"""The counting rule, as arithmetic (docs/09 F17, §7.4): `funding.counting`, pure and in dollars.

Each rule, the order they are tried in, the even spread and its two bases, and where each counted
dollar lands on the award-year axis. The grants are rows as the export writes them, holding only
the fields the rule reads. The app's `aggregate/counting.ts` is held to the same table.
"""

from typing import Any, cast

import pytest

from uwpr_pubs.funding.contract import ExportGrant
from uwpr_pubs.funding.counting import (
    FROM_YEAR,
    FULL_AMOUNT_CATEGORIES,
    LAST_YEARS,
    OBLIGATED_TO_DATE_BASES,
    award_years,
    counted,
    counting_block,
    spread_years,
    yearly,
)


def row(**fields: Any) -> ExportGrant:
    """A grant row, its spread computed as the export computes it unless one is given."""
    grant: dict[str, Any] = {
        "key": "X:1",
        "category": "research",
        "amount_usd": None,
        "start_year": None,
        "end_year": None,
        "amount_source": None,
        "fiscal_years": None,
        "spread_years": None,
    }
    grant.update(fields)
    if "spread_years" not in fields:
        grant["spread_years"] = spread_years(cast(ExportGrant, grant))
    return cast(ExportGrant, grant)


def source(basis: str, as_of: str = "2026-09-26") -> dict[str, Any]:
    return {"name": "X", "url": None, "as_of": as_of, "basis": basis}


def by_year(amounts: dict[int, int | None]) -> dict[str, int | None]:
    return {str(year): value for year, value in amounts.items()}


FY_1996_2003 = by_year({year: 100 + year - 1996 for year in range(1996, 2004)})  # 100 … 107


def test_the_constants_and_the_block_that_states_them() -> None:
    assert (FROM_YEAR, LAST_YEARS, FULL_AMOUNT_CATEGORIES) == (2006, 5, ("instrument",))
    assert frozenset({"nsf_obligated", "usaspending_obligation"}) == OBLIGATED_TO_DATE_BASES
    assert counting_block() == {"from_year": 2006, "last_years": 5, "full_amount_categories": ["instrument"]}


# --- the rule table ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("grant", "first", "last", "expected"),
    [
        pytest.param(
            row(category="instrument", amount_usd=782028, fiscal_years={"2003": 782028}),
            2008,
            2012,
            (782028, "full_amount"),
            id="an instrument, in full",
        ),
        pytest.param(
            row(amount_usd=300, start_year=2018), 2021, 2021, (300, "undated"), id="no end year: undated"
        ),
        pytest.param(row(amount_usd=300), 2021, 2021, (300, "undated"), id="no years at all: undated"),
        pytest.param(
            row(amount_usd=sum(v or 0 for v in FY_1996_2003.values()), fiscal_years=FY_1996_2003),
            2019,
            2019,
            (103 + 104 + 105 + 106 + 107, "ended_before"),
            id="ended before 2006: its last five years",
        ),
        pytest.param(
            row(amount_usd=30, fiscal_years={"2022": 10, "2023": 20}),
            2019,
            2019,
            (0, "began_after"),
            id="began after its latest listing work: nothing",
        ),
        pytest.param(
            row(amount_usd=70, fiscal_years=by_year({y: 10 for y in range(2004, 2011)})),
            2007,
            2008,
            (30, "window"),
            id="the window: 2006 to the latest listing year",
        ),
        pytest.param(
            row(amount_usd=30, fiscal_years={"2019": 10, "2020": 20}),
            2019,
            2019,
            (10, "window"),
            id="the ceiling is the latest listing year, inclusive",
        ),
        pytest.param(
            row(amount_usd=None, category="instrument", fiscal_years={"2019": None}),
            2019,
            2019,
            (None, None),
            id="an unknown amount is unknown, never 0",
        ),
    ],
)
def test_each_rule(
    grant: ExportGrant, first: int, last: int, expected: tuple[int | None, str | None]
) -> None:
    assert counted(grant, first, last) == expected


def test_an_instrument_is_counted_in_full_before_any_other_rule() -> None:
    """S10RR017262 is an instrument whose only year is FY2003, so it also ended before 2006; and an
    instrument bought after the paper that lists it also began after it. Neither cuts it."""
    old = row(category="instrument", amount_usd=782028, fiscal_years={"2003": 782028})
    assert counted(old, 2008, 2008) == (782028, "full_amount")
    later = row(category="instrument", amount_usd=500, fiscal_years={"2021": 500})
    assert counted(later, 2019, 2019) == (500, "full_amount")
    undated = row(category="instrument", amount_usd=500, start_year=2021)
    assert counted(undated, 2019, 2019) == (500, "full_amount")


