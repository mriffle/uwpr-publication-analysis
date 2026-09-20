"""Scripted multi-run scenarios (docs/03-retrieval-pipeline.md §12.2).

Three things no single run can show, over a corpus small enough to reason about:

1. **A rule change and an override**, across three runs. This reproduces what `samples/store/`
   holds as a finished picture — an override exclusion and a work dropped by a rule change,
   carrying its superseded evidence forward — by actually doing it.
2. **Determinism**: two stores built from scratch on the same day are byte-identical.
3. **Degradation**: a failing source never shrinks the data, and three such runs in a row alert.

The corpus is two papers. One is on the official list, so R1 keeps it whatever else happens; the
other is off the list and included only by the award code in its metadata, so it is the one whose
inclusion the rules and the overrides can actually change.
"""

import datetime as dt
import json
import shutil
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest
import yaml

from uwpr_pubs import pipeline as pipeline_module
from uwpr_pubs.cache import Cache
from uwpr_pubs.config import load_config
from uwpr_pubs.context import RunContext
from uwpr_pubs.http import Budget, HttpClient, Mode, RateLimiter, Response
from uwpr_pubs.pipeline import RunOptions, run_pipeline
from uwpr_pubs.store import io
from uwpr_pubs.validate import validate_store

PROJECT = Path(__file__).resolve().parents[1]
TODAY = "2026-09-21"
INDEX = "https://proteomicsresource.washington.edu/publications/"
LISTED_PMID = "38665238"
LISTED_DOI = "10.1234/listed"
OFFLIST_DOI = "10.1234/offlist"

LIST_PAGE = f"""<html><body><main><h3>2023</h3><ul>
<li><b>A listed paper.</b> Eng JK. <i>J Example.</i> 2023 Oct 5.
<a href="https://pubmed.ncbi.nlm.nih.gov/{LISTED_PMID}/">PMID: {LISTED_PMID}</a></li>
</ul></main></body></html>"""


def work(number: int, doi: str, *, pmid: str | None, award: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": f"https://openalex.org/W{number}",
        "doi": f"https://doi.org/{doi}",
        "ids": {"openalex": f"https://openalex.org/W{number}", "doi": f"https://doi.org/{doi}"},
        "display_name": f"Example work {number}",
        "publication_date": "2023-05-01",
        "publication_year": 2023,
        "type": "article",
        "primary_location": {"source": {"display_name": "J Example", "issn_l": "1234-5678"}},
        "authorships": [],
        "topics": [],
        "open_access": {"oa_status": "gold"},
        "best_oa_location": {},
        "is_retracted": False,
        "cited_by_count": number,
        "counts_by_year": [],
        "fwci": None,
        "citation_normalized_percentile": {},
    }
    if pmid:
        payload["ids"]["pmid"] = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}"
    if award:
        payload["awards"] = [{"funder_award_id": "UWPR95794", "funder_display_name": "UW"}]
    return payload


LISTED = work(1, LISTED_DOI, pmid=LISTED_PMID, award=False)
OFFLIST = work(2, OFFLIST_DOI, pmid=None, award=True)


def route(url: str, params: Mapping[str, str]) -> Response:  # noqa: PLR0911 - one branch per source
    if url.startswith(INDEX) and url.rstrip("/").endswith("publications"):
        return Response(url, 200, b'<a href="/publications/2023/">2023</a>', {})
    if "publications/2023" in url:
        return Response(url, 200, LIST_PAGE.encode(), {"content-type": "text/html"})
    if "api.openalex.org/authors" in url:
        return Response(url, 200, json.dumps({"results": [], "meta": {}}).encode(), {})
    if "idconv" in url:
        return Response(url, 200, json.dumps({"records": []}).encode(), {})
    if "api.openalex.org/works" in url:
        expression = params.get("filter", "")
        award_filter = "awards.funder_award_id" in expression
        found = [
            candidate
            for candidate in (LISTED, OFFLIST)
            if _wanted(candidate, expression) or (award_filter and candidate is OFFLIST)
        ]
        payload = {"results": found, "meta": {"next_cursor": None}}
        return Response(url, 200, json.dumps(payload).encode(), {})
    if "api.crossref.org" in url:
        return Response(url, 200, json.dumps({"message": {"items": [], "next-cursor": None}}).encode(), {})
    if "ebi.ac.uk" in url:
        return Response(
            url, 200, json.dumps({"resultList": {"result": []}, "nextCursorMark": ""}).encode(), {}
        )
    raise AssertionError(f"unexpected request: {url}")


