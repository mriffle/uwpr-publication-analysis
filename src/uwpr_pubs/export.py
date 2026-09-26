"""The app's data contract (docs/05-metrics-and-data-contract.md).

Pure: store shapes in, export shapes out. No IO, no clock, no config files — everything the
export needs arrives as an argument, so every metric definition in docs/05 §5 is testable as
arithmetic.

The export is a *projection* of the store, not a copy. Three rules govern what crosses:

- **Rows, not totals** (§1.1). Every dimension the app filters or groups by sits on the work, so
  aggregates are recomputed in the browser under any filter. `summary` is a cross-check written
  independently, never a source the app reads for something a filter can change.
- **Nothing internal.** Abstracts (D11), cache hashes and full-text status stay behind. The
  method block carries *aggregates* over full-text status, because §10 needs to distinguish a
  paper we read and found nothing in from one we could not read at all.
- **Absent versus null.** A `null` means "known to be absent" and the app shows it as such: no
  ORCID, no field-weighted impact, no ISSN-L. A key is omitted only where the concept does not
  apply at all — `found_on` on override evidence, which belongs to the work and to no record.
"""

import statistics
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, NotRequired, TypedDict

from uwpr_pubs.store.models import (
    Affiliation,
    Author,
    Candidate,
    Date,
    DateTime,
    Evidence,
    MetricsLine,
    Record,
    RecordId,
    RuleVersion,
    StaffKey,
    Topic,
    Work,
    WorkId,
)

SCHEMA_VERSION = "1.0"

# Presentation text for the lookup index (docs/05 §8). It lives here rather than in rules.yaml
# because a change to that file is a rule change and forces a `rule_version` bump that
# re-evaluates every work (docs/02 §4) — wording should never cost that. The register is
# docs/05 §11's: plain, factual, and never implying the paper is deficient.
REASON_LABELS: Mapping[str, str] = {
    "no_rule_fired": "No evidence of UWPR support was found in this paper",
    "excluded_record_type": "Not a publication type this project counts",
    "before_window": "Published before 2006, where the project's search window opens",
    "override_exclude": "Reviewed and set aside by hand, with a recorded reason",
    "no_longer_meets_rules": "A rule changed, and the evidence this paper had is superseded",
}

SIGNAL_LABELS: Mapping[str, str] = {
    "staff_coauthor": "A UWPR staff member is a co-author, which on its own is not evidence",
    "staff_ack_other": "A UWPR staff member is thanked, but not for analysis or technical help",
    "core_named": "A different UW core facility is named, which is not UWPR",
    "uwpr_tool_mention": "The paper used a UWPR online tool, which is not use of the facility",
    "uwpr_hardware_mention": "The paper used a UWPR hardware design, which is not use of the facility",
    "uwpr_software_mention": "The paper used or cited UWPR software, which is not use of the facility",
    "near_miss_identifier": "An identifier resembling the UWPR award code appears, but does not match",
}


# --- exported shapes ---------------------------------------------------------------------------


class ExportVenue(TypedDict):
    name: str
    issn_l: str | None


class ExportIds(TypedDict):
    doi: str | None
    pmid: str | None
    pmcid: str | None
    openalex: str | None


class ExportOa(TypedDict):
    status: str
    url: str | None
    license: str | None


class ExportInstitution(TypedDict):
    ror: str
    name: str | None
    country: str | None


class ExportAuthor(TypedDict):
    name: str
    openalex: str | None
    orcid: str | None
    staff: StaffKey | None
    corresponding: bool
    institutions: list[ExportInstitution]
    affiliations_raw: list[str]


class ExportPerson(TypedDict):
    """A member of the resource's staff.

    `id` is the join key the app needs: the same identifier `authors[].staff` and
    `staff_authors` carry, so a staff id can be turned into a name (docs/05 §4.2).
    """

    id: StaffKey
    name: str
    openalex: str | None


class ExportNamedPerson(TypedDict):
    """Someone named on a publication who is not staff, and so has no staff identifier."""

    name: str
    openalex: str | None


