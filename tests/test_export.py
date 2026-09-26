"""The app's data contract (docs/05-metrics-and-data-contract.md §4, §5, §12, §13).

The metric definitions are the part most worth testing as arithmetic: the app recomputes all of
them in the browser, so a definition implemented two different ways is a discrepancy nobody sees
until a funder asks why two numbers disagree. Everything here is offline.
"""

import json
import shutil
from pathlib import Path
from typing import Any, cast

import pytest

from uwpr_pubs import __version__
from uwpr_pubs.config import load_config
from uwpr_pubs.export import (
    ExportMeta,
    ExportWork,
    build_export,
    build_lookup,
    build_period,
    build_summary,
    export_work,
    h_index,
    signal_label,
)
from uwpr_pubs.pipeline import CODE_VERSION
from uwpr_pubs.rules.signals import NEAR_MISS_IDENTIFIER
from uwpr_pubs.sample import CASES, missing_cases
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.stages.export import (
    EXPORT_FILE,
    LOOKUP_FILE,
    NoRunError,
    build_from_store,
    export_dir,
    read,
    read_on,
    resource_block,
    schema_problems,
    store_identity,
)
from uwpr_pubs.stages.export import write as write_export
from uwpr_pubs.store.models import Candidate, MetricsLine, Work
from uwpr_pubs.store.read import read_store
from uwpr_pubs.validate import validate_export

SAMPLE_STORE = Path("samples/store")
SAMPLE_EXPORT = Path("samples/export")
SAMPLE_CASES = Path("samples/export_cases.json")


@pytest.fixture(scope="module")
def built() -> tuple[Any, Any]:
    config = load_config()
    return build_from_store(SAMPLE_STORE, resource_block(config), extra=SAMPLE_CASES)


@pytest.fixture(scope="module")
def committed() -> tuple[Any, Any]:
    return read(SAMPLE_EXPORT)


# --- the committed sample ----------------------------------------------------------------------


def test_the_committed_sample_matches_a_fresh_build(
    built: tuple[Any, Any], committed: tuple[Any, Any]
) -> None:
    """`samples/export/` is committed, so it can go stale against the code that wrote it."""
    assert committed[0] == built[0]
    assert committed[1] == built[1]


def test_the_sample_covers_every_case_docs_05_requires(built: tuple[Any, Any]) -> None:
    assert missing_cases(built[0]) == []


def test_the_sample_validates(built: tuple[Any, Any]) -> None:
    document, lookup = built
    assert schema_problems(document, lookup) == []
    report = validate_export(document, lookup, run_year=int(document["run_id"][:4]))
    assert report.errors == []


def test_the_resource_block_states_the_home_institution_and_country() -> None:
    """docs/05 §7.8 and §7.14: the app must be told, not left to infer from frequency."""
    resource = resource_block(load_config())
    assert resource["home_institution"] == {"ror": "00cvxb145", "name": "University of Washington"}
    assert resource["home_country"] == "US"


def test_the_named_exclusions_stay_in_step_with_the_rules() -> None:
    """docs/05 §10: `resource.exclusions` restates in public terms what `rules.yaml` excludes.

    Neither side can be derived from the other — the name a reader recognises is not the regex
    fragment the rules match on — so the guard is parity on the one group where the two use the
    same words: the software the R3 mentions exclusion names. A rule that starts excluding a new
    program without the page naming it, or the page naming one the rules do not exclude, fails
    here rather than leaving the method page quietly wrong.
    """
    config = load_config()
    generic = {"search engine"}  # a category, not something a reader could be shown
    matched = set(config.rules["r3"]["exclusions"]["software"]) - generic
    named = {e["name"] for e in resource_block(config)["exclusions"] if e["kind"] == "software"}
    assert named == matched


def test_the_home_institution_is_what_the_real_store_actually_reports() -> None:
    """A ROR that named nothing in the data would exclude nothing and the chart would not say so.

    Measured against the committed store: 316 of 339 works and 322 of 339 countries, the figures
    docs/05 §7.8 and §7.14 quote.
    """
    config = load_config()
    document, _ = build_from_store(REAL_STORE, resource_block(config))
    home = document["resource"]["home_institution"]
    at_home = [w for w in document["works"] if any(i["ror"] == home["ror"] for i in w["institutions"])]

    assert len(at_home) == 316
    assert {i["name"] for w in at_home for i in w["institutions"] if i["ror"] == home["ror"]} == {
        home["name"]
    }
    country = document["resource"]["home_country"]
    assert sum(country in w["countries"] for w in document["works"]) == 322