def _wanted(candidate: Mapping[str, Any], expression: str) -> bool:
    """Whether an OpenAlex filter names this paper, for the filters the pipeline actually sends."""
    if ":" not in expression:
        return False
    field, values = expression.split(":", 1)
    if field not in ("pmid", "doi", "openalex_id"):
        return False
    haystack = f"{candidate['id']} {candidate['doi']} {candidate['ids'].get('pmid', '')}"
    return any(value and value in haystack for value in values.split("|"))


@pytest.fixture
def client(tmp_path: Path) -> HttpClient:
    def transport(
        url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response:
        return route(url, params)

    return HttpClient(
        contact="mriffle@uw.edu",
        user_agent="uwpr-pubs/test",
        mode=Mode.LIVE,
        cache=Cache(tmp_path / "cache"),
        budget=Budget(max_run_usd=0.5, min_remaining_usd=0.1),
        rate_limiter=RateLimiter({}),
        transport=transport,
        sleep=lambda _: None,
        now=lambda: f"{TODAY}T00:00:00Z",
    )


@pytest.fixture(autouse=True)
def _no_real_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline_module, "api_keys", lambda: (None, None))


def go(
    client: HttpClient,
    store: Path,
    day: str = TODAY,
    *,
    config_dir: Path | None = None,
    overrides: Path | None = None,
) -> Any:
    started = dt.datetime.fromisoformat(f"{day}T09:00:00+00:00")
    context = RunContext(today=started.date(), started=started, mode="live", store=store)
    config = load_config(config_dir=config_dir, overrides_path=overrides)
    return run_pipeline(config, client, context, RunOptions(store=store, check_clean=False))


def config_at(tmp_path: Path, version: str, **rules: Any) -> Path:
    """A second config tree at a new rule version, as a rule change really arrives."""
    directory = tmp_path / f"config-{version}"
    shutil.copytree(PROJECT / "config", directory)
    document = yaml.safe_load((directory / "rules.yaml").read_text(encoding="utf-8"))
    document["rule_version"] = version
    for key, value in rules.items():
        document[key] = {**document[key], **value}
    (directory / "rules.yaml").write_text(yaml.safe_dump(document, sort_keys=False), encoding="utf-8")
    return directory


def candidate(store: Path, work_id: str) -> dict[str, Any]:
    lines = io.read_jsonl(store / "candidates.jsonl")
    return next(line for line in lines if line["id"] == work_id)


def offlist_work_id(store: Path) -> str:
    aliases = io.read_json(store / "aliases.json")["aliases"]
    return str(aliases[f"doi:{OFFLIST_DOI}"])


# --- scenario 1: a rule change and an override ----------------------------------------------