class ExportTopic(TypedDict):
    domain: str
    field: str
    subfield: str
    topic: str
    score: float
    primary: bool


class ExportCitations(TypedDict):
    total: int
    by_year: dict[str, int]
    fwci: float | None
    percentile: float | None
    as_of: Date


class ExportFoundOn(TypedDict):
    kind: str
    doi: str | None


class ExportEvidence(TypedDict):
    rule: str
    criterion: int | None
    label: str
    section: str
    excerpt: str | None
    found_on: NotRequired[ExportFoundOn]
    source: dict[str, str | None]
    detail: dict[str, Any]
    first_seen: Date
    last_seen: Date


class ExportVersion(TypedDict):
    kind: str
    doi: str | None
    date: Date | None
    year: int
    url: str | None


class ExportWork(TypedDict):
    id: WorkId
    aliases: list[WorkId]
    title: str
    year: int
    date: Date | None
    first_version_date: Date | None
    kind: str
    is_preprint: bool
    venue: ExportVenue | None
    ids: ExportIds
    url: str | None
    oa: ExportOa
    retracted: bool
    authors: list[ExportAuthor]
    author_count: int
    staff_authors: list[StaffKey]
    institutions: list[ExportInstitution]
    countries: list[str]
    corresponding_authors: list[ExportNamedPerson]
    topics: list[ExportTopic]
    citations: ExportCitations
    on_official_list: bool
    criteria: list[int]
    evidence: list[ExportEvidence]
    versions: list[ExportVersion]


class ExportPeriod(TypedDict):
    first_year: int
    last_year: int
    complete_through: int
    current_year_partial: bool
    citation_years_from: int | None
    citations_before_window: int


class ExportSummary(TypedDict):
    publications: int
    first_year: int
    last_year: int
    citations: int
    citations_in_window: int
    fwci_median: float | None
    fwci_mean: float | None
    h_index: int
    open_access: int
    journals: int
    institutions: int
    countries: int
    research_groups: int
    last_authors: int
    on_official_list: int
    beyond_official_list: int
    preprint_only: int


class ExportMethod(TypedDict):
    criteria: dict[str, int]
    works_with_multiple_criteria: int
    official_list_total: int
    independently_confirmed: int
    listing_only: int
    listing_only_text_read: int
    listing_only_text_unavailable: int
    beyond_official_list: int
    works_with_staff_author: int
    sources_last_read: dict[str, Date]


class ExportHomeInstitution(TypedDict):
    ror: str
    name: str


class ExportExclusion(TypedDict):
    kind: str
    name: str
    note: str


class ExportResource(TypedDict):
    name: str
    short_name: str
    url: str
    identifier: str
    #: The institution docs/05 §7.8's chart excludes, and the country §7.14 counts "outside".
    #: Facts about the facility, so they are stated here rather than inferred by the app.
    home_institution: ExportHomeInstitution
    home_country: str
    #: What is deliberately not evidence, named (docs/05 §10). The method page groups these by
    #: `kind`; it names none of them itself, because §1.1 principle 5 keeps every
    #: resource-specific string in this file.
    exclusions: list[ExportExclusion]
    staff: list[ExportPerson]


class ExportDoc(TypedDict):
    schema_version: str
    generated_at: DateTime
    run_id: str
    pipeline_version: str
    rule_version: RuleVersion
    resource: ExportResource
    sources: dict[str, Any]
    period: ExportPeriod
    summary: ExportSummary
    method: ExportMethod
    works: list[ExportWork]


class LookupCandidate(TypedDict):
    id: WorkId
    title: str
    year: int | None
    ids: ExportIds
    reason: str
    reason_label: str
    signals: list[str]
    signal_labels: list[str]


class LookupDoc(TypedDict):
    schema_version: str
    generated_at: DateTime
    aliases: dict[str, WorkId]
    not_included: list[LookupCandidate]


