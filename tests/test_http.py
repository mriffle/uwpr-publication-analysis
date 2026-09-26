"""The HTTP client: secrets, retries, rate limits, the budget guard, caching and modes."""

import hashlib
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from uwpr_pubs import recording
from uwpr_pubs.cache import Cache, CacheRecord, Fetched, request_key
from uwpr_pubs.http import (
    Budget,
    BudgetExceededError,
    HttpClient,
    HttpError,
    MalformedReplyError,
    MissingRecordingError,
    Mode,
    Policy,
    RateLimiter,
    Response,
    openalex_cost,
)
from uwpr_pubs.secrets import REDACTED, scrub, strip_url
from uwpr_pubs.sources.europepmc import EuropePmc

FAKE_KEY = "fake-openalex-key-abc123"
FAKE_NCBI_KEY = "fake-ncbi-key-xyz789"


@pytest.fixture(autouse=True)
def _fake_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never read the real keys (docs/03 §12.1); these stand in for them."""
    monkeypatch.setenv("OPEN_ALEX_API_KEY", FAKE_KEY)
    monkeypatch.setenv("NCBI_API_KEY", FAKE_NCBI_KEY)


class FakeTransport:
    def __init__(self, *replies: Response | Exception) -> None:
        self.replies = list(replies)
        self.calls: list[tuple[str, dict[str, str]]] = []
        self.sent: list[tuple[str, bytes | None, dict[str, str]]] = []  # method, body, headers

    def __call__(
        self,
        url: str,
        params: Mapping[str, str],
        headers: Mapping[str, str],
        timeout: float,
        *,
        method: str = "GET",
        body: bytes | None = None,
    ) -> Response:
        self.calls.append((url, dict(params)))
        self.sent.append((method, body, dict(headers)))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def make_client(
    transport: FakeTransport,
    tmp_path: Path,
    *,
    mode: Mode = Mode.LIVE,
    recordings: Cache | None = None,
    max_run_usd: float = 0.5,
    rates: dict[str, float] | None = None,
) -> tuple[HttpClient, list[float]]:
    sleeps: list[float] = []
    clock = iter(range(0, 100000))
    client = HttpClient(
        contact="mriffle@uw.edu",
        user_agent="uwpr-pubs/test",
        mode=mode,
        cache=Cache(tmp_path / "cache"),
        recordings=recordings,
        budget=Budget(max_run_usd=max_run_usd, min_remaining_usd=0.10),
        rate_limiter=RateLimiter(rates or {}, sleep=sleeps.append, clock=lambda: float(next(clock))),
        transport=transport,
        max_attempts=4,
        sleep=sleeps.append,
        now=lambda: "2026-09-21T00:00:00Z",
        jitter=lambda: 0.0,
    )
    return client, sleeps


def ok(body: bytes = b"{}", headers: Mapping[str, str] | None = None) -> Response:
    return Response(url="https://example.org/x", status=200, body=body, headers=dict(headers or {}))


def test_the_key_never_reaches_the_cache_or_a_message(tmp_path: Path) -> None:
    transport = FakeTransport(ok(b'{"ok": true}'))
    client, _ = make_client(transport, tmp_path)
    client.get("https://api.openalex.org/works", {"filter": "x", "api_key": FAKE_KEY}, host="openalex")

    written = [p for p in (tmp_path / "cache").rglob("*") if p.is_file()]
    assert written
    for path in written:
        assert FAKE_KEY not in path.read_text(encoding="utf-8", errors="replace")
    index = (tmp_path / "cache" / "index.jsonl").read_text(encoding="utf-8")
    assert REDACTED in index
    assert transport.calls[0][1]["api_key"] == FAKE_KEY  # the real request still carries it


def test_secret_values_are_scrubbed_from_free_text() -> None:
    assert scrub(f"failed with key {FAKE_KEY}") == f"failed with key {REDACTED}"
    assert scrub(f"and the ncbi one {FAKE_NCBI_KEY}") == f"and the ncbi one {REDACTED}"
    assert strip_url(f"https://api.openalex.org/works?api_key={FAKE_KEY}&mailto=a@b.c") == (
        f"https://api.openalex.org/works?api_key={REDACTED}&mailto=a%40b.c"
    )


def test_an_error_message_cannot_leak_the_key(tmp_path: Path) -> None:
    transport = FakeTransport(RuntimeError(f"connection to ...api_key={FAKE_KEY} failed"))
    client, _ = make_client(transport, tmp_path)
    with pytest.raises(HttpError) as exc:
        client.get("https://api.openalex.org/works", {"api_key": FAKE_KEY}, host="openalex")
    assert FAKE_KEY not in str(exc.value)


def test_retry_honours_retry_after_then_succeeds(tmp_path: Path) -> None:
    transport = FakeTransport(
        Response("u", 429, b"", {"retry-after": "7"}),
        ok(b'{"done": 1}'),
    )
    client, sleeps = make_client(transport, tmp_path)
    reply = client.get("https://api.crossref.org/works", host="crossref")
    assert reply.json() == {"done": 1}
    assert sleeps == [7.0]


def test_server_errors_are_retried_up_to_the_limit(tmp_path: Path) -> None:
    transport = FakeTransport(Response("u", 503, b"", {}))
    client, sleeps = make_client(transport, tmp_path)
    with pytest.raises(HttpError, match="HTTP 503"):
        client.get("https://www.ebi.ac.uk/x", host="europepmc")
    assert len(transport.calls) == 4
    assert len(sleeps) == 3


def test_client_errors_are_not_retried(tmp_path: Path) -> None:
    transport = FakeTransport(Response("u", 404, b"", {}))
    client, _ = make_client(transport, tmp_path)
    with pytest.raises(HttpError, match="HTTP 404"):
        client.get("https://api.openalex.org/works/W1", host="openalex")
    assert len(transport.calls) == 1


def test_rate_limiter_spaces_requests_per_host(tmp_path: Path) -> None:
    transport = FakeTransport(ok())
    client, sleeps = make_client(transport, tmp_path, rates={"uwpr_site": 0.5})
    for _ in range(3):
        client.get("https://proteomicsresource.washington.edu/publications/", host="uwpr_site")
    assert sleeps and all(delay > 0 for delay in sleeps)


@pytest.mark.parametrize(
    ("params", "path", "expected"),
    [
        ({}, "/works/W123", 0.0),
        ({"filter": "openalex_id:W1|W2"}, "/works", 0.0001),
        ({"filter": "fulltext.search:UWPR95794"}, "/works", 0.001),
        ({"search": "proteomics"}, "/works", 0.001),
        ({"filter": "raw_affiliation_strings.search:x"}, "/works", 0.001),
    ],
)
def test_openalex_cost_classification(params: dict[str, str], path: str, expected: float) -> None:
    assert openalex_cost(params, path) == expected


def test_budget_guard_stops_spending_and_records_the_trip(tmp_path: Path) -> None:
    transport = FakeTransport(ok())
    client, _ = make_client(transport, tmp_path, max_run_usd=0.0015)
    client.get("https://api.openalex.org/works", {"search": "a"}, host="openalex", cost=0.001)
    with pytest.raises(BudgetExceededError):
        client.get("https://api.openalex.org/works", {"search": "b"}, host="openalex", cost=0.001)
    assert client.budget.tripped
    assert client.budget.spent_usd == pytest.approx(0.001)
    assert client.usage["openalex"].calls == 1


def test_a_low_remaining_balance_also_stops_spending(tmp_path: Path) -> None:
    transport = FakeTransport(ok(headers={"x-ratelimit-remaining-usd": "0.05"}))
    client, _ = make_client(transport, tmp_path)
    client.get("https://api.openalex.org/works", {"search": "a"}, host="openalex", cost=0.001)
    assert client.budget.remaining_usd == pytest.approx(0.05)
    with pytest.raises(BudgetExceededError):
        client.get("https://api.openalex.org/works", {"search": "b"}, host="openalex", cost=0.001)


def test_immutable_responses_are_served_from_the_cache(tmp_path: Path) -> None:
    transport = FakeTransport(ok(b"<article/>"))
    client, _ = make_client(transport, tmp_path)
    first = client.get("https://eutils.ncbi.nlm.nih.gov/x", host="ncbi", policy=Policy.IMMUTABLE)
    second = client.get("https://eutils.ncbi.nlm.nih.gov/x", host="ncbi", policy=Policy.IMMUTABLE)
    assert first.body == second.body
    assert second.from_cache
    assert len(transport.calls) == 1


def test_refreshable_responses_are_fetched_again(tmp_path: Path) -> None:
    transport = FakeTransport(ok(b'{"n": 1}'), ok(b'{"n": 2}'))
    client, _ = make_client(transport, tmp_path)
    client.get("https://api.openalex.org/works", host="openalex")
    second = client.get("https://api.openalex.org/works", host="openalex")
    assert second.json() == {"n": 2}
    assert len(transport.calls) == 2


def test_replay_mode_never_touches_the_transport(tmp_path: Path) -> None:
    recordings = Cache(tmp_path / "recordings")
    url = "https://api.openalex.org/works"
    key = request_key(url, {"filter": "x"})
    recordings.put(
        key,
        Fetched(url, {"filter": "x"}, 200, "application/json", b'{"replayed": true}', "2026-09-21"),
    )
    transport = FakeTransport(ok(b"never used"))
    client, _ = make_client(transport, tmp_path, mode=Mode.REPLAY, recordings=recordings)
    assert client.get(url, {"filter": "x"}, host="openalex").json() == {"replayed": True}
    assert transport.calls == []


def test_replay_mode_fails_loudly_on_a_missing_recording(tmp_path: Path) -> None:
    client, _ = make_client(
        FakeTransport(ok()), tmp_path, mode=Mode.REPLAY, recordings=Cache(tmp_path / "recordings")
    )
    with pytest.raises(MissingRecordingError):
        client.get("https://api.openalex.org/works", host="openalex")


def test_record_mode_scrubs_abstracts_but_the_cache_keeps_them(tmp_path: Path) -> None:
    payload = {"id": "W1", "abstract_inverted_index": {"UWPR": [0]}, "title": "t"}
    transport = FakeTransport(ok(json.dumps(payload).encode(), {"content-type": "application/json"}))
    recordings = Cache(tmp_path / "recordings")
    client, _ = make_client(transport, tmp_path, mode=Mode.RECORD, recordings=recordings)
    client.get("https://api.openalex.org/works", host="openalex")

    recorded = recordings.get(client.last_key or "")
    assert recorded is not None
    assert json.loads(recorded[1]) == {"id": "W1", "title": "t"}
    cached = Cache(tmp_path / "cache").get(client.last_key or "")
    assert cached is not None
    assert b"abstract_inverted_index" in cached[1]


def test_record_mode_refuses_to_record_full_text(tmp_path: Path) -> None:
    body = b'<?xml version="1.0"?><article><body><p>text</p></body></article>'
    transport = FakeTransport(ok(body, {"content-type": "application/xml"}))
    recordings = Cache(tmp_path / "recordings")
    client, _ = make_client(transport, tmp_path, mode=Mode.RECORD, recordings=recordings)
    client.get("https://eutils.ncbi.nlm.nih.gov/x", host="ncbi")
    assert recordings.get(client.last_key or "") is None


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (b'{"abstractText": "x"}', ["contains abstractText"]),
        (b'{"abstract_inverted_index": {}}', ["contains abstract_inverted_index"]),
        (b'{"abstract_text": "x"}', ["contains abstract_text"]),  # NIH RePORTER
        (b'{"phr_text": "x"}', ["contains phr_text"]),
        (b"<Abstract><AbstractText>x</AbstractText></Abstract>", ["contains AbstractText"]),  # PubMed
        (b"<article><body>x</body></article>", ["looks like full text"]),
        (b'{"id": "W1"}', []),
    ],
)
def test_recording_guard_spots_what_must_not_be_committed(body: bytes, expected: list[str]) -> None:
    assert recording.violations(body) == expected


def test_committed_recordings_contain_no_text_or_abstracts() -> None:
    """The guard the spec asks for (§12.3); vacuously true until recordings exist."""
    blobs = Path(__file__).resolve().parent / "recordings" / "blobs"
    for path in blobs.rglob("*") if blobs.exists() else []:
        if path.is_file():
            assert recording.violations(path.read_bytes()) == [], path


def test_an_endpoint_whose_error_is_an_answer_is_asked_once(tmp_path: Path) -> None:
    """Europe PMC replies 500 to every non-open-access record (Phase 1 §7).

    Retrying that with backoff cost about 14 seconds each, on hundreds of records, which is what
    made the first full run unworkably slow.
    """
    transport = FakeTransport(Response("https://ebi", 500, b""))
    client, sleeps = make_client(transport, tmp_path)

    with pytest.raises(HttpError):
        client.get("https://ebi/PMC1/fullTextXML", host="europepmc", attempts=1)

    assert len(transport.calls) == 1
    assert sleeps == []


def test_a_transient_failure_is_still_retried(tmp_path: Path) -> None:
    transport = FakeTransport(Response("https://x", 503, b""), ok(b"{}"))
    client, _ = make_client(transport, tmp_path)

    assert client.get("https://x", host="ncbi").status == 200
    assert len(transport.calls) == 2


def test_europe_pmc_full_text_asks_once(tmp_path: Path) -> None:
    transport = FakeTransport(Response("https://ebi", 500, b""))
    client, _ = make_client(transport, tmp_path)

    assert EuropePmc(client, "mriffle@uw.edu").full_text_xml("PMC1") is None
    assert len(transport.calls) == 1


# --- a reply that arrived but will not parse (2026-09-26) ---------------------------------


def test_an_empty_body_is_a_source_error_with_no_status() -> None:
    """bioRxiv's `details` answered HTTP 200 with nothing, to every request, and a bare
    `JSONDecodeError` from it failed the whole run. No answer is an outage, like a timeout.
    """
    reply = Response("https://api.biorxiv.org/details/biorxiv/10.1101/1", 200, b"", {})
    with pytest.raises(MalformedReplyError) as raised:
        reply.json()
    assert raised.value.status is None
    assert isinstance(raised.value, HttpError)  # so every stage that degrades on one catches it
    assert isinstance(raised.value, ValueError)  # and so does anything that caught the old error
    assert (
        str(raised.value) == "https://api.biorxiv.org/details/biorxiv/10.1101/1: HTTP 200 with an empty body"
    )


def test_a_body_that_is_not_json_keeps_its_status() -> None:
    """Something did answer, in the wrong shape: that reads as a changed source, not an outage."""
    reply = Response("https://api.example.org/x", 200, b"<!doctype html><title>Maintenance</title>", {})
    with pytest.raises(MalformedReplyError) as raised:
        reply.json()
    assert raised.value.status == 200
    assert "41 bytes that are not JSON" in str(raised.value)


def test_a_json_body_still_parses() -> None:
    assert Response("u", 200, b'{"hitCount": 185}', {}).json() == {"hitCount": 185}


# --- POST, for the sources that take a JSON body (docs/03 §7, changed 2026-09-26) -----------------

# Two lines of the main checkout's `cache/index.jsonl`, as the code before POST wrote them on
# 2026-09-19. Every cache entry and recording made before POST is found by keys like these.
OLD_INDEX = Path(__file__).resolve().parent / "fixtures" / "cache-index-2026-09-19.jsonl"
REPORTER = "https://api.reporter.nih.gov/v2/projects/search"
REPORTER_QUERY = {
    "criteria": {"project_nums": ["P41GM103533"], "exclude_subprojects": True},
    "include_fields": ["ApplId", "FiscalYear", "AwardAmount"],
    "limit": 5,
}


def old_lines() -> list[dict[str, Any]]:
    return [json.loads(line) for line in OLD_INDEX.read_text(encoding="utf-8").splitlines()]


@pytest.mark.parametrize("line", old_lines(), ids=lambda line: str(line["url"]))
def test_get_request_keys_are_unchanged(line: dict[str, Any]) -> None:
    """A GET's key may not move, or every cache entry and recording made before POST is lost."""
    url, params = line["url"], dict(line["params"])
    if "api_key" in params:
        params["api_key"] = FAKE_KEY  # the key as sent; it is redacted before hashing
    assert request_key(url, params) == line["key"]
    assert request_key(url, params, "GET", None) == line["key"]


