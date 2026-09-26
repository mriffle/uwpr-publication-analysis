"""The funding the export carries: each work's grants, and the top-level block (docs/09 §11).

Pure, like the rest of the export: the store's funding lines, the grant overrides, the date of the
last full refresh and the exchange-rate sources in; each exported work's listings and the
`funding` block out. No network and no configuration beyond those arguments, so what the page
says about a grant is exactly what the store holds, and the store alone can reproduce it.

It is a projection, as the rest of the export is (docs/05 §1.1): only the citations lines of
exported works count, only the grants they list cross, and only the agencies those grants name,
with every parent. A store without `funding/`, or whose lines name no exported work, exports the
"no funding data" shape — a null `version`, empty lists, zero counts — which the app meets as one
designed state, as it meets a 1.0 export with no block at all (§11.1, §12.10).
"""

import datetime as dt
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, cast
from urllib.parse import quote

from uwpr_pubs.funding.amounts import fiscal_year
from uwpr_pubs.funding.contract import (
    HOW_ORDER,
    ExportAgency,
    ExportExchangeRates,
    ExportFunding,
    ExportFundingMethod,
    ExportFundingSource,
    ExportGrant,
    ExportGrantListing,
    FundingSourceId,
    ListingHow,
    WorkGrants,
)
from uwpr_pubs.funding.overrides import grant_override_for
from uwpr_pubs.funding.summary import build_funding_summary
from uwpr_pubs.store.models import (
    Agency,
    AgencyCode,
    Date,
    DecimalString,
    FundingCitation,
    Grant,
    GrantKey,
    Override,
    WorkId,
)

# The sources a grant's facts or a work's strings can come from (§11.3): name, a page a reader can
# open, the first year its amounts cover, and whether it reports by fiscal year. Listed in §11.3's
# order, which is the order they are exported in. The app hard-codes none of it.
SOURCES: Mapping[FundingSourceId, tuple[str, str, int | None, bool]] = {
    "reporter": ("NIH RePORTER", "https://reporter.nih.gov/", 1985, True),
    "nsf": ("NSF Award API", "https://www.nsf.gov/awardsearch/", None, False),
    "usaspending": ("USAspending", "https://www.usaspending.gov/", 2008, False),
    "openalex": ("OpenAlex", "https://openalex.org/", None, False),
    "pubmed": ("PubMed", "https://pubmed.ncbi.nlm.nih.gov/", None, False),
    "crossref": ("Crossref", "https://www.crossref.org/", None, False),
    "pmc": ("PubMed Central", "https://pmc.ncbi.nlm.nih.gov/", None, False),
}
STRING_SOURCES: Mapping[str, FundingSourceId] = {
    "openalex": "openalex",
    "crossref": "crossref",
    "pubmed": "pubmed",
    "jats": "pmc",  # the JATS text is PMC's
}
# A string reached its grant by correction or by override; any other method lists it as written.
BY_METHOD: Mapping[str, ListingHow] = {"corrected": "corrected", "override": "override"}
REPORTER_FAMILIES = frozenset({"reporter", "nih_contract", "nih_task_order"})
REPORTER_BASES = frozenset({"reporter_fiscal_years", "reporter_contract", "reporter_task_order"})

# Outbound links (§11.4), each form checked by hand against one real page on 2026-09-26.
REPORTER_PAGE = "https://reporter.nih.gov/project-details/{}"
# NSF serves its award page here; the older `showAward?AWD_ID=` form redirects to it.
NSF_PAGE = "https://www.nsf.gov/awardsearch/show-award/?AWD_ID={}"
USASPENDING_PAGE = "https://www.usaspending.gov/award/{}"


