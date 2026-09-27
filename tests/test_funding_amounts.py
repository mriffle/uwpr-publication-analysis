"""What a grant is worth (docs/09 §7): parent rows only, NSF's rule, USAspending, OpenAlex's
corrections, the agency against OpenAlex, and conversion to US dollars."""

import datetime as dt
import json
from decimal import ROUND_HALF_EVEN, Context, Decimal
from functools import cache
from pathlib import Path
from typing import Any, cast

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.amounts import (
    COMPARED_WITH_OPENALEX,
    Valuation,
    fiscal_year,
    nsf_amount,
    openalex_amount,
    parent_rows,
    reporter_amount,
    reporter_facts,
    task_order_rows,
    usaspending_amount,
    value_grant,
)
from uwpr_pubs.funding.classify import FundingRules
from uwpr_pubs.funding.currency import Rates, convert, decimal_string, to_usd
from uwpr_pubs.store.models import GrantFacts, GrantFamily, NsfFacts, OpenalexAward, UsaspendingFacts

ROWS = json.loads(
    (Path(__file__).parent / "fixtures" / "funding" / "reporter_rows.json").read_text(encoding="utf-8")
)
TODAY = dt.date(2026, 9, 26)


@cache
def rules() -> FundingRules:
    config = load_config()
    return FundingRules.from_config(config.funding, config.rules["r2"]["code"])


@cache
def rates() -> Rates:
    return Rates.from_config(load_config().exchange_rates)


def row(
    fy: int, amount: int | None, *, num: str = "5R01GM012345-03", appl: int = 1, sub: str | None = None
) -> dict[str, Any]:
    return {
        "appl_id": appl,
        "fiscal_year": fy,
        "project_num": num,
        "core_project_num": "R01GM012345",
        "subproject_id": sub,
        "award_amount": amount,
    }


# --- Parent rows only (F6) --------------------------------------------------------------


def test_p30ca015704_fy2024_sub_projects_sum_to_the_parent_and_are_never_added() -> None:
    """docs/09 §5.1: the sub-project rows of FY2024 sum to exactly the base award, $10,090,142.

    Seven supplements are further parent rows, and bring the year to $11,330,768. Adding the
    sub-projects too would count the base award twice.
    """
    rows = ROWS["P30CA015704"]
    subprojects = [r for r in rows if r["subproject_id"]]
    base = [r for r in rows if r["project_num"] == "5P30CA015704-49" and not r["subproject_id"]]
    assert sum(r["award_amount"] for r in subprojects) == 10_090_142
    assert [r["award_amount"] for r in base] == [10_090_142]
    assert len(parent_rows(rows)) == 8  # the base award and supplements S1 to S7
    facts = reporter_facts(rows)
    assert facts["fiscal_years"] == {"2024": 11_330_768}
    assert facts == reporter_facts(parent_rows(rows))
    assert facts["application_types"] == ["3", "5"]


def test_p30dk017047_is_its_parent_rows_not_every_row() -> None:
    """$52,843,525 from 54 parent rows; all 233 rows would say $86,010,763 (docs/09 §5.1)."""
    rows = ROWS["P30DK017047"]
    assert len(rows) == 233 and len(parent_rows(rows)) == 54
    assert sum(r["award_amount"] or 0 for r in rows) == 86_010_763
    facts = reporter_facts(rows)
    valued = reporter_amount(facts, "reporter_fiscal_years", end=None, today=TODAY)
    assert valued.amount is not None
    assert valued.amount["usd"] == 52_843_525
    assert valued.amount == {
        "usd": 52_843_525,
        "original": "52843525",
        "currency": "USD",
        "rate": "1",
        "rate_year": None,
        "basis": "reporter_fiscal_years",
        "source": "NIH RePORTER",
    }
    assert sum(amount or 0 for amount in facts["fiscal_years"].values()) == 52_843_525
    assert "active" in valued.flags  # it has a row in FY2026, the year in progress
    assert facts["latest_appl_id"] == max(r["appl_id"] for r in parent_rows(rows) if r["fiscal_year"] == 2026)


