"""Staff name forms and tenure (Phase 1 §5.1, §6.6).

A bare surname never counts: the name forms in `staff.yaml` are all full forms, including the
observed misspelling "von Haler" (`Hal+er`). Tenure matters because Hoopmann joined in 2024, so
an earlier acknowledgement of him is not UWPR support (calibration C5 covers the same case from
the other side, when the other institution is named outright).
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, cast

from uwpr_pubs.store.models import StaffKey


@dataclass(frozen=True)
class StaffMember:
    key: StaffKey
    name: str
    patterns: tuple[re.Pattern[str], ...]
    openalex: tuple[str, ...]
    orcid: str | None
    start: int
    end: int | None

    def in_tenure(self, year: int | None) -> bool:
        """An unknown year is treated as within tenure; the rule's other tests still apply."""
        if year is None:
            return True
        return year >= self.start and (self.end is None or year <= self.end)

    def found_in(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in self.patterns)


def staff_members(staff: Sequence[Mapping[str, Any]]) -> tuple[StaffMember, ...]:
    members = []
    for person in staff:
        tenure = person["tenure"]
        members.append(
            StaffMember(
                key=cast(StaffKey, person["key"]),
                name=str(person["name"]),
                patterns=tuple(re.compile(p) for p in person["name_patterns"]),
                openalex=tuple(str(i) for i in person["openalex"]),
                orcid=person["orcid"],
                start=int(tenure["start"]),
                end=int(tenure["end"]) if tenure["end"] is not None else None,
            )
        )
    return tuple(members)


def named_in(text: str, members: Iterable[StaffMember], year: int | None = None) -> StaffKey | None:
    """The first staff member named in the text, within tenure. Config order is stable."""
    for member in members:
        if member.found_in(text) and member.in_tenure(year):
            return member.key
    return None


def _tokens(name: str) -> list[str]:
    return [part for part in re.split(r"[\s,.]+", name.casefold()) if part]


def is_author(member: StaffMember, authors: Iterable[str]) -> bool:
    """R7 item 2: the staff member must not be an author of the paper.

    Matched on the surname plus a shared given-name initial, because the same person reaches us
    as "Michael Riffle", "Riffle, Michael", "Riffle M" and "M. Riffle". Erring towards "yes" only
    costs an R7 entry on a paper where a staff member is both author and thanked, which D2 says
    is not evidence anyway.
    """
    surname = _tokens(member.name)[-1]
    initial = member.name[:1].casefold()
    for author in authors:
        tokens = _tokens(author)
        if surname not in tokens:
            continue
        others = [token for token in tokens if token != surname]
        # A surname on its own is as much as that source gives us.
        if not others or any(token.startswith(initial) for token in others):
            return True
    return False