def test_post_keys_depend_on_method_and_canonical_body(tmp_path: Path) -> None:
    transport = FakeTransport(ok(b'{"results": []}'))
    client, _ = make_client(transport, tmp_path)

    client.post_json(REPORTER, REPORTER_QUERY, host="reporter")
    first = client.last_key
    reordered = {"limit": 5, "include_fields": REPORTER_QUERY["include_fields"]}
    reordered["criteria"] = {"exclude_subprojects": True, "project_nums": ["P41GM103533"]}
    client.post_json(REPORTER, reordered, host="reporter")
    assert client.last_key == first  # built in another order, it is the same question
    client.post_json(REPORTER, {**REPORTER_QUERY, "limit": 6}, host="reporter")
    assert client.last_key != first

    method, body, headers = transport.sent[0]
    assert method == "POST"
    assert body == transport.sent[1][1]
    assert body is not None
    assert body.startswith(b'{"criteria":{"exclude_subprojects":true,')  # sorted, no spaces
    assert headers["Content-Type"] == "application/json"
    assert "mriffle@uw.edu" in headers["User-Agent"]

    # The method is part of the key: a POST with no body is not the GET of the same URL.
    assert request_key(REPORTER, {}, "POST", b"") != request_key(REPORTER)
    assert request_key(REPORTER, {}, "POST", b"{}") != request_key(REPORTER, {}, "PUT", b"{}")
    # A key value in a body is redacted before hashing, so a recording made with the real key
    # answers a replay made with a fake one.
    assert request_key(REPORTER, {}, "POST", f'{{"k":"{FAKE_KEY}"}}'.encode()) == request_key(
        REPORTER, {}, "POST", f'{{"k":"{REDACTED}"}}'.encode()
    )


