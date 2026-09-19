"""R3 — the resource is named in the text, and R3d, the same test on a dataset description.

Phase 1 §6.3. Two things here are easy to get wrong and were measured the hard way:

- **Exclusions are checked on the whole merged mention, not on each match.** Checking matches
  separately let "(UWPR" escape an exclusion that applied to the phrase beside it.
- **The exclusion window is the 40 characters on *either side* of the mention, never the mention
  itself.** "Proteomics Resource" contains the hardware exclusion "source", so including the
  mention in the window would exclude every match there is.
"""

import re
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from uwpr_pubs.evidence import criterion_for
from uwpr_pubs.rules.common import TextSource, text_evidence
from uwpr_pubs.rules.staff import StaffMember, named_in
from uwpr_pubs.store.models import Date, Evidence, RecordId, Section
from uwpr_pubs.text import Document

Span = tuple[int, int]
AFFILIATION = "affiliation"


@dataclass(frozen=True)
class R3Rules:
    uw: re.Pattern[str]
    resource: re.Pattern[str]
    acronym: re.Pattern[str]
    max_gap: int
    merge_within: int
    exclusion_window: int
    exclusions: tuple[tuple[str, tuple[str, ...]], ...]


def r3_rules(config: Mapping[str, Any]) -> R3Rules:
    return R3Rules(
        uw=re.compile(config["uw"]),
        resource=re.compile(config["resource"]),
        acronym=re.compile(config["acronym"]),
        max_gap=int(config["max_gap"]),
        merge_within=int(config["merge_within"]),
        exclusion_window=int(config["exclusion_window"]),
        exclusions=tuple(
            (bucket, tuple(term.casefold() for term in terms))
            for bucket, terms in config["exclusions"].items()
        ),
    )


@dataclass(frozen=True)
class Mention:
    start: int
    end: int
    text: str
    excluded_by: str | None

    @property
    def counts(self) -> bool:
        return self.excluded_by is None


def _paired_spans(text: str, rules: R3Rules) -> Iterator[Span]:
    """`UW` within 40 characters of `RES`, in either order (§6.3)."""
    university = [(m.start(), m.end()) for m in rules.uw.finditer(text)]
    resource = [(m.start(), m.end()) for m in rules.resource.finditer(text)]
    for uw_start, uw_end in university:
        for res_start, res_end in resource:
            if 0 <= res_start - uw_end <= rules.max_gap:
                yield (uw_start, res_end)
            elif 0 <= uw_start - res_end <= rules.max_gap:
                yield (res_start, uw_end)


def _merge(spans: Sequence[Span], within: int) -> list[Span]:
    """Matches no more than 20 characters apart form one mention (§6.3)."""
    merged: list[Span] = []
    for start, end in sorted(spans):
        if merged and start - merged[-1][1] <= within:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _excluded_by(text: str, span: Span, rules: R3Rules) -> str | None:
    start, end = span
    left = text[max(0, start - rules.exclusion_window) : start].casefold()
    right = text[end : end + rules.exclusion_window].casefold()
    for bucket, terms in rules.exclusions:
        if any(term in left or term in right for term in terms):
            return bucket
    return None


def mentions(text: str, rules: R3Rules) -> list[Mention]:
    """Every place the resource is named, with the exclusion that disqualified it, if any."""
    acronyms = ((m.start(), m.end()) for m in rules.acronym.finditer(text))
    return [
        Mention(
            start=start,
            end=end,
            text=text[start:end],
            excluded_by=_excluded_by(text, (start, end), rules),
        )
        for start, end in _merge([*_paired_spans(text, rules), *acronyms], rules.merge_within)
    ]


def _detail(text: str, staff: Iterable[StaffMember], year: int | None) -> dict[str, str]:
    key = named_in(text, staff, year)
    return {"staff": key} if key else {}


def resource_named(  # noqa: PLR0913 - a rule needs its text, its record, its source and its config
    document: Document,
    *,
    record: RecordId,
    source: TextSource,
    rules: R3Rules,
    label: str,
    staff: Sequence[StaffMember],
    year: int | None,
    today: Date,
) -> list[Evidence]:
    """One entry per section the resource is named in, taking that section's first mention.

    A paper may name the resource in its acknowledgements and again in its methods, and both are
    worth showing. Naming it four times in one section is not, so the first sentence wins.
    """
    found: list[Evidence] = []
    seen: set[Section] = set()
    for sentence in document.sentences:
        # An author's address naming the resource is R5's case, with its own criterion. Letting
        # R3 fire on it too would record one fact twice, and inflate R3 against Phase 1 §4.2.
        if sentence.section == AFFILIATION or sentence.section in seen:
            continue
        if not any(mention.counts for mention in mentions(sentence.text, rules)):
            continue
        seen.add(sentence.section)
        detail = _detail(sentence.text, staff, year)
        found.append(
            text_evidence(
                "R3",
                criterion=criterion_for("R3", names_staff=bool(detail)),
                label=label,
                record=record,
                source=source,
                section=sentence.section,
                excerpt=sentence.text,
                detail=detail,
                today=today,
            )
        )
    return found


def dataset_named(  # noqa: PLR0913 - as above, plus the accession the evidence is keyed by
    sentences: Sequence[str],
    *,
    record: RecordId,
    source: TextSource,
    rules: R3Rules,
    label: str,
    dataset: str,
    today: Date,
) -> Evidence | None:
    """R3d: the resource named in a public dataset's own description (Phase 1 §5 channel J)."""
    for sentence in sentences:
        if any(mention.counts for mention in mentions(sentence, rules)):
            return text_evidence(
                "R3d",
                criterion=criterion_for("R3d"),
                label=label,
                record=record,
                source=source,
                section="dataset description",
                excerpt=sentence,
                detail={"dataset": dataset},
                today=today,
            )
    return None