@dataclass(frozen=True)
class FundingInput:
    """What the export needs to say about funding. Empty, it exports "no funding data"."""

    citations: Mapping[WorkId, FundingCitation] = field(default_factory=dict)
    grants: Mapping[GrantKey, Grant] = field(default_factory=dict)
    agencies: Mapping[AgencyCode, Agency] = field(default_factory=dict)
    #: `overrides.yaml`'s entries, for the attribution of a `grant` override (§11.2).
    overrides: Sequence[Override] = ()
    #: The store's aliases, so an override naming a since-retired work still attributes.
    aliases: Mapping[str, WorkId] = field(default_factory=dict)
    #: The date of the last full refresh: the newest run manifest whose `funding.mode` is `full`.
    refreshed: Date | None = None
    #: `config/exchange_rates.yaml`'s `sources`.
    rate_sources: Sequence[Mapping[str, Any]] = ()


# --- small pieces --------------------------------------------------------------------------------


def collapse(text: str) -> str:
    """A written form as `cited_as` shows it: whitespace collapsed."""
    return " ".join(text.split())


def json_number(text: DecimalString) -> int | float:
    """A stored decimal string as a JSON number, exactly.

    Through `Decimal`, and a float only when its shortest form is the same decimal, so no amount
    gains or loses a digit on the way out. An amount no float can carry is refused rather than
    rounded; none in the corpus comes near.
    """
    number = Decimal(text)
    if number == number.to_integral_value():
        return int(number)
    value = float(number)
    if Decimal(repr(value)) != number:
        raise ValueError(f"the amount {text} cannot be written as a JSON number without changing it")
    return value


def _year(value: str | None) -> int | None:
    """A date or a year alone (OpenAlex gives only years): its year."""
    return int(value[:4]) if value else None


def agency_chain(code: AgencyCode, agencies: Mapping[AgencyCode, Agency]) -> list[AgencyCode]:
    """An agency and its parents, root first (`["NIH", "NIGMS"]`). A cycle stops where it closes;
    the store's invariant F5 and the export's validator both report one."""
    chain = [code]
    parent = agencies[code]["parent"] if code in agencies else None
    while parent is not None and parent not in chain:
        chain.append(parent)
        parent = agencies[parent]["parent"] if parent in agencies else None
    return chain[::-1]


def grant_url(grant: Grant) -> tuple[str | None, str | None]:
    """The page a reader can open to check a grant, and its label; (None, None) for none."""
    facts = grant["facts"]
    reporter, usaspending = facts.get("reporter"), facts.get("usaspending")
    if grant["family"] in REPORTER_FAMILIES and reporter is not None:
        return REPORTER_PAGE.format(reporter["latest_appl_id"]), "NIH RePORTER project page"
    if grant["family"] == "nsf":
        return NSF_PAGE.format(grant["key"].split(":", 1)[1]), "NSF award page"
    if grant["family"] == "us_federal" and usaspending is not None:
        return USASPENDING_PAGE.format(quote(usaspending["generated_id"], safe="")), "USAspending award page"
    return None, None


# --- a work's grants -------------------------------------------------------------------------------


def listings_for(work: WorkId, line: FundingCitation, funding: FundingInput) -> list[ExportGrantListing]:
    """One work's grants (§11.2), sorted by grant.

    `how` is the strongest evidence that the paper itself names the grant. `cited_as` is every
    written form that reached the grant only by correction or override, **whatever `how` is**: a
    corrected core is usually also written exactly by another source, and the page should still
    be able to say what the paper wrote.
    """
    hows: dict[GrantKey, set[ListingHow]] = {}
    cited: dict[GrantKey, set[str]] = {}
    decided: dict[GrantKey, set[str]] = {}
    for string in line["strings"]:
        how = BY_METHOD.get(string["method"] or "", "listed")
        for key in string["grants"]:
            hows.setdefault(key, set()).add(how)
            if how != "listed":
                cited.setdefault(key, set()).add(collapse(string["raw"]))
            if how == "override":
                decided.setdefault(key, set()).add(string["raw"])
    for link in line["nih_links"]:
        hows.setdefault(link["grant"], set()).add("nih_link")

    rows: list[ExportGrantListing] = []
    for key in sorted(hows):
        grant = funding.grants.get(key)
        row: ExportGrantListing = {
            "grant": key,
            "how": next(how for how in HOW_ORDER if how in hows[key]),
            "agencies": agency_chain(grant["agency"], funding.agencies) if grant else [],
        }
        if key in cited:
            row["cited_as"] = sorted(cited[key])
        for raw in sorted(decided.get(key, ())):
            entry = grant_override_for(funding.overrides, work, raw, funding.aliases)
            if entry is not None:
                row["override"] = {"reason": entry["reason"], "by": entry["by"], "date": entry["date"]}
                break
        rows.append(row)
    return rows


