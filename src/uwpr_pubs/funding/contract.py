"""The export's funding shapes, `schema_version` 1.1 (docs/09 §11).

Kept apart from `uwpr_pubs.export`, which holds the rest of the contract, only so that the
builder (`funding.export`), the summary (`funding.summary`) and the export can all import them
without importing one another. `schemas/export.schema.json` is the authority; these mirror it.
"""

from typing import Literal, NotRequired, TypedDict

from uwpr_pubs.store.models import (
    AgencyCode,
    AgencyGroup,
    AmountBasis,
    AmountSource,
    Date,
    GrantCategory,
    GrantFlag,
    GrantKey,
    GrantScope,
    GrantStatus,
    RuleVersion,
    WorkId,
)

# How a work came to list a grant (§11.2), strongest first: the order `how` is chosen in.
ListingHow = Literal["listed", "corrected", "override", "nih_link"]
HOW_ORDER: tuple[ListingHow, ...] = ("listed", "corrected", "override", "nih_link")

FundingSourceId = Literal["reporter", "nsf", "usaspending", "openalex", "pubmed", "crossref", "pmc"]


class ExportGrantOverride(TypedDict):
    """Who decided a string is this grant, and why: the same attribution override evidence has."""

    reason: str
    by: str
    date: Date


class ExportGrantListing(TypedDict):
    """One grant on one work (§11.2). `cited_as` and `override` are absent, not null, where they
    do not apply: a key is omitted only where the concept does not apply at all (docs/05)."""

    grant: GrantKey
    how: ListingHow
    cited_as: NotRequired[list[str]]
    override: NotRequired[ExportGrantOverride]
    agencies: list[AgencyCode]  # the chain, root first, so a filter needs nothing but the row


class WorkGrants(TypedDict):
    """The part of an exported work the funding summary reads. `ExportWork` has these keys with
    these types, so any exported work is one."""

    id: WorkId
    year: int
    grants: list[ExportGrantListing]


class ExportInvestigator(TypedDict):
    name: str
    id: str | None


class ExportAmountSource(TypedDict):
    name: AmountSource
    url: str | None
    as_of: Date
    basis: AmountBasis


class ExportGrant(TypedDict):
    """A grant (§11.4)."""

    key: GrantKey
    agency: AgencyCode
    number: str
    category: GrantCategory
    scope: GrantScope
    scope_reason: str | None
    status: GrantStatus
    title: str | None
    pis: list[ExportInvestigator]
    organization: str | None
    start_year: int | None
    end_year: int | None
    first_year: int | None
    amount_usd: int | None
    amount_original: int | float | None
    currency: str | None
    rate_year: int | None
    amount_source: ExportAmountSource | None
    fiscal_years: dict[str, int | None] | None
    url: str | None
    url_name: str | None
    flags: list[GrantFlag]


class ExportAgency(TypedDict):
    """An agency (§11.5)."""

    code: AgencyCode
    name: str
    short_name: str | None
    parent: AgencyCode | None
    group: AgencyGroup
    country: str | None


class ExportFundingSource(TypedDict):
    id: FundingSourceId
    name: str
    url: str
    as_of: Date
    amounts_from: int | None
    partial_year: int | None


class ExportExchangeRates(TypedDict):
    name: str
    url: str
    currencies: list[str]
    through_year: int


class ExportFundingStrings(TypedDict):
    grant: int
    unresolved: int
    not_a_grant: int
    resource_code: int
    facility_contract: int


class ExportFundingResolution(TypedDict):
    exact: int
    normalised: int
    corrected: int
    override: int


class ExportFundingMethod(TypedDict):
    strings: ExportFundingStrings
    resolution: ExportFundingResolution
    works_without_funding_metadata: int


class ExportFundingYear(TypedDict):
    grants: int
    grants_institution_wide: int
    amount_usd: int
    amount_usd_institution_wide: int


class ExportFundingSummary(TypedDict):
    """§11.6. Computed from the rows by `funding.summary`, for the cross-check."""

    grants: int
    grants_resolved: int
    grants_with_amount: int
    grants_unconverted: int
    grants_institution_wide: int
    agencies: int
    investigators: int
    organizations: int
    amount_usd: int
    amount_usd_institution_wide: int
    amount_usd_nih: int
    nih_grants: int
    works_with_grants: int
    works_with_listings: int
    first_year: int | None
    last_year: int | None
    by_first_year: dict[str, ExportFundingYear]


class ExportFunding(TypedDict):
    """The top-level `funding` block (§11.3). `version` is null exactly when there is no funding
    data, and then every list is empty and every count zero (§11.1)."""

    version: RuleVersion | None
    as_of: Date | None
    sources: list[ExportFundingSource]
    exchange_rates: list[ExportExchangeRates]
    method: ExportFundingMethod
    summary: ExportFundingSummary
    agencies: list[ExportAgency]
    grants: list[ExportGrant]
