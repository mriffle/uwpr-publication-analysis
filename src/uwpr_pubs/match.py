"""Matching a nomination to a record or work already in the store (Phase 1 §8, docs/02 §4).

Pure. The order is DOI, PMID, PMCID, OpenAlex ID, and only then normalised title with year ±1 —
title matching is the last resort because it is the only one that can be wrong.
"""

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

from uwpr_pubs.store.ids import external_keys, normalise_doi
from uwpr_pubs.store.models import Ids, WorkId

TITLE_SIMILARITY = 0.85  # Phase 1 §8
YEAR_TOLERANCE = 1


def normalise_title(title: str) -> str:
    text = unicodedata.normalize("NFKC", title).lower()
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", text).split())


def title_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, normalise_title(left), normalise_title(right)).ratio()


@dataclass(frozen=True)
class TitleCandidate:
    work: WorkId
    title: str
    year: int | None


def by_identifier(ids: Ids, aliases: dict[str, WorkId]) -> WorkId | None:
    """DOI → PMID → PMCID → OpenAlex ID, in that order (Phase 1 §8)."""
    for key in external_keys(ids):
        found = aliases.get(key)
        if found:
            return found
    return None


def by_title(
    title: str,
    year: int | None,
    candidates: list[TitleCandidate],
    *,
    threshold: float = TITLE_SIMILARITY,
    tolerance: int = YEAR_TOLERANCE,
) -> WorkId | None:
    """The fallback for official-list entries with no PMID: title ≥ 0.85 and year within one."""
    best: tuple[float, WorkId] | None = None
    for candidate in candidates:
        if year is not None and candidate.year is not None and abs(candidate.year - year) > tolerance:
            continue
        score = title_similarity(title, candidate.title)
        if score >= threshold and (best is None or score > best[0]):
            best = (score, candidate.work)
    return best[1] if best else None


def normalise_ids(ids: Ids) -> Ids:
    """Everything the store compares on is normalised before it is written."""
    cleaned: Ids = dict(ids)  # type: ignore[assignment]
    doi = cleaned.get("doi")
    if doi:
        cleaned["doi"] = normalise_doi(str(doi))
    pmcid = cleaned.get("pmcid")
    if pmcid and not str(pmcid).startswith("PMC"):
        cleaned["pmcid"] = f"PMC{pmcid}"
    return cleaned
