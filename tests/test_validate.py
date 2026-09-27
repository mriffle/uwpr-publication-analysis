"""The validator catches each broken store for the right reason (docs/02 §14, §18).

The spec-phase mutation cases were scratch work and were not kept, so they are rebuilt here: each
case copies the sample store, breaks one thing, and asserts the matching complaint.
"""

import json
import re
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.store import io
from uwpr_pubs.validate import validate_store

SAMPLES = Path(__file__).resolve().parent.parent / "samples"
FUNDING = Path(__file__).resolve().parent / "fixtures" / "funding"  # synthetic, over the sample's works


@pytest.fixture
def store(tmp_path: Path) -> Path:
    shutil.copytree(SAMPLES / "store", tmp_path / "store")
    shutil.copy(SAMPLES / "overrides.yaml", tmp_path / "overrides.yaml")
    return tmp_path / "store"


@pytest.fixture
def funded(store: Path) -> Path:
    """The sample's works with B4's synthetic `funding/` (docs/09 §8), in place of its own."""
    shutil.rmtree(store / "funding")
    shutil.copytree(FUNDING, store / "funding")
    return store


def test_the_sample_store_is_valid(store: Path) -> None:
    """With the funding its build fetched live (B8): one citations line per included work."""
    report = validate_store(store)
    assert report.errors == []
    funding = {
        name: len(io.read_jsonl(store / "funding" / f"{name}.jsonl"))
        for name in ("grants", "lookups", "agencies")
    }
    assert report.counts == {
        "works": 13,
        "candidates": 7,
        "list entries": 4,
        "metrics lines": 30,
        "overrides": 2,
        "funding citations": 13,
        "grants": funding["grants"],
        "funding lookups": funding["lookups"],
        "agencies": funding["agencies"],
    }


def test_a_missing_store_is_an_error(tmp_path: Path) -> None:
    report = validate_store(tmp_path / "nowhere")
    assert not report.ok
    assert "does not exist" in report.errors[0]


def test_an_empty_store_is_an_error(tmp_path: Path) -> None:
    (tmp_path / "store").mkdir()
    report = validate_store(tmp_path / "store")
    assert not report.ok
    assert any("store is empty" in e for e in report.errors)


def _rename_work(store: Path) -> None:
    (store / "works" / "W-000001.json").rename(store / "works" / "W-000099.json")


def _duplicate_into_candidates(store: Path) -> None:
    lines = io.read_jsonl(store / "candidates.jsonl")
    duplicate = dict(lines[0])
    duplicate["id"] = "W-000001"
    io.write_jsonl(store / "candidates.jsonl", [*lines, duplicate])


def _retired_id_still_in_use(store: Path) -> None:
    aliases = io.read_json(store / "aliases.json")
    aliases["aliases"]["work:W-000001"] = "W-000002"
    io.write_json(store / "aliases.json", aliases)


def _duplicate_record_id(store: Path) -> None:
    work = io.read_json(store / "works" / "W-000002.json")
    work["records"][0]["id"] = "R-000001"
    io.write_json(store / "works" / "W-000002.json", work)


def _drop_an_alias(store: Path) -> None:
    aliases = io.read_json(store / "aliases.json")
    del aliases["aliases"]["doi:10.1016/j.jasms.2008.10.025"]
    io.write_json(store / "aliases.json", aliases)


def _alias_to_unknown_work(store: Path) -> None:
    aliases = io.read_json(store / "aliases.json")
    aliases["aliases"]["doi:10.9999/nowhere"] = "W-000999"
    io.write_json(store / "aliases.json", aliases)


def _canonical_outside_the_work(store: Path) -> None:
    work = io.read_json(store / "works" / "W-000001.json")
    work["canonical"] = "R-000999"
    io.write_json(store / "works" / "W-000001.json", work)


def _evidence_points_nowhere(store: Path) -> None:
    work = io.read_json(store / "works" / "W-000001.json")
    work["evidence"][0]["record"] = "R-000999"
    io.write_json(store / "works" / "W-000001.json", work)