@pytest.mark.parametrize(
    "replies",
    [
        [Response("u", 429, b"", {"retry-after": "3"}), Response("u", 503, b"", {}), ok()],
        [RuntimeError("connection reset"), ok()],
        [Response("u", 503, b"", {})],
        [Response("u", 400, b"", {})],
    ],
    ids=["429-then-503-then-ok", "a-transport-error", "503-forever", "a-400-is-an-answer"],
)
def test_post_is_retried_and_spaced_like_get(tmp_path: Path, replies: list[Response | Exception]) -> None:
    """The same replies bring the same retries, backoff and spacing, whichever the method."""
    outcomes = []
    for method in ("GET", "POST"):
        transport = FakeTransport(*replies)
        client, sleeps = make_client(transport, tmp_path / method, rates={"reporter": 0.5})
        try:
            if method == "GET":
                client.get(REPORTER, host="reporter")
            else:
                client.post_json(REPORTER, REPORTER_QUERY, host="reporter")
        except HttpError as exc:
            status: int | str | None = exc.status
            assert str(exc).startswith("POST " if method == "POST" else REPORTER)
        else:
            status = "ok"
        assert {sent[0] for sent in transport.sent} == {method}
        outcomes.append((status, len(transport.calls), sleeps, client.usage.get("reporter")))
    assert outcomes[0] == outcomes[1]
    assert outcomes[1][2], "the limiter and the backoff both slept"