def test_a_year_whose_rows_report_no_amount_is_null() -> None:
    facts = reporter_facts([row(2009, None, appl=1), row(2010, 100, appl=2), row(2010, None, appl=3)])
    assert facts["fiscal_years"] == {"2009": None, "2010": 100}


def test_a_grant_whose_rows_report_no_amount_has_none() -> None:
    """VA's I01BX000531 and contract N01HV028179: RePORTER holds them, with no amount."""
    facts = reporter_facts(
        [row(2009, None, num="1I01BX000531-01A1"), row(2010, None, num="5I01BX000531-02", appl=2)]
    )
    valued = reporter_amount(facts, "reporter_fiscal_years", end="2013-09-30", today=TODAY)
    assert valued == Valuation(None, ("no_amount_reported",))


def test_a_grant_already_running_in_fy1985_is_flagged() -> None:
    """RePORTER's amounts begin in FY1985; a first row there with a support year above 1 began
    earlier, and its lifetime total is understated."""
    older = reporter_facts(
        [row(1985, 90_000, num="5T32GM007750-08"), row(1986, 95_000, num="5T32GM007750-09", appl=2)]
    )
    assert older["first_support_year"] == 8
    assert (
        "starts_before_fy1985" in reporter_amount(older, "reporter_fiscal_years", end=None, today=TODAY).flags
    )
    new = reporter_facts([row(1985, 90_000, num="1T32GM007750-01")])
    assert (
        "starts_before_fy1985"
        not in reporter_amount(new, "reporter_fiscal_years", end=None, today=TODAY).flags
    )
    split = reporter_facts([{**row(1985, 1), "project_num_split": {"support_year": "12"}}])
    assert split["first_support_year"] == 12


def test_a_grant_is_active_by_its_end_date_or_a_row_this_fiscal_year() -> None:
    facts = reporter_facts([row(2020, 100)])
    assert "active" in reporter_amount(facts, "reporter_fiscal_years", end="2027-06-30", today=TODAY).flags
    assert (
        "active" not in reporter_amount(facts, "reporter_fiscal_years", end="2021-06-30", today=TODAY).flags
    )
    assert "active" in reporter_amount(facts, "reporter_fiscal_years", end="2026", today=TODAY).flags


def test_a_grant_needs_a_parent_row() -> None:
    with pytest.raises(ValueError, match="no parent rows"):
        reporter_facts([row(2024, 5, sub="0001")])


def test_the_fiscal_year_runs_october_to_september() -> None:
    assert fiscal_year(dt.date(2026, 9, 30)) == 2026
    assert fiscal_year(dt.date(2026, 10, 1)) == 2027


def test_contracts_count_every_line_item_and_task_orders_only_their_own() -> None:
    """§7.1: a contract's rows are line items, several in a year; a task order is its own rows."""
    rows = [
        {**row(2020, 1_000, num="272201700036I-0-0-1", appl=1)},
        {**row(2020, 250, num="272201700036I-0-759302000001-1", appl=2)},
        {**row(2021, 50, num="272201700036I-P00004-759302000001-1", appl=3)},
        {**row(2021, 70, num="272201700036I-0-759302100002-1", appl=4)},
    ]
    contract = reporter_amount(reporter_facts(rows), "reporter_contract", end=None, today=TODAY)
    assert contract.amount is not None and contract.amount["usd"] == 1_370
    assert contract.amount["basis"] == "reporter_contract"
    order = task_order_rows(rows, "75N93020F00001")
    assert [r["appl_id"] for r in order] == [2, 3]
    valued = reporter_amount(reporter_facts(order), "reporter_task_order", end=None, today=TODAY)
    assert valued.amount is not None and valued.amount["usd"] == 300
    assert "starts_before_fy1985" not in valued.flags


# --- NSF and USAspending ----------------------------------------------------------------


def nsf(estimated: str | None, obligated: str | None, exp_date: str | None) -> NsfFacts:
    return {"estimated": estimated, "obligated": obligated, "exp_date": exp_date, "program": None}