@dataclass(frozen=True)
class ExportMeta:
    """Everything the export needs about the run and the resource it describes."""

    run_id: str
    generated_at: DateTime
    pipeline_version: str
    rule_version: RuleVersion
    run_year: int
    citations_as_of: Date
    resource: ExportResource
    citation_note: str = (
        "Citation counts come from OpenAlex and differ from Google Scholar or Web of Science."
    )
    # The work files hold these dates under the 28-day rule, so a weekly run need not rewrite
    # them (docs/02 §15). The export changes every run anyway, so it can say them exactly:
    # each list entry's own first and last seen, and the day this run read each source it
    # queries afresh (docs/05, changed 2026-09-26).
    listings: Mapping[str, tuple[Date, Date]] = field(default_factory=dict)
    read_on: Mapping[str, Date] = field(default_factory=dict)


# --- helpers -----------------------------------------------------------------------------------


def active_evidence(work: Work) -> list[Evidence]:
    """Superseded entries stay in the store as the audit trail; they are never exported."""
    return [entry for entry in work["evidence"] if "superseded" not in entry]


def canonical_record(work: Work) -> Record:
    for record in work["records"]:
        if record["id"] == work["canonical"]:
            return record
    raise KeyError(f"{work['id']} has no canonical record {work['canonical']}")


def _affiliation_key(raw: str) -> str:
    """OpenAlex returns the same affiliation twice with only punctuation differing.

    Measured on 2026-09-20: 301 such pairs across the store. The store keeps what the source
    published (docs/02 §5.2); collapsing them here means every app does not have to.
    """
    return "".join(character.lower() for character in raw if character.isalnum())


def _url_for(ids: Mapping[str, Any]) -> str | None:
    if ids.get("doi"):
        return f"https://doi.org/{ids['doi']}"
    if ids.get("pmid"):
        return f"https://pubmed.ncbi.nlm.nih.gov/{ids['pmid']}/"
    if ids.get("openalex"):
        return f"https://openalex.org/{ids['openalex']}"
    return None


def _export_ids(ids: Mapping[str, Any]) -> ExportIds:
    return {
        "doi": ids.get("doi"),
        "pmid": ids.get("pmid"),
        "pmcid": ids.get("pmcid"),
        "openalex": ids.get("openalex"),
    }


def _institutions(affiliations: Iterable[Affiliation]) -> list[ExportInstitution]:
    """Deduplicated, ROR-resolved institutions, in a stable order."""
    seen: dict[str, ExportInstitution] = {}
    for affiliation in affiliations:
        ror = affiliation.get("ror")
        if ror and ror not in seen:
            seen[ror] = {
                "ror": ror,
                "name": affiliation.get("name"),
                "country": affiliation.get("country"),
            }
    return [seen[ror] for ror in sorted(seen)]


def _raw_affiliations(affiliations: Iterable[Affiliation]) -> list[str]:
    seen: dict[str, str] = {}
    for affiliation in affiliations:
        key = _affiliation_key(affiliation["raw"])
        if key and key not in seen:
            seen[key] = affiliation["raw"]
    return [seen[key] for key in sorted(seen)]


def _export_author(author: Author) -> ExportAuthor:
    affiliations = author.get("affiliations") or []
    return {
        "name": author["name"],
        "openalex": author.get("openalex"),
        "orcid": author.get("orcid"),
        "staff": author.get("staff"),
        "corresponding": bool(author.get("corresponding")),
        "institutions": _institutions(affiliations),
        "affiliations_raw": _raw_affiliations(affiliations),
    }


def _export_topics(topics: Sequence[Topic]) -> list[ExportTopic]:
    return [
        {
            "domain": topic["domain"],
            "field": topic["field"],
            "subfield": topic["subfield"],
            "topic": topic["topic"],
            "score": topic["score"],
            "primary": index == 0,
        }
        for index, topic in enumerate(topics)
    ]


def _export_venue(record: Record) -> ExportVenue | None:
    venue = record.get("venue")
    if not venue:
        return None
    return {"name": venue["name"], "issn_l": venue.get("issn_l")}


