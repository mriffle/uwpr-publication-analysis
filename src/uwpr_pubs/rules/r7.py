"""R7 — a staff member thanked for data-analysis or technical help (Phase 1 §6.6, calibration C2).

All six conditions must hold. The one that matters most is that items 4 and 5 are tested on the
**purpose phrase** — the "for …" phrase following the staff name — not on the whole sentence. A
first version tested the sentence and fired on

    "…the Proteomics Facility at the FHCRC for help with MS, and Jimmy Eng … for advice with
     using X!Tandem"

where the help-with-work wording belonged to other people entirely.

The exception is the other-institution disqualifier (C5), which Phase 1 words as "another
institution next to the staff name": it is tested on the whole sentence, so a parenthetical
"(Institute for Systems Biology)" after the name still disqualifies even though it sits outside
the "for …" phrase.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from uwpr_pubs.evidence import criterion_for
from uwpr_pubs.rules.common import TextSource, text_evidence
from uwpr_pubs.rules.staff import StaffMember, is_author
from uwpr_pubs.store.models import Date, Evidence, RecordId, StaffKey
from uwpr_pubs.text import Document, Sentence

FOR = re.compile(r"\bfor\b")
OTHER_INSTITUTION = "other_institution"

# Where the next person's thanks begins: ", Martin Morgan for …" or "and Phil Gafken for …".
# The purpose phrase stops there, because §6.6's 160 characters are a ceiling, not a target, and
# its whole reason for existing is that the help-with-work wording may belong to somebody else.
NEXT_CLAUSE = re.compile(r"(?:,|\band\b)\s+(?:[A-Z][\w.\-']*\s+){1,4}for\b")

DISCUSSION = "discussion"
# Services named outright, as opposed to help described in passing. These are the wordings 01a
# C2 quotes when it decides this case type is UWPR support.
NAMED_SERVICE = re.compile(r"(?i)technical (?:assistance|support|help)|data analysis")


@dataclass(frozen=True)
class WorkPattern:
    """One help-with-work test; an `all:` group must match every one of its patterns."""

    patterns: tuple[re.Pattern[str], ...]

    def matches(self, text: str) -> bool:
        return all(pattern.search(text) for pattern in self.patterns)


@dataclass(frozen=True)
class R7Rules:
    thanks: re.Pattern[str]
    same_or_previous: bool
    purpose_max_chars: int
    work: tuple[WorkPattern, ...]
    disqualifiers: tuple[tuple[str, re.Pattern[str]], ...]


def r7_rules(config: Mapping[str, Any]) -> R7Rules:
    work: list[WorkPattern] = []
    for entry in config["work"]:
        if isinstance(entry, dict):
            work.append(WorkPattern(tuple(re.compile(p) for p in entry["all"])))
        else:
            work.append(WorkPattern((re.compile(entry),)))
    return R7Rules(
        thanks=re.compile(config["thanks"]),
        same_or_previous=config["thanks_scope"] == "same_or_previous_sentence",
        purpose_max_chars=int(config["purpose_max_chars"]),
        work=tuple(work),
        disqualifiers=tuple((name, re.compile(p)) for name, p in config["disqualifiers"].items()),
    )


@dataclass(frozen=True)
class R7Outcome:
    evidence: list[Evidence] = field(default_factory=list)
    acknowledged: set[StaffKey] = field(default_factory=set)  # named and thanked, but R7 did not fire


def purpose_phrase(sentence: str, name_end: int, limit: int) -> str:
    """The "for …" phrase after the staff name, capped at `limit` characters (§6.6).

    It also stops at the next person's clause, so that "…von Haller for help with mass
    spectrometry, Martin Morgan for computational advice, Phil Gafken for helpful discussions"
    tests only "for help with mass spectrometry".
    """
    match = FOR.search(sentence, name_end)
    start = match.start() if match else name_end
    phrase = sentence[start : start + limit]
    boundary = NEXT_CLAUSE.search(phrase)
    return phrase[: boundary.start()] if boundary else phrase


def _thanked(document: Document, sentence: Sentence, rules: R7Rules) -> bool:
    if rules.thanks.search(sentence.text):
        return True
    if not rules.same_or_previous:
        return False
    previous = document.previous(sentence)
    return previous is not None and bool(rules.thanks.search(previous.text))


def _disqualified(sentence: str, purpose: str, rules: R7Rules) -> bool:
    named_service = bool(NAMED_SERVICE.search(purpose))
    for name, pattern in rules.disqualifiers:
        if name == DISCUSSION and named_service:
            # "for their discussions and technical assistance" names a service outright, which
            # 01a C2 decides is UWPR support. The discussion wording still vetoes on its own —
            # "for helpful discussions about running the instrument" is not a service.
            continue
        target = sentence if name == OTHER_INSTITUTION else purpose
        if pattern.search(target):
            return True
    return False


def _fires(sentence: str, name_end: int, rules: R7Rules) -> bool:
    purpose = purpose_phrase(sentence, name_end, rules.purpose_max_chars)
    if not any(test.matches(purpose) for test in rules.work):
        return False
    return not _disqualified(sentence, purpose, rules)


def staff_thanked(  # noqa: PLR0913 - a rule needs its text, record, source, config and authors
    document: Document,
    *,
    record: RecordId,
    source: TextSource,
    rules: R7Rules,
    label: str,
    staff: Sequence[StaffMember],
    authors: Sequence[str],
    year: int | None,
    today: Date,
) -> R7Outcome:
    """R7 evidence, plus the staff who were thanked without qualifying (a `staff_ack_other` signal)."""
    outcome = R7Outcome()
    decided: set[StaffKey] = set()
    for sentence in document.sentences:
        if not _thanked(document, sentence, rules):
            continue
        for member in staff:
            if member.key in decided:
                continue
            match = next((m for p in member.patterns if (m := p.search(sentence.text))), None)
            if match is None:
                continue
            outcome.acknowledged.add(member.key)
            if is_author(member, authors) or not member.in_tenure(year):
                continue
            if not _fires(sentence.text, match.end(), rules):
                continue
            decided.add(member.key)
            outcome.acknowledged.discard(member.key)
            outcome.evidence.append(
                text_evidence(
                    "R7",
                    criterion=criterion_for("R7"),
                    label=label,
                    record=record,
                    source=source,
                    section=sentence.section,
                    excerpt=sentence.text,
                    detail={"staff": member.key},
                    today=today,
                )
            )
    return outcome