def test_ended_before_is_tried_before_began_after() -> None:
    grant = row(amount_usd=10, fiscal_years={"2001": 4, "2003": 6})
    assert counted(grant, 1999, 1999) == (10, "ended_before")  # a listing year no real work has


def test_ended_before_counts_the_last_five_years_by_year_not_by_row() -> None:
    """A gap inside the last five years is not filled from earlier: 1998 is six years before 2003."""
    grant = row(amount_usd=36, fiscal_years={"1998": 1, "2000": 5, "2003": 30})
    assert counted(grant, 2010, 2010) == (35, "ended_before")


def test_a_null_fiscal_year_counts_as_zero_but_still_dates_the_grant() -> None:
    """P01HL999001's shape: FY2016 reports no amount. Its first year is still 2016."""
    grant = row(amount_usd=2100000, fiscal_years={"2016": None, "2017": 1000000, "2018": 1100000})
    assert yearly(grant) == {2016: 0, 2017: 1000000, 2018: 1100000}
    assert counted(grant, 2016, 2016) == (0, "window")  # not began_after: the grant had begun
    assert counted(grant, 2019, 2021) == (2100000, "window")
    assert award_years(grant, 2016, 2016) == {}


def test_every_year_from_2006_counts_and_none_before() -> None:
    grant = row(amount_usd=30, fiscal_years={"2005": 10, "2006": 20})
    assert counted(grant, 2010, 2010) == (20, "window")


# --- the spread ---------------------------------------------------------------------------------------


def test_the_spread_is_even_in_whole_dollars_and_the_earliest_years_take_the_remainder() -> None:
    grant = row(amount_usd=1000003, start_year=2017, end_year=2023, amount_source=source("openalex_amount"))
    assert grant["spread_years"] == {
        "2017": 142858,
        "2018": 142858,
        "2019": 142858,
        "2020": 142858,
        "2021": 142857,
        "2022": 142857,
        "2023": 142857,
    }
    assert sum((grant["spread_years"] or {}).values()) == 1000003
    assert counted(grant, 2019, 2021) == (4 * 142858 + 142857, "window")


def test_a_one_year_spread_is_the_whole_amount() -> None:
    assert spread_years(row(amount_usd=7, start_year=2020, end_year=2020)) == {"2020": 7}


@pytest.mark.parametrize("basis", ["openalex_amount", "nsf_estimated"])
def test_a_planned_total_is_spread_to_its_end_year_even_past_its_as_of(basis: str) -> None:
    grant = row(amount_usd=90, start_year=2024, end_year=2029, amount_source=source(basis, "2026-09-26"))
    assert grant["spread_years"] == by_year({year: 15 for year in range(2024, 2030)})


@pytest.mark.parametrize("basis", sorted(OBLIGATED_TO_DATE_BASES))
def test_money_obligated_so_far_is_spread_no_later_than_its_as_of_year(basis: str) -> None:
    active = row(
        amount_usd=2500002, start_year=2022, end_year=2028, amount_source=source(basis, "2026-09-26")
    )
    assert active["spread_years"] == {
        "2022": 500001,
        "2023": 500001,
        "2024": 500000,
        "2025": 500000,
        "2026": 500000,
    }
    ended = row(amount_usd=40, start_year=2010, end_year=2013, amount_source=source(basis, "2026-09-26"))
    assert ended["spread_years"] == by_year({year: 10 for year in range(2010, 2014)})
    # Read before it began, which a real record cannot be: it keeps its first year.
    early = row(amount_usd=40, start_year=2027, end_year=2030, amount_source=source(basis, "2026-09-26"))
    assert early["spread_years"] == {"2027": 40}


