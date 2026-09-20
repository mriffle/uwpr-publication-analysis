"""Turning source metadata into store records (docs/02-data-model.md §5.2).

Pure: a parsed API response and the configuration in, a record out. The record-type map and the
2006 window live in `rules.yaml`, so what counts as a publication is configuration, not code.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any, cast

from uwpr_pubs.config import Config
from uwpr_pubs.store.ids import normalise_doi
from uwpr_pubs.store.models import (
    Affiliation,
    Author,
    CandidateRecord,
    Date,
    Ids,
    IncludedKind,
    OpenAccess,
    Record,
    RecordId,
    StaffKey,
    Topic,
    Venue,
)

YEAR_IN_TEXT = re.compile(r"\b(19[89][0-9]|20[0-9]{2})\b")
INCLUDED_KINDS: frozenset[str] = frozenset(IncludedKind.__args__)  # type: ignore[attr-defined]
UNKNOWN_KIND = "other"  # an unmapped source type is excluded, and the run report names it


def short_openalex_id(value: str | None) -> str | None:
    """OpenAlex gives full URLs; the store keeps the bare id."""
    return value.rsplit("/", 1)[-1] if value else None


def ids_from_openalex(work: Mapping[str, Any]) -> Ids:
    raw = work.get("ids") or {}
    doi = raw.get("doi") or work.get("doi")
    pmid = raw.get("pmid")
    pmcid = raw.get("pmcid")
    ids: Ids = {
        "doi": normalise_doi(doi) if doi else None,
        "pmid": pmid.rsplit("/", 1)[-1] if pmid else None,
        "pmcid": pmcid.rsplit("/", 1)[-1] if pmcid else None,
        "openalex": short_openalex_id(work.get("id")),
    }
    return ids


def merge_ids(stored: Ids, fresh: Ids) -> Ids:
    """Identifiers accumulate; a source that stops reporting one never takes it away.

    The PMCID is the case that matters: the NCBI ID converter finds it in stage 4, and OpenAlex,
    which knows nothing about it, would otherwise blank it on the next run's metadata refresh.
    """
    merged: dict[str, Any] = {**stored}
    for key, value in cast(Mapping[str, Any], fresh).items():
        if key == "pride":
            combined = sorted({*(merged.get("pride") or []), *(value or [])})
            if combined:
                merged["pride"] = combined
        elif value is not None or key not in merged:
            merged[key] = value
    return cast(Ids, merged)


def kind_of(work: Mapping[str, Any], config: Config, source: str = "openalex") -> str:
    """The store's record kind, or an excluded kind, from the type maps in rules.yaml."""
    types = config.rules["record_types"]
    doi = (work.get("ids") or {}).get("doi") or work.get("doi") or work.get("DOI") or ""
    normalised = normalise_doi(doi) if doi else ""
    for entry in types["exclude_doi_patterns"]:
        if normalised and re.search(entry["pattern"], normalised):
            return str(entry["kind"])
    title = work.get("display_name") or work.get("title") or ""
    if isinstance(title, list):
        title = title[0] if title else ""
    if title and re.search(types["exclude_title_pattern"]["pattern"], str(title)):
        return str(types["exclude_title_pattern"]["kind"])
    for prefix in types["repository_copy_doi_prefixes"]:
        if normalised.startswith(prefix):
            return "repository-copy"
    mapping = types["openalex_types"] if source == "openalex" else types["crossref_types"]
    raw_type = str(work.get("type") or "")
    return str(mapping.get(raw_type, UNKNOWN_KIND))


def staff_key_for(author: Mapping[str, Any], config: Config, year: int | None) -> StaffKey | None:
    """A staff member only counts within their UWPR tenure (Phase 1 §5.1)."""
    openalex = short_openalex_id((author.get("author") or {}).get("id"))
    orcid = (author.get("author") or {}).get("orcid")
    orcid_id = orcid.rsplit("/", 1)[-1] if orcid else None
    for person in config.staff:
        if openalex in person["openalex"] or (orcid_id and orcid_id == person["orcid"]):
            tenure = person["tenure"]
            if year is not None and year < tenure["start"]:
                return None
            if year is not None and tenure["end"] is not None and year > tenure["end"]:
                return None
            return cast(StaffKey, person["key"])
    return None


def _affiliations(authorship: Mapping[str, Any]) -> list[Affiliation]:
    institutions = {i.get("display_name"): i for i in authorship.get("institutions") or []}
    result: list[Affiliation] = []
    for raw in authorship.get("raw_affiliation_strings") or []:
        match = next((i for name, i in institutions.items() if name and str(name) in raw), None)
        # An institution may carry `ror: null`; `.get("ror", "")` then returns None, not "".
        ror = str((match or {}).get("ror") or "").rsplit("/", 1)[-1]
        result.append(
            {
                "raw": raw,
                "ror": ror or None,
                "name": (match or {}).get("display_name") if match else None,
                "country": (match or {}).get("country_code") if match else None,
            }
        )
    return result