def test_post_replays_from_recordings(tmp_path: Path) -> None:
    project = {"appl_id": 1, "award_amount": 1_000_000, "abstract_text": "An abstract.", "phr_text": "Why."}
    reply = {"meta": {"total": 1}, "results": [project]}
    recordings = Cache(tmp_path / "recordings")
    recorder, _ = make_client(
        FakeTransport(ok(json.dumps(reply).encode(), {"content-type": "application/json"})),
        tmp_path,
        mode=Mode.RECORD,
        recordings=recordings,
    )
    recorder.post_json(REPORTER, REPORTER_QUERY, host="reporter")
    line = json.loads((tmp_path / "recordings" / "index.jsonl").read_text(encoding="utf-8"))
    assert line["method"] == "POST"
    canonical = json.dumps(REPORTER_QUERY, sort_keys=True, separators=(",", ":")).encode()
    assert line["body_sha256"] == hashlib.sha256(canonical).hexdigest()
    assert line["params"] == {}

    transport = FakeTransport(ok(b"never used"))
    replayer, _ = make_client(
        transport, tmp_path / "replay", mode=Mode.REPLAY, recordings=Cache(tmp_path / "recordings")
    )
    reordered = dict(reversed(list(REPORTER_QUERY.items())))
    replayed = replayer.post_json(REPORTER, reordered, host="reporter")
    assert replayed.from_cache
    assert replayed.json() == {"meta": {"total": 1}, "results": [{"appl_id": 1, "award_amount": 1_000_000}]}
    assert transport.calls == []

    with pytest.raises(MissingRecordingError, match=f"no recording for POST {REPORTER}"):
        replayer.post_json(REPORTER, {**REPORTER_QUERY, "limit": 6}, host="reporter")
    with pytest.raises(MissingRecordingError):
        replayer.get(REPORTER, host="reporter")  # the GET of the same URL is another request


