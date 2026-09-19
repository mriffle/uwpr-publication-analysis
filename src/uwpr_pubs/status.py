"""Whether a work is included, and if not, why (docs/02-data-model.md §13).

Pure. The order below is the order of precedence, and the first rule is the one that matters most:
the official list always wins (Phase 1 §6.0), even over an exclude override.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from uwpr_pubs.evidence import active
from uwpr_pubs.store.models import CandidateReason, Date, Evidence, IncludedKind

INCLUDED_KINDS: frozenset[str] = frozenset(IncludedKind.__args__)  # type: ignore[attr-defined]


@dataclass(frozen=True)
class StatusInput:
    evidence: Sequence[Evidence]
    record_kinds: Sequence[str]
    on_official_list: bool = False
    override: str | None = None  # "include" | "exclude" | None
    year: int | None = None
    window_start: int = 2006
    since: Date | None = None  # when this work was last already included


@dataclass(frozen=True)
class Status:
    included: bool
    basis: str | None = None  # "rules" | "override"
    reason: CandidateReason | None = None
    reason_detail: str | None = None
    since: Date | None = None

    @property
    def keeps_former_evidence(self) -> bool:
        """These reasons carry the work's evidence forward, so it is not lost (docs/02 §6)."""
        return self.reason in ("no_longer_meets_rules", "override_exclude")


def excluded_kinds(record_kinds: Iterable[str]) -> list[str]:
    return sorted({kind for kind in record_kinds if kind not in INCLUDED_KINDS})


def decide(state: StatusInput, today: Date) -> Status:  # noqa: PLR0911 - one return per row of §13
    """Apply docs/02 §13, in precedence order."""
    has_included_kind = any(kind in INCLUDED_KINDS for kind in state.record_kinds)
    since = state.since or today

    # 1. The official list always wins, whatever else is true (Phase 1 §6.0).
    #    A listed work with no record of an included type would break invariant 3, so the run's
    #    validation gate stops rather than the list being quietly overruled here.
    if state.on_official_list:
        return Status(included=True, basis="rules", since=since)

    # 2. An include override.
    if state.override == "include":
        return Status(included=True, basis="override", since=since)

    # 3. An exclude override beats the rules, but never the list.
    if state.override == "exclude":
        return Status(included=False, reason="override_exclude")

    # 4. Outside the search window.
    if state.year is not None and state.year < state.window_start:
        return Status(included=False, reason="before_window", reason_detail=str(state.year))

    # 5. Record types that are not publications we count (Phase 1 §1).
    if not has_included_kind:
        detail = ", ".join(excluded_kinds(state.record_kinds)) or "unknown"
        return Status(included=False, reason="excluded_record_type", reason_detail=detail)

    # 6. Evidence the current rules still produce.
    if active(state.evidence):
        return Status(included=True, basis="rules", since=since)

    # 7. It had evidence once, and a rule change took it away.
    if state.evidence:
        return Status(included=False, reason="no_longer_meets_rules")

    # 8. Nothing ever fired.
    return Status(included=False, reason="no_rule_fired")
