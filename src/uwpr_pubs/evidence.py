"""Evidence identity and merging across runs (docs/03-retrieval-pipeline.md §6.3).

Pure: dictionaries in, dictionaries out. Evidence is keyed by **record**, because stage 6 can
merge two works after stage 5 has produced their evidence; only override evidence belongs to a
work. The three things this module gets right, which nothing else can:

- an entry reproduced this run keeps its `first_seen` and, under P11, usually its `last_seen` too;
- an entry that is simply not reproduced is kept, because a source going quiet is not evidence of
  absence — it is superseded only when a new rule version failed to re-derive it;
- an entry on a record whose text could not be read is left exactly as it was (§6.2), even across
  a rule-version change, so an outage cannot drop a work.
"""

import hashlib
import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any, cast

from uwpr_pubs.store.models import (
    Date,
    Evidence,
    EvidenceOverride,
    Override,
    RecordId,
    RuleVersion,
    StaffKey,
)

EXCERPT_LIMIT = 300  # docs/02 §5.3 says "at most about 300 characters"; the schema allows 400
ELLIPSIS = "…"

# R1 is the one rule whose dates are not the run's: they are the official-list entry's own
# first and last seen, kept exactly (docs/02 §7, as changed 2026-09-19), so that "listed from X
# to Y" stays true to the day even though everything else follows the 28-day rule.
DATES_FROM_SOURCE = frozenset({"R1"})


def normalise_excerpt(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).split())


