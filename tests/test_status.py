"""Every row of the inclusion table (docs/02-data-model.md §13)."""

from typing import Any, cast

import pytest

from uwpr_pubs.status import StatusInput, decide
from uwpr_pubs.store.models import Evidence

TODAY = "2026-09-21"


def evidence(superseded: bool = False) -> Evidence:
    entry: dict[str, Any] = {
        "rule": "R3",
        "criterion": 4,
        "label": "The paper names the UW Proteomics Resource",
        "record": "R-000001",
        "source": {"name": "PMC", "url": None, "retrieved": TODAY, "cache": None},
        "section": "acknowledgements",
        "excerpt": "…the University of Washington Proteomics Resource…",
        "detail": {},
        "rule_version": "2026-09-19.2",
        "first_seen": TODAY,
        "last_seen": TODAY,
    }
    if superseded:
        entry["superseded"] = {"by_rule_version": "2026-09-20.1", "date": TODAY}
    return cast(Evidence, entry)


def state(**kwargs: Any) -> StatusInput:
    defaults: dict[str, Any] = {"evidence": [], "record_kinds": ["article"], "year": 2024}
    return StatusInput(**{**defaults, **kwargs})


def test_rules_evidence_includes_a_work() -> None:
    outcome = decide(state(evidence=[evidence()]), TODAY)
    assert outcome.included
    assert outcome.basis == "rules"
    assert outcome.since == TODAY


def test_being_on_the_list_wins_over_everything_including_an_exclude_override() -> None:
    """R1 always wins (Phase 1 §6.0): a listed paper cannot be excluded by override."""
    outcome = decide(state(on_official_list=True, override="exclude", year=1999), TODAY)
    assert outcome.included
    assert outcome.basis == "rules"


def test_a_listed_work_needs_no_other_evidence() -> None:
    assert decide(state(on_official_list=True), TODAY).included


def test_an_include_override_is_recorded_as_such() -> None:
    outcome = decide(state(override="include"), TODAY)
    assert outcome.included
    assert outcome.basis == "override"


def test_an_exclude_override_beats_the_rules() -> None:
    outcome = decide(state(evidence=[evidence()], override="exclude"), TODAY)
    assert not outcome.included
    assert outcome.reason == "override_exclude"
    assert outcome.keeps_former_evidence  # so removing the override can bring it back


def test_works_before_the_window_are_not_included() -> None:
    outcome = decide(state(evidence=[evidence()], year=2004), TODAY)
    assert outcome.reason == "before_window"
    assert outcome.reason_detail == "2004"


def test_excluded_record_types_are_named_in_the_reason() -> None:
    outcome = decide(state(evidence=[evidence()], record_kinds=["peer-review", "dissertation"]), TODAY)
    assert outcome.reason == "excluded_record_type"
    assert outcome.reason_detail == "dissertation, peer-review"


def test_one_included_record_is_enough_even_beside_an_excluded_one() -> None:
    assert decide(state(evidence=[evidence()], record_kinds=["peer-review", "article"]), TODAY).included


def test_a_rule_change_that_removes_the_last_evidence_moves_the_work_out() -> None:
    outcome = decide(state(evidence=[evidence(superseded=True)]), TODAY)
    assert not outcome.included
    assert outcome.reason == "no_longer_meets_rules"
    assert outcome.keeps_former_evidence


def test_a_work_that_never_had_evidence() -> None:
    outcome = decide(state(), TODAY)
    assert outcome.reason == "no_rule_fired"
    assert not outcome.keeps_former_evidence


def test_superseded_evidence_alongside_active_evidence_still_includes() -> None:
    assert decide(state(evidence=[evidence(superseded=True), evidence()]), TODAY).included


def test_an_already_included_work_keeps_the_date_it_came_in() -> None:
    outcome = decide(state(evidence=[evidence()], since="2024-03-01"), TODAY)
    assert outcome.since == "2024-03-01"


@pytest.mark.parametrize("kinds", [["preprint"], ["article"], ["review"], ["letter"], ["data-paper"]])
def test_every_included_kind_counts(kinds: list[str]) -> None:
    assert decide(state(evidence=[evidence()], record_kinds=kinds), TODAY).included
