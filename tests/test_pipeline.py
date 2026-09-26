"""A whole run, offline: stages 0-3, 5, 7, 8, 9, 12 and 13 (docs/03 §5)."""

import datetime as dt
import json
import shutil
import subprocess
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from uwpr_pubs import git as git_module
from uwpr_pubs import pipeline as pipeline_module
from uwpr_pubs.cache import Cache
from uwpr_pubs.config import load_config
from uwpr_pubs.context import RunContext
from uwpr_pubs.http import Budget, HttpClient, Mode, RateLimiter, Response
from uwpr_pubs.pipeline import RunOptions, run_pipeline
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.stages.export import export_dir
from uwpr_pubs.stages.export import read as read_export
from uwpr_pubs.store import io
from uwpr_pubs.validate import validate_export, validate_store

FIXTURES = Path(__file__).resolve().parent / "fixtures"
TODAY = "2026-09-21"
INDEX = "https://proteomicsresource.washington.edu/publications/"

# Three publications, matching the committed page fixture; the first carries the award code.
LISTED_PMIDS = ["38665238", "37615442", "37305927"]
UNLISTED_PMID = "99999999"  # nominated by a channel, but on no list and with no award
PREPRINT_DOI = "10.1101/2023.04.01.535000"  # the preprint of work 1, under a different title


def openalex_work(index: int, *, award: bool = False, year: int = 2023) -> dict[str, Any]:
    work: dict[str, Any] = {
        "id": f"https://openalex.org/W{index}",
        "doi": f"https://doi.org/10.1234/example.{index}",
        "ids": {
            "openalex": f"https://openalex.org/W{index}",
            "doi": f"https://doi.org/10.1234/example.{index}",
            "pmid": "https://pubmed.ncbi.nlm.nih.gov/"
            + (LISTED_PMIDS[index - 1] if index <= len(LISTED_PMIDS) else UNLISTED_PMID),
        },
        "display_name": f"Example work {index}",
        "publication_date": f"{year}-05-0{index}",
        "publication_year": year,
        "type": "article",
        "primary_location": {"source": {"display_name": "J Example", "issn_l": "1234-5678"}},
        "authorships": [
            {
                "author": {"id": "https://openalex.org/A5011565192", "display_name": "Jimmy K. Eng"},
                "institutions": [
                    {
                        "display_name": "University of Washington",
                        "ror": "https://ror.org/00cvxb145",
                        "country_code": "US",
                    }
                ],
                "raw_affiliation_strings": ["University of Washington, Seattle"],
                "is_corresponding": False,
            }
        ],
        "topics": [],
        "open_access": {"oa_status": "gold"},
        "best_oa_location": {"landing_page_url": "https://example.org"},
        "is_retracted": False,
        "cited_by_count": 3 + index,
        "counts_by_year": [{"year": 2024, "cited_by_count": 3 + index}],
        "fwci": 1.5,
        "citation_normalized_percentile": {"value": 0.9},
    }
    if award:
        work["awards"] = [{"funder_award_id": "UWPR95794", "funder_display_name": "UW"}]
    return work


def preprint_work() -> dict[str, Any]:
    """The preprint of work 1. Its title differs, so only a stated relation can link them.

    Its DOI sorts before every `10.1234/…`, so it is minted first and its work ID is the lower
    one — which is the ID the merge must keep (docs/02 §4).
    """
    return {
        "id": "https://openalex.org/W5",
        "doi": f"https://doi.org/{PREPRINT_DOI}",
        "ids": {"openalex": "https://openalex.org/W5", "doi": f"https://doi.org/{PREPRINT_DOI}"},
        "display_name": "A preliminary account of the first example",
        "publication_date": "2023-04-01",
        "publication_year": 2023,
        "type": "preprint",
        "primary_location": {"source": {"display_name": "bioRxiv", "issn_l": None}},
        "authorships": [],
        "topics": [],
        "open_access": {"oa_status": "green"},
        "best_oa_location": {},
        "is_retracted": False,
        "cited_by_count": 0,
        "counts_by_year": [],
        "fwci": None,
        "citation_normalized_percentile": {},
        "awards": [{"funder_award_id": "UWPR95794", "funder_display_name": "UW"}],
    }


