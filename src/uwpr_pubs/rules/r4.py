"""R4 — the early-era name, "South Lake Union Mass Spec Facility" (Phase 1 §6.4, D1c).

UWPR was called this before the current name settled, so R4 is how 2006-2010 papers are reached
at all (Phase 1 §9). It fires on one list paper today; it is kept because the early years have
almost no other signal.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from uwpr_pubs.evidence import criterion_for
from uwpr_pubs.rules.common import TextSource, text_evidence
from uwpr_pubs.rules.staff import StaffMember, named_in
from uwpr_pubs.store.models import Date, Evidence, RecordId
from uwpr_pubs.text import Document


@dataclass(frozen=True)
class R4Rules:
    pattern: re.Pattern[str]


def r4_rules(config: dict[str, Any]) -> R4Rules:
    return R4Rules(pattern=re.compile(config["pattern"]))


def facility_named(  # noqa: PLR0913 - a rule needs its text, its record, its source and its config
    document: Document,
    *,
    record: RecordId,
    source: TextSource,
    rules: R4Rules,
    label: str,
    staff: Sequence[StaffMember],
    year: int | None,
    today: Date,
) -> Evidence | None:
    for sentence in document.sentences:
        if not rules.pattern.search(sentence.text):
            continue
        key = named_in(sentence.text, staff, year)
        return text_evidence(
            "R4",
            criterion=criterion_for("R4"),
            label=label,
            record=record,
            source=source,
            section=sentence.section,
            excerpt=sentence.text,
            detail={"staff": key} if key else {},
            today=today,
        )
    return None