def _export_evidence(
    entry: Evidence, records: Mapping[RecordId, Record], listings: Mapping[str, tuple[Date, Date]]
) -> ExportEvidence:
    source = entry["source"]
    exported: ExportEvidence = {
        "rule": entry["rule"],
        "criterion": entry["criterion"],
        "label": entry["label"],
        "section": entry["section"],
        "excerpt": entry["excerpt"],
        "source": {
            "name": source["name"],
            "url": source.get("url"),
            "retrieved": source["retrieved"],
        },
        "detail": dict(entry.get("detail") or {}),
        "first_seen": entry["first_seen"],
        "last_seen": entry["last_seen"],
    }
    listed = listings.get(str(exported["detail"].get("list_key"))) if entry["rule"] == "R1" else None
    if listed is not None:
        # "First on X and most recently on Y" (docs/06 §5) is the list entry's to say, exactly.
        first, last = listed
        exported["detail"] = {**exported["detail"], "first_seen": first, "last_seen": last}
        exported["first_seen"], exported["last_seen"] = first, last
    # `record` is null only on override evidence, which applies to the whole work (docs/02 §5.3),
    # so there is no version to point at and the key is omitted rather than nulled.
    record_id = entry["record"]
    if record_id is not None and record_id in records:
        found = records[record_id]
        exported["found_on"] = {"kind": found["kind"], "doi": found["ids"].get("doi")}
    return exported


def _citations(record_id: RecordId, metrics: Mapping[RecordId, MetricsLine], as_of: Date) -> ExportCitations:
    line = metrics.get(record_id)
    if line is None:
        return {"total": 0, "by_year": {}, "fwci": None, "percentile": None, "as_of": as_of}
    return {
        "total": line["cited_by"],
        "by_year": dict(sorted(line["cites_by_year"].items())),
        "fwci": line["fwci"],
        "percentile": line["citation_percentile"],
        "as_of": line["date"],
    }


def export_work(
    work: Work,
    metrics: Mapping[RecordId, MetricsLine],
    as_of: Date,
    listings: Mapping[str, tuple[Date, Date]] | None = None,
) -> ExportWork:
    """One work, as the app sees it (docs/05 §4.3)."""
    canonical = canonical_record(work)
    records = {record["id"]: record for record in work["records"]}
    evidence = active_evidence(work)
    authors = [_export_author(author) for author in canonical.get("authors") or []]

    every_affiliation = [
        affiliation
        for author in canonical.get("authors") or []
        for affiliation in author.get("affiliations") or []
    ]
    institutions = _institutions(every_affiliation)
    countries = sorted({i["country"] for i in institutions if i["country"]})
    published = [record["published"] for record in work["records"] if record["published"]]

    return {
        "id": work["id"],
        "aliases": sorted(work["aliases"]),
        "title": canonical["title"],
        "year": canonical["year"],
        "date": canonical["published"],
        "first_version_date": min(published) if published else None,
        "kind": canonical["kind"],
        "is_preprint": all(record["kind"] == "preprint" for record in work["records"]),
        "venue": _export_venue(canonical),
        "ids": _export_ids(canonical["ids"]),
        "url": _url_for(canonical["ids"]),
        "oa": {
            "status": canonical["oa"]["status"],
            "url": canonical["oa"].get("url"),
            "license": canonical["oa"].get("license"),
        },
        "retracted": bool(canonical.get("retracted")),
        "authors": authors,
        "author_count": len(authors),
        "staff_authors": sorted({a["staff"] for a in authors if a["staff"] is not None}),
        "institutions": institutions,
        "countries": countries,
        "corresponding_authors": [
            {"name": a["name"], "openalex": a["openalex"]} for a in authors if a["corresponding"]
        ],
        "topics": _export_topics(canonical.get("topics") or []),
        "citations": _citations(work["canonical"], metrics, as_of),
        "on_official_list": any(entry["rule"] == "R1" for entry in evidence),
        "criteria": sorted({e["criterion"] for e in evidence if e["criterion"] is not None}),
        "evidence": [_export_evidence(entry, records, listings or {}) for entry in evidence],
        "versions": [
            {
                "kind": record["kind"],
                "doi": record["ids"].get("doi"),
                "date": record["published"],
                "year": record["year"],
                "url": _url_for(record["ids"]),
            }
            for record in work["records"]
            if record["id"] != work["canonical"]
        ],
    }


