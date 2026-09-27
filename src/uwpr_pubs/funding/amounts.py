"""What a grant is worth, recomputed every run from its stored facts (docs/09 §7).

| Family | Amount | `basis` |
|---|---|---|
| NIH grant | Σ `award_amount` over parent rows, per fiscal year | `reporter_fiscal_years` |
| NIH contract | Σ over the contract's rows | `reporter_contract` |
| NIH task order | Σ over that task order's rows only | `reporter_task_order` |
| NSF | obligated when expired; the larger of estimated and obligated when active | `nsf_*` |
| Other US federal | USAspending's `total_obligation` | `usaspending_obligation` |
| Everyone else | OpenAlex's award amount, gepris excluded, ANID times 1,000 | `openalex_amount` |

**Parent rows only (F6).** A multi-project grant's parent row already includes its sub-projects,
so any row with a `subproject_id` is dropped here, whatever the query asked: P30DK017047's parent
rows come to $52,843,525 and all its rows to $86,010,763.

**An agency's own source beats OpenAlex**; where both have an amount and they differ by more
than 1%, the grant is flagged `amounts_disagree`, but only where the agency's figure is a
lifetime total as OpenAlex's is: NSF's and USAspending's. RePORTER's is a sum of fiscal years and
OpenAlex's NIH amount (`nih_exporter`) one year's award, so those two are never compared.
**Unknown is not zero:** a grant without an amount has `amount` null and a flag saying why.

Pure: facts, the configuration, the rates and the date in; `Valuation` out.
"""

import datetime as dt
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from uwpr_pubs.funding.classify import FundingRules
from uwpr_pubs.funding.currency import USD, Rates, convert, decimal_string, to_usd
from uwpr_pubs.funding.numbers import task_order_digits
from uwpr_pubs.store.models import (
    Amount,
    AmountBasis,
    AmountSource,
    GrantFacts,
    GrantFamily,
    GrantFlag,
    NsfFacts,
    OpenalexAward,
    ReporterFacts,
    UsaspendingFacts,
)

FIRST_REPORTER_YEAR = 1985  # RePORTER holds no amount before FY1985
USASPENDING_FROM = dt.date(2007, 10, 1)  # the first day of FY2008, where USAspending starts
DISAGREEMENT = Decimal("0.01")
# The agency bases OpenAlex's amount is compared with: an award's lifetime total, as OpenAlex's
# is. Not RePORTER's: its lifetime sum of parent rows, set beside OpenAlex's `nih_exporter` amount,
# which is one fiscal year's award, flagged grants that agree (P30DK017047: $52,843,525, $89,000).
COMPARED_WITH_OPENALEX: frozenset[AmountBasis] = frozenset(
    {"nsf_obligated", "nsf_estimated", "usaspending_obligation"}
)
SOURCE: Mapping[AmountBasis, AmountSource] = {
    "reporter_fiscal_years": "NIH RePORTER",
    "reporter_contract": "NIH RePORTER",
    "reporter_task_order": "NIH RePORTER",
    "nsf_obligated": "NSF Award API",
    "nsf_estimated": "NSF Award API",
    "usaspending_obligation": "USAspending",
    "openalex_amount": "OpenAlex",
}
FLAG_ORDER: tuple[GrantFlag, ...] = (
    "active",
    "starts_before_fy1985",
    "starts_before_fy2008",
    "no_amount_reported",
    "amount_not_found",
    "amount_from_openalex",
    "amount_corrected",
    "amounts_disagree",
    "unconverted_currency",
    "rate_year_estimated",
)
_SUPPORT_YEAR = re.compile(r"^[1-9]?[A-Z][A-Z0-9]{2}[A-Z]{2}[0-9]{6}-([0-9]{2})")
_AGENCY_FAMILIES: Mapping[GrantFamily, AmountBasis] = {
    "reporter": "reporter_fiscal_years",
    "nih_contract": "reporter_contract",
    "nih_task_order": "reporter_task_order",
}


@dataclass(frozen=True)
class Valuation:
    """A grant's amount (null when unknown) and the flags that qualify it (§11.4)."""

    amount: Amount | None
    flags: tuple[GrantFlag, ...] = ()


def _flags(*groups: Iterable[GrantFlag]) -> tuple[GrantFlag, ...]:
    present = {flag for group in groups for flag in group}
    return tuple(flag for flag in FLAG_ORDER if flag in present)


def fiscal_year(day: dt.date) -> int:
    """The US government's fiscal year: 1 October to 30 September, named by the year it ends."""
    return day.year + 1 if day.month >= 10 else day.year  # noqa: PLR2004 - October


def _after(end: str | None, today: dt.date) -> bool:
    """Whether an end date, or a year alone (taken as its last day), is after the data date."""
    if not end:
        return False
    if len(end) == 4:  # noqa: PLR2004 - a year alone
        return dt.date(int(end), 12, 31) > today
    return dt.date.fromisoformat(end[:10]) > today