def test_both_papers_are_included_to_begin_with(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    assert go(client, store).status == "ok"
    works = {p.stem for p in (store / "works").glob("W-*.json")}
    assert len(works) == 2
    assert offlist_work_id(store) in works


def test_an_exclude_override_removes_a_work_but_never_a_listed_one(
    client: HttpClient, tmp_path: Path
) -> None:
    """Overrides beat the rules, except R1: the list always wins (Phase 1 §6.0)."""
    store = tmp_path / "store"
    go(client, store)
    offlist = offlist_work_id(store)
    listed = next(p.stem for p in (store / "works").glob("W-*.json") if p.stem != offlist)

    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        f"- target: {offlist}\n  action: exclude\n  reason: 'PI says the work was run elsewhere.'\n"
        f"  by: mriffle\n  date: 2026-09-22\n"
        f"- target: {listed}\n  action: exclude\n  reason: 'Should have no effect: it is listed.'\n"
        f"  by: mriffle\n  date: 2026-09-22\n",
        encoding="utf-8",
    )
    result = go(client, store, day="2026-09-22", overrides=overrides)

    assert result.status == "ok", result.errors
    assert not (store / "works" / f"{offlist}.json").exists()
    assert (store / "works" / f"{listed}.json").exists(), "R1 always wins"

    line = candidate(store, offlist)
    assert line["reason"] == "override_exclude"
    # Its evidence is carried forward, or removing the override later could never bring it back.
    assert [entry["rule"] for entry in line["former_evidence"]] == ["R2"]
    assert validate_store(store, overrides).errors == []


def test_an_include_override_reaches_the_app_with_its_reason_and_attribution(
    client: HttpClient, tmp_path: Path
) -> None:
    """docs/02 §9 and docs/05 §6: the reason is the label, `by` and `date` are its attribution.

    The override is the only thing holding this work in — the rule change has just superseded its
    R2 evidence — so this is the case the app has to render, and before the override was recorded
    as evidence the work reached the export carrying no reason at all, which the export schema
    rejects: the whole run failed.
    """
    store = tmp_path / "store"
    go(client, store)
    offlist = offlist_work_id(store)
    changed = config_at(tmp_path, "2026-09-22.1", r2={"code": "OTHER99999"})
    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        f"- target: {offlist}\n  action: include\n  reason: 'PI confirmed the samples were run at UWPR.'\n"
        f"  by: mriffle\n  date: 2026-09-22\n",
        encoding="utf-8",
    )

    result = go(client, store, day="2026-09-22", config_dir=changed, overrides=overrides)

    assert result.status == "ok", result.errors
    work = io.read_json(store / "works" / f"{offlist}.json")
    assert work["status"]["basis"] == "override", "the file must say what actually included it"
    entry = next(e for e in work["evidence"] if e["rule"] == "override")
    assert entry["label"] == "PI confirmed the samples were run at UWPR."
    assert entry["detail"] == {"by": "mriffle", "date": "2026-09-22"}
    assert entry["criterion"] is None and entry["record"] is None
    assert entry["source"]["name"] == "overrides.yaml"
    assert validate_store(store, overrides).errors == []

    exported = io.read_json(store.parent / "export" / "uwpr_publications.json")
    shown = next(
        e
        for exported_work in exported["works"]
        if exported_work["id"] == offlist
        for e in exported_work["evidence"]
        if e["rule"] == "override"
    )
    assert shown["detail"] == {"by": "mriffle", "date": "2026-09-22"}
    assert shown["label"] == "PI confirmed the samples were run at UWPR."


def test_a_rule_change_supersedes_the_evidence_and_drops_the_work(client: HttpClient, tmp_path: Path) -> None:
    """docs/02 §13: a new rule version re-derives everything, and what it no longer produces
    is superseded and kept, so the file still says why the work was once included."""
    store = tmp_path / "store"
    go(client, store)
    offlist = offlist_work_id(store)

    # The same change a person would make: a new rule version whose R2 looks for another code.
    changed = config_at(tmp_path, "2026-09-22.1", r2={"code": "OTHER99999"})
    result = go(client, store, day="2026-09-22", config_dir=changed)

    assert result.status == "ok", result.errors
    assert not (store / "works" / f"{offlist}.json").exists()
    line = candidate(store, offlist)
    assert line["reason"] == "no_longer_meets_rules"
    assert line["rule_version"] == "2026-09-22.1"
    superseded = [entry for entry in line["former_evidence"] if "superseded" in entry]
    assert [entry["rule"] for entry in superseded] == ["R2"]
    assert superseded[0]["superseded"]["by_rule_version"] == "2026-09-22.1"
    assert superseded[0]["first_seen"] == TODAY, "the original sighting date is kept"
    assert f"{offlist} — no_longer_meets_rules" in result.report
    assert validate_store(store).errors == []