def test_every_staff_entry_carries_the_id_that_joins_it_to_an_author() -> None:
    """The join key docs/05 §4.2 was missing: `authors[].staff` and `staff_authors` are ids."""
    config = load_config()
    document, _ = build_from_store(REAL_STORE, resource_block(config))
    staff = {person["id"]: person["name"] for person in document["resource"]["staff"]}

    assert staff == {person["key"]: person["name"] for person in config.staff}
    used = {key for work in document["works"] for key in work["staff_authors"]}
    used |= {a["staff"] for w in document["works"] for a in w["authors"] if a["staff"] is not None}
    assert used <= set(staff), "a staff id on a work that resource.staff cannot name"


def test_the_schema_requires_an_override_to_be_attributed_and_dated(built: tuple[Any, Any]) -> None:
    """The guarantee the app reads (docs/05 §6): the store schema leaves `detail` free, so the
    export schema is where "attributed to the person who decided it and dated" is enforced."""
    document, _ = built
    works = []
    for work in document["works"]:
        evidence = [
            {**e, "detail": {}} if e["rule"] == "override" else e for e in cast(Any, work["evidence"])
        ]
        works.append({**work, "evidence": evidence})
    stripped = {**document, "works": works}

    problems = schema_errors("export", stripped)
    assert any("detail" in problem for problem in problems), problems


def test_the_synthetic_cases_are_valid_store_shapes() -> None:
    """They are merged with real works and go through the same code, so they must be real Works."""
    document = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))
    for work in document["works"]:
        assert schema_errors("work", work) == [], work["id"]
    for line in document["metrics"]:
        assert schema_errors("metrics", line) == [], line["work"]


def test_the_synthetic_cases_cannot_be_mistaken_for_real_papers() -> None:
    """A committed artifact must not assert that a real paper acknowledged UWPR when it did not."""
    document = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))
    for work in document["works"]:
        for record in work["records"]:
            assert record["title"].startswith("SAMPLE: ")
            assert record["ids"]["doi"].startswith("10.0000/sample-")


def test_building_twice_is_byte_identical(tmp_path: Path) -> None:
    """docs/02 §15: two runs on unchanged input produce no diff in `export/`."""
    config = load_config()
    first = build_from_store(SAMPLE_STORE, resource_block(config), extra=SAMPLE_CASES)
    second = build_from_store(SAMPLE_STORE, resource_block(config), extra=SAMPLE_CASES)
    one, two = tmp_path / "one", tmp_path / "two"
    write_export(one, *first)
    write_export(two, *second)
    for name in (EXPORT_FILE, LOOKUP_FILE):
        assert (one / name).read_bytes() == (two / name).read_bytes()


# --- metric definitions (docs/05 §5) -------------------------------------------------------------


def _work(**overrides: Any) -> ExportWork:
    base: dict[str, Any] = {
        "id": "W-000001",
        "aliases": [],
        "title": "t",
        "year": 2020,
        "date": "2020-01-01",
        "first_version_date": "2020-01-01",
        "kind": "article",
        "is_preprint": False,
        "venue": {"name": "J", "issn_l": "1234-5678"},
        "ids": {"doi": None, "pmid": None, "pmcid": None, "openalex": None},
        "url": None,
        "oa": {"status": "gold", "url": "u", "license": None},
        "retracted": False,
        "authors": [],
        "author_count": 0,
        "staff_authors": [],
        "institutions": [],
        "countries": [],
        "corresponding_authors": [],
        "topics": [],
        "citations": {"total": 0, "by_year": {}, "fwci": None, "percentile": None, "as_of": "2026-01-01"},
        "on_official_list": False,
        "criteria": [],
        "evidence": [],
        "versions": [],
    }
    base.update(overrides)
    return cast(ExportWork, base)


@pytest.mark.parametrize(
    ("citations", "expected"),
    [([], 0), ([0, 0], 0), ([1], 1), ([5, 4, 3, 2, 1], 3), ([10, 8, 5, 4, 3], 4), ([100], 1)],
)
def test_h_index(citations: list[int], expected: int) -> None:
    assert h_index(citations) == expected