# --- the block ---------------------------------------------------------------------------------------


def export_grant(grant: Grant, first_year: int | None) -> ExportGrant:
    """A grant (§11.4), with `amount_source` derived rather than stored twice: its page is the
    grant's `url`, and its date the line's `checked`."""
    amount = grant["amount"]
    reporter = grant["facts"].get("reporter")
    url, url_name = grant_url(grant)
    start_year = _year(grant["start"])
    if grant["family"] == "reporter" and reporter and reporter["fiscal_years"]:
        start_year = min(int(year) for year in reporter["fiscal_years"])  # the first year RePORTER holds
    # A year whose rows report no amount stays null; the years sum to `amount_usd` only while the
    # amount is RePORTER's, so they are not exported beside an amount from elsewhere.
    by_year = reporter is not None and (amount is None or amount["basis"] in REPORTER_BASES)
    return {
        "key": grant["key"],
        "agency": grant["agency"],
        "number": grant["number"],
        "category": grant["category"],
        "scope": grant["scope"],
        "scope_reason": grant["scope_reason"],
        "status": grant["status"],
        "title": grant["title"],
        "pis": [{"name": person["name"], "id": person["id"]} for person in grant["pis"]],
        "organization": grant["organization"],
        "start_year": start_year,
        "end_year": _year(grant["end"]),
        "first_year": first_year,
        "amount_usd": amount["usd"] if amount else None,
        "amount_original": json_number(amount["original"]) if amount else None,
        "currency": amount["currency"] if amount else None,
        "rate_year": amount["rate_year"] if amount else None,
        "amount_source": (
            {"name": amount["source"], "url": url, "as_of": grant["checked"], "basis": amount["basis"]}
            if amount
            else None
        ),
        "fiscal_years": dict(sorted(reporter["fiscal_years"].items())) if reporter and by_year else None,
        "url": url,
        "url_name": url_name,
        "flags": list(grant["flags"]),
    }


def _sources(lines: Iterable[FundingCitation], grants: Iterable[Grant]) -> list[ExportFundingSource]:
    """Every source the exported data came from, dated by the latest fact it confirmed."""
    dates: dict[FundingSourceId, Date] = {}

    def saw(source: FundingSourceId, date: Date) -> None:
        dates[source] = max(date, dates.get(source, date))

    for grant in grants:
        facts = grant["facts"]
        if "reporter" in facts:
            saw("reporter", grant["checked"])
        if "nsf" in facts:
            saw("nsf", grant["checked"])
        if "usaspending" in facts:
            saw("usaspending", grant["checked"])
        if facts.get("openalex") or grant["openalex_awards"]:
            saw("openalex", grant["checked"])
    for line in lines:
        for string in line["strings"]:
            for source in string["sources"]:
                saw(STRING_SOURCES[source], string["last_seen"])
        for link in line["nih_links"]:
            saw("reporter", link["last_seen"])
        for date in line["jats_checked"].values():
            saw("pmc", date)

    rows: list[ExportFundingSource] = []
    for source_id, (name, url, amounts_from, by_fiscal_year) in SOURCES.items():
        if source_id not in dates:
            continue
        as_of = dates[source_id]
        rows.append(
            {
                "id": source_id,
                "name": name,
                "url": url,
                "as_of": as_of,
                "amounts_from": amounts_from,
                "partial_year": fiscal_year(dt.date.fromisoformat(as_of)) if by_fiscal_year else None,
            }
        )
    return rows


