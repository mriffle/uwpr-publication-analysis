"""The HTTP client: secrets, retries, rate limits, the budget guard, caching and modes."""

import json
from collections.abc import Mapping
from pathlib import Path

import pytest

from uwpr_pubs import recording
from uwpr_pubs.cache import Cache, Fetched, request_key
from uwpr_pubs.http import (
    Budget,
    BudgetExceededError,
    HttpClient,
    HttpError,
    MissingRecordingError,
    Mode,
    Policy,
    RateLimiter,
    Response,
    openalex_cost,
)
from uwpr_pubs.secrets import REDACTED, scrub, strip_url

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

    def __call__(
        self, url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response:
        self.calls.append((url, dict(params)))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def make_client(  # noqa: PLR0913 - a test helper mirroring the client's injection points
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