# --- aggregates --------------------------------------------------------------------------------


def h_index(citations: Iterable[int]) -> int:
    """The largest h for which h works are cited at least h times (docs/05 §5)."""
    ordered = sorted(citations, reverse=True)
    return sum(1 for position, count in enumerate(ordered, 1) if count >= position)


def _journal_key(work: ExportWork) -> str | None:
    venue = work["venue"]
    if not venue:
        return None
    return venue["issn_l"] or venue["name"]


def build_summary(works: Sequence[ExportWork]) -> ExportSummary:
    """Computed independently of the app, as the cross-check of docs/05 §1.2."""
    years = [work["year"] for work in works]
    fwci = [w["citations"]["fwci"] for w in works if w["citations"]["fwci"] is not None]
    in_window = sum(sum(w["citations"]["by_year"].values()) for w in works)
    return {
        "publications": len(works),
        "first_year": min(years) if years else 0,
        "last_year": max(years) if years else 0,
        "citations": sum(work["citations"]["total"] for work in works),
        "citations_in_window": in_window,
        "fwci_median": round(statistics.median(fwci), 4) if fwci else None,
        "fwci_mean": round(statistics.fmean(fwci), 4) if fwci else None,
        "h_index": h_index(work["citations"]["total"] for work in works),
        "open_access": sum(1 for work in works if work["oa"]["status"] != "closed"),
        "journals": len({key for key in (_journal_key(w) for w in works) if key}),
        "institutions": len({i["ror"] for w in works for i in w["institutions"]}),
        "countries": len({country for work in works for country in work["countries"]}),
        "research_groups": len(
            {p["openalex"] or p["name"] for w in works for p in w["corresponding_authors"]}
        ),
        "last_authors": len(
            {(w["authors"][-1]["openalex"] or w["authors"][-1]["name"]) for w in works if w["authors"]}
        ),
        "on_official_list": sum(1 for work in works if work["on_official_list"]),
        "beyond_official_list": sum(1 for work in works if not work["on_official_list"]),
        "preprint_only": sum(1 for work in works if work["is_preprint"]),
    }


def build_period(works: Sequence[ExportWork], run_year: int) -> ExportPeriod:
    """The partial-year and citation-window flags of docs/05 §4.2.

    Both exist because a chart drawn without them lies: the current year is incomplete, so every
    time series falls off at the right-hand end, and OpenAlex reports citations by year only from
    2012 while the publications start in 2008.
    """
    years = [work["year"] for work in works] or [run_year]
    citation_years = [int(year) for work in works for year in work["citations"]["by_year"]]
    total = sum(work["citations"]["total"] for work in works)
    in_window = sum(sum(work["citations"]["by_year"].values()) for work in works)
    return {
        "first_year": min(years),
        "last_year": max(years),
        "complete_through": run_year - 1,
        "current_year_partial": max(years) >= run_year,
        "citation_years_from": min(citation_years) if citation_years else None,
        "citations_before_window": max(total - in_window, 0),
    }