def truncate_excerpt(text: str, limit: int = EXCERPT_LIMIT) -> str:
    """Keep quotations within the spec's limit, marking where they were cut."""
    cleaned = normalise_excerpt(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + ELLIPSIS


def _digest(text: str) -> str:
    return hashlib.sha256(normalise_excerpt(text).encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True, order=True)
class EvidenceKey:
    """What makes two evidence entries the same reason (§6.3)."""

    rule: str
    record: str  # empty for R1 and override evidence, which are not record-specific
    discriminator: str


def evidence_key(entry: Mapping[str, Any]) -> EvidenceKey:
    rule = str(entry["rule"])
    record = str(entry.get("record") or "")
    detail = cast(Mapping[str, Any], entry.get("detail") or {})
    if rule == "R1":
        return EvidenceKey(rule, "", str(detail.get("list_key", "")))
    if rule == "override":
        return EvidenceKey(rule, "", _digest(str(entry.get("label", ""))))
    if rule == "R2" and entry.get("section") == "metadata":
        source = str((entry.get("source") or {}).get("name", ""))
        return EvidenceKey(rule, record, f"{source}:{detail.get('field', '')}")
    if rule == "R3d":
        return EvidenceKey(rule, record, str(detail.get("dataset", "")))
    if rule == "R6":
        return EvidenceKey(rule, record, str(detail.get("phrase", "")))
    # R2 in text, R3, R4, R5 (from JATS or from an OpenAlex affiliation string), R7
    return EvidenceKey(rule, record, f"{entry.get('section', '')}:{_digest(str(entry.get('excerpt') or ''))}")


def criterion_for(rule: str, *, phrase: str | None = None, names_staff: bool = False) -> int | None:
    """The inclusion criterion an entry supports (docs/02 §5.3).

    R3 is criterion 3 when the matched sentence names a staff member and 4 otherwise; R6 is 2 only
    when the phrase is the award code itself.
    """
    fixed: dict[str, int | None] = {"R1": 1, "R2": 2, "R3d": 4, "R4": 4, "R5": 3, "R7": 3, "override": None}
    if rule in fixed:
        return fixed[rule]
    if rule == "R3":
        return 3 if names_staff else 4
    if rule == "R6":
        return 2 if phrase and "UWPR95794" in phrase.replace(" ", "") else 4
    raise ValueError(f"unknown rule {rule!r}")


def override_evidence(override: Override, today: Date) -> EvidenceOverride:
    """An `include` override, as evidence (docs/02 §9).

    The reason becomes the label, so it is shown like any other reason; `by` and `date` become
    the detail, because docs/05 §6 has the app show the reason "attributed to the person who
    decided it and dated". An override is the one place a human judgement enters an otherwise
    automatic pipeline, so it is the last place that should be less traceable than a parsed
    sentence.
    """
    return cast(
        EvidenceOverride,
        {
            "rule": "override",
            "criterion": criterion_for("override"),
            "label": str(override["reason"]),
            "record": None,  # it belongs to the work, not to any one version (docs/02 §5.3)
            "source": {"name": "overrides.yaml", "url": None, "retrieved": today, "cache": None},
            "section": "override",
            "excerpt": None,
            "detail": {"by": str(override["by"]), "date": str(override["date"])},
            "rule_version": "",  # the merge stamps the run's version
            "first_seen": today,
            "last_seen": today,
        },
    )


def staff_named(detail: Mapping[str, Any]) -> StaffKey | None:
    staff = detail.get("staff")
    return cast(StaffKey, staff) if staff else None


def advance_last_seen(stored: Date, today: Date, refresh_days: int) -> Date:
    """P11: move `last_seen` only once it is stale, so weekly runs don't rewrite every work."""
    if stored >= today:
        return stored
    if (date.fromisoformat(today) - date.fromisoformat(stored)).days >= refresh_days:
        return today
    return stored


def _content(entry: Mapping[str, Any]) -> tuple[Any, ...]:
    """The parts that make one entry materially different from another."""
    return (
        entry.get("label"),
        entry.get("excerpt"),
        entry.get("section"),
        entry.get("criterion"),
        tuple(sorted((entry.get("detail") or {}).items())),
    )


@dataclass(frozen=True)
class MergeContext:
    """What this run knows: its rules, its date, and where it could not look (§6.2, §9)."""

    rule_version: RuleVersion
    today: Date
    refresh_days: int
    unevaluated_records: frozenset[RecordId] = frozenset()
    degraded_rules: frozenset[str] = frozenset()


@dataclass(frozen=True)
class MergeOutcome:
    evidence: list[Evidence]
    added: list[EvidenceKey] = field(default_factory=list)
    reproduced: list[EvidenceKey] = field(default_factory=list)
    unconfirmed: list[EvidenceKey] = field(default_factory=list)  # not seen this run, still kept
    superseded: list[EvidenceKey] = field(default_factory=list)
    untouched: list[EvidenceKey] = field(default_factory=list)  # source down; left exactly as it was


def merge_evidence(
    stored: Iterable[Evidence], derived: Iterable[Evidence], context: MergeContext
) -> MergeOutcome:
    """Fold this run's evidence into what the store already held.

    Entries on a record whose text could not be fetched, or produced by a rule whose source
    failed, are left untouched, and their `last_seen` does not advance (§6.2, §9).
    """
    rule_version = context.rule_version
    today = context.today
    refresh_days = context.refresh_days
    unevaluated_records = context.unevaluated_records
    degraded_rules = context.degraded_rules
    derived_by_key = {evidence_key(entry): entry for entry in derived}
    result: list[Evidence] = []
    outcome_added: list[EvidenceKey] = []
    outcome_reproduced: list[EvidenceKey] = []
    outcome_unconfirmed: list[EvidenceKey] = []
    outcome_superseded: list[EvidenceKey] = []
    outcome_untouched: list[EvidenceKey] = []
    seen: set[EvidenceKey] = set()

    for entry in stored:
        key = evidence_key(entry)
        seen.add(key)
        fresh = derived_by_key.get(key)
        blocked = (entry.get("record") in unevaluated_records) or (entry["rule"] in degraded_rules)

        if fresh is not None:
            merged = dict(fresh) if _content(fresh) != _content(entry) else dict(entry)
            if entry["rule"] in DATES_FROM_SOURCE:
                merged["first_seen"] = fresh["first_seen"]
                merged["last_seen"] = fresh["last_seen"]
            else:
                merged["first_seen"] = entry["first_seen"]
                merged["last_seen"] = advance_last_seen(entry["last_seen"], today, refresh_days)
            merged["rule_version"] = rule_version
            merged.pop("superseded", None)
            result.append(cast(Evidence, merged))
            outcome_reproduced.append(key)
        elif blocked:
            result.append(entry)
            outcome_untouched.append(key)
        elif entry["rule_version"] == rule_version or "superseded" in entry:
            # The same rules still apply, so silence from a source does not remove anything.
            result.append(entry)
            outcome_unconfirmed.append(key)
        else:
            # Re-derived under a new rule version and no longer produced (docs/02 §13).
            superseded = dict(entry)
            superseded["superseded"] = {"by_rule_version": rule_version, "date": today}
            result.append(cast(Evidence, superseded))
            outcome_superseded.append(key)

    for key, entry in derived_by_key.items():
        if key in seen:
            continue
        new_entry = dict(entry)
        if entry["rule"] not in DATES_FROM_SOURCE:
            new_entry["first_seen"] = today
            new_entry["last_seen"] = today
        new_entry["rule_version"] = rule_version
        result.append(cast(Evidence, new_entry))
        outcome_added.append(key)

    return MergeOutcome(
        evidence=result,
        added=sorted(outcome_added),
        reproduced=sorted(outcome_reproduced),
        unconfirmed=sorted(outcome_unconfirmed),
        superseded=sorted(outcome_superseded),
        untouched=sorted(outcome_untouched),
    )


def active(evidence: Iterable[Evidence]) -> list[Evidence]:
    """Active means not superseded (docs/02 §13, as changed 2026-09-19)."""
    return [entry for entry in evidence if "superseded" not in entry]
