"""`funding.summary`, computed from the exported rows (docs/09 §11.6).

The funding half of docs/05 §1.2's cross-check: the export writes this block, `validate_export`
recomputes it from the same rows, and the app's `summarizeFunding` must reproduce it field for
field. It reads the exported grants, agencies and listings and nothing else — never the store —
so a builder that drifted from the contract is caught rather than restated.

Everything counts **with institution-wide awards included**, the default view, and carries their
halves so the excluded view is checkable too. Investigators and organisations are keyed partly on
names, because only RePORTER gives a person an identifier: one person under two spellings counts
twice, and the method page says so.
"""

import unicodedata
from collections.abc import Mapping, Sequence

from uwpr_pubs.funding.contract import (
    ExportAgency,
    ExportFundingSummary,
    ExportFundingYear,
    ExportGrant,
    ExportInvestigator,
    WorkGrants,
)

NIH = "NIH"  # the root agency `amount_usd_nih` and `nih_grants` count


def normalised_name(name: str) -> str:
    """NFKC, casefolded, whitespace collapsed: the key of a name with no identifier (§11.6)."""
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def investigator_key(person: ExportInvestigator) -> str:
    """A principal investigator's `id` when the source gives one, else the name normalised."""
    return person["id"] if person["id"] else normalised_name(person["name"])


def root_agency(code: str, parents: Mapping[str, str | None]) -> str:
    """The top of an agency's chain (NIH, not NIGMS). A cycle stops where it closes; the
    validator reports it."""
    seen = {code}
    parent = parents.get(code)
    while parent is not None and parent not in seen:
        seen.add(parent)
        code, parent = parent, parents.get(parent)
    return code


def build_funding_summary(
    works: Sequence[WorkGrants], grants: Sequence[ExportGrant], agencies: Sequence[ExportAgency]
) -> ExportFundingSummary:
    """§11.6 over the unfiltered export."""
    parents = {agency["code"]: agency["parent"] for agency in agencies}
    resolved = [grant for grant in grants if grant["status"] == "resolved"]
    wide = [grant for grant in grants if grant["scope"] == "institution-wide"]
    status = {grant["key"]: grant["status"] for grant in grants}
    nih = [grant for grant in resolved if root_agency(grant["agency"], parents) == NIH]
    years = [grant["first_year"] for grant in resolved if grant["first_year"] is not None]

    by_first_year: dict[str, ExportFundingYear] = {}
    for grant in sorted(resolved, key=lambda g: g["first_year"] or 0):
        if grant["first_year"] is None:
            continue
        year = by_first_year.setdefault(
            str(grant["first_year"]),
            {"grants": 0, "grants_institution_wide": 0, "amount_usd": 0, "amount_usd_institution_wide": 0},
        )
        is_wide = grant["scope"] == "institution-wide"
        year["grants"] += 1
        year["grants_institution_wide"] += int(is_wide)
        year["amount_usd"] += grant["amount_usd"] or 0
        year["amount_usd_institution_wide"] += (grant["amount_usd"] or 0) if is_wide else 0

    return {
        "grants": len(grants),
        "grants_resolved": len(resolved),
        "grants_with_amount": sum(1 for grant in grants if grant["amount_usd"] is not None),
        "grants_unconverted": sum(1 for grant in grants if "unconverted_currency" in grant["flags"]),
        "grants_institution_wide": len(wide),
        "agencies": len({root_agency(grant["agency"], parents) for grant in resolved}),
        "investigators": len({investigator_key(person) for grant in resolved for person in grant["pis"]}),
        "organizations": len(
            {normalised_name(grant["organization"]) for grant in resolved if grant["organization"]}
        ),
        "amount_usd": sum(grant["amount_usd"] or 0 for grant in grants),
        "amount_usd_institution_wide": sum(grant["amount_usd"] or 0 for grant in wide),
        "amount_usd_nih": sum(grant["amount_usd"] or 0 for grant in nih),
        "nih_grants": len(nih),
        "works_with_grants": sum(
            1 for work in works if any(status.get(row["grant"]) == "resolved" for row in work["grants"])
        ),
        "works_with_listings": sum(1 for work in works if work["grants"]),
        "first_year": min(years) if years else None,
        "last_year": max(years) if years else None,
        "by_first_year": dict(sorted(by_first_year.items())),
    }