# Each listed paper has a PMC copy; the ID converter is what links them (Phase 1 §7).
PMCIDS = {LISTED_PMIDS[0]: "PMC1000001", LISTED_PMIDS[1]: "PMC1000002", LISTED_PMIDS[2]: "PMC1000003"}

# Synthetic JATS (P10), one per listed paper, each exercising a different text rule. Every one
# has a `<body>`: a record without one is what Phase 1 §6.5 means by "no readable text of our
# own", and R6 rather than these rules would then apply.
BODY = "<body><sec><title>Results</title><p>The experiment worked.</p></sec></body>"
JATS = {
    "PMC1000001": f"""<article>{BODY}<back><ack><p>This work was supported in part by the
      University of Washington Proteomics Resource (UWPR95794).</p></ack></back></article>""",
    "PMC1000002": f"""<article>{BODY}<back><ack><p>We also thank Michael Riffle for assistance
      with data analysis and visualization.</p></ack></back></article>""",
    "PMC1000003": f"""<article><front><article-meta><contrib-group><aff><label>1</label>
      University of Washington Proteomics Resource, Seattle, WA 98109, USA</aff></contrib-group>
      </article-meta></front>{BODY}</article>""",
}

STAFF_AUTHOR_IDS = ["A5011565192", "A5067746093", "A5134114528", "A5018903678", "A5101918119"]


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def route(url: str, params: Mapping[str, str]) -> Response:  # noqa: PLR0911, PLR0912 - one branch per source
    """A stand-in for every source this milestone talks to."""
    body: Any
    if url.startswith(INDEX) and url.rstrip("/").endswith("publications"):
        body = '<a href="/publications/2023/">2023</a>'
        return Response(url, 200, body.encode(), {"content-type": "text/html"})
    if "publications/2023" in url:
        return Response(url, 200, page("uwpr_publications_2023.html").encode(), {"content-type": "text/html"})
    if "api.openalex.org/authors" in url:
        # The ORCID check (Phase 1 §5.1): every ID found is already in staff.yaml.
        authors = [{"id": f"https://openalex.org/{i}", "orcid": None} for i in STAFF_AUTHOR_IDS]
        return Response(url, 200, json.dumps({"results": authors, "meta": {}}).encode(), {})
    if "idconv" in url:
        wanted = params.get("ids", "").split(",")
        records = [{"pmid": p, "pmcid": PMCIDS[p]} for p in wanted if p in PMCIDS]
        return Response(url, 200, json.dumps({"records": records}).encode(), {})
    if "efetch.fcgi" in url:
        xml = JATS.get(f"PMC{params.get('id', '')}", "<article/>")
        return Response(url, 200, xml.encode(), {"content-type": "application/xml"})
    if "api.openalex.org/works" in url:
        expression = params.get("filter", "")
        if "awards.funder_award_id" in expression:
            results = [openalex_work(1, award=True), preprint_work()]
        elif expression.startswith("pmid:"):
            wanted = expression.removeprefix("pmid:").split("|")
            results = [openalex_work(i, award=(i == 1)) for i in (1, 2, 3) if LISTED_PMIDS[i - 1] in wanted]
        elif "fulltext.search:UWPR95794" in expression:
            # An R6 phrase, but work 1's own text is readable, so R6 must not fire for it (P13).
            results = [openalex_work(1, award=True)]
        elif '"Proteomics Resource" "University of Washington"' in expression:
            results = [openalex_work(4)]  # the 93% query: nominates only, never includes
        elif "fulltext.search" in expression:
            results = []
        elif expression.startswith("openalex_id:"):
            wanted = expression.removeprefix("openalex_id:").split("|")
            results = [openalex_work(i, award=(i == 1)) for i in (1, 2, 3, 4) if f"W{i}" in wanted]
            results += [preprint_work()] if "W5" in wanted else []
        else:
            results = []
        payload = {"results": results, "meta": {"next_cursor": None}}
        return Response(url, 200, json.dumps(payload).encode(), {})
    if url.endswith(f"/works/{PREPRINT_DOI}"):
        # Crossref states the relation outright, which is the signal version linking trusts most.
        relation = {"message": {"relation": {"is-preprint-of": [{"id": "10.1234/example.1"}]}}}
        return Response(url, 200, json.dumps(relation).encode(), {})
    if "api.crossref.org" in url:
        empty: dict[str, Any] = {"message": {"items": [], "next-cursor": None}}
        return Response(url, 200, json.dumps(empty).encode(), {})
    if "api.biorxiv.org" in url:
        unknown: dict[str, Any] = {"collection": []}
        return Response(url, 200, json.dumps(unknown).encode(), {})
    if "ebi.ac.uk" in url:
        nothing: dict[str, Any] = {"resultList": {"result": []}, "nextCursorMark": ""}
        return Response(url, 200, json.dumps(nothing).encode(), {})
    raise AssertionError(f"unexpected request: {url}")


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


