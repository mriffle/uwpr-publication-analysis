"""Evidence identity and the merge matrix (docs/03 §6.3, P11, P13; docs/02 §13)."""

from typing import Any, cast

import pytest

from uwpr_pubs.evidence import (
    EvidenceKey,
    MergeContext,
    MergeOutcome,
    active,
    advance_last_seen,
    criterion_for,
    evidence_key,
    merge_evidence,
    truncate_excerpt,
)
from uwpr_pubs.store.models import Evidence

TODAY = "2026-09-21"
V1 = "2026-09-19.1"
V2 = "2026-09-20.1"
REFRESH = 28


def merge(
    stored: list[Evidence], derived: list[Evidence], rule_version: str = V1, **kwargs: Any
) -> MergeOutcome:
    return merge_evidence(stored, derived, MergeContext(rule_version, TODAY, REFRESH, **kwargs))


def evidence(
    rule: str = "R3",
    *,
    record: str | None = "R-000001",
    section: str = "acknowledgements",
    excerpt: str | None = "The UW Proteomics Resource ran the samples.",
    detail: dict[str, Any] | None = None,
    label: str = "The paper names the UW Proteomics Resource",
    criterion: int | None = 4,
    first_seen: str = "2026-01-01",
    last_seen: str = "2026-01-01",
    rule_version: str = V1,
    superseded: dict[str, str] | None = None,
) -> Evidence:
    entry: dict[str, Any] = {
        "rule": rule,
        "criterion": criterion,
        "label": label,
        "record": record,
        "source": {"name": "PMC", "url": "https://pmc/x", "retrieved": first_seen, "cache": None},
        "section": section,
        "excerpt": excerpt,
        "detail": detail or {},
        "rule_version": rule_version,
        "first_seen": first_seen,
        "last_seen": last_seen,
    }
    if superseded:
        entry["superseded"] = superseded
    return cast(Evidence, entry)


# --- identity -----------------------------------------------------------------------------


def test_the_seven_key_shapes() -> None:
    assert evidence_key(
        evidence(
            "R1",
            record="R-1",
            section="official list",
            excerpt=None,
            detail={"list_key": "list:2026:abc123456789"},
        )
    ) == EvidenceKey("R1", "", "list:2026:abc123456789")
    assert evidence_key(
        evidence("R2", section="metadata", excerpt="UWPR95794", detail={"field": "awards[].funder_award_id"})
    ).discriminator == ("PMC:awards[].funder_award_id")
    assert evidence_key(evidence("R3d", detail={"dataset": "PXD011642"})) == EvidenceKey(
        "R3d", "R-000001", "PXD011642"
    )
    assert evidence_key(evidence("R6", detail={"phrase": "Washington Proteomics Resource"})) == EvidenceKey(
        "R6", "R-000001", "Washington Proteomics Resource"
    )
    text_key = evidence_key(evidence("R3"))
    assert text_key.rule == "R3" and text_key.record == "R-000001"
    assert text_key.discriminator.startswith("acknowledgements:")


def test_an_excerpt_key_ignores_whitespace_but_not_wording() -> None:
    a = evidence_key(evidence(excerpt="The  UW Proteomics\nResource ran the samples."))
    b = evidence_key(evidence(excerpt="The UW Proteomics Resource ran the samples."))
    c = evidence_key(evidence(excerpt="The UW Proteomics Resource ran the peptides."))
    assert a == b
    assert a != c


def test_the_same_sentence_on_two_records_is_two_reasons() -> None:
    assert evidence_key(evidence(record="R-1")) != evidence_key(evidence(record="R-2"))


# --- the spec's criterion mapping (docs/02 §5.3) -------------------------------------------


@pytest.mark.parametrize(
    ("rule", "kwargs", "expected"),
    [
        ("R1", {}, 1),
        ("R2", {}, 2),
        ("R3", {"names_staff": True}, 3),
        ("R3", {"names_staff": False}, 4),
        ("R3d", {}, 4),
        ("R4", {}, 4),
        ("R5", {}, 3),
        ("R6", {"phrase": "UWPR95794"}, 2),
        ("R6", {"phrase": "Washington Proteomics Resource"}, 4),
        ("R7", {}, 3),
        ("override", {}, None),
    ],
)
def test_criterion_mapping(rule: str, kwargs: dict[str, Any], expected: int | None) -> None:
    assert criterion_for(rule, **kwargs) == expected


def test_excerpts_are_kept_within_the_spec_limit() -> None:
    assert truncate_excerpt("  spaced   out\ntext ") == "spaced out text"
    long = truncate_excerpt("x" * 400)
    assert len(long) == 300
    assert long.endswith("…")


# --- merging, same rule version ------------------------------------------------------------


def test_a_reproduced_entry_keeps_its_first_seen_and_stale_last_seen() -> None:
    stored = evidence(first_seen="2026-01-01", last_seen="2026-09-20")
    outcome = merge([stored], [evidence(first_seen=TODAY, last_seen=TODAY)], V1)
    assert outcome.reproduced and not outcome.added
    kept = outcome.evidence[0]
    assert kept["first_seen"] == "2026-01-01"
    assert kept["last_seen"] == "2026-09-20"  # P11: only 1 day old, so it does not move


def test_last_seen_moves_once_it_is_stale() -> None:
    stored = evidence(first_seen="2026-01-01", last_seen="2026-08-01")
    outcome = merge([stored], [evidence()], V1)
    assert outcome.evidence[0]["last_seen"] == TODAY


@pytest.mark.parametrize(
    ("stored_date", "expected"),
    [("2026-09-20", "2026-09-20"), ("2026-08-24", TODAY), ("2026-08-25", "2026-08-25")],
)
def test_the_28_day_rule(stored_date: str, expected: str) -> None:
    assert advance_last_seen(stored_date, TODAY, REFRESH) == expected


