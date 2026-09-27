"""How much of a grant's funding the totals count (docs/09 F17, §7.4).

A grant's `amount_usd` is its lifetime total, which can run from long before UWPR began to long
after the last paper that lists it. The totals count only the part UWPR could have touched:

- **the floor:** nothing from before `FROM_YEAR`, when UWPR began;
- **the ceiling:** nothing after the year of the latest publication listing the grant;
- **instruments** count in full: bought once and used for years;
- **a grant whose funding ended before `FROM_YEAR`** counts its last `LAST_YEARS` years;
- **a grant that began after its latest listing publication** counts nothing, with that reason;
- **an amount with no fiscal years** but a start and an end year is spread evenly over them, an
  estimate; one with no end year counts whole.

Pure and in whole dollars: no I/O, no clock and no floats. It reads a grant as the export writes
it, so the app's TypeScript twin (`web/src/aggregate/counting.ts`) can mirror it line for line,
and `validate_export` recomputes every exported figure with it.

The constants are code, not configuration. `config/funding.yaml` is fingerprinted, so changing it
forces a `funding_version` bump and a full RePORTER refresh, and the export reads no configuration
(`funding.export`). Changing one is a code change and a dated note in docs/09. The export carries
them as `funding.counting`, so the app hard-codes none.
"""

from uwpr_pubs.funding.contract import CountedRule, ExportFundingCounting, ExportGrant
from uwpr_pubs.store.models import AmountBasis, GrantCategory

FROM_YEAR = 2006  # UWPR began in 2006 (docs/01 D4); FY2006 counts
LAST_YEARS = 5  # how many final years a grant that ended before FROM_YEAR counts
FULL_AMOUNT_CATEGORIES: tuple[GrantCategory, ...] = ("instrument",)
# An amount that is money obligated so far, not a planned total: spread only to the year it was
# read, or an active award would be spread into years not yet paid.
OBLIGATED_TO_DATE_BASES: frozenset[AmountBasis] = frozenset({"nsf_obligated", "usaspending_obligation"})


def counting_block() -> ExportFundingCounting:
    """`funding.counting`: the constants, as the export states them."""
    return {
        "from_year": FROM_YEAR,
        "last_years": LAST_YEARS,
        "full_amount_categories": list(FULL_AMOUNT_CATEGORIES),
    }


def spread_years(grant: ExportGrant) -> dict[str, int] | None:
    """An even spread of `amount_usd` over the grant's years, in whole dollars; None where none
    applies.

    Only for a known amount with no fiscal years and `start_year <= end_year`. An amount obligated
    to date is spread no later than the year of the grant's own `amount_source.as_of`, never
    today's, so the export stays reproducible. The first `amount % years` years take one dollar
    more, so the years sum exactly to `amount_usd`.
    """
    amount, start, end = grant["amount_usd"], grant["start_year"], grant["end_year"]
    if amount is None or grant["fiscal_years"] or start is None or end is None or start > end:
        return None
    source = grant["amount_source"]
    if source is not None and source["basis"] in OBLIGATED_TO_DATE_BASES:
        end = max(start, min(end, int(source["as_of"][:4])))
    base, remainder = divmod(amount, end - start + 1)
    return {str(year): base + (1 if year - start < remainder else 0) for year in range(start, end + 1)}


def yearly(grant: ExportGrant) -> dict[int, int] | None:
    """The grant's yearly breakdown: its fiscal years (a null year is 0), else its exported
    `spread_years`, else None. None too when the amount is unknown."""
    if grant["amount_usd"] is None:
        return None
    if grant["fiscal_years"]:
        return {int(year): value or 0 for year, value in grant["fiscal_years"].items()}
    if grant["spread_years"]:
        return {int(year): value for year, value in grant["spread_years"].items()}
    return None


def counted(grant: ExportGrant, first: int, last: int) -> tuple[int | None, CountedRule | None]:
    """What the totals count of a grant, and why, given the earliest (`first`) and latest (`last`)
    years of the publications listing it. The first rule that applies decides.

    `first` changes no amount; it is taken so that this and `award_years` read the same arguments.
    An unknown amount counts as unknown: (None, None), never 0.
    """
    amount = grant["amount_usd"]
    if amount is None:
        return None, None
    years = yearly(grant)
    if grant["category"] in FULL_AMOUNT_CATEGORIES:
        return amount, "full_amount"
    if years is None:
        return amount, "undated"
    if max(years) < FROM_YEAR:
        return sum(value for year, value in years.items() if year > max(years) - LAST_YEARS), "ended_before"
    if min(years) > last:
        return 0, "began_after"
    return sum(value for year, value in years.items() if FROM_YEAR <= year <= last), "window"


def award_years(grant: ExportGrant, first: int, last: int) -> dict[int, int]:
    """The counted amount by the year it was awarded, clamped into `[FROM_YEAR, last]`, for the
    value-over-time chart. Sums to the counted amount; a year with nothing is left out.

    - `full_amount`: each year's dollars to that year, except that a year before `FROM_YEAR` goes
      to `first` and a year after `last` to `last`; with no years, all of it to `first`;
    - `undated` and `ended_before`: all to `first`, for want of a year inside the window;
    - `began_after`: nothing;
    - `window`: each year in `[FROM_YEAR, last]` to itself.
    """
    usd, rule = counted(grant, first, last)
    years = yearly(grant)
    allocated: dict[int, int] = {}
    if usd is None or rule == "began_after":
        return allocated
    if rule == "full_amount" and years is not None:
        for year, value in years.items():
            into = first if year < FROM_YEAR else min(year, last)
            allocated[into] = allocated.get(into, 0) + value
    elif rule == "window" and years is not None:
        allocated = {year: value for year, value in years.items() if FROM_YEAR <= year <= last}
    else:
        allocated = {first: usd}
    return {year: allocated[year] for year in sorted(allocated) if allocated[year]}