def context_at(store: Path, day: str = TODAY) -> RunContext:
    started = dt.datetime.fromisoformat(f"{day}T09:00:00+00:00")
    return RunContext(today=started.date(), started=started, mode="live", store=store)


def do_run(
    client: HttpClient, store: Path, day: str = TODAY, overrides: Path | None = None, **kwargs: Any
) -> Any:
    config = load_config(overrides_path=overrides)
    options = RunOptions(store=store, check_clean=False, **kwargs)
    return run_pipeline(config, client, context_at(store, day), options)


def test_a_run_builds_a_store_that_validates(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    result = do_run(client, store)

    assert result.status == "ok", result.errors
    assert result.written
    report = validate_store(store)
    assert report.errors == []
    assert report.counts["works"] == 3
    assert report.counts["candidates"] == 1  # nominated, but no rule fired
    assert report.counts["list entries"] == 3


def test_listed_works_carry_r1_and_the_award_carries_r2(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    do_run(client, store)
    works = [io.read_json(p) for p in sorted((store / "works").glob("W-*.json"))]
    rules = {work["id"]: sorted(e["rule"] for e in work["evidence"]) for work in works}

    # One paper states the award code and names the resource, one thanks a staff member, and one
    # gives the resource as an author's address. The first carries a third R2 as well, from the
    # metadata of the preprint stage 6 merged into it.
    assert sorted(rules.values()) == [["R1", "R2", "R2", "R2", "R3"], ["R1", "R5"], ["R1", "R7"]]

    award_work = next(w for w in works if any(e["rule"] == "R2" for e in w["evidence"]))
    r2 = next(e for e in award_work["evidence"] if e["section"] == "metadata")
    assert r2["criterion"] == 2
    assert r2["rule"] == "R2"
    assert r2["excerpt"] == "UWPR95794"
    assert r2["detail"]["field"] == "awards[].funder_award_id"
    r1 = next(e for e in award_work["evidence"] if e["rule"] == "R1")
    assert r1["excerpt"] is None
    assert r1["detail"]["page"] == "2023"


def test_text_evidence_carries_its_excerpt_and_cache(client: HttpClient, tmp_path: Path) -> None:
    """Evidence read from the paper quotes the sentence and points at the cached copy."""
    store = tmp_path / "store"
    do_run(client, store)
    works = [io.read_json(p) for p in sorted((store / "works").glob("W-*.json"))]
    evidence = [e for work in works for e in work["evidence"]]

    text_r2 = next(e for e in evidence if e["rule"] == "R2" and e["section"] == "acknowledgements")
    assert text_r2["detail"] == {"match": "text"}
    assert text_r2["source"]["name"] == "PMC"
    assert text_r2["source"]["cache"].startswith("sha256:")
    assert "UWPR95794" in text_r2["excerpt"]

    r7 = next(e for e in evidence if e["rule"] == "R7")
    assert r7["criterion"] == 3
    assert r7["detail"] == {"staff": "riffle"}
    assert r7["excerpt"].startswith("We also thank Michael Riffle")

    r5 = next(e for e in evidence if e["rule"] == "R5")
    assert r5["section"] == "affiliation"
    assert r5["excerpt"].startswith("University of Washington Proteomics Resource")


def test_r6_does_not_fire_on_a_paper_we_can_read(client: HttpClient, tmp_path: Path) -> None:
    """R6 stands in only for text we cannot read ourselves (Phase 1 §6.5, P13).

    The award-code phrase query returns the one listed paper whose text we have, so R6 must stay
    out of the store even though the phrase matched.
    """
    store = tmp_path / "store"
    do_run(client, store)
    works = [io.read_json(p) for p in sorted((store / "works").glob("W-*.json"))]
    assert not [e for work in works for e in work["evidence"] if e["rule"] == "R6"]


def test_a_preprint_and_its_article_become_one_work(client: HttpClient, tmp_path: Path) -> None:
    """Stage 6: the two records a channel found separately are one work (Phase 1 §8).

    Their titles differ, so the only thing that can join them is Crossref's stated relation —
    which is what Phase 1 §4.3's duplicate preprints need.
    """
    store = tmp_path / "store"
    do_run(client, store)
    works = [io.read_json(p) for p in sorted((store / "works").glob("W-*.json"))]
    merged = next(w for w in works if len(w["records"]) > 1)

    kinds = sorted(record["kind"] for record in merged["records"])
    assert kinds == ["article", "preprint"]
    assert merged["records"][0]["kind"] == "article"  # articles sort first (docs/02 §15)
    canonical = next(r for r in merged["records"] if r["id"] == merged["canonical"])
    assert canonical["kind"] == "article"  # the journal version represents the work

    preprint = next(r for r in merged["records"] if r["kind"] == "preprint")
    article = next(r for r in merged["records"] if r["kind"] == "article")
    assert preprint["version_link"] == {"to": article["id"], "method": "crossref_relation"}
    assert article["version_link"] is None


def test_a_source_answering_an_empty_body_degrades_the_run_instead_of_failing_it(tmp_path: Path) -> None:
    """The catch-up run of 2026-09-26, in miniature (§9, P4).

    bioRxiv's `details` answered HTTP 200 with an empty body to every request. Stage 6 asks it only
    when Crossref states no relation, and it was reached as a bare `JSONDecodeError`, which no
    stage catches: the run failed and wrote nothing, for a source it is built to go without.
    """

    def transport(
        url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response:
        if url.endswith(f"/works/{PREPRINT_DOI}"):
            return Response(url, 200, b'{"message": {}}', {})  # no stated relation, so bioRxiv is asked
        if "api.biorxiv.org" in url:
            return Response(url, 200, b"", {"content-type": "application/json"})
        return route(url, params)

    client = HttpClient(
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
    store = tmp_path / "store"
    result = do_run(client, store)

    assert result.status == "degraded", result.report
    assert result.written
    assert "source:biorxiv: published check unavailable:" in result.report
    assert "HTTP 200 with an empty body" in result.report
    assert validate_store(store).errors == []


def test_a_merge_retires_the_higher_work_id_and_repoints_everything(
    client: HttpClient, tmp_path: Path
) -> None:
    """The lower ID survives; the other becomes an alias, and the list entry follows it."""
    store = tmp_path / "store"
    result = do_run(client, store)
    aliases = io.read_json(store / "aliases.json")["aliases"]
    retired = {key.removeprefix("work:"): target for key, target in aliases.items() if "work:" in key}
    assert retired  # the article's work was merged into the preprint's, which was minted first

    for old, new in retired.items():
        assert not (store / "works" / f"{old}.json").exists()
        assert old > new
        work = io.read_json(store / "works" / f"{new}.json")
        assert old in work["aliases"]

    # Everything that named the retired work now names the survivor, or validation would fail.
    entries = io.read_jsonl(store / "official_list" / "entries.jsonl")
    assert not {entry["work"] for entry in entries} & set(retired)
    assert not set(aliases.values()) & set(retired)
    manifest = io.read_json(store / "runs" / f"{result.run_id}.json")
    assert manifest["changes"]["merged"] == [
        {"into": new, "retired": old} for old, new in sorted(retired.items())
    ]


def test_a_resolved_pmcid_is_kept_and_aliased(client: HttpClient, tmp_path: Path) -> None:
    """The ID converter's PMCID must survive the next run's OpenAlex refresh, which lacks it."""
    store = tmp_path / "store"
    do_run(client, store)
    do_run(client, store, day="2026-09-22")
    aliases = io.read_json(store / "aliases.json")["aliases"]
    works = [io.read_json(p) for p in sorted((store / "works").glob("W-*.json"))]
    pmcids = {r["ids"]["pmcid"] for work in works for r in work["records"] if r["ids"].get("pmcid")}
    assert pmcids == set(PMCIDS.values())
    assert all(f"pmcid:{pmcid}" in aliases for pmcid in pmcids)


def test_every_list_entry_maps_to_an_included_work(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    do_run(client, store)
    entries = io.read_jsonl(store / "official_list" / "entries.jsonl")
    works = {p.stem for p in (store / "works").glob("W-*.json")}
    assert entries
    assert all(entry["work"] in works for entry in entries)


def test_metrics_and_the_run_record_are_written(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    result = do_run(client, store)
    metrics = io.read_jsonl(store / "metrics" / "latest.jsonl")
    assert len(metrics) == 4  # one per record: three articles and the merged preprint
    assert metrics[0]["source"] == "OpenAlex"
    assert (store / "metrics" / "2026-09.jsonl").exists()
    manifest = io.read_json(store / "runs" / f"{result.run_id}.json")
    assert manifest["status"] == "ok"
    assert manifest["rule_version"] == load_config().rule_version
    assert (store / "runs" / f"{result.run_id}.md").exists()


def test_a_second_run_the_same_day_changes_no_data(client: HttpClient, tmp_path: Path) -> None:
    """Idempotence (docs/03 §1): only the run record differs between two identical runs."""
    store = tmp_path / "store"
    do_run(client, store)
    before = {p: p.read_bytes() for p in sorted(store.rglob("*")) if p.is_file() and "runs" not in p.parts}
    do_run(client, store)
    after = {p: p.read_bytes() for p in sorted(store.rglob("*")) if p.is_file() and "runs" not in p.parts}
    assert before == after


def test_a_run_never_deletes_what_it_did_not_generate(client: HttpClient, tmp_path: Path) -> None:
    """The owned-paths policy of stage 13."""
    store = tmp_path / "store"
    do_run(client, store)
    snapshot = store / "official_list" / "pages" / "2026-09-01" / "current.html"
    io.write_text_atomic(snapshot, "<html>an earlier snapshot</html>")
    monthly = store / "metrics" / "2026-08.jsonl"
    io.write_jsonl(monthly, io.read_jsonl(store / "metrics" / "latest.jsonl"))
    first_work = sorted((store / "works").glob("W-*.json"))[0].stem
    generated = store / "works" / f"{first_work}.generated.json"
    io.write_json(
        generated,
        {
            "schema": 1,
            "work": first_work,
            "inputs": {"fingerprint": "sha256:" + "0" * 64, "parts": ["evidence"]},
            "generator": {"name": "test", "version": "0", "date": TODAY},
            "content": {},
        },
    )

    do_run(client, store, day="2026-09-22")

    assert snapshot.exists()
    assert monthly.exists()
    assert generated.exists()
    assert len(list((store / "runs").glob("*.json"))) == 2


def test_a_dirty_store_stops_the_run(client: HttpClient, tmp_path: Path) -> None:
    """A crashed run leaves files that must not be read back as committed (stage 0)."""
    store = tmp_path / "store"
    do_run(client, store)
    git = shutil.which("git") or "git"
    subprocess.run([git, "init", "-q"], cwd=tmp_path, check=True)  # noqa: S603
    subprocess.run([git, "add", "-A"], cwd=tmp_path, check=True)  # noqa: S603
    subprocess.run(  # noqa: S603
        [git, "-c", "user.email=t@e.st", "-c", "user.name=t", "commit", "-qm", "seed"],
        cwd=tmp_path,
        check=True,
    )
    (store / "works" / "W-000999.json").write_text("{}", encoding="utf-8")  # an orphan from a crash

    config = load_config()
    result = run_pipeline(config, client, context_at(store), RunOptions(store=store))
    assert result.status == "failed"
    assert "uncommitted changes" in result.report
    assert (store / "works" / "W-000999.json").exists()  # nothing was touched


def test_a_dirty_store_stops_the_run_when_it_is_named_by_a_relative_path(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`--store store`, the default, and the only spelling CI and a local run ever use.

    The check runs git with the store as its working directory, so the relative pathspec
    `store` is read as `store/store` and matches nothing — and `git status` answers "nothing
    changed" rather than failing, so the guard passed silently on the one store that matters.
    Its sibling `test_the_store_commits_when_it_is_named_by_a_relative_path` covers stage 13,
    where `git add` on a pathspec matching nothing is an error and so was caught long ago.
    """
    _git_repository(tmp_path)
    monkeypatch.chdir(tmp_path)
    do_run(client, Path("store"))
    (Path("store") / "works" / "W-000999.json").write_text("{}", encoding="utf-8")

    config = load_config()
    result = run_pipeline(config, client, context_at(Path("store")), RunOptions(store=Path("store")))

    assert result.status == "failed"
    assert "uncommitted changes" in result.report


def test_a_failing_gate_writes_nothing_but_still_reports(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """§10.6: a run that fails at validation still produces a report, outside the store."""
    store = tmp_path / "store"
    do_run(client, store)
    before = {p: p.read_bytes() for p in sorted(store.rglob("*")) if p.is_file()}

    broken = validate_store(tmp_path / "does-not-exist")
    monkeypatch.setattr(pipeline_module, "validate_store", lambda *a, **k: broken)
    summary = tmp_path / "summary.md"
    result = do_run(client, store, day="2026-09-23", summary_out=summary)

    assert result.status == "failed"
    assert not result.written
    assert {p: p.read_bytes() for p in sorted(store.rglob("*")) if p.is_file()} == before
    assert "FAILED" in summary.read_text(encoding="utf-8")


def test_dry_run_writes_nothing(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    result = do_run(client, store, dry_run=True)
    assert result.status == "ok"
    assert not result.written
    assert not store.exists() or not any(store.rglob("W-*.json"))


def test_record_ids_are_permanent_across_runs(client: HttpClient, tmp_path: Path) -> None:
    """A record id, once minted, never changes — including for a work that is not included."""
    store = tmp_path / "store"
    do_run(client, store)
    first = io.read_jsonl(store / "candidates.jsonl")
    assert first and first[0]["records"]
    before = {line["id"]: [r["id"] for r in line["records"]] for line in first}

    do_run(client, store, day="2026-09-22")

    after = {
        line["id"]: [r["id"] for r in line["records"]] for line in io.read_jsonl(store / "candidates.jsonl")
    }
    assert after == before


def test_a_candidate_keeps_its_metrics_and_metadata_refresh(client: HttpClient, tmp_path: Path) -> None:
    """Every stored record is refreshed each run, not only what a channel named (§6.1)."""
    store = tmp_path / "store"
    do_run(client, store)
    first = io.read_jsonl(store / "metrics" / "latest.jsonl")
    do_run(client, store, day="2026-09-22")
    assert len(io.read_jsonl(store / "metrics" / "latest.jsonl")) == len(first)


def _git_repository(tmp_path: Path) -> str:
    git = shutil.which("git") or "git"
    subprocess.run([git, "init", "-q"], cwd=tmp_path, check=True)  # noqa: S603
    subprocess.run([git, "config", "user.email", "t@e.st"], cwd=tmp_path, check=True)  # noqa: S603
    subprocess.run([git, "config", "user.name", "t"], cwd=tmp_path, check=True)  # noqa: S603
    (tmp_path / "README").write_text("seed", encoding="utf-8")
    subprocess.run([git, "add", "-A"], cwd=tmp_path, check=True)  # noqa: S603
    subprocess.run([git, "commit", "-qm", "seed"], cwd=tmp_path, check=True)  # noqa: S603
    return git


def _log(git: str, cwd: Path) -> list[str]:
    done = subprocess.run(  # noqa: S603
        [git, "log", "--format=%s"], cwd=cwd, capture_output=True, text=True, check=True
    )
    return done.stdout.splitlines()


def test_a_successful_run_commits_its_data(client: HttpClient, tmp_path: Path) -> None:
    """The pipeline makes one bot commit per run; the update workflow pushes it (P3, C3)."""
    git = _git_repository(tmp_path)
    store = tmp_path / "store"
    result = do_run(client, store)

    assert result.commit
    assert _log(git, tmp_path)[0].startswith("Data update ")
    assert not git_module.status([store], store), "the store should be clean after committing"

    # The manifest and the report are committed with the data they describe.
    committed = subprocess.run(  # noqa: S603
        [git, "show", "--name-only", "--format=", "HEAD"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert f"store/runs/{result.run_id}.json" in committed
    assert f"store/runs/{result.run_id}.md" in committed

    # `export/` is a committed build product beside the store (docs/02 §3), and docs/07 §3 counts
    # it among what a normal week changes. One commit carries both, so the workflow scans and
    # pushes a single hash, and `main` never advertises data the store no longer holds.
    assert "export/uwpr_publications.json" in committed
    assert "export/lookup_index.json" in committed
    assert not git_module.status([export_dir(store)], store), "the export should be clean too"


def test_an_uncommitted_export_stops_the_run(client: HttpClient, tmp_path: Path) -> None:
    """Stage 0 refuses on a dirty `store/` **or `export/`** (docs/03 §5 stage 0)."""
    git = _git_repository(tmp_path)
    store = tmp_path / "store"
    do_run(client, store)
    (export_dir(store) / "uwpr_publications.json").write_text("{}", encoding="utf-8")

    config = load_config()
    result = run_pipeline(config, client, context_at(store), RunOptions(store=store))

    assert result.status == "failed"
    assert "uncommitted changes" in result.report
    assert _log(git, tmp_path)[0].startswith("Data update ")  # nothing new was committed


def test_the_store_commits_when_it_is_named_by_a_relative_path(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`--store store`, which is the default and what the weekly run uses.

    The commit runs with the store as its working directory, so a relative "store" pathspec
    would be read as `store/store` and match nothing. The first real seed run hit exactly this,
    and reported OK, because the failure lands after the report has been rendered.
    """
    git = _git_repository(tmp_path)
    monkeypatch.chdir(tmp_path)
    result = do_run(client, Path("store"))

    assert result.status == "ok", result.report
    assert result.commit
    assert _log(git, tmp_path)[0].startswith("Data update ")
    assert not git_module.status([Path("store")], tmp_path)


def test_a_commit_that_fails_says_so_in_the_report(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The report is rendered before the commit, so an alert from it must re-render (§10.6)."""
    _git_repository(tmp_path)
    store = tmp_path / "store"

    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise subprocess.CalledProcessError(128, ["git", "commit"], stderr="nothing to commit")

    monkeypatch.setattr(git_module, "commit", refuse)
    result = do_run(client, store)

    assert result.status == "alert"
    assert "could not be committed" in result.report
    assert "could not be committed" in (store / "runs" / f"{result.run_id}.md").read_text()


def test_a_second_run_that_changes_nothing_makes_no_second_data_commit(
    client: HttpClient, tmp_path: Path
) -> None:
    """Only `runs/` differs, so there is something to commit — but it must be one commit, not two."""
    git = _git_repository(tmp_path)
    store = tmp_path / "store"
    do_run(client, store)
    do_run(client, store, day="2026-09-22")
    assert len([line for line in _log(git, tmp_path) if line.startswith("Data update")]) == 2


def test_no_commit_writes_the_store_and_leaves_git_alone(client: HttpClient, tmp_path: Path) -> None:
    git = _git_repository(tmp_path)
    store = tmp_path / "store"
    result = do_run(client, store, no_commit=True)
    assert result.written
    assert result.commit is None
    assert _log(git, tmp_path) == ["seed"]


def test_naming_channels_implies_no_commit(client: HttpClient, tmp_path: Path) -> None:
    """§8: a partial run must not commit, advance any last_seen or remove anything."""
    git = _git_repository(tmp_path)
    store = tmp_path / "store"
    result = do_run(client, store, channels=("B1",))
    assert result.written
    assert result.commit is None
    assert _log(git, tmp_path) == ["seed"]


def test_a_source_failing_three_runs_running_raises_an_alert(
    client: HttpClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """§9: one failure degrades, three in a row need a person. Nothing is ever removed."""
    store = tmp_path / "store"
    do_run(client, store)
    before = len(list((store / "works").glob("W-*.json")))

    def failing(self: Any) -> None:
        self.recorder.degrade("source:openalex", "pretend outage")

    monkeypatch.setattr(pipeline_module.Pipeline, "check_staff_orcids", failing)
    first = do_run(client, store, day="2026-09-22")
    second = do_run(client, store, day="2026-09-23")
    third = do_run(client, store, day="2026-09-24")

    assert [first.status, second.status, third.status] == ["degraded", "degraded", "alert"]
    assert "has now failed in 3 runs in a row" in third.report
    assert len(list((store / "works").glob("W-*.json"))) == before


def test_an_override_merges_two_works_that_nothing_else_can_join(client: HttpClient, tmp_path: Path) -> None:
    """docs/02 §9's worked example: titles too different to link automatically."""
    store = tmp_path / "store"
    do_run(client, store)
    works = sorted(p.stem for p in (store / "works").glob("W-*.json"))
    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        f"- target: [{works[1]}, {works[2]}]\n"
        "  action: merge\n"
        '  reason: "Preprint and article; titles differ too much to link automatically."\n'
        "  by: mriffle\n"
        "  date: 2026-09-22\n",
        encoding="utf-8",
    )

    result = do_run(client, store, day="2026-09-22", overrides=overrides)

    assert result.status == "ok", result.errors
    assert not (store / "works" / f"{works[2]}.json").exists()
    survivor = io.read_json(store / "works" / f"{works[1]}.json")
    assert works[2] in survivor["aliases"]
    assert io.read_json(store / "aliases.json")["aliases"][f"work:{works[2]}"] == works[1]
    assert validate_store(store, overrides).errors == []


def test_duplicate_openalex_records_for_one_doi_are_chosen_the_same_way(tmp_path: Path) -> None:
    """OpenAlex holds two work records for some DOIs, and returns them in no fixed order.

    One live DOI resolved to a `dissertation` on one run and an `article` on the next, which
    changed both `aliases.json` and the candidate's reason. The choice is now the lowest id,
    whatever order they arrive in.
    """
    high = {"id": "https://openalex.org/W4375844275", "doi": "https://doi.org/10.1/x", "type": "dissertation"}
    low = {"id": "https://openalex.org/W2782300612", "doi": "https://doi.org/10.1/x", "type": "article"}

    assert pipeline_module._preferred([high, low]) is low
    assert pipeline_module._preferred([low, high]) is low
    assert pipeline_module._preferred([]) is None


def test_a_run_writes_the_export_beside_its_store(client: HttpClient, tmp_path: Path) -> None:
    """Stage 11 runs in the pipeline, and stage 13 publishes it outside the store (docs/02 §3)."""
    store = tmp_path / "store"
    result = do_run(client, store)
    assert result.status == "ok", result.errors

    exported = export_dir(store)
    assert exported == tmp_path / "export"
    assert not (store / "export").exists(), "the export must not land inside the store"

    document, lookup = read_export(exported)
    assert schema_errors("export", document) == []
    assert schema_errors("lookup-index", lookup) == []
    assert document["summary"]["publications"] == len(document["works"]) == 3
    assert validate_export(document, lookup, run_year=int(TODAY[:4])).errors == []


def test_a_dry_run_writes_no_export(client: HttpClient, tmp_path: Path) -> None:
    store = tmp_path / "store"
    do_run(client, store, dry_run=True)
    assert not export_dir(store).exists()
