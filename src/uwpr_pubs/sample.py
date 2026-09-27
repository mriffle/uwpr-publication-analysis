"""The twelve cases the sample export has to cover (docs/05-metrics-and-data-contract.md §13).

`samples/export/` is what the web app is developed and tested against, so it has to contain every
shape the app can meet. Nine of the twelve are already in `samples/store/`. Three are not, and
cannot be:

- **a retracted work** — the real store has none (0 of 339), which §13 itself says;
- **a single-author work** and **one with more than 50 authors** — `samples/store/` runs 4 to 15
  authors, and it is built from live APIs against real UWPR papers.

They cannot be added to `samples/store/` because it is rebuilt from live sources by
`samples/build_sample_store.py`, must rebuild byte-identically, and holds *real* papers with
*real* UWPR evidence. Inventing a UWPR acknowledgement for a real paper that does not have one
would put a false claim into a committed, validated artifact — the one thing this project's
traceability principle exists to prevent — and no real retracted UWPR paper exists to use
instead. So they arrive from `samples/export_cases.json` and are merged by
`uwpr_pubs.stages.export.build_from_store`, which has one path for every store.

**This coverage guard applies to the sample only.** A real store can never satisfy "retracted" or
"override with attribution" — it has no retraction, and its only override is an *exclude*, which
by definition never reaches the export — so applying it everywhere made the export command fail
permanently against its most obvious target.
"""

import re
from collections.abc import Callable, Mapping, Sequence

from uwpr_pubs.export import ExportDoc, ExportWork
from uwpr_pubs.funding.contract import ExportGrant, ExportGrantListing

LONG_AUTHOR_LIST = 50


def _has_no_excerpt(work: ExportWork, rule: str) -> bool:
    return any(e["rule"] == rule and e["excerpt"] is None for e in work["evidence"])


def _is_attributed_override(entry: Mapping[str, object]) -> bool:
    """The case is "an override *with its attribution*", so the reason, the person and the date
    all have to be there. Asking only for `rule == "override"` let the sample pass §13 while the
    attribution reached nothing at all."""
    if entry["rule"] != "override":
        return False
    detail = entry.get("detail") or {}
    if not isinstance(detail, Mapping):
        return False
    return bool(entry.get("label")) and bool(detail.get("by")) and bool(detail.get("date"))


# One predicate per case, so "it must cover" is a test rather than a promise.
CASES: Mapping[str, Callable[[ExportWork], bool]] = {
    "preprint-only work": lambda w: w["is_preprint"],
    "merged preprint and article": lambda w: bool(w["versions"]),
    "listing is the only evidence": lambda w: [e["rule"] for e in w["evidence"]] == ["R1"],
    "listing evidence has no excerpt": lambda w: _has_no_excerpt(w, "R1"),
    "full-text index match, no excerpt": lambda w: _has_no_excerpt(w, "R6"),
    "override with attribution": lambda w: any(_is_attributed_override(e) for e in w["evidence"]),
    "no open-access link": lambda w: w["oa"]["url"] is None,
    "no field-weighted impact": lambda w: w["citations"]["fwci"] is None,
    "retracted": lambda w: w["retracted"],
    "single author": lambda w: w["author_count"] == 1,
    "more than 50 authors": lambda w: w["author_count"] > LONG_AUTHOR_LIST,
    "author with no resolved affiliation": lambda w: any(
        not a["institutions"] and a["affiliations_raw"] for a in w["authors"]
    ),
    "retired work ID in aliases": lambda w: bool(w["aliases"]),
}


# --- funding (docs/09 §11.8) -------------------------------------------------------------------
# The synthetic half of §11.8, from `samples/export_cases.json`, and the real half, from the sample
# store's own papers (`REAL_FUNDING_CASES`, below). Each predicate reads the whole document,
# because a funding case is a relation between works, grants and agencies rather than a property
# of one work, and each returns what exhibits it, so the export command can say where.

NIH_FORMAT = re.compile(r"^[1-9]?[A-Z][A-Z0-9]{2} ?[A-Z]{2} ?[0-9]{6}")


def _grants(export: ExportDoc) -> list[ExportGrant]:
    return export["funding"]["grants"]


def _listings(export: ExportDoc) -> list[tuple[ExportWork, ExportGrantListing]]:
    return [(work, row) for work in export["works"] for row in work["grants"]]