def test_total_citations_count_the_canonical_record_only() -> None:
    """docs/05 §5. A preprint's own citations are in the store but are not added to the work's."""
    work: Work = json.loads((SAMPLE_STORE / "works" / "W-000006.json").read_text())
    metrics: list[MetricsLine] = [
        json.loads(line) for line in (SAMPLE_STORE / "metrics/latest.jsonl").read_text().splitlines()
    ]
    canonical = next(m for m in metrics if m["record"] == work["canonical"])
    other = next(m for m in metrics if m["work"] == work["id"] and m["record"] != work["canonical"])
    exported = export_work(work, {m["record"]: m for m in metrics}, "2026-09-19")

    assert other["cited_by"] > 0, "the preprint has citations of its own, or this proves nothing"
    assert exported["citations"]["total"] == canonical["cited_by"]


def test_the_median_is_taken_over_works_that_have_a_value() -> None:
    """16 of 339 works have no field-weighted impact; they are excluded, not counted as zero."""
    works = [
        _work(citations={"total": 0, "by_year": {}, "fwci": v, "percentile": None, "as_of": "2026-01-01"})
        for v in (1.0, 3.0, None, None)
    ]
    summary = build_summary(works)
    assert summary["fwci_median"] == 2.0
    assert summary["fwci_mean"] == 2.0


def test_open_access_counts_any_status_but_closed() -> None:
    works = [_work(oa={"status": s, "url": None, "license": None}) for s in ("gold", "green", "closed")]
    assert build_summary(works)["open_access"] == 2


def test_journals_key_on_issn_before_name() -> None:
    """One journal under two names is one journal; two journals sharing a name are two."""
    works = [
        _work(venue={"name": "PNAS", "issn_l": "0027-8424"}),
        _work(venue={"name": "Proc Natl Acad Sci", "issn_l": "0027-8424"}),
        _work(venue={"name": "Other", "issn_l": None}),
        _work(venue=None),
    ]
    assert build_summary(works)["journals"] == 2


def test_institutions_and_countries_count_once_per_work() -> None:
    uw = {"ror": "00cvxb145", "name": "UW", "country": "US"}
    works = [_work(institutions=[uw, uw], countries=["US"]), _work(institutions=[uw], countries=["US"])]
    summary = build_summary(works)
    assert summary["institutions"] == 1
    assert summary["countries"] == 1


def test_research_groups_are_distinct_corresponding_authors() -> None:
    a = {"name": "A", "openalex": "A5001"}
    b = {"name": "B", "openalex": "A5002"}
    works = [_work(corresponding_authors=[a, b]), _work(corresponding_authors=[a])]
    assert build_summary(works)["research_groups"] == 2


# --- the two honesty flags (docs/05 §4.2) --------------------------------------------------------


def test_the_current_year_is_marked_partial() -> None:
    """Without this every time series shows a decline that is an artifact of the calendar."""
    period = build_period([_work(year=2025), _work(year=2026)], run_year=2026)
    assert period["current_year_partial"] is True
    assert period["complete_through"] == 2025


def test_a_store_that_stops_before_this_year_is_not_partial() -> None:
    period = build_period([_work(year=2024)], run_year=2026)
    assert period["current_year_partial"] is False


def test_citations_outside_the_by_year_window_are_reported() -> None:
    """OpenAlex reports citations by year only from 2012; the publications start in 2008."""
    work = _work(
        citations={
            "total": 100,
            "by_year": {"2012": 30, "2013": 20},
            "fwci": None,
            "percentile": None,
            "as_of": "x",
        }
    )
    period = build_period([work], run_year=2026)
    assert period["citation_years_from"] == 2012
    assert period["citations_before_window"] == 50


# --- work projection (docs/05 §4.3) --------------------------------------------------------------


def _minimal_work(records: list[Any], evidence: list[Any]) -> Work:
    return cast(
        Work,
        {
            "schema": 1,
            "id": "W-000001",
            "aliases": [],
            "status": {"included": True, "since": "2026-01-01", "basis": "rules"},
            "canonical": records[0]["id"],
            "records": records,
            "evidence": evidence,
            "discovery": [],
            "rule_version": "2026-09-19.2",
            "created": "2026-01-01",
            "updated": "2026-01-01",
        },
    )