def build_method(
    works: Sequence[Work], exported: Sequence[ExportWork], read_on: Mapping[str, Date] | None = None
) -> ExportMethod:
    """The aggregates the method page states (docs/05 §10).

    Full-text status is deliberately not exported per work (§4.3), but the *split* between a
    listed paper we read and found no trace in and one we could not read at all is the whole
    point of §10, so it is aggregated here.
    """
    by_id = {work["id"]: work for work in works}
    criteria: dict[str, int] = {}
    for work in exported:
        for criterion in work["criteria"]:
            criteria[str(criterion)] = criteria.get(str(criterion), 0) + 1

    listed = [work for work in exported if work["on_official_list"]]
    listing_only = [work for work in listed if work["criteria"] == [1]]
    read, unread = 0, 0
    for work in listing_only:
        stored = by_id.get(work["id"])
        status = canonical_record(stored)["fulltext"]["status"] if stored else "unavailable"
        if status in ("pmc_xml", "epmc_xml"):
            read += 1
        else:
            unread += 1

    # §10 wants each source with the date it was last read. The records' own `sources` map cannot
    # supply it — measured on 2026-09-20, every record in the store carries `openalex` and nothing
    # else — so this reads the evidence, whose `source.name` is already the human-facing name the
    # method page shows: OpenAlex, PMC, Crossref, PRIDE, the UWPR website. A source that produced
    # no evidence is absent rather than guessed at.
    last_read: dict[str, Date] = {}
    for exported_work in exported:
        for entry in exported_work["evidence"]:
            name, retrieved = entry["source"]["name"], entry["source"]["retrieved"]
            if name and retrieved and retrieved > last_read.get(name, ""):
                last_read[name] = retrieved
    # The evidence holds its `retrieved` dates under the 28-day rule (docs/02 §15), so a source
    # this run queried afresh says so with the run's date. Only a source that produced evidence.
    for name, date in (read_on or {}).items():
        if name in last_read and date > last_read[name]:
            last_read[name] = date

    return {
        "criteria": dict(sorted(criteria.items())),
        "works_with_multiple_criteria": sum(1 for work in exported if len(work["criteria"]) > 1),
        "official_list_total": len(listed),
        "independently_confirmed": len(listed) - len(listing_only),
        "listing_only": len(listing_only),
        "listing_only_text_read": read,
        "listing_only_text_unavailable": unread,
        "beyond_official_list": sum(1 for work in exported if not work["on_official_list"]),
        "works_with_staff_author": sum(1 for work in exported if work["staff_authors"]),
        "sources_last_read": dict(sorted(last_read.items())),
    }


# --- documents ---------------------------------------------------------------------------------


def sort_works(works: Iterable[ExportWork]) -> list[ExportWork]:
    """Newest first, then by title, then by id — a total order, so runs do not reorder."""
    return sorted(works, key=lambda w: (-w["year"], w["date"] or "", w["title"], w["id"]))


def build_export(
    works: Sequence[Work],
    metrics: Sequence[MetricsLine],
    meta: ExportMeta,
) -> ExportDoc:
    by_record = {line["record"]: line for line in metrics}
    exported = sort_works(export_work(work, by_record, meta.citations_as_of, meta.listings) for work in works)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": meta.generated_at,
        "run_id": meta.run_id,
        "pipeline_version": meta.pipeline_version,
        "rule_version": meta.rule_version,
        "resource": meta.resource,
        "sources": {
            "citations": {"name": "OpenAlex", "as_of": meta.citations_as_of},
            "notes": [meta.citation_note],
        },
        "period": build_period(exported, meta.run_year),
        "summary": build_summary(exported),
        "method": build_method(works, exported, meta.read_on),
        "works": exported,
    }


def signal_label(signal: str) -> str:
    """Signals are either bare (`near_miss_identifier`) or keyed (`staff_coauthor:riffle`)."""
    return SIGNAL_LABELS.get(signal.split(":", 1)[0], signal)


def build_lookup(
    candidates: Sequence[Candidate],
    aliases: Mapping[str, WorkId],
    meta: ExportMeta,
) -> LookupDoc:
    rows: list[LookupCandidate] = []
    for candidate in sorted(candidates, key=lambda c: c["id"]):
        record = candidate["records"][0] if candidate["records"] else None
        signals = sorted(candidate.get("signals") or [])
        rows.append(
            {
                "id": candidate["id"],
                "title": record["title"] if record else "",
                "year": record["year"] if record else None,
                "ids": _export_ids(record["ids"] if record else {}),
                "reason": candidate["reason"],
                "reason_label": REASON_LABELS.get(candidate["reason"], candidate["reason"]),
                "signals": signals,
                "signal_labels": [signal_label(signal) for signal in signals],
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": meta.generated_at,
        "aliases": dict(sorted(aliases.items())),
        "not_included": rows,
    }