def test_restoring_the_rule_brings_the_work_back(client: HttpClient, tmp_path: Path) -> None:
    """The point of keeping superseded evidence: the decision is reversible."""
    store = tmp_path / "store"
    go(client, store)
    offlist = offlist_work_id(store)
    go(client, store, day="2026-09-22", config_dir=config_at(tmp_path, "2026-09-22.1", r2={"code": "OTHER"}))
    assert not (store / "works" / f"{offlist}.json").exists()

    go(client, store, day="2026-09-23", config_dir=config_at(tmp_path, "2026-09-23.1"))

    assert (store / "works" / f"{offlist}.json").exists()
    restored = io.read_json(store / "works" / f"{offlist}.json")
    assert [entry["rule"] for entry in restored["evidence"]] == ["R2"]
    assert "superseded" not in restored["evidence"][0]


# --- scenario 2: determinism ----------------------------------------------------------------


def test_two_stores_built_from_scratch_are_byte_identical(client: HttpClient, tmp_path: Path) -> None:
    """Phase 2 §15. Two runs from nothing must agree on every ID, date and array order."""
    first = tmp_path / "first"
    second = tmp_path / "second"
    go(client, first)
    go(client, second)

    def contents(store: Path) -> dict[str, bytes]:
        return {
            str(path.relative_to(store)): path.read_bytes()
            for path in sorted(store.rglob("*"))
            if path.is_file() and "runs" not in path.parts
        }

    assert contents(first) == contents(second)


def test_a_candidate_keeps_a_record_no_channel_nominates(client: HttpClient, tmp_path: Path) -> None:
    """A record ID, once minted, is permanent — including one no channel will ever name again.

    A candidate's records are rebuilt only from this run's nominations, so the stored list has to
    be merged rather than replaced. Stage 6 creates exactly such records, and before this was
    fixed the second run silently dropped them.
    """
    store = tmp_path / "store"
    go(client, store)
    offlist = offlist_work_id(store)
    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        f"- target: {offlist}\n  action: exclude\n  reason: 'Not UWPR work.'\n"
        f"  by: mriffle\n  date: 2026-09-22\n",
        encoding="utf-8",
    )
    go(client, store, day="2026-09-22", overrides=overrides)

    line = candidate(store, offlist)
    planted = {**line["records"][0], "id": "R-009999", "ids": {"doi": "10.1234/never-nominated"}}
    io.write_jsonl(
        store / "candidates.jsonl",
        [
            {**line, "records": [*line["records"], planted]} if line["id"] == offlist else line
            for line in io.read_jsonl(store / "candidates.jsonl")
        ],
    )
    aliases = io.read_json(store / "aliases.json")
    aliases["aliases"]["doi:10.1234/never-nominated"] = offlist
    io.write_json(store / "aliases.json", aliases)

    go(client, store, day="2026-09-23", overrides=overrides)

    kept = {record["id"] for record in candidate(store, offlist)["records"]}
    assert "R-009999" in kept


# --- scenario 3: a failing source ------------------------------------------------------------


def test_a_failing_source_never_shrinks_the_store(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """§9: the official list going down must not look like every paper being delisted."""
    store = tmp_path / "store"
    go(client, store)
    before = {p.stem for p in (store / "works").glob("W-*.json")}
    entries_before = io.read_jsonl(store / "official_list" / "entries.jsonl")

    def unavailable(self: Any) -> None:
        self.recorder.degrade("stage:official_list", "fetch failed: pretend outage")

    monkeypatch.setattr(pipeline_module.Pipeline, "official_list", unavailable)
    result = go(client, store, day="2026-09-22")

    assert result.status == "degraded"
    assert {p.stem for p in (store / "works").glob("W-*.json")} == before
    assert io.read_jsonl(store / "official_list" / "entries.jsonl") == entries_before
    assert validate_store(store).errors == []