def _usd(original: str, basis: AmountBasis) -> Amount:
    return Amount(
        usd=to_usd(original, "1"),
        original=original,
        currency=USD,
        rate="1",
        rate_year=None,
        basis=basis,
        source=SOURCE[basis],
    )


# --- NIH RePORTER ----------------------------------------------------------------------------


def parent_rows(rows: Iterable[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    """Rows without a `subproject_id`: a sub-project's cost is already in its parent's (F6)."""
    return [row for row in rows if not row.get("subproject_id")]


def task_order_rows(rows: Iterable[Mapping[str, Any]], task_order: str) -> list[Mapping[str, Any]]:
    """An IDIQ contract's rows for one task order: its number, letters removed, is one of the
    project number's parts (`272201700036I-0-759302000001-1`, and `…-P00004-759302000001-1`)."""
    digits = task_order_digits(task_order)
    return [row for row in rows if digits in str(row.get("project_num") or "").split("-")]


def _support_year(row: Mapping[str, Any]) -> int | None:
    split = row.get("project_num_split") or {}
    year = split.get("support_year") if isinstance(split, Mapping) else None
    if year and str(year).isdigit():
        return int(year)
    match = _SUPPORT_YEAR.match(str(row.get("project_num") or ""))
    return int(match.group(1)) if match else None


def reporter_facts(rows: Iterable[Mapping[str, Any]]) -> ReporterFacts:
    """The facts an NIH grant's, contract's or task order's amount is recomputed from.

    Per fiscal year, Σ `award_amount` over parent rows, or None when that year's rows report
    no amount; the rows' application types; the support year of the earliest row; and the
    latest application, for the project page link.
    """
    parents = sorted(parent_rows(rows), key=lambda row: (int(row["fiscal_year"]), int(row["appl_id"])))
    if not parents:
        raise ValueError("no parent rows: a grant's facts need at least one")
    years: dict[str, int | None] = {}
    for row in parents:
        year = str(row["fiscal_year"])
        amount = row.get("award_amount")
        if amount is None:
            years.setdefault(year, None)
        else:
            years[year] = (years.get(year) or 0) + int(amount)
    types = {str(row.get("project_num") or "")[:1] for row in parents}
    return ReporterFacts(
        fiscal_years=dict(sorted(years.items())),
        application_types=sorted(t for t in types if t.isdigit()),
        first_support_year=_support_year(parents[0]),
        latest_appl_id=int(parents[-1]["appl_id"]),
    )


def reporter_amount(
    facts: ReporterFacts, basis: AmountBasis, *, end: str | None, today: dt.date
) -> Valuation:
    """Σ the fiscal years' amounts (§7.1). Active when the grant's end date is after the data
    date or it has a row in the fiscal year in progress."""
    years = facts["fiscal_years"]
    flags: list[GrantFlag] = []
    if _after(end, today) or str(fiscal_year(today)) in years:
        flags.append("active")
    first = min((int(year) for year in years), default=None)
    support = facts["first_support_year"]
    began_earlier = first is not None and first <= FIRST_REPORTER_YEAR and (support or 0) > 1
    if basis == "reporter_fiscal_years" and began_earlier:
        flags.append("starts_before_fy1985")
    amounts = [amount for amount in years.values() if amount is not None]
    if not amounts:
        return Valuation(None, _flags(flags, ["no_amount_reported"]))
    return Valuation(_usd(str(sum(amounts)), basis), _flags(flags))


# --- NSF and USAspending ---------------------------------------------------------------------


def nsf_amount(facts: NsfFacts, *, today: dt.date) -> Valuation:
    """Obligated for an expired award; the larger of estimated and obligated for an active one,
    which still has years to be paid (§5.2)."""
    estimated = Decimal(facts["estimated"]) if facts["estimated"] is not None else None
    obligated = Decimal(facts["obligated"]) if facts["obligated"] is not None else None
    active = _after(facts["exp_date"], today)
    flags: list[GrantFlag] = ["active"] if active else []
    if obligated is None and estimated is None:
        return Valuation(None, _flags(flags, ["no_amount_reported"]))
    use_estimated = obligated is None or (active and estimated is not None and estimated > obligated)
    basis: AmountBasis = "nsf_estimated" if use_estimated else "nsf_obligated"
    chosen = estimated if use_estimated else obligated
    return Valuation(_usd(decimal_string(chosen), basis), _flags(flags))


def usaspending_amount(facts: UsaspendingFacts, *, today: dt.date) -> Valuation:
    """USAspending's `total_obligation` (§5.3), which covers FY2008 on only."""
    flags: list[GrantFlag] = []
    if _after(facts["pop_end"], today):
        flags.append("active")
    start = facts["pop_start"]
    if start is not None and dt.date.fromisoformat(start) < USASPENDING_FROM:
        flags.append("starts_before_fy2008")
    total = facts["total_obligation"]
    if total is None:
        return Valuation(None, _flags(flags, ["no_amount_reported"]))
    return Valuation(_usd(decimal_string(total), "usaspending_obligation"), _flags(flags))


# --- OpenAlex --------------------------------------------------------------------------------


def openalex_amount(
    awards: Sequence[OpenalexAward], rules: FundingRules, rates: Rates, *, first_year: int | None
) -> Valuation | None:
    """An OpenAlex award's amount, in US dollars at its start year's rate, or None.

    `gepris` amounts are excluded (§5.4); ANID's are multiplied by 1,000 and flagged
    `amount_corrected`. A stated 0 is no amount. When several of a grant's awards carry an
    amount, the one with the lowest ID is used: OpenAlex mints one award per funder and string,
    and they carry the same figure.
    """
    usable = [
        award
        for award in awards
        if award["amount"] is not None
        and Decimal(award["amount"]) > 0
        and award["currency"]
        and award["provenance"] not in rules.openalex_excluded
    ]
    if not usable:
        return None
    award = min(usable, key=lambda item: (len(item["id"]), item["id"]))
    multiplier = rules.openalex_multipliers.get(award["provenance"] or "", Decimal(1))
    original = decimal_string(Decimal(award["amount"] or "0") * multiplier)
    currency = str(award["currency"])
    conversion = convert(original, currency, award["start_year"], first_year, rates)
    amount = Amount(
        usd=conversion.usd,
        original=original,
        currency=currency,
        rate=conversion.rate,
        rate_year=conversion.rate_year,
        basis="openalex_amount",
        source=SOURCE["openalex_amount"],
    )
    corrected: list[GrantFlag] = ["amount_corrected"] if multiplier != 1 else []
    return Valuation(amount, _flags(conversion.flags, corrected, ["amount_from_openalex"]))


# --- A grant ---------------------------------------------------------------------------------


def _agency_valuation(
    family: GrantFamily, facts: GrantFacts, *, end: str | None, today: dt.date
) -> Valuation | None:
    if family in _AGENCY_FAMILIES:
        reporter = facts.get("reporter")
        return reporter_amount(reporter, _AGENCY_FAMILIES[family], end=end, today=today) if reporter else None
    if family == "nsf":
        nsf = facts.get("nsf")
        return nsf_amount(nsf, today=today) if nsf else None
    if family == "us_federal":
        usaspending = facts.get("usaspending")
        return usaspending_amount(usaspending, today=today) if usaspending else None
    return None


def value_grant(  # noqa: PLR0913 - the grant's family and facts, and what they are valued against
    family: GrantFamily,
    facts: GrantFacts,
    *,
    end: str | None,
    first_year: int | None,
    rules: FundingRules,
    rates: Rates,
    today: dt.date,
) -> Valuation:
    """A grant's amount and flags from its stored facts (§7.1, §7.3).

    The agency's own source decides where it has an amount, and OpenAlex fills in where it has
    none; any amount from OpenAlex is flagged `amount_from_openalex`. `first_year` (§4) stands in
    for an OpenAlex award's missing start year.
    """
    if family == "miscellaneous":
        return Valuation(None, ("amount_not_found",))
    expects_agency = family in (*_AGENCY_FAMILIES, "nsf", "us_federal")
    agency = _agency_valuation(family, facts, end=end, today=today)
    openalex = openalex_amount(facts.get("openalex", []), rules, rates, first_year=first_year)
    if openalex is not None and openalex.amount is not None and not expects_agency:
        active: list[GrantFlag] = ["active"] if _after(end, today) else []
        return Valuation(openalex.amount, _flags(openalex.flags, active))
    if agency is not None and agency.amount is not None:
        flags = list(agency.flags)
        if openalex is not None and openalex.amount is not None and _disagree(agency.amount, openalex.amount):
            flags.append("amounts_disagree")
        return Valuation(agency.amount, _flags(flags))
    agency_flags = agency.flags if agency is not None else ()
    if openalex is not None and openalex.amount is not None:
        return Valuation(openalex.amount, _flags(agency_flags, openalex.flags))
    missing: list[GrantFlag] = [] if "no_amount_reported" in agency_flags else ["amount_not_found"]
    return Valuation(None, _flags(agency_flags, missing))


def _disagree(agency: Amount, openalex: Amount) -> bool:
    """More than 1% apart, in US dollars, where the agency's figure is a lifetime total as
    OpenAlex's is (`COMPARED_WITH_OPENALEX`); an amount not in dollars cannot be compared."""
    if agency["basis"] not in COMPARED_WITH_OPENALEX:
        return False
    if agency["usd"] is None or openalex["usd"] is None or agency["usd"] == 0:
        return False
    return abs(Decimal(agency["usd"] - openalex["usd"])) > DISAGREEMENT * abs(Decimal(agency["usd"]))
