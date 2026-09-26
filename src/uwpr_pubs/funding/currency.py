"""Amounts in other currencies, in US dollars (docs/09 §7.2, F7).

`config/exchange_rates.yaml` holds annual average rates as US dollars per unit, as decimal
strings, by currency and year. An amount is converted at the rate of its award's start year; a
start year the table lacks takes the nearest year it has, and says which (`rate_year`). A source
that gives no start year uses the grant's first year, flagged `rate_year_estimated`. A currency
the table lacks is not converted: `usd` stays null, flagged `unconverted_currency`, and the grant
stays out of every US-dollar total.

Arithmetic is decimal throughout, from the stored strings, and `usd` is rounded to the whole
dollar with halves to even, so every total is an exact integer sum (invariant F6).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal
from typing import Any

from uwpr_pubs.store.models import GrantFlag

USD = "USD"


def decimal_string(value: object) -> str:
    """A number as the store writes it: plain decimal, no exponent, no trailing zeros.

    `350000.0` → `"350000"`, `Decimal("1.50")` → `"1.5"`. A float goes through its shortest
    `repr`, which is what a JSON reply held.
    """
    number = Decimal(repr(value)) if isinstance(value, float) else Decimal(str(value))
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def to_usd(original: str, rate: str) -> int:
    """`round(original * rate)`, halves to even, from the two decimal strings (§7.2)."""
    return int((Decimal(original) * Decimal(rate)).quantize(Decimal(1), rounding=ROUND_HALF_EVEN))


@dataclass(frozen=True)
class Rates:
    """US dollars per unit, by currency and year."""

    table: Mapping[str, Mapping[int, str]]

    @classmethod
    def from_config(cls, document: Mapping[str, Any]) -> "Rates":
        return cls(
            {
                currency: {int(year): str(rate) for year, rate in years.items()}
                for currency, years in document["rates"].items()
            }
        )


@dataclass(frozen=True)
class Conversion:
    usd: int | None
    rate: str | None  # US dollars per unit; None exactly when usd is
    rate_year: int | None  # the rate's year; None for US dollars
    flags: tuple[GrantFlag, ...] = ()


def convert(
    original: str, currency: str, start_year: int | None, first_year: int | None, rates: Rates
) -> Conversion:
    """An amount in US dollars, at the award's start year's rate (F7)."""
    if currency == USD:
        return Conversion(to_usd(original, "1"), "1", None)
    years = rates.table.get(currency)
    if not years:
        return Conversion(None, None, None, ("unconverted_currency",))
    year = start_year if start_year is not None else first_year
    flags: tuple[GrantFlag, ...] = () if start_year is not None else ("rate_year_estimated",)
    wanted = year if year is not None else max(years)
    rate_year = min(years, key=lambda candidate: (abs(candidate - wanted), candidate))  # the earlier on a tie
    rate = years[rate_year]
    return Conversion(to_usd(original, rate), rate, rate_year, flags)