def test_an_expired_nsf_award_is_its_obligated_amount() -> None:
    """0444148, a fellowship: estimated 0, obligated $130,950, expired 2007."""
    valued = nsf_amount(nsf("0", "130950", "2007-06-30"), today=TODAY)
    assert valued.amount is not None
    assert (valued.amount["usd"], valued.amount["basis"], valued.flags) == (130_950, "nsf_obligated", ())
    assert nsf_amount(nsf("900000", "600000", "2020-01-31"), today=TODAY).amount == {
        "usd": 600_000,
        "original": "600000",
        "currency": "USD",
        "rate": "1",
        "rate_year": None,
        "basis": "nsf_obligated",
        "source": "NSF Award API",
    }


def test_an_active_nsf_award_is_the_larger_of_its_two_amounts() -> None:
    """2140004, UW's GRFP award: estimated $8,238,370, obligated $45,382,136, active."""
    grfp = nsf_amount(nsf("8238370", "45382136", "2027-07-31"), today=TODAY)
    assert grfp.amount is not None and grfp.amount["usd"] == 45_382_136
    assert (grfp.amount["basis"], grfp.flags) == ("nsf_obligated", ("active",))
    continuing = nsf_amount(nsf("900000", "600000", "2028-08-31"), today=TODAY)
    assert continuing.amount is not None
    assert (continuing.amount["usd"], continuing.amount["basis"]) == (900_000, "nsf_estimated")


def test_an_nsf_award_without_amounts_has_none() -> None:
    assert nsf_amount(nsf(None, None, None), today=TODAY) == Valuation(None, ("no_amount_reported",))
    only_estimate = nsf_amount(nsf("5000", None, None), today=TODAY)
    assert only_estimate.amount is not None and only_estimate.amount["basis"] == "nsf_estimated"


def usaspending(total: str | None, start: str | None, end: str | None) -> UsaspendingFacts:
    return {
        "total_obligation": total,
        "type": "04",
        "pop_start": start,
        "pop_end": end,
        "generated_id": "ASST_NON_X",
    }


def test_usaspending_is_its_total_obligation() -> None:
    """80NSSC18K1291: $1,072,453.81 obligated, rounded to the whole dollar."""
    valued = usaspending_amount(usaspending("1072453.81", "2018-08-01", "2024-10-31"), today=TODAY)
    assert valued.amount is not None
    assert valued.amount["usd"] == 1_072_454
    assert valued.amount["original"] == "1072453.81"
    assert (valued.amount["basis"], valued.flags) == ("usaspending_obligation", ())


def test_a_usaspending_award_begun_before_fy2008_is_flagged() -> None:
    """NSBRI began in 1999; USAspending reaches FY2008 on, so earlier obligations may be missing."""
    valued = usaspending_amount(usaspending("583518208", "1997-04-01", "2027-09-30"), today=TODAY)
    assert valued.flags == ("active", "starts_before_fy2008")
    assert usaspending_amount(usaspending(None, None, None), today=TODAY) == Valuation(
        None, ("no_amount_reported",)
    )


# --- OpenAlex (§5.4) --------------------------------------------------------------------


def award(
    amount: str | None,
    currency: str | None,
    provenance: str | None,
    start: int | None = None,
    gid: str = "G1",
) -> OpenalexAward:
    return {"id": gid, "amount": amount, "currency": currency, "provenance": provenance, "start_year": start}


def test_anid_amounts_are_thousands_of_pesos() -> None:
    """ANID's CSV states "Miles de pesos"; OpenAlex labels the same numbers CLP (docs/09 §5.4)."""
    valued = openalex_amount([award("263255", "CLP", "anid_github", 2019)], rules(), rates(), first_year=None)
    assert valued is not None and valued.amount is not None
    assert valued.amount["original"] == "263255000"
    assert valued.amount["currency"] == "CLP"
    assert valued.amount["rate_year"] == 2019
    assert valued.amount["rate"] == rates().table["CLP"][2019]
    assert valued.amount["usd"] == to_usd("263255000", rates().table["CLP"][2019])
    assert valued.flags == ("amount_from_openalex", "amount_corrected")