def _exchange_rates(rate_sources: Iterable[Mapping[str, Any]]) -> list[ExportExchangeRates]:
    return [
        {
            "name": str(source["name"]),
            "url": str(source["url"]),
            "currencies": sorted(str(currency) for currency in source["currencies"]),
            "through_year": int(source["years"][1]),
        }
        for source in rate_sources
    ]


def _no_method() -> ExportFundingMethod:
    return {
        "strings": {
            "grant": 0,
            "unresolved": 0,
            "not_a_grant": 0,
            "resource_code": 0,
            "facility_contract": 0,
        },
        "resolution": {"exact": 0, "normalised": 0, "corrected": 0, "override": 0},
        "works_without_funding_metadata": 0,
    }


def _method(works: Iterable[WorkId], lines: Mapping[WorkId, FundingCitation]) -> ExportFundingMethod:
    """Distinct (work, string) pairs by outcome and by method, over the exported works (§11.3)."""
    method = _no_method()
    resolution = cast(dict[str, int], method["resolution"])
    for work in works:
        line = lines.get(work)
        if line is None or not line["strings"]:
            method["works_without_funding_metadata"] += 1
            continue
        for string in line["strings"]:
            method["strings"][string["outcome"]] += 1
            if string["method"] in resolution:
                resolution[string["method"]] += 1
    return method


def no_funding() -> ExportFunding:
    """The shape of an export with no funding data (§11.1)."""
    return {
        "version": None,
        "as_of": None,
        "sources": [],
        "exchange_rates": [],
        "method": _no_method(),
        "summary": build_funding_summary([], [], []),
        "agencies": [],
        "grants": [],
    }


def build_funding(
    years: Mapping[WorkId, int], funding: FundingInput
) -> tuple[dict[WorkId, list[ExportGrantListing]], ExportFunding]:
    """Each exported work's grants, and the `funding` block, from the works' years (§11).

    `years` is every exported work's publication year, by ID: a grant's first year is the year of
    the earliest exported work that lists it (§4), and only exported works' lines count.
    """
    lines = {work: funding.citations[work] for work in years if work in funding.citations}
    if not lines:
        return {}, no_funding()

    listings = {work: listings_for(work, line, funding) for work, line in lines.items()}
    first_years: dict[GrantKey, int] = {}
    for work, listed_by in listings.items():
        for row in listed_by:
            first_years[row["grant"]] = min(years[work], first_years.get(row["grant"], years[work]))
    listed = [funding.grants[key] for key in sorted(first_years) if key in funding.grants]
    grants = [export_grant(grant, first_years[grant["key"]]) for grant in listed]

    codes = {code for grant in listed for code in agency_chain(grant["agency"], funding.agencies)}
    agencies: list[ExportAgency] = [
        {
            "code": agency["code"],
            "name": agency["name"],
            "short_name": agency["short_name"],
            "parent": agency["parent"],
            "group": agency["group"],
            "country": agency["country"],
        }
        for agency in (funding.agencies[code] for code in sorted(codes) if code in funding.agencies)
    ]
    rows: list[WorkGrants] = [
        {"id": work, "year": year, "grants": listings.get(work, [])} for work, year in years.items()
    ]
    checked = [grant["checked"] for grant in listed]
    return listings, {
        "version": max(line["funding_version"] for line in lines.values()),
        # Every amount was read on the last full refresh or later. Until a run records one (the
        # funding stage writes `mode`), the latest date any grant was confirmed stands in.
        "as_of": funding.refreshed or (max(checked) if checked else None),
        "sources": _sources(lines.values(), listed),
        "exchange_rates": _exchange_rates(funding.rate_sources),
        "method": _method(years, lines),
        "summary": build_funding_summary(rows, grants, agencies),
        "agencies": agencies,
        "grants": grants,
    }
