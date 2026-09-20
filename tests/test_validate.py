"""The validator catches each broken store for the right reason (docs/02 §14, §18).

The spec-phase mutation cases were scratch work and were not kept, so they are rebuilt here: each
case copies the sample store, breaks one thing, and asserts the matching complaint.
"""

import json
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest

from uwpr_pubs.store import io
from uwpr_pubs.validate import validate_store

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


@pytest.fixture
def store(tmp_path: Path) -> Path:
    shutil.copytree(SAMPLES / "store", tmp_path / "store")
    shutil.copy(SAMPLES / "overrides.yaml", tmp_path / "overrides.yaml")
    return tmp_path / "store"


def test_the_sample_store_is_valid(store: Path) -> None:
    report = validate_store(store)
    assert report.errors == []
    assert report.counts == {
        "works": 13,
        "candidates": 7,
        "list entries": 4,
        "metrics lines": 30,
        "overrides": 2,
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