def test_a_new_reason_is_added_with_todays_dates() -> None:
    outcome = merge([], [evidence()], V1)
    assert len(outcome.added) == 1
    assert outcome.evidence[0]["first_seen"] == TODAY
    assert outcome.evidence[0]["last_seen"] == TODAY


def test_a_source_going_quiet_removes_nothing() -> None:
    """Under the same rules, silence is not evidence of absence (docs/02 §13)."""
    stored = evidence(last_seen="2026-09-01")
    outcome = merge([stored], [], V1)
    assert outcome.unconfirmed and not outcome.superseded
    assert outcome.evidence[0]["last_seen"] == "2026-09-01"  # frozen, not advanced
    assert active(outcome.evidence)


def test_changed_wording_replaces_the_entry_but_keeps_its_history() -> None:
    stored = evidence(label="old label", first_seen="2026-01-01", last_seen="2026-01-01")
    outcome = merge([stored], [evidence(label="new label")], V1)
    assert outcome.evidence[0]["label"] == "new label"
    assert outcome.evidence[0]["first_seen"] == "2026-01-01"


# --- merging, new rule version -------------------------------------------------------------


def test_a_rule_change_supersedes_what_it_no_longer_produces() -> None:
    stored = evidence(rule_version=V1)
    outcome = merge([stored], [], V2)
    assert outcome.superseded
    entry = outcome.evidence[0]
    assert entry["superseded"] == {"by_rule_version": V2, "date": TODAY}
    assert active(outcome.evidence) == []


def test_a_rule_change_that_still_produces_the_entry_revives_it() -> None:
    stored = evidence(rule_version=V1, superseded={"by_rule_version": V2, "date": "2026-09-20"})
    outcome = merge([stored], [evidence()], V2)
    assert "superseded" not in outcome.evidence[0]
    assert outcome.evidence[0]["rule_version"] == V2


def test_unreadable_text_leaves_its_evidence_exactly_as_it_was() -> None:
    """The §6.2 exception: an outage must not drop a work at a rule change."""
    stored = evidence(rule_version=V1, last_seen="2026-05-01")
    outcome = merge([stored], [], V2, unevaluated_records=frozenset({"R-000001"}))
    assert outcome.untouched and not outcome.superseded
    assert outcome.evidence[0] == stored
    assert active(outcome.evidence)  # still counts, so the work stays included


def test_a_degraded_source_does_not_advance_last_seen_or_supersede() -> None:
    stored = evidence(
        rule="R6",
        detail={"phrase": "UWPR95794"},
        excerpt=None,
        section="full-text index",
        rule_version=V2,
        last_seen="2026-01-01",
    )
    outcome = merge([stored], [], V2, degraded_rules=frozenset({"R6"}))
    assert outcome.untouched
    assert outcome.evidence[0]["last_seen"] == "2026-01-01"


def test_r6_survives_our_text_becoming_readable_then_follows_the_ordinary_rules() -> None:
    """P13: kept while the rules are unchanged; re-derived like anything else at a version bump."""
    stored = evidence(
        rule="R6",
        section="full-text index",
        excerpt=None,
        detail={"phrase": "Washington Proteomics Resource"},
        rule_version=V1,
    )
    same_version = merge([stored], [], V1)
    assert active(same_version.evidence)  # our own text showed nothing, but R6 is kept

    next_version = merge([stored], [], V2)
    assert active(next_version.evidence) == []  # now it is superseded, and the report says so


def test_override_evidence_is_identified_by_its_reason() -> None:
    first = evidence(
        "override",
        record=None,
        section="override",
        excerpt=None,
        criterion=None,
        label="PI confirmed samples were run at UWPR.",
    )
    second = evidence(
        "override",
        record=None,
        section="override",
        excerpt=None,
        criterion=None,
        label="A different reason entirely.",
    )
    assert evidence_key(first) != evidence_key(second)
    assert evidence_key(first).record == ""


def test_merging_is_stable_when_nothing_changed() -> None:
    """Two runs on the same day over unchanged sources produce identical evidence (docs/03 §1)."""
    # dates inside the 28-day window, so P11 does not move them
    stored = [
        evidence(first_seen="2026-01-01", last_seen="2026-09-20"),
        evidence(
            "R2",
            section="metadata",
            detail={"field": "awards"},
            first_seen="2026-01-01",
            last_seen="2026-09-20",
        ),
    ]
    once = merge(stored, stored, V1)
    twice = merge(once.evidence, stored, V1)
    assert once.evidence == twice.evidence == stored


def test_r1_takes_its_dates_from_the_official_list_entry() -> None:
    """The entry's exact dates, so "listed from X to Y" stays true (docs/02 §7)."""
    detail = {"list_key": "list:2026:abc123456789", "page": "2026"}
    stored = evidence(
        "R1",
        section="official list",
        excerpt=None,
        criterion=1,
        detail={**detail, "first_seen": "2026-06-01", "last_seen": "2026-09-12"},
        first_seen="2026-06-01",
        last_seen="2026-09-12",
    )
    fresh = evidence(
        "R1",
        section="official list",
        excerpt=None,
        criterion=1,
        detail={**detail, "first_seen": "2026-06-01", "last_seen": TODAY},
        first_seen="2026-06-01",
        last_seen=TODAY,
    )
    outcome = merge([stored], [fresh], V1)
    entry = outcome.evidence[0]
    assert entry["first_seen"] == "2026-06-01"
    assert entry["last_seen"] == TODAY  # exact, not held back by the 28-day rule