def _supersede_all_evidence(store: Path) -> None:
    work = io.read_json(store / "works" / "W-000007.json")
    for evidence in work["evidence"]:
        evidence["superseded"] = {"by_rule_version": "2026-09-20.1", "date": "2026-09-20"}
    io.write_json(store / "works" / "W-000007.json", work)


def _list_entry_to_a_candidate(store: Path) -> None:
    entries = io.read_jsonl(store / "official_list" / "entries.jsonl")
    entries[0]["work"] = "W-000016"
    io.write_jsonl(store / "official_list" / "entries.jsonl", entries)


def _metrics_for_an_excluded_work(store: Path) -> None:
    metrics = io.read_jsonl(store / "metrics" / "latest.jsonl")
    metrics[0]["work"] = "W-000016"
    io.write_jsonl(store / "metrics" / "latest.jsonl", metrics)


def _candidate_on_the_official_list(store: Path) -> None:
    entries = io.read_jsonl(store / "official_list" / "entries.jsonl")
    lines = io.read_jsonl(store / "candidates.jsonl")
    entries[0]["work"] = lines[0]["id"]
    io.write_jsonl(store / "official_list" / "entries.jsonl", entries)


def _break_the_schema(store: Path) -> None:
    work = io.read_json(store / "works" / "W-000001.json")
    work["rule_version"] = "2026-09-19"  # missing the mandatory .N
    io.write_json(store / "works" / "W-000001.json", work)


def _malformed_json(store: Path) -> None:
    (store / "works" / "W-000001.json").write_text("{not json", encoding="utf-8")


def _generated_for_an_excluded_work(store: Path) -> None:
    generated = io.read_json(store / "works" / "W-000006.generated.json")
    generated["work"] = "W-000016"
    io.write_json(store / "works" / "W-000016.generated.json", generated)


def _override_target_that_vanished(store: Path) -> None:
    overrides = (store.parent / "overrides.yaml").read_text(encoding="utf-8")
    (store.parent / "overrides.yaml").write_text(overrides.replace("W-000014", "W-000404"), encoding="utf-8")


def _override_target_that_is_a_doi(store: Path) -> None:
    overrides = (store.parent / "overrides.yaml").read_text(encoding="utf-8")
    (store.parent / "overrides.yaml").write_text(overrides.replace("W-000014", "10.1234/x"), encoding="utf-8")


MUTATIONS: list[tuple[str, Callable[[Path], None], str]] = [
    ("file name does not match id", _rename_work, "file name does not match id"),
    ("work in two places", _duplicate_into_candidates, "present in both works/ and candidates.jsonl"),
    ("retired id still in use", _retired_id_still_in_use, "retired ID still in use"),
    ("record owned twice", _duplicate_record_id, "record in both"),
    ("missing alias", _drop_an_alias, "aliases.json does not map"),
    ("alias to unknown work", _alias_to_unknown_work, "not a current work"),
    ("canonical outside work", _canonical_outside_the_work, "canonical record not among its records"),
    ("evidence points nowhere", _evidence_points_nowhere, "evidence R1 points to"),
    ("no active evidence", _supersede_all_evidence, "included without active evidence"),
    ("list entry not included", _list_entry_to_a_candidate, "not an included work"),
    ("metrics for excluded work", _metrics_for_an_excluded_work, "which is not an included work"),
    ("candidate on the list", _candidate_on_the_official_list, "R1 always wins"),
    ("schema violation", _break_the_schema, "schema: rule_version"),
    ("malformed json", _malformed_json, "invalid JSON"),
    ("generated for excluded work", _generated_for_an_excluded_work, "work that is not included"),
    ("override target gone", _override_target_that_vanished, "does not resolve"),
    ("override target a doi", _override_target_that_is_a_doi, "0/target: '10.1234/x' does not match"),
]


@pytest.mark.parametrize(("name", "mutate", "expected"), MUTATIONS, ids=[m[0] for m in MUTATIONS])
def test_broken_store_is_caught(
    store: Path, name: str, mutate: Callable[[Path], None], expected: str
) -> None:
    mutate(store)
    report = validate_store(store)
    assert not report.ok, f"{name}: no error reported"
    assert any(expected in error for error in report.errors), f"{name}: got {report.errors}"