def _record(**overrides: Any) -> Any:
    base: dict[str, Any] = {
        "id": "R-000001",
        "kind": "article",
        "ids": {"doi": "10.0000/x", "pmid": None, "pmcid": None, "openalex": None},
        "title": "T",
        "published": "2020-01-01",
        "year": 2020,
        "venue": None,
        "authors": [],
        "topics": [],
        "oa": {"status": "gold", "url": None, "license": None},
        "retracted": False,
        "fulltext": {"status": "pmc_xml", "checked": "2026-01-01", "recheck_after": None, "cache": None},
        "abstract": None,
        "version_link": None,
        "sources": {},
    }
    base.update(overrides)
    return base


def _evidence(**overrides: Any) -> Any:
    base: dict[str, Any] = {
        "rule": "R2",
        "criterion": 2,
        "label": "L",
        "record": "R-000001",
        "source": {"name": "OpenAlex", "url": None, "retrieved": "2026-01-01", "cache": None},
        "section": "metadata",
        "excerpt": "UWPR95794",
        "detail": {"field": "f"},
        "rule_version": "2026-09-19.2",
        "first_seen": "2026-01-01",
        "last_seen": "2026-01-01",
    }
    base.update(overrides)
    return base


def test_superseded_evidence_is_never_exported() -> None:
    """It stays in the store as the audit trail (docs/05 §4.3)."""
    work = _minimal_work(
        [_record()],
        [
            _evidence(),
            _evidence(
                rule="R3",
                criterion=4,
                excerpt="gone",
                superseded={"by_rule_version": "2026-09-20.1", "date": "x"},
            ),
        ],
    )
    exported = export_work(work, {}, "2026-01-01")
    assert [e["rule"] for e in exported["evidence"]] == ["R2"]
    assert exported["criteria"] == [2]


def test_override_evidence_names_no_version_but_does_name_who_decided_it() -> None:
    """It belongs to the work, not a record, so `found_on` is omitted rather than nulled.

    Its attribution does reach the app: docs/05 §6 shows an override's reason "attributed to the
    person who decided it and dated", and `detail` is where `by` and `date` travel.
    """
    work = _minimal_work(
        [_record()],
        [
            _evidence(
                rule="override",
                criterion=None,
                record=None,
                section="override",
                excerpt=None,
                label="PI confirmed the samples were run at UWPR.",
                detail={"by": "mriffle", "date": "2026-09-20"},
            )
        ],
    )
    exported = export_work(work, {}, "2026-01-01")
    assert "found_on" not in exported["evidence"][0]
    assert exported["evidence"][0]["detail"] == {"by": "mriffle", "date": "2026-09-20"}
    assert exported["evidence"][0]["label"] == "PI confirmed the samples were run at UWPR."
    assert exported["criteria"] == []


def test_evidence_says_which_version_carried_it() -> None:
    """Evidence found on a preprint applies to the whole work (Phase 1 §8)."""
    records = [
        _record(),
        _record(id="R-000002", kind="preprint", ids={"doi": "10.1101/x"}, published="2019-01-01", year=2019),
    ]
    work = _minimal_work(records, [_evidence(record="R-000002")])
    exported = export_work(work, {}, "2026-01-01")
    assert exported["evidence"][0]["found_on"] == {"kind": "preprint", "doi": "10.1101/x"}


def test_affiliations_that_differ_only_in_punctuation_are_collapsed() -> None:
    """Measured: 301 such pairs in the store. The store keeps both; the export shows one."""
    author = {
        "name": "A",
        "orcid": None,
        "openalex": None,
        "staff": None,
        "corresponding": False,
        "affiliations": [
            {
                "raw": "Dept. of Genome Sciences, University of Washington",
                "ror": "00cvxb145",
                "name": "UW",
                "country": "US",
            },
            {
                "raw": "Dept of Genome Sciences University of Washington",
                "ror": "00cvxb145",
                "name": "UW",
                "country": "US",
            },
        ],
    }
    work = _minimal_work([_record(authors=[author])], [_evidence()])
    exported = export_work(work, {}, "2026-01-01")
    assert len(exported["authors"][0]["affiliations_raw"]) == 1
    assert len(exported["authors"][0]["institutions"]) == 1
    assert exported["institutions"] == [{"ror": "00cvxb145", "name": "UW", "country": "US"}]