@pytest.mark.parametrize(
    "fields",
    [
        pytest.param({"amount_usd": None, "start_year": 2017, "end_year": 2020}, id="no amount"),
        pytest.param({"amount_usd": 9, "start_year": None, "end_year": 2020}, id="no start"),
        pytest.param({"amount_usd": 9, "start_year": 2017, "end_year": None}, id="no end"),
        pytest.param({"amount_usd": 9, "start_year": 2021, "end_year": 2020}, id="ends before it starts"),
        pytest.param(
            {"amount_usd": 9, "start_year": 2017, "end_year": 2020, "fiscal_years": {"2018": 9}},
            id="fiscal years",
        ),
    ],
)
def test_nothing_is_spread_without_an_amount_both_years_in_order_and_no_fiscal_years(
    fields: dict[str, Any],
) -> None:
    assert spread_years(row(**fields)) is None


def test_fiscal_years_come_before_the_exported_spread() -> None:
    grant = row(amount_usd=9, fiscal_years={"2018": 9}, spread_years={"2017": 9})
    assert yearly(grant) == {2018: 9}
    assert yearly(row(amount_usd=9, spread_years={"2017": 9})) == {2017: 9}
    assert yearly(row(amount_usd=None, fiscal_years={"2018": None})) is None


# --- award years --------------------------------------------------------------------------------------


def test_an_instruments_years_are_clamped_into_the_window() -> None:
    """A year before 2006 goes to the first listing year; one after the latest, to that year."""
    grant = row(category="instrument", amount_usd=600, fiscal_years={"2005": 100, "2010": 200, "2023": 300})
    assert award_years(grant, 2012, 2021) == {2010: 200, 2012: 100, 2021: 300}
    same = row(category="instrument", amount_usd=750, fiscal_years={"2020": 600, "2023": 150})
    assert award_years(same, 2021, 2021) == {2020: 600, 2021: 150}  # 2020 is inside the window


def test_an_instrument_with_no_years_goes_to_its_first_listing_year() -> None:
    assert award_years(row(category="instrument", amount_usd=500), 2015, 2020) == {2015: 500}


def test_undated_and_ended_before_amounts_go_to_the_first_listing_year() -> None:
    assert award_years(row(amount_usd=300, start_year=2018), 2019, 2021) == {2019: 300}
    ended = row(amount_usd=sum(v or 0 for v in FY_1996_2003.values()), fiscal_years=FY_1996_2003)
    assert award_years(ended, 2019, 2021) == {2019: 525}


def test_a_window_grant_keeps_its_own_years_and_began_after_has_none() -> None:
    grant = row(amount_usd=70, fiscal_years=by_year({y: 10 for y in range(2004, 2011)}))
    assert award_years(grant, 2009, 2009) == {2006: 10, 2007: 10, 2008: 10, 2009: 10}
    assert award_years(row(amount_usd=30, fiscal_years={"2022": 10, "2023": 20}), 2019, 2019) == {}


CASES = [
    (
        row(category="instrument", amount_usd=600, fiscal_years={"2005": 100, "2010": 200, "2023": 300}),
        2012,
        2021,
    ),
    (row(amount_usd=300, start_year=2018), 2019, 2021),
    (row(amount_usd=sum(v or 0 for v in FY_1996_2003.values()), fiscal_years=FY_1996_2003), 2019, 2019),
    (row(amount_usd=30, fiscal_years={"2022": 10, "2023": 20}), 2019, 2019),
    (
        row(amount_usd=1000003, start_year=2017, end_year=2023, amount_source=source("openalex_amount")),
        2019,
        2021,
    ),
    (row(amount_usd=2100000, fiscal_years={"2016": None, "2017": 1000000, "2018": 1100000}), 2019, 2021),
    (row(amount_usd=None, fiscal_years={"2016": None}), 2019, 2021),
]


@pytest.mark.parametrize(("grant", "first", "last"), CASES)
def test_the_award_years_sum_to_the_counted_amount_and_stay_in_the_window(
    grant: ExportGrant, first: int, last: int
) -> None:
    usd, _ = counted(grant, first, last)
    allocated = award_years(grant, first, last)
    assert sum(allocated.values()) == (usd or 0)
    assert all(min(FROM_YEAR, first) <= year <= last for year in allocated)
    assert all(allocated.values())  # a year with nothing is left out
    assert list(allocated) == sorted(allocated)


def test_an_unknown_amount_counts_nothing_anywhere() -> None:
    grant = row(amount_usd=None, category="instrument", start_year=2017, end_year=2020)
    assert (
        spread_years(grant),
        yearly(grant),
        counted(grant, 2019, 2021),
        award_years(grant, 2019, 2021),
    ) == (
        None,
        None,
        (None, None),
        {},
    )