def test_a_past_month_may_name_a_work_that_has_since_left(store: Path) -> None:
    """A month's metrics are a record of what was true then (docs/02 §10, changed 2026-09-20).

    A work can leave afterwards — a rule change, an exclude override, or a merge into another
    work — and rewriting the history to hide that would be worse than carrying it.
    """
    lines = io.read_jsonl(store / "metrics" / "latest.jsonl")
    lines[0]["work"] = "W-000016"  # a work that is not included
    io.write_jsonl(store / "metrics" / "2026-08.jsonl", lines)
    report = validate_store(store)
    assert report.ok, report.errors
    assert any("W-000016" in warning for warning in report.warnings)


def test_a_past_month_naming_a_merged_work_resolves_through_the_aliases(store: Path) -> None:
    """A retired work ID still resolves, so a merge leaves no dangling metrics behind."""
    lines = io.read_jsonl(store / "metrics" / "latest.jsonl")
    retired = "W-000404"
    aliases = io.read_json(store / "aliases.json")
    aliases["aliases"][f"work:{retired}"] = lines[0]["work"]
    io.write_json(store / "aliases.json", aliases)
    io.write_jsonl(store / "metrics" / "2026-08.jsonl", [{**lines[0], "work": retired}])
    report = validate_store(store)
    assert report.ok, report.errors
    assert not [warning for warning in report.warnings if retired in warning]


def test_unreadable_text_without_a_recheck_date_is_only_a_warning(store: Path) -> None:
    path = store / "works" / "W-000010.json"
    work = json.loads(path.read_text(encoding="utf-8"))
    for record in work["records"]:
        record["fulltext"] = {**record["fulltext"], "status": "unavailable", "recheck_after": None}
    io.write_json(path, work)
    report = validate_store(store)
    assert report.ok
    assert any("no recheck_after" in warning for warning in report.warnings)


# --- store/funding/: invariants F1-F7 (docs/09 §8.6) ----------------------------------------------


def test_the_sample_store_with_funding_is_valid(funded: Path) -> None:
    report = validate_store(funded)
    assert report.errors == []
    assert report.warnings == ["cache: 18 cache references not checked: no cache/index.jsonl"]
    assert report.counts == {
        "works": 13,
        "candidates": 7,
        "list entries": 4,
        "metrics lines": 30,
        "overrides": 2,
        "funding citations": 12,
        "grants": 17,
        "funding lookups": 5,
        "agencies": 14,
    }


def test_an_empty_funding_directory_is_valid(store: Path) -> None:
    """What the stage writes for a store whose works list no grant at all."""
    for name in ("citations", "grants", "lookups", "agencies"):
        io.write_jsonl(store / "funding" / f"{name}.jsonl", [])
    report = validate_store(store)
    assert report.errors == []
    assert report.counts["grants"] == 0


def edit_funding(store: Path, name: str, change: Callable[[list[Any]], Any]) -> None:
    """Change a funding file's lines in place, or replace them with what `change` returns."""
    path = store / "funding" / f"{name}.jsonl"
    lines = io.read_jsonl(path)
    replaced = change(lines)
    io.write_jsonl(path, lines if replaced is None else replaced)


def line(lines: list[Any], field: str, value: str) -> Any:
    return next(item for item in lines if item[field] == value)


def _f1_malformed_lines(store: Path) -> None:
    def change(grants: list[Any]) -> None:
        line(grants, "key", "NIH:P30DK017047")["category"] = "large"  # not in the vocabulary
        grants.append(dict(line(grants, "key", "NSF:1443474")))  # the same grant twice

    edit_funding(store, "grants", change)
    path = store / "funding" / "lookups.jsonl"
    path.write_text(path.read_text(encoding="utf-8") + "{not json\n", encoding="utf-8")


def _f2_lines_for_works_not_included(store: Path) -> None:
    def change(citations: list[Any]) -> None:
        line(citations, "work", "W-000013")["work"] = "W-000016"  # a candidate
        line(citations, "work", "W-000004")["work"] = "W-000005"  # retired into W-000004 by a merge

    edit_funding(store, "citations", change)