def test_a_preprint_only_work_is_labelled_and_dated_by_its_preprint() -> None:
    work = _minimal_work([_record(kind="preprint")], [_evidence()])
    exported = export_work(work, {}, "2026-01-01")
    assert exported["is_preprint"] is True
    assert exported["year"] == 2020


def test_first_version_date_is_the_earliest_version() -> None:
    """docs/05 §2.1: the year is the article's, but both dates are exported so it is checkable."""
    records = [
        _record(published="2021-06-01", year=2021),
        _record(id="R-000002", kind="preprint", ids={"doi": "10.1101/y"}, published="2020-09-01", year=2020),
    ]
    exported = export_work(_minimal_work(records, [_evidence()]), {}, "2026-01-01")
    assert exported["date"] == "2021-06-01"
    assert exported["first_version_date"] == "2020-09-01"
    assert exported["year"] == 2021


def test_the_primary_topic_is_flagged() -> None:
    topics = [
        {"domain": "D", "field": "F", "subfield": "S", "topic": "T1", "score": 0.9},
        {"domain": "D", "field": "F", "subfield": "S", "topic": "T2", "score": 0.4},
    ]
    exported = export_work(_minimal_work([_record(topics=topics)], [_evidence()]), {}, "2026-01-01")
    assert [t["primary"] for t in exported["topics"]] == [True, False]


# --- the lookup index (docs/05 §8) ---------------------------------------------------------------


def _meta() -> ExportMeta:
    return ExportMeta(
        run_id="r",
        generated_at="2026-01-01T00:00:00Z",
        pipeline_version="0",
        rule_version=cast(Any, "2026-09-19.2"),
        run_year=2026,
        citations_as_of="2026-01-01",
        resource=cast(
            Any,
            {
                "name": "n",
                "short_name": "s",
                "url": "https://x/",
                "identifier": "i",
                "home_institution": {"ror": "00cvxb145", "name": "n"},
                "home_country": "US",
                "exclusions": [{"kind": "software", "name": "x", "note": "n"}],
                "staff": [],
            },
        ),
    )


def test_every_signal_the_rules_can_emit_has_a_plain_language_label() -> None:
    """A signal without a label is a rejection the app cannot explain (docs/05 §8)."""
    config = load_config()
    emitted = {NEAR_MISS_IDENTIFIER}
    emitted |= {v for v in config.rules["signals"]["exclusion_signals"].values() if v}
    emitted |= {f"core_named:{name}" for name in config.rules["signals"]["cores"]}
    emitted |= {f"staff_coauthor:{p['key']}" for p in config.staff}
    emitted |= {f"staff_ack_other:{p['key']}" for p in config.staff}
    for signal in sorted(emitted):
        assert signal_label(signal) != signal, f"{signal} has no label"


def test_a_candidate_carries_its_reason_and_its_signals_in_words() -> None:
    candidate = cast(
        Candidate,
        {
            "schema": 1,
            "id": "W-000099",
            "records": [
                {"id": "R-000099", "kind": "article", "ids": {"doi": "10.0000/z"}, "title": "T", "year": 2019}
            ],
            "reason": "no_rule_fired",
            "signals": ["staff_coauthor:riffle"],
            "channels": ["G"],
            "fulltext": None,
            "rule_version": "2026-09-19.2",
            "first_seen": "2026-01-01",
            "last_seen": "2026-01-01",
        },
    )
    lookup = build_lookup([candidate], {}, _meta())
    row = lookup["not_included"][0]
    assert row["reason_label"].startswith("No evidence")
    assert row["signal_labels"] == ["A UWPR staff member is a co-author, which on its own is not evidence"]


def test_an_alias_may_point_at_a_candidate(built: tuple[Any, Any]) -> None:
    """aliases.json covers every work, included or not; the lookup is how a rejection answers."""
    document, lookup = built
    included = {w["id"] for w in document["works"]}
    rejected = {row["id"] for row in lookup["not_included"]}
    targets = set(lookup["aliases"].values())
    assert targets & rejected, "the sample should exercise an alias pointing at a candidate"
    assert targets <= included | rejected