def test_an_old_cache_line_still_loads(tmp_path: Path) -> None:
    root = tmp_path / "cache"
    root.mkdir()
    future = {**old_lines()[1], "key": "f" * 64, "added_by_a_later_format": True}
    lines = OLD_INDEX.read_text(encoding="utf-8") + json.dumps(future, sort_keys=True) + "\n"
    (root / "index.jsonl").write_text(lines, encoding="utf-8")
    for line in old_lines():
        blob = Cache(root).blob_path(str(line["sha256"]))
        blob.parent.mkdir(parents=True, exist_ok=True)
        blob.write_bytes(b"a stand-in body")

    cache = Cache(root)
    for line in [*old_lines(), future]:
        hit = cache.get(str(line["key"]))
        assert hit is not None
        assert (hit[0].method, hit[0].body_sha256) == ("GET", None)
        assert hit[0].url == line["url"]

    # What this code writes for a GET is what the old code wrote, byte for byte.
    for text in OLD_INDEX.read_text(encoding="utf-8").splitlines(keepends=True):
        assert CacheRecord.from_line(json.loads(text)).to_line() == text
    fetched = Fetched("https://example.org/x", {"a": "1"}, 200, "text/plain", b"body", "2026-09-26T00:00:00Z")
    cache.put("0" * 64, fetched)
    written = json.loads((root / "index.jsonl").read_text(encoding="utf-8").splitlines()[-1])
    assert list(written) == list(old_lines()[0])  # no new fields, in the same order