def _f3_grants_that_are_not_the_union(store: Path) -> None:
    def change(citations: list[Any]) -> None:
        # W-000011 lists R01GM086688; W-000007 does not, and drops one it does list.
        line(citations, "work", "W-000007")["grants"] = ["NIH:P30DK017047", "NIH:R01GM086688"]

    edit_funding(store, "citations", change)


def _f4_a_listed_key_with_no_grant_and_a_grant_nobody_lists(store: Path) -> None:
    def change(grants: list[Any]) -> None:
        grants.remove(line(grants, "key", "USA:NASA:NNX14AJ87G"))
        grants.append({**line(grants, "key", "NIH:R01GM086688"), "key": "NIH:R01GM999999"})

    edit_funding(store, "grants", change)


def _f5_missing_agencies_and_a_cycle(store: Path) -> None:
    edit_funding(
        store, "grants", lambda grants: line(grants, "key", "NIH:P30DK017047").update(agency="NIDCR")
    )

    def change(agencies: list[Any]) -> None:
        line(agencies, "code", "NIH")["parent"] = "NIGMS"  # NIH -> NIGMS -> NIH
        line(agencies, "code", "VR")["parent"] = "SE-GOV"

    edit_funding(store, "agencies", change)


def _f6_amounts_that_disagree_with_themselves(store: Path) -> None:
    def change(grants: list[Any]) -> None:
        line(grants, "key", "USA:NASA:NNX14AJ87G")["amount"]["usd"] = 796090  # round(796089.19 * 1)
        line(grants, "key", "NIH:P30DK017047")["facts"]["reporter"]["fiscal_years"]["2019"] += 1

    edit_funding(store, "grants", change)


def _f7_a_resource_code_string_that_lists_a_grant(store: Path) -> None:
    def change(citations: list[Any]) -> None:
        strings = line(citations, "work", "W-000001")["strings"]
        line(strings, "outcome", "resource_code")["grants"] = ["NIH:T32GM007750"]  # listed anyway

    edit_funding(store, "citations", change)


def _f7_the_resource_code_as_a_grant(store: Path) -> None:
    def rename(value: Any) -> Any:
        if isinstance(value, dict):
            return {key: rename(item) for key, item in value.items()}
        if isinstance(value, list):
            return [rename(item) for item in value]
        return "MISC:UWPR95794" if value == "MISC:R01GM122864" else value

    for name in ("citations", "grants"):
        edit_funding(store, name, rename)


FUNDING_MUTATIONS: list[tuple[str, Callable[[Path], None], str, list[str]]] = [
    (
        "F1 schema, duplicate, json",
        _f1_malformed_lines,
        "F1",
        ["'large' is not one of", "a second line for grant NSF:1443474", "invalid JSON"],
    ),
    (
        "F2 candidate and retired",
        _f2_lines_for_works_not_included,
        "F2",
        ["W-000016 is not an included work", "W-000005 is a retired work ID, merged into W-000004"],
    ),
    (
        "F3 not the union",
        _f3_grants_that_are_not_the_union,
        "F3",
        ["missing ['NIH:P01HL092969'], listed by no string or link ['NIH:R01GM086688']"],
    ),
    (
        "F4 both halves",
        _f4_a_listed_key_with_no_grant_and_a_grant_nobody_lists,
        "F4",
        [
            "W-000013 lists USA:NASA:NNX14AJ87G, which grants.jsonl lacks",
            "NIH:R01GM999999 is listed by no work",
        ],
    ),
    (
        "F5 missing and a cycle",
        _f5_missing_agencies_and_a_cycle,
        "F5",
        [
            "NIH:P30DK017047's agency NIDCR is not in agencies.jsonl",
            "VR's parent SE-GOV is not in agencies.jsonl",
            "the agencies' parents form a cycle: NIH -> NIGMS -> NIH",
        ],
    ),
    (
        "F6 rate and fiscal years",
        _f6_amounts_that_disagree_with_themselves,
        "F6",
        [
            "USA:NASA:NNX14AJ87G's usd 796090 is not round(796089.19 * 1) = 796089",
            "NIH:P30DK017047's usd 5050000 is not the sum of its fiscal years, 5050001",
        ],
    ),
    (
        "F7 resource code string",
        _f7_a_resource_code_string_that_lists_a_grant,
        "F7",
        ["W-000001's resource_code string 'UWPR95794' lists ['NIH:T32GM007750']"],
    ),
    (
        "F7 resource code grant",
        _f7_the_resource_code_as_a_grant,
        "F7",
        ["MISC:UWPR95794's key contains the resource code UWPR95794"],
    ),
]