def test_gepris_amounts_are_excluded() -> None:
    """Two unrelated DFG grants carry the identical €109,941.6654 from GEPRIS."""
    assert (
        openalex_amount([award("109941.6654", "EUR", "gepris", 2021)], rules(), rates(), first_year=2021)
        is None
    )


def test_a_stated_zero_or_a_missing_currency_is_no_amount() -> None:
    assert (
        openalex_amount([award("0", "GBP", "gateway_to_research")], rules(), rates(), first_year=2020) is None
    )
    assert openalex_amount([award("5", None, "crossref")], rules(), rates(), first_year=2020) is None
    assert (
        openalex_amount([award(None, "USD", "nsf_award_search")], rules(), rates(), first_year=2020) is None
    )


def test_of_several_awards_the_lowest_id_decides() -> None:
    awards = [award("200", "USD", "x", gid="G10"), award("100", "USD", "x", gid="G9")]
    valued = openalex_amount(awards, rules(), rates(), first_year=None)
    assert valued is not None and valued.amount is not None and valued.amount["usd"] == 100


def grant_facts(**facts: Any) -> GrantFacts:
    return cast(GrantFacts, facts)


def test_the_agency_beats_openalex_and_a_difference_is_flagged() -> None:
    """NSF 2245300: the API's $1,199,760 against OpenAlex's stale $905,320 (docs/09 §3.3)."""
    facts = grant_facts(
        nsf=nsf("1199760", "1199760", "2027-05-31"),
        openalex=[award("905320", "USD", "nsf_award_search", 2023)],
    )
    valued = value_grant("nsf", facts, end=None, first_year=2024, rules=rules(), rates=rates(), today=TODAY)
    assert valued.amount is not None and valued.amount["usd"] == 1_199_760
    assert valued.flags == ("active", "amounts_disagree")
    close = grant_facts(nsf=nsf("1000000", "1000000", "2020-01-01"), openalex=[award("1005000", "USD", "x")])
    agreed = value_grant("nsf", close, end=None, first_year=2019, rules=rules(), rates=rates(), today=TODAY)
    assert agreed.flags == ()


def test_only_a_lifetime_total_is_compared_with_openalex() -> None:
    """RePORTER's figure is a sum over fiscal years, and OpenAlex's NIH amount (`nih_exporter`)
    one year's award, so the two are never compared: P30DK017047's $52,843,525 against OpenAlex's
    $89,000 is no disagreement (B3b, seen on the sample). NSF's and USAspending's figures are
    lifetime totals, as OpenAlex's is, and a difference there is still flagged."""
    assert {"nsf_obligated", "nsf_estimated", "usaspending_obligation"} == COMPARED_WITH_OPENALEX
    facts = reporter_facts(ROWS["P30DK017047"])
    p30 = grant_facts(reporter=facts, openalex=[award("89000", "USD", "nih_exporter", 2024)])
    valued = value_grant(
        "reporter", p30, end=None, first_year=1977, rules=rules(), rates=rates(), today=TODAY
    )
    assert valued.amount is not None and valued.amount["usd"] == 52_843_525
    assert valued.flags == reporter_amount(facts, "reporter_fiscal_years", end=None, today=TODAY).flags
    assert "amounts_disagree" not in valued.flags
    rows = grant_facts(
        reporter=reporter_facts([row(2020, 10), row(2021, 20, appl=2)]),
        openalex=[award("5", "USD", "nih_exporter", 2020)],
    )
    nih_families: tuple[GrantFamily, ...] = ("reporter", "nih_contract", "nih_task_order")
    for family in nih_families:
        nih = value_grant(family, rows, end=None, first_year=2020, rules=rules(), rates=rates(), today=TODAY)
        assert nih.amount is not None and nih.amount["usd"] == 30
        assert nih.flags == (), family
    federal = grant_facts(
        usaspending=usaspending("583518208", "1997-04-01", "2027-09-30"),
        openalex=[award("139600000", "USD", "usaspending", 2017)],
    )
    usa = value_grant(
        "us_federal", federal, end=None, first_year=2018, rules=rules(), rates=rates(), today=TODAY
    )
    assert usa.amount is not None and usa.amount["basis"] == "usaspending_obligation"
    assert usa.flags == ("active", "starts_before_fy2008", "amounts_disagree")
    continuing = grant_facts(
        nsf=nsf("900000", "600000", "2028-08-31"), openalex=[award("600000", "USD", "nsf_award_search", 2024)]
    )
    estimated = value_grant(
        "nsf", continuing, end=None, first_year=2025, rules=rules(), rates=rates(), today=TODAY
    )
    assert estimated.amount is not None and estimated.amount["basis"] == "nsf_estimated"
    assert estimated.flags == ("active", "amounts_disagree")


