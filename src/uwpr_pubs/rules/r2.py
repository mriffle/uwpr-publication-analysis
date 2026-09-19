"""R2 — the UWPR award code, in funding metadata or in the text (Phase 1 §6.2).

The code is matched as a substring after removing every non-alphanumeric character and
uppercasing, which is what handles `UWPR 95794`, `UWPR-95794` and the observed `UWPR95794UWPR`.
This module covers the metadata arm; the text arm arrives with `text.py`.
"""

import re
from collections.abc import Iterator, Mapping, Sequence
from typing import Any, cast

from uwpr_pubs.store.models import Date, EvidenceR2, RecordId

OPENALEX_FIELD = "awards[].funder_award_id"
CROSSREF_FIELD = "funder[].award[]"


def normalise_award_text(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def contains_award_code(text: str, code: str) -> bool:
    return normalise_award_text(code) in normalise_award_text(text)


def near_misses(text: str, pattern: str, code: str) -> list[str]:
    """Identifiers that look like the code but are not it; logged as a signal, never evidence."""
    found = []
    for match in re.finditer(pattern, text):
        if not contains_award_code(match.group(0), code):
            found.append(match.group(0))
    return found


def _award_numbers_openalex(work: Mapping[str, Any]) -> Iterator[str]:
    for award in work.get("awards") or []:
        number = award.get("funder_award_id") or award.get("award_id")
        if number:
            yield str(number)
    for grant in work.get("grants") or []:  # older OpenAlex records use `grants`
        number = grant.get("award_id")
        if number:
            yield str(number)


def _award_numbers_crossref(work: Mapping[str, Any]) -> Iterator[str]:
    for funder in work.get("funder") or []:
        for award in funder.get("award") or []:
            yield str(award)


def award_code_in_metadata(  # noqa: PLR0913 - evidence needs its source and label, keyword-only
    work: Mapping[str, Any],
    *,
    record: RecordId,
    code: str,
    source_name: str,
    source_url: str | None,
    label: str,
    today: Date,
) -> EvidenceR2 | None:
    """Evidence when a funder award number in the metadata is the UWPR code."""
    numbers: Sequence[str] = (
        list(_award_numbers_crossref(work))
        if source_name == "Crossref"
        else list(_award_numbers_openalex(work))
    )
    matching = [number for number in numbers if contains_award_code(number, code)]
    if not matching:
        return None
    field = CROSSREF_FIELD if source_name == "Crossref" else OPENALEX_FIELD
    return cast(
        EvidenceR2,
        {
            "rule": "R2",
            "criterion": 2,
            "label": label,
            "record": record,
            "source": {"name": source_name, "url": source_url, "retrieved": today, "cache": None},
            "section": "metadata",
            "excerpt": matching[0],
            "detail": {"field": field},
            "rule_version": "",  # the merge stamps the run's version
            "first_seen": today,
            "last_seen": today,
        },
    )