@pytest.mark.parametrize(
    ("name", "mutate", "invariant", "expected"), FUNDING_MUTATIONS, ids=[m[0] for m in FUNDING_MUTATIONS]
)
def test_broken_funding_is_caught_by_its_own_invariant(
    funded: Path, name: str, mutate: Callable[[Path], None], invariant: str, expected: list[str]
) -> None:
    """Each broken store fails for the intended invariant, and for nothing else."""
    mutate(funded)
    report = validate_store(funded)
    assert not report.ok, f"{name}: no error reported"
    assert all(f"invariant {invariant}: " in error for error in report.errors), report.errors
    for message in expected:
        assert any(message in error for error in report.errors), f"{name}: {message!r} not in {report.errors}"


def test_funding_the_schema_rejects_is_reported_not_raised(funded: Path) -> None:
    """The invariant pass never assumes a field the schema may have rejected (as for the store)."""
    garbage: dict[str, list[Any]] = {
        "citations": [
            {"work": ["W-000001"], "strings": "none", "nih_links": [{"grant": ["x"]}], "grants": [{}]},
        ],
        "grants": [
            [1, 2],
            {
                "key": ["NIH", "R01"],
                "agency": {"code": "NIH"},
                "amount": {"usd": 5, "original": "abc", "rate": "1", "basis": "reporter_fiscal_years"},
            },
        ],
        "agencies": [{"code": "X", "parent": ["NIH"]}],
    }
    for name, lines in garbage.items():
        path = funded / "funding" / f"{name}.jsonl"
        extra = "".join(f"\n{json.dumps(item)}\n" for item in lines)  # blank lines between, too
        path.write_text(path.read_text(encoding="utf-8") + extra, encoding="utf-8")
    report = validate_store(funded)
    assert not report.ok
    assert all("invariant F" in error for error in report.errors), report.errors
    assert any("amount is by fiscal year, but it has none" in error for error in report.errors)


def test_the_resource_code_comes_from_the_caller(funded: Path) -> None:
    """The pipeline passes `rules.r2.code`; the CLI reads it from the project's rules.yaml."""
    _f7_the_resource_code_as_a_grant(funded)
    assert not validate_store(funded).ok
    assert validate_store(funded, resource_code="XYZ00000").ok


# --- grant overrides (docs/09 §6.6, §8.5) -------------------------------------------------------

SPEC = (Path(__file__).resolve().parent.parent / "docs" / "09-funding-impact.md").read_text(encoding="utf-8")


def add_overrides(store: Path, *entries: dict[str, Any]) -> None:
    path = store.parent / "overrides.yaml"
    overrides = yaml.safe_load(path.read_text(encoding="utf-8"))
    path.write_text(yaml.safe_dump([*overrides, *entries], allow_unicode=True), encoding="utf-8")


def grant_override(target: Any, raw: str, grant: str | None, **extra: Any) -> dict[str, Any]:
    entry = {"target": target, "action": "grant", "raw": raw, "grant": grant}
    return {**entry, "reason": "Checked by hand.", "by": "mriffle", "date": "2026-09-26", **extra}