def test_openalex_fills_in_where_the_agency_has_nothing() -> None:
    facts = grant_facts(openalex=[award("829705.92", "USD", "usaspending", 2014)])
    valued = value_grant(
        "us_federal", facts, end=None, first_year=2016, rules=rules(), rates=rates(), today=TODAY
    )
    assert valued.amount is not None and valued.amount["usd"] == 829_706
    assert valued.amount["basis"] == "openalex_amount"
    assert valued.flags == ("amount_from_openalex",)
    reported = grant_facts(
        reporter=reporter_facts([row(2010, None)]), openalex=[award("1000", "USD", "nih_exporter", 2010)]
    )
    both = value_grant(
        "reporter", reported, end=None, first_year=2011, rules=rules(), rates=rates(), today=TODAY
    )
    assert both.flags == ("no_amount_reported", "amount_from_openalex")


def test_unknown_is_not_zero() -> None:
    """A grant no v1 source values has no amount, and says why (§1.1 principle 4)."""
    nothing = value_grant(
        "agency", grant_facts(), end=None, first_year=2020, rules=rules(), rates=rates(), today=TODAY
    )
    assert nothing == Valuation(None, ("amount_not_found",))
    misc = value_grant(
        "miscellaneous", grant_facts(), end=None, first_year=2020, rules=rules(), rates=rates(), today=TODAY
    )
    assert misc == Valuation(None, ("amount_not_found",))
    va = grant_facts(reporter=reporter_facts([row(2009, None)]))
    assert value_grant(
        "reporter", va, end=None, first_year=2016, rules=rules(), rates=rates(), today=TODAY
    ) == Valuation(None, ("no_amount_reported",))


def test_every_family_is_valued_from_its_own_facts() -> None:
    reporter = grant_facts(reporter=reporter_facts([row(2020, 10), row(2021, 20, appl=2)]))
    families: tuple[tuple[GrantFamily, str], ...] = (
        ("reporter", "reporter_fiscal_years"),
        ("nih_contract", "reporter_contract"),
        ("nih_task_order", "reporter_task_order"),
    )
    for family, basis in families:
        valued = value_grant(
            family, reporter, end=None, first_year=2021, rules=rules(), rates=rates(), today=TODAY
        )
        assert valued.amount is not None and (valued.amount["usd"], valued.amount["basis"]) == (30, basis)
    federal = grant_facts(usaspending=usaspending("1.5", "2010-01-01", "2012-01-01"))
    valued = value_grant(
        "us_federal", federal, end=None, first_year=2011, rules=rules(), rates=rates(), today=TODAY
    )
    assert valued.amount is not None and valued.amount["usd"] == 2
    swedish = grant_facts(openalex=[award("25200000", "SEK", "swedish_research_council", 2018)])
    valued = value_grant(
        "agency", swedish, end="2030", first_year=2019, rules=rules(), rates=rates(), today=TODAY
    )
    assert valued.amount is not None and valued.amount["currency"] == "SEK"
    assert valued.flags == ("active", "amount_from_openalex")


# --- Currency (§7.2) -------------------------------------------------------------------


TEN = Context(prec=10, rounding=ROUND_HALF_EVEN)


