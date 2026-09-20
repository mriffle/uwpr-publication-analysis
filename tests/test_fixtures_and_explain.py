"""The two ways a person interrogates a store: the test papers, and one work at a time.

Both run against `samples/store/`, which is a real validated store built from live sources, so
these exercise the same shapes a run produces rather than hand-made ones.
"""

import shutil
from pathlib import Path
from typing import Any

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.explain import explain, resolve
from uwpr_pubs.fixtures import alias_keys, evaluate, evaluate_one
from uwpr_pubs.store import io
from uwpr_pubs.store.read import read_store

SAMPLE = Path(__file__).resolve().parents[1] / "samples" / "store"
CASANOVO = "10.1021/acs.jproteome.5c00706"


@pytest.fixture
def store(tmp_path: Path) -> Path:
    copy = tmp_path / "store"
    shutil.copytree(SAMPLE, copy)
    return copy


def fixture(**fields: Any) -> dict[str, Any]:
    return {"id": "T", "ids": {}, "expected": "include", **fields}


# --- fixtures ------------------------------------------------------------------------------


def test_alias_keys_cover_every_identifier_a_fixture_may_carry() -> None:
    keys = alias_keys(
        {"doi": "HTTPS://DOI.ORG/10.1/A", "pmid": "7", "pride": "PXD011642", "family": ["10.1/b"]}
    )
    assert keys == ["doi:10.1/a", "pmid:7", "pride:PXD011642", "doi:10.1/b"]


def test_a_positive_fixture_passes_when_its_rules_fired(store: Path) -> None:
    snapshot = read_store(store)
    result = evaluate_one(fixture(ids={"doi": CASANOVO}, rules=["R2"]), snapshot)
    assert result.outcome == "pass"
    assert result.work == "W-000006"


def test_a_positive_fixture_fails_when_a_required_rule_is_missing(store: Path) -> None:
    result = evaluate_one(fixture(ids={"doi": CASANOVO}, rules=["R7"]), read_store(store))
    assert result.outcome == "fail"
    assert result.regressed
    assert "R7 did not fire" in result.detail


def test_a_rules_absent_fixture_fails_when_that_rule_fires(store: Path) -> None:
    """Fixture G must be included by R1 and must *not* show R3 (C6/D6)."""
    result = evaluate_one(
        fixture(ids={"doi": CASANOVO}, rules=["R2"], rules_absent=["R2"]), read_store(store)
    )
    assert result.outcome == "fail"
    assert "should not have" in result.detail


def test_a_paper_the_store_has_never_seen_is_not_a_regression(store: Path) -> None:
    """§12.2 says the positive papers *present in the store* must stay included.

    On a first run nothing is present yet, and that must not fail the run.
    """
    result = evaluate_one(fixture(ids={"doi": "10.9999/never-seen"}, rules=["R2"]), read_store(store))
    assert result.outcome == "fail"
    assert not result.present
    assert not result.regressed
    assert result.detail == "not in this store"


def test_a_paper_present_but_no_longer_included_is_a_regression(store: Path) -> None:
    snapshot = read_store(store)
    excluded = snapshot.candidates[0]["records"][0]["ids"]
    result = evaluate_one(fixture(ids={"doi": excluded["doi"]}, rules=["R2"]), snapshot)
    assert result.regressed
    assert "not included" in result.detail


def test_a_negative_fixture_passes_while_the_paper_stays_out(store: Path) -> None:
    """The SAWN paper: a stage built from UWPR's posted plans is not UWPR support (01a C6)."""
    result = evaluate_one(fixture(ids={"doi": "10.1021/ac100372c"}, expected="exclude"), read_store(store))
    assert result.outcome == "pass"

    included = evaluate_one(fixture(ids={"doi": CASANOVO}, expected="exclude"), read_store(store))
    assert included.regressed


def test_a_known_miss_that_starts_passing_is_good_news(store: Path) -> None:
    """Phase 1 §12: if a source begins carrying text we could not read, that is news, not a fault."""
    missing = evaluate_one(
        fixture(ids={"doi": "10.1016/j.ijms.2010.06.025"}, expected="known_miss"), read_store(store)
    )
    assert missing.outcome == "known_miss"
    assert not missing.good_news

    found = evaluate_one(fixture(ids={"doi": CASANOVO}, expected="known_miss"), read_store(store))
    assert found.outcome == "pass"
    assert found.good_news
    assert not found.regressed


def test_a_synthetic_fixture_has_nothing_to_look_up(store: Path) -> None:
    result = evaluate_one(fixture(id="neg-comet-url", expected="exclude"), read_store(store))
    assert result.outcome == "pass"
    assert "synthetic" in result.detail


def test_every_configured_fixture_can_be_evaluated(store: Path) -> None:
    results = evaluate(load_config().fixtures, read_store(store))
    assert len(results) == len(load_config().fixtures)
    assert {r.id for r in results} >= {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}


# --- explain -------------------------------------------------------------------------------


def test_explain_resolves_every_kind_of_identifier(store: Path) -> None:
    snapshot = read_store(store)
    assert resolve(snapshot, "W-000006") == "W-000006"
    assert resolve(snapshot, CASANOVO) == "W-000006"
    assert resolve(snapshot, f"  {CASANOVO.upper()}  ") == "W-000006"
    assert resolve(snapshot, "W4412674037") == "W-000006"
    assert resolve(snapshot, "10.9999/nothing") is None


def test_explain_shows_the_evidence_and_its_excerpts(store: Path) -> None:
    found, text = explain(read_store(store), CASANOVO)
    assert found
    assert "INCLUDED since" in text
    assert "R2" in text
    assert "Found by channels:" in text
    assert "Records (2)" in text  # the article and its preprint


def test_explain_shows_the_version_link_that_joined_two_records(store: Path) -> None:
    found, text = explain(read_store(store), "10.21203/rs.3.rs-4693768/v2")
    assert found
    assert "version of R-000004 (linked by override)" in text


def test_explain_says_why_a_work_is_not_included(store: Path) -> None:
    line = read_store(store).candidates[0]
    found, text = explain(read_store(store), line["id"])
    assert found
    assert "NOT INCLUDED" in text
    assert line["reason"] in text


def test_explain_shows_the_signals_that_deliberately_do_not_count(store: Path) -> None:
    snapshot = read_store(store)
    line = next(entry for entry in snapshot.candidates if entry["signals"])
    _, text = explain(snapshot, line["id"])
    assert "deliberately do not count" in text
    assert line["signals"][0] in text


def test_explain_follows_a_retired_work_id_to_its_survivor(store: Path) -> None:
    aliases = io.read_json(store / "aliases.json")
    aliases["aliases"]["work:W-000404"] = "W-000006"
    io.write_json(store / "aliases.json", aliases)
    found, text = explain(read_store(store), "W-000404")
    assert found
    assert "W-000404 was merged into W-000006" in text


def test_explain_says_plainly_when_nothing_has_ever_nominated_a_paper(store: Path) -> None:
    found, text = explain(read_store(store), "10.9999/nothing")
    assert not found
    assert "No channel has ever nominated it" in text