# --- the gate (docs/05 §12) ----------------------------------------------------------------------


def test_a_summary_that_disagrees_with_the_rows_is_an_error(built: tuple[Any, Any]) -> None:
    """The highest-value check in the suite: two independent computations of one number."""
    document = json.loads(json.dumps(built[0]))
    document["summary"]["citations"] += 1
    report = validate_export(document, built[1])
    assert any("citations" in error for error in report.errors)


def test_criteria_that_disagree_with_the_evidence_are_an_error(built: tuple[Any, Any]) -> None:
    document = json.loads(json.dumps(built[0]))
    document["works"][0]["criteria"] = [1, 2, 3, 4]
    report = validate_export(document, built[1])
    assert any("does not match evidence" in error for error in report.errors)


def test_an_alias_pointing_nowhere_is_an_error(built: tuple[Any, Any]) -> None:
    document, lookup = built
    broken = json.loads(json.dumps(lookup))
    broken["aliases"]["doi:10.0000/ghost"] = "W-999999"
    report = validate_export(document, broken)
    assert any("W-999999" in error for error in report.errors)


def test_completeness_must_stop_at_the_year_before_the_run(built: tuple[Any, Any]) -> None:
    report = validate_export(built[0], built[1], run_year=2030)
    assert any("complete_through" in error for error in report.errors)


def test_a_work_the_export_leaves_out_is_an_error(built: tuple[Any, Any]) -> None:
    document, lookup = built
    stored: dict[str, Any] = {work["id"]: {"evidence": []} for work in document["works"]}
    stored["W-000999"] = {"evidence": []}
    report = validate_export(document, lookup, store_works=stored)
    assert any("leaves out" in error for error in report.errors)


def test_exporting_a_work_that_is_not_included_is_an_error(built: tuple[Any, Any]) -> None:
    document, lookup = built
    stored: dict[str, Any] = {work["id"]: {"evidence": []} for work in document["works"]}
    del stored[document["works"][0]["id"]]
    report = validate_export(document, lookup, store_works=stored)
    assert any("not an included work" in error for error in report.errors)


# --- where the export is written ------------------------------------------------------------------


def test_the_export_sits_beside_the_store_it_came_from(tmp_path: Path) -> None:
    """A run against a scratch store must never write the repository's own `export/`."""
    assert export_dir(tmp_path / "scratch-store") == tmp_path / "export"
    assert export_dir(Path("store")) == Path("export")


def test_an_empty_corpus_still_produces_a_valid_document() -> None:
    """The first run into an empty store must not crash on min() of nothing."""
    document = build_export(cast(list[Work], []), [], _meta())
    assert document["summary"]["publications"] == 0
    assert document["period"]["citation_years_from"] is None
    assert schema_errors("export", document) == []


def test_every_case_predicate_is_exercised_by_the_sample(built: tuple[Any, Any]) -> None:
    """A predicate that matches nothing would silently stop guarding its case."""
    works = built[0]["works"]
    for name, matches in CASES.items():
        assert any(matches(work) for work in works), name


def test_the_override_case_asks_for_the_attribution_not_just_the_rule(built: tuple[Any, Any]) -> None:
    """§13's case is "an override *with its attribution*".

    While the predicate asked only for `rule == "override"`, the sample passed the coverage guard
    with `detail: {}` — the attribution reached nothing and nothing noticed.
    """
    matches = CASES["override with attribution"]
    work = next(work for work in built[0]["works"] if matches(work))
    entry = next(e for e in work["evidence"] if e["rule"] == "override")
    assert entry["detail"]["by"] and entry["detail"]["date"]

    stripped = {**work, "evidence": [{**entry, "detail": {}}]}
    assert not matches(cast(Any, stripped))


# --- exporting a store that is not the sample (docs/05 §4) ----------------------------------


REAL_STORE = Path("store")


def test_the_real_store_exports_without_the_sample_cases() -> None:
    """The case this was missing: the committed store can never satisfy two of §13's cases.

    It holds no retracted work (0 of 339) and its only override is an *exclude*, which by
    definition never reaches the export. Applying the §13 guard here made `uwpr-pubs export`
    fail permanently against its most obvious target.
    """
    config = load_config()
    document, lookup = build_from_store(REAL_STORE, resource_block(config))

    assert schema_problems(document, lookup) == []
    report = validate_export(document, lookup, run_year=int(document["run_id"][:4]))
    assert report.errors == []
    assert missing_cases(document) == ["override with attribution", "retracted"]