def test_record_mode_strips_pubmed_abstract_xml(tmp_path: Path) -> None:
    """PubMed's efetch XML carries the abstract, which a public repository may not (P10)."""
    body = (
        b'<?xml version="1.0" ?>\n<!DOCTYPE PubmedArticleSet>\n<PubmedArticleSet><PubmedArticle>'
        b"<MedlineCitation><PMID>123</PMID><Article><ArticleTitle>A title</ArticleTitle>"
        b'<Abstract>\n<AbstractText Label="BACKGROUND">Secret words.</AbstractText>'
        b"<AbstractText>More secret words.</AbstractText><CopyrightInformation>c</CopyrightInformation>"
        b'</Abstract></Article><OtherAbstract Type="Publisher" Language="spa">'
        b"<AbstractText>Palabras secretas.</AbstractText></OtherAbstract>"
        b"<GrantList><Grant><GrantID>P41 GM103533</GrantID></Grant></GrantList>"
        b"</MedlineCitation></PubmedArticle></PubmedArticleSet>"
    )
    transport = FakeTransport(ok(body, {"content-type": "text/xml; charset=UTF-8"}))
    recordings = Cache(tmp_path / "recordings")
    client, _ = make_client(transport, tmp_path, mode=Mode.RECORD, recordings=recordings)
    client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", {"db": "pubmed"}, host="ncbi")

    recorded = recordings.get(client.last_key or "")
    assert recorded is not None
    assert recording.violations(recorded[1]) == []
    assert b"secret" not in recorded[1].lower()
    assert b"Palabras" not in recorded[1]
    assert b"<ArticleTitle>A title</ArticleTitle>" in recorded[1]
    assert b"<GrantID>P41 GM103533</GrantID>" in recorded[1]  # what the funding stage reads
    cached = Cache(tmp_path / "cache").get(client.last_key or "")
    assert cached is not None
    assert b"Secret words." in cached[1]  # the cache is git-ignored, and keeps the whole reply

    # Abstract text in a shape the pattern does not know is not recorded at all.
    assert recording.prepare_recording("text/xml", b"<X><AbstractText>t</AbstractText></X>") is None