def test_the_specs_override_example_validates() -> None:
    """docs/09 §8.5's YAML, as written there, and all nine of Appendix E's rows."""
    block = SPEC[SPEC.index("### 8.5") :]
    example = yaml.safe_load(block[block.index("```yaml") + len("```yaml") : block.index("```\n", 10)])
    example = [
        {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in item.items()} for item in example
    ]
    assert example[0]["grant"] == "NIH:U19AG023122"
    assert schema_errors("overrides", example) == []

    rows = re.findall(r"^\| E\.\d \| (W-\d{6}) \| `([^`]+)` \| `([^`]+)` \|", SPEC, flags=re.MULTILINE)
    assert len(rows) == 9
    assert schema_errors("overrides", [grant_override(*row) for row in rows]) == []


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        ({k: v for k, v in grant_override("W-000010", "x", "NSF:1443474").items() if k != "raw"}, "'raw'"),
        (
            {k: v for k, v in grant_override("W-000010", "x", "NSF:1443474").items() if k != "grant"},
            "'grant'",
        ),
        (grant_override("W-000010", "x", "nsf:1443474"), "grant"),
        (grant_override("W-000010", "x", "WT:092809/Z/10/Z"), "grant"),
        (grant_override("W-000010", "", None), "raw"),
        (grant_override("10.1234/x", "x", None), "target"),
        (grant_override(["W-000010", "W-000013"], "x", None), "target"),
        ({**grant_override("W-000010", "x", None), "action": "include"}, "should not be valid"),
    ],
    ids=[
        "no raw",
        "no grant",
        "lower case",
        "a slash",
        "empty raw",
        "doi target",
        "list target",
        "raw on include",
    ],
)
def test_a_malformed_grant_override_is_a_schema_error(
    store: Path, entry: dict[str, Any], expected: str
) -> None:
    add_overrides(store, entry)
    report = validate_store(store)
    schema = [e for e in report.errors if e.startswith("overrides.yaml: schema: 2")]
    assert schema, report.errors
    assert any(expected in error for error in schema), schema


def not_seen(report: Any) -> list[str]:
    return [warning for warning in report.warnings if "is not seen on" in warning]


def test_the_not_seen_warning_fires_and_clears(funded: Path) -> None:
    """W-000010 writes `OPP 144374`; the match forgives case, spaces and dashes, and nothing else."""
    add_overrides(funded, grant_override("W-000010", "opp\u2010144374", "NSF:1443474"))
    report = validate_store(funded)
    assert report.errors == []
    assert not_seen(report) == []

    shutil.copy(SAMPLES / "overrides.yaml", funded.parent / "overrides.yaml")
    add_overrides(
        funded,
        grant_override("W-000010", "OPP 144375", "NSF:1443474"),  # one digit differs
        grant_override("W-000014", "OPP 144374", "NSF:1443474"),  # a work with no citations line
    )
    report = validate_store(funded)
    assert report.errors == []
    assert not_seen(report) == [
        "overrides: grant override: 'OPP 144375' is not seen on W-000010",
        "overrides: grant override: 'OPP 144374' is not seen on W-000014",
    ]


def test_an_override_on_a_merged_work_is_looked_for_on_the_survivor(funded: Path) -> None:
    add_overrides(funded, grant_override("W-000005", "VR-RFI 2019-00217", "VR:201900217"))
    report = validate_store(funded)
    assert report.errors == []
    assert not_seen(report) == []


def test_without_funding_grant_overrides_are_not_checked(store: Path) -> None:
    """The real store until the seed: nothing to look in, which is said once, and is no error."""
    shutil.rmtree(store / "funding")
    add_overrides(
        store,
        grant_override("W-000010", "OPP 144374", "NSF:1443474"),
        grant_override("W-000012", "Project 3", None),
    )
    report = validate_store(store)
    assert report.errors == []
    assert "overrides: 2 grant override(s) not checked: the store has no funding/" in report.warnings
    assert not_seen(report) == []


def test_two_grant_overrides_that_disagree_are_an_error(funded: Path) -> None:
    add_overrides(
        funded,
        grant_override("W-000010", "OPP 144374", "NSF:1443474"),
        grant_override("W-000010", "OPP-144374", None),
    )
    report = validate_store(funded)
    assert report.errors == [
        "overrides: grant: two overrides for 'OPP-144374' on W-000010 disagree (NSF:1443474 and None)"
    ]


def test_a_grant_override_target_must_resolve(store: Path) -> None:
    """Invariant 7 covers the new action as it covers every other."""
    add_overrides(store, grant_override("W-000404", "OPP 144374", "NSF:1443474"))
    report = validate_store(store)
    assert "overrides: grant target W-000404 does not resolve" in report.errors