def _contracts(export: ExportDoc, segments: int) -> list[str]:
    return [
        g["key"]
        for g in _grants(export)
        if g["key"].startswith("NIH-contract:")
        and g["key"].count(":") == segments
        and g["category"] == "contract"
    ]


def _unresolved_nih(export: ExportDoc) -> list[str]:
    groups = {agency["code"]: agency["group"] for agency in export["funding"]["agencies"]}
    return [
        g["key"]
        for g in _grants(export)
        if g["status"] == "unresolved"
        and groups.get(g["agency"]) == "miscellaneous"
        and NIH_FORMAT.match(g["number"])
    ]


def _attributed_overrides(export: ExportDoc) -> list[str]:
    return [
        f"{work['id']} {row['grant']}"
        for work, row in _listings(export)
        if row["how"] == "override"
        and row.get("cited_as")
        and "override" in row
        and bool(row["override"]["reason"] and row["override"]["by"] and row["override"]["date"])
    ]


def _cited(export: ExportDoc, how: str) -> list[str]:
    return [
        f"{work['id']} {row['grant']}"
        for work, row in _listings(export)
        if row["how"] == how and row.get("cited_as")
    ]


def _converted_by_oecd(export: ExportDoc) -> list[str]:
    oecd = {
        currency
        for source in export["funding"]["exchange_rates"]
        if source["name"].startswith("OECD")
        for currency in source["currencies"]
    }
    return [
        g["key"]
        for g in _grants(export)
        if g["currency"] == "CLP"
        and "CLP" in oecd
        and g["amount_usd"] is not None
        and g["rate_year"] is not None
    ]


def _unconverted(export: ExportDoc) -> list[str]:
    covered = {
        currency for source in export["funding"]["exchange_rates"] for currency in source["currencies"]
    }
    return [
        g["key"]
        for g in _grants(export)
        if "unconverted_currency" in g["flags"]
        and g["amount_usd"] is None
        and g["amount_original"] is not None
        and g["currency"] not in covered
    ]


def _no_grants(export: ExportDoc) -> list[str]:
    if export["funding"]["version"] is None:
        return []
    return [work["id"] for work in export["works"] if not work["grants"]]


def _shared_across_years(export: ExportDoc) -> list[str]:
    years: dict[str, set[int]] = {}
    for work, row in _listings(export):
        years.setdefault(row["grant"], set()).add(work["year"])
    first = {g["key"]: g["first_year"] for g in _grants(export)}
    return [key for key, seen in sorted(years.items()) if len(seen) > 1 and first.get(key) == min(seen)]


def _no_amount(export: ExportDoc) -> list[str]:
    return [
        g["key"]
        for g in _grants(export)
        if g["status"] == "resolved" and g["amount_usd"] is None and g["amount_source"] is None
    ]


def _sub_agencies(export: ExportDoc) -> list[str]:
    named = {g["agency"] for g in _grants(export)}
    return [
        a["code"] for a in export["funding"]["agencies"] if a["parent"] is not None and a["code"] in named
    ]


# The real half of §11.8, from `samples/store/funding/`, which the sample's build fetches live
# (B8). Each reads only the listings of the real works, so a synthetic case cannot stand in for a
# real one: if a rebuild ever loses one, the export says so. Four of §11.8's real cases are facts
# the export does not carry — a supplement's written number, the funder a source names, the
# resource code, and the provenance of a refused amount — and `tests/test_sample_funding.py`
# holds them against the store instead (docs/09, B8).

SYNTHETIC_TITLE = "SAMPLE: "  # every synthetic work's title starts so (`export_cases.json`)
MULTI_PROJECT = ("P01", "P30", "P41", "P50", "U54")  # docs/09 §5.1's multi-project grants
PAIRED_CURRENCIES = frozenset({"SEK", "EUR"})


def _real_listings(export: ExportDoc) -> list[tuple[ExportWork, ExportGrantListing]]:
    return [(work, row) for work, row in _listings(export) if not work["title"].startswith(SYNTHETIC_TITLE)]


def _real_grants(export: ExportDoc, keep: Callable[[ExportGrant], bool]) -> list[str]:
    listed = {row["grant"] for _, row in _real_listings(export)}
    return [g["key"] for g in _grants(export) if g["key"] in listed and keep(g)]


def _source(grant: ExportGrant) -> tuple[str | None, str | None]:
    source = grant["amount_source"]
    return (source["name"], source["basis"]) if source else (None, None)