def test_g5a_quotes_four_currencies_in_dollars_and_the_rest_per_dollar() -> None:
    """EUR, GBP, AUD, NZD are stored as G.5A quotes them; SEK, JPY and the rest are inverted,
    in decimal, to ten significant digits (the file's header says so)."""
    table = rates().table
    assert table["GBP"][2024] == "1.2781"  # G.5A, January 2026: 1.2781 US dollars per pound
    assert table["EUR"][2025] == "1.1306"
    assert table["GBP"][1999] == "1.6172"
    assert Decimal(table["SEK"][2024]) == TEN.divide(1, Decimal("10.5744"))  # 10.5744 kronor per dollar
    assert Decimal(table["JPY"][2025]) == TEN.divide(1, Decimal("149.5686"))
    assert Decimal(table["CAD"][2016]) == TEN.divide(1, Decimal("1.3243"))
    assert set(table["EUR"]) == set(range(1999, 2026))


def test_every_g5a_currency_is_there_from_1999_to_2025_and_clp_from_oecd() -> None:
    config = load_config().exchange_rates
    g5a, oecd = config["sources"]
    assert g5a["name"] == "Federal Reserve G.5A" and len(g5a["currencies"]) == 22
    assert "CLP" in oecd["currencies"] and "CLP" not in g5a["currencies"]
    assert not set(g5a["currencies"]) & set(oecd["currencies"])
    for currency in g5a["currencies"]:
        assert set(rates().table[currency]) == set(range(1999, 2026)), currency
    assert Decimal(rates().table["CLP"][2019]) == TEN.divide(1, Decimal("702.897423"))  # OECD, EXC_A


def test_clp_is_converted_by_the_oecd_rate() -> None:
    """ANID's FONDAP centre 15130011: 4,500,000,000 pesos (docs/09 Appendix B)."""
    converted = convert("4500000000", "CLP", 2013, None, rates())
    assert converted.rate == rates().table["CLP"][2013]
    assert converted.usd == to_usd("4500000000", converted.rate)
    assert 8_000_000 < (converted.usd or 0) < 10_000_000
    assert (converted.rate_year, converted.flags) == (2013, ())


def test_a_currency_in_neither_table_is_left_unconverted() -> None:
    converted = convert("1000", "BGN", 2020, None, rates())
    assert (converted.usd, converted.rate, converted.rate_year) == (None, None, None)
    assert converted.flags == ("unconverted_currency",)
    valued = openalex_amount([award("1000", "BGN", "x", 2020)], rules(), rates(), first_year=2020)
    assert valued is not None and valued.amount is not None
    assert (valued.amount["usd"], valued.amount["rate"]) == (None, None)
    assert "unconverted_currency" in valued.flags


def test_usd_rounds_to_the_whole_dollar_halves_to_even() -> None:
    assert [to_usd(value, "1") for value in ("0.5", "1.5", "2.5", "3.49", "3.51")] == [0, 2, 2, 3, 4]
    assert to_usd("3", "0.5") == 2  # 1.5
    assert to_usd("5", "0.5") == 2  # 2.5
    assert convert("2.5", "USD", None, None, rates()) == convert("2.5", "USD", 2020, 2020, rates())


def test_a_year_outside_the_table_uses_the_nearest() -> None:
    before = convert("100", "GBP", 1990, None, rates())
    after = convert("100", "GBP", 2031, None, rates())
    assert (before.rate_year, after.rate_year) == (1999, 2025)
    assert before.flags == after.flags == ()
    ties = Rates({"XXX": {2000: "1", 2002: "2"}})
    assert convert("10", "XXX", 2001, None, ties).rate_year == 2000  # the earlier on a tie


def test_no_start_year_uses_the_first_year_and_says_so() -> None:
    estimated = convert("100", "EUR", None, 2019, rates())
    assert (estimated.rate_year, estimated.flags) == (2019, ("rate_year_estimated",))
    latest = convert("100", "EUR", None, None, rates())
    assert latest.rate_year == 2025 and latest.flags == ("rate_year_estimated",)


def test_decimals_are_written_plainly() -> None:
    assert decimal_string(350000.0) == "350000"
    assert decimal_string(109941.6654) == "109941.6654"
    assert decimal_string(Decimal("1.50")) == "1.5"
    assert decimal_string("0.000") == "0"
    assert decimal_string(Decimal("1E+3")) == "1000"