def test_a_real_export_takes_its_period_from_the_store_not_a_constant() -> None:
    """A sample constant here would put a wrong `complete_through` in a real file (docs/05 §4.2)."""
    config = load_config()
    document, _ = build_from_store(REAL_STORE, resource_block(config))
    manifest = json.loads(
        max(Path(REAL_STORE, "runs").glob("*.json"), key=lambda p: p.stem).read_text(encoding="utf-8")
    )

    assert document["run_id"] == manifest["run_id"]
    assert document["generated_at"] == manifest["started"]
    assert document["rule_version"] == manifest["rule_version"]
    assert document["pipeline_version"] == manifest["code_version"]
    assert document["period"]["complete_through"] == int(manifest["run_id"][:4]) - 1


def test_both_export_paths_stamp_the_same_pipeline_version() -> None:
    """The invariant that broke CI on 2026-09-20, and the only thing that guards it.

    Stage 11 stamps `__version__` during a run; a rebuild reads `code_version` back out of the
    run manifest. They are the same field and must hold the same value, or the committed export
    and a rebuild of it disagree — which is exactly what `check.yml`'s freshness diff compares.
    `CODE_VERSION` was the milestone label "m4" while `__version__` was "0.1.0", so they did not.
    """
    assert __version__ == CODE_VERSION


def test_the_period_follows_a_store_whose_run_is_in_another_year(tmp_path: Path) -> None:
    """The guard that matters: shift the store's run year and the export must move with it."""
    config = load_config()
    store = tmp_path / "store"
    shutil.copytree(SAMPLE_STORE, store)
    old = next(iter(Path(store, "runs").glob("*.json")))
    manifest = json.loads(old.read_text(encoding="utf-8"))
    manifest["run_id"] = "2031-04-02T00-00-sample"
    manifest["started"] = "2031-04-02T00:00:00Z"
    Path(store, "runs", "2031-04-02T00-00-sample.json").write_text(json.dumps(manifest), encoding="utf-8")
    old.unlink()

    document, _ = build_from_store(store, resource_block(config))
    assert document["run_id"] == "2031-04-02T00-00-sample"
    assert document["period"]["complete_through"] == 2030
    assert document["period"]["current_year_partial"] is False


def test_a_store_no_run_has_written_cannot_be_exported(tmp_path: Path) -> None:
    """Inventing a generation date would be worse than refusing (docs/05 §1.1 principle 3)."""
    config = load_config()
    store = tmp_path / "store"
    shutil.copytree(SAMPLE_STORE, store)
    shutil.rmtree(store / "runs")

    with pytest.raises(NoRunError):
        build_from_store(store, resource_block(config))


def test_the_sample_store_identity_comes_from_its_own_manifest() -> None:
    """The sample needed no constants of its own; its manifest already said all of it."""
    identity = store_identity(read_store(SAMPLE_STORE))
    assert identity.run_id == "2026-09-19T00-00-sample"
    assert identity.generated_at == "2026-09-19T00:00:00Z"
    assert identity.run_year == 2026
    assert identity.citations_as_of == "2026-09-19"


def test_the_method_page_dates_a_source_the_run_read_with_the_runs_own_day() -> None:
    """docs/05 §10, changed 2026-09-26: the evidence keeps `retrieved` under the 28-day rule, so a
    source every run queries afresh is dated by the run, unless the run could not reach it."""
    channels = load_config().channels
    everything = read_on("2026-10-03", [], channels)
    assert everything == {name: "2026-10-03" for name in ("OpenAlex", "Crossref", "PRIDE", "UWPR website")}

    down = [
        {"source": "channel:J", "cause": "PRIDE timed out"},  # PRIDE is reached through J alone
        {"source": "stage:official_list", "cause": "fetch failed"},
        {"source": "source:ncbi", "cause": "a text source; it has no run date to lose"},
    ]
    assert read_on("2026-10-03", down, channels) == {"OpenAlex": "2026-10-03", "Crossref": "2026-10-03"}