def _authors(work: Mapping[str, Any], config: Config, year: int | None) -> list[Author]:
    authors: list[Author] = []
    for authorship in work.get("authorships") or []:
        person = authorship.get("author") or {}
        orcid = person.get("orcid")
        authors.append(
            {
                "name": str(person.get("display_name") or "unknown"),
                "orcid": orcid.rsplit("/", 1)[-1] if orcid else None,
                "openalex": short_openalex_id(person.get("id")),
                "staff": staff_key_for(authorship, config, year),
                "corresponding": bool(authorship.get("is_corresponding")),
                "affiliations": _affiliations(authorship),
            }
        )
    return authors


def _venue(work: Mapping[str, Any]) -> Venue | None:
    source = (work.get("primary_location") or {}).get("source") or {}
    if not source.get("display_name"):
        return None
    return {
        "name": str(source["display_name"]),
        "issn_l": source.get("issn_l"),
        "publisher": source.get("host_organization_name"),
    }


def _open_access(work: Mapping[str, Any]) -> OpenAccess:
    oa = work.get("open_access") or {}
    best = work.get("best_oa_location") or {}
    status = str(oa.get("oa_status") or "unknown")
    return {
        "status": cast(
            Any, status if status in {"gold", "green", "hybrid", "bronze", "diamond", "closed"} else "unknown"
        ),
        "url": best.get("landing_page_url") or oa.get("oa_url"),
        "license": best.get("license"),
    }


def _topics(work: Mapping[str, Any]) -> list[Topic]:
    topics: list[Topic] = []
    for topic in work.get("topics") or []:
        topics.append(
            {
                "domain": str((topic.get("domain") or {}).get("display_name") or ""),
                "field": str((topic.get("field") or {}).get("display_name") or ""),
                "subfield": str((topic.get("subfield") or {}).get("display_name") or ""),
                "topic": str(topic.get("display_name") or ""),
                "score": float(topic.get("score") or 0.0),
            }
        )
    return topics


def record_from_openalex(work: Mapping[str, Any], record_id: RecordId, config: Config, today: Date) -> Record:
    """A full store record. `fulltext` says we have not looked yet: M3 fetches text."""
    year = work.get("publication_year")
    return {
        "id": record_id,
        "kind": cast(IncludedKind, kind_of(work, config)),
        "ids": ids_from_openalex(work),
        "title": str(work.get("display_name") or "untitled"),
        "published": work.get("publication_date"),
        "year": int(year) if year else 0,
        "venue": _venue(work),
        "authors": _authors(work, config, int(year) if year else None),
        "topics": _topics(work),
        "oa": _open_access(work),
        "retracted": bool(work.get("is_retracted")),
        "fulltext": {"status": "unavailable", "checked": today, "recheck_after": today, "cache": None},
        "abstract": None,
        "version_link": None,
        "sources": {"openalex": today},
    }


def record_from_list_entry(  # noqa: PLR0913 - the fields a list entry gives us, all keyword-only
    *, record_id: RecordId, key: str, title: str, year: int, pmid: str | None, today: Date
) -> Record:
    """A work that is on UWPR's list and nowhere else we can reach (Phase 1 §8).

    Its identifier is the list entry key, which is why `ids` accepts one (Phase 2, 2026-09-19).
    """
    return {
        "id": record_id,
        "kind": "article",
        "ids": {"doi": None, "pmid": pmid, "pmcid": None, "openalex": None, "list": key},
        "title": title,
        "published": None,
        "year": year,
        "venue": None,
        "authors": [],
        "topics": [],
        "oa": {"status": "unknown", "url": None, "license": None},
        "retracted": False,
        "fulltext": {"status": "unavailable", "checked": today, "recheck_after": today, "cache": None},
        "abstract": None,
        "version_link": None,
        "sources": {"uwpr_site": today},
    }


def to_candidate_record(record: Record, kind: str | None = None) -> CandidateRecord:
    """The smaller shape a work that is not included keeps (docs/02 §6)."""
    return {
        "id": record["id"],
        "kind": kind or record["kind"],
        "ids": record["ids"],
        "title": record["title"],
        "year": record["year"] or None,
    }


def year_from_text(*candidates: str | None) -> int | None:
    """The publication year of a list entry, which carries no structured date."""
    for text in candidates:
        if not text:
            continue
        found = YEAR_IN_TEXT.findall(text)
        if found:
            return int(found[0])
    return None


def canonical_record(records: Sequence[Record]) -> RecordId:
    """The journal article if there is one, else the latest preprint (docs/02 §5.1)."""
    articles = [r for r in records if r["kind"] != "preprint"]
    if articles:
        return sorted(articles, key=lambda r: (r["published"] or "", r["id"]))[0]["id"]
    return sorted(records, key=lambda r: (r["published"] or "", r["id"]))[-1]["id"]