def _parent_rows_total(grant: ExportGrant) -> bool:
    return (
        grant["category"] == "center"
        and grant["number"].startswith(MULTI_PROJECT)
        and _source(grant)[1] == "reporter_fiscal_years"
    )


def _converted_openalex_amounts(export: ExportDoc) -> list[str]:
    found = _real_grants(
        export,
        lambda g: (
            _source(g)[1] == "openalex_amount"
            and g["currency"] in PAIRED_CURRENCIES
            and g["amount_usd"] is not None
            and g["rate_year"] is not None
        ),
    )
    currencies = {g["currency"] for g in _grants(export) if g["key"] in found}
    return found if currencies == PAIRED_CURRENCIES else []


def _nih_link_only(export: ExportDoc) -> list[str]:
    return [
        f"{work['id']} {row['grant']}" for work, row in _real_listings(export) if row["how"] == "nih_link"
    ]


def _nih_institutes(export: ExportDoc) -> list[str]:
    return sorted(
        {
            row["agencies"][-1]
            for _, row in _real_listings(export)
            if len(row["agencies"]) > 1 and row["agencies"][0] == "NIH"
        }
    )


REAL_FUNDING_CASES: Mapping[str, Callable[[ExportDoc], Sequence[str]]] = {
    "real: a multi-project grant valued from its parent rows alone": lambda export: _real_grants(
        export, _parent_rows_total
    ),
    "real: an NSF grant valued by the NSF Award API": lambda export: _real_grants(
        export, lambda g: _source(g)[0] == "NSF Award API"
    ),
    "real: a NASA grant valued by USAspending": lambda export: _real_grants(
        export, lambda g: g["agency"] == "NASA" and _source(g)[0] == "USAspending"
    ),
    "real: OpenAlex amounts in SEK and EUR, converted": _converted_openalex_amounts,
    "real: institution-wide awards": lambda export: _real_grants(
        export, lambda g: g["scope"] == "institution-wide"
    ),
    "real: a grant starting before FY1985": lambda export: _real_grants(
        export, lambda g: "starts_before_fy1985" in g["flags"]
    ),
    "real: a grant known only by an NIH link": _nih_link_only,
    "real: a DFG grant left without an amount": lambda export: _real_grants(
        export, lambda g: g["agency"] == "DFG" and g["status"] == "resolved" and g["amount_usd"] is None
    ),
    "real: an NIH institute under its parent": _nih_institutes,
}


FUNDING_CASES: Mapping[str, Callable[[ExportDoc], Sequence[str]]] = {
    "a contract": lambda export: _contracts(export, 1),
    "a task order": lambda export: _contracts(export, 2),
    "an unresolved NIH-format string in Miscellaneous": _unresolved_nih,
    "a grant override with attribution": _attributed_overrides,
    "a corrected near-miss": lambda export: _cited(export, "corrected"),
    "a corrected form beside the exact one (cited_as with how: listed)": lambda export: _cited(
        export, "listed"
    ),
    "a CLP amount converted by the OECD rate": _converted_by_oecd,
    "an amount in a currency no rate table covers, unconverted": _unconverted,
    "a work with no grants": _no_grants,
    "one grant listed by two works in different years": _shared_across_years,
    "a grant with a null amount": _no_amount,
    "a sub-agency with a parent": _sub_agencies,
    **REAL_FUNDING_CASES,
}


def missing_cases(export: ExportDoc) -> list[str]:
    """Which of §13's cases no exported work exhibits, and which of docs/09 §11.8's the export lacks."""
    works = export["works"]
    missing = [name for name, matches in CASES.items() if not any(matches(work) for work in works)]
    return missing + [name for name, exhibits in FUNDING_CASES.items() if not exhibits(export)]


def case_report(export: ExportDoc) -> str:
    """Which work, grant or agency covers each case, for the export command's output."""
    lines = []
    for name, matches in CASES.items():
        covered: Sequence[str] = [w["id"] for w in export["works"] if matches(w)]
        mark = "ok  " if covered else "MISS"
        lines.append(f"  {mark} {name}: {', '.join(covered) if covered else '—'}")
    for name, exhibits in FUNDING_CASES.items():
        covered = exhibits(export)
        mark = "ok  " if covered else "MISS"
        lines.append(f"  {mark} {name}: {', '.join(covered) if covered else '—'}")
    return "\n".join(lines)
