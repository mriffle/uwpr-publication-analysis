"""The on-disk shapes of the store (docs/02-data-model.md, schemas/*.schema.json).

The JSON is the model. These types mirror the schemas field for field, including where a key is
absent rather than null, because that distinction is what keeps writes byte-stable (Phase 2 §15).
The evidence and candidate types are tagged unions matching the schemas' if/then blocks, so mypy
narrows `detail` and `criterion` the way the schema constrains them.
"""

from typing import Literal, NotRequired, TypedDict

# Scalars. The patterns live in schemas/common.schema.json; these are documentation.
WorkId = str  # W-000123
RecordId = str  # R-000123
Date = str  # YYYY-MM-DD
DateTime = str  # YYYY-MM-DDTHH:MM:SSZ
RuleVersion = str  # YYYY-MM-DD.N
CacheRef = str  # sha256:<64 hex>
ListKey = str  # list:<page>:<12 hex>
GrantKey = str  # NIH:R01GM086688, NIH-contract:HHSN272201700059C, USA:NASA:NNX14AJ87G (docs/09 §8.2)
AgencyCode = str  # NIH, NIGMS, NSF, WT, F4320332161, MISC
DecimalString = str  # "52843525", "0.1057207838": amounts never pass through a float

StaffKey = Literal["eng", "sharma", "riffle", "hoopmann", "vonhaller"]
Channel = Literal["A", "B1", "B2", "C1", "C2", "D1", "D2", "D3", "E", "F", "G", "J"]
IncludedKind = Literal["article", "review", "letter", "data-paper", "book-chapter", "preprint"]
FullTextStatus = Literal["pmc_xml", "epmc_xml", "abstract_only", "unavailable"]
OaStatus = Literal["gold", "green", "hybrid", "bronze", "diamond", "closed", "unknown"]
VersionMethod = Literal[
    "crossref_relation", "biorxiv_published", "openalex_locations", "title_author", "override"
]
SourceName = Literal["UWPR website", "OpenAlex", "Crossref", "PMC", "Europe PMC", "PRIDE", "overrides.yaml"]
SourceKey = Literal["openalex", "crossref", "epmc", "pubmed", "pmc", "pride", "uwpr_site"]
Section = Literal[
    "official list",
    "metadata",
    "acknowledgements",
    "funding",
    "methods",
    "main text",
    "affiliation",
    "author notes",
    "dataset description",
    "full-text index",
    "override",
]
Rule = Literal["R1", "R2", "R3", "R3d", "R4", "R5", "R6", "R7", "override"]
CandidateReason = Literal[
    "no_rule_fired",
    "excluded_record_type",
    "before_window",
    "override_exclude",
    "no_longer_meets_rules",
]
RunMode = Literal["live", "replay", "record", "sample"]
RunStatus = Literal["ok", "degraded", "alert"]


class Ids(TypedDict, total=False):
    # `pride` is annotated before the `list` field, while `list` still means the builtin.
    doi: str | None
    pmid: str | None
    pmcid: str | None
    openalex: str | None
    pride: list[str]
    list: ListKey | None  # the official-list entry key, for a work with no other identifier


class Affiliation(TypedDict):
    raw: str
    ror: NotRequired[str | None]
    name: NotRequired[str | None]
    country: NotRequired[str | None]


class Author(TypedDict):
    name: str
    orcid: str | None
    openalex: str | None
    staff: StaffKey | None
    corresponding: bool
    affiliations: list[Affiliation]


class Topic(TypedDict):
    domain: str
    field: str
    subfield: str
    topic: str
    score: float


class Venue(TypedDict):
    name: str
    issn_l: str | None
    publisher: str | None


class OpenAccess(TypedDict):
    status: OaStatus
    url: str | None
    license: str | None


class FullText(TypedDict):
    status: FullTextStatus
    checked: Date
    recheck_after: Date | None
    cache: CacheRef | None


class Abstract(TypedDict):
    cache: CacheRef


class VersionLink(TypedDict):
    to: RecordId
    method: VersionMethod


class Record(TypedDict):
    id: RecordId
    kind: IncludedKind
    ids: Ids
    title: str
    published: Date | None
    year: int
    venue: Venue | None
    authors: list[Author]
    topics: list[Topic]
    oa: OpenAccess
    retracted: bool
    fulltext: FullText
    abstract: Abstract | None
    version_link: VersionLink | None
    sources: dict[SourceKey, Date]


class CandidateRecord(TypedDict):
    id: RecordId
    kind: str  # may be an excluded type, so not IncludedKind
    ids: Ids
    title: str
    year: int | None


class EvidenceSource(TypedDict):
    name: SourceName
    url: str | None
    retrieved: Date
    cache: CacheRef | None


class Superseded(TypedDict):
    by_rule_version: RuleVersion
    date: Date


class DetailR1(TypedDict):
    page: str
    list_key: ListKey
    first_seen: Date
    last_seen: Date


class DetailR2(TypedDict):
    field: str


class DetailR3d(TypedDict):
    dataset: str


class DetailR6(TypedDict):
    phrase: str
    query_date: Date


class DetailR7(TypedDict):
    staff: StaffKey


class _EvidenceBase(TypedDict):
    label: str
    record: RecordId | None
    source: EvidenceSource
    excerpt: str | None
    rule_version: RuleVersion
    first_seen: Date
    last_seen: Date
    superseded: NotRequired[Superseded]


class EvidenceR1(_EvidenceBase):
    rule: Literal["R1"]
    criterion: Literal[1]
    section: Literal["official list"]
    detail: DetailR1


class EvidenceR2(_EvidenceBase):
    rule: Literal["R2"]
    criterion: Literal[2]
    section: Section
    detail: DetailR2


class EvidenceR3(_EvidenceBase):
    rule: Literal["R3"]
    criterion: Literal[3, 4]
    section: Section
    detail: dict[str, str]


class EvidenceR3d(_EvidenceBase):
    rule: Literal["R3d"]
    criterion: Literal[4]
    section: Literal["dataset description"]
    detail: DetailR3d


class EvidenceR4(_EvidenceBase):
    rule: Literal["R4"]
    criterion: Literal[4]
    section: Section
    detail: dict[str, str]


class EvidenceR5(_EvidenceBase):
    rule: Literal["R5"]
    criterion: Literal[3]
    section: Section
    detail: dict[str, str]


class EvidenceR6(_EvidenceBase):
    rule: Literal["R6"]
    criterion: Literal[2, 4]
    section: Literal["full-text index"]
    detail: DetailR6


class EvidenceR7(_EvidenceBase):
    rule: Literal["R7"]
    criterion: Literal[3]
    section: Section
    detail: DetailR7


class EvidenceOverride(_EvidenceBase):
    rule: Literal["override"]
    criterion: None
    section: Literal["override"]
    detail: dict[str, str]


Evidence = (
    EvidenceR1
    | EvidenceR2
    | EvidenceR3
    | EvidenceR3d
    | EvidenceR4
    | EvidenceR5
    | EvidenceR6
    | EvidenceR7
    | EvidenceOverride
)


class Discovery(TypedDict):
    channel: Channel
    record: RecordId
    first_seen: Date
    last_seen: Date


class Status(TypedDict):
    included: Literal[True]
    since: Date
    basis: Literal["rules", "override"]


class Work(TypedDict):
    schema: Literal[1]
    id: WorkId
    aliases: list[WorkId]
    status: Status
    canonical: RecordId
    records: list[Record]
    evidence: list[Evidence]
    discovery: list[Discovery]
    rule_version: RuleVersion
    created: Date
    updated: Date


class Candidate(TypedDict):
    schema: Literal[1]
    id: WorkId
    records: list[CandidateRecord]
    reason: CandidateReason
    reason_detail: NotRequired[str]
    former_evidence: NotRequired[list[Evidence]]
    signals: list[str]
    channels: list[Channel]
    fulltext: FullText | None
    rule_version: RuleVersion
    first_seen: Date
    last_seen: Date


class ListEntry(TypedDict):
    schema: Literal[1]
    key: ListKey
    page: str
    title: str
    authors_text: str
    venue_text: str
    pmid: str | None
    links: list[str]
    work: WorkId
    first_seen: Date
    last_seen: Date


class MetricsLine(TypedDict):
    schema: Literal[1]
    work: WorkId
    record: RecordId
    date: Date
    source: Literal["OpenAlex"]
    cited_by: int
    cites_by_year: dict[str, int]
    fwci: float | None
    citation_percentile: float | None


class Aliases(TypedDict):
    schema: Literal[1]
    aliases: dict[str, WorkId]


class ChannelRun(TypedDict):
    queries: int
    nominated: int
    new: int
    errors: list[str]


class RuleRun(TypedDict):
    works: int
    new: int


class Recall(TypedDict):
    assessable: int
    with_evidence: int


class RemovedChange(TypedDict):
    work: WorkId
    reason: str


class MergedChange(TypedDict):
    into: WorkId
    retired: WorkId


class Changes(TypedDict):
    added: list[WorkId]
    removed: list[RemovedChange]
    merged: list[MergedChange]
    list_appeared: list[str]
    list_disappeared: list[str]


class Degradation(TypedDict):
    source: str  # controlled vocabulary: channel:<id> | source:<adapter> | stage:<name>
    cause: str


class ApiUse(TypedDict):
    calls: int
    cost_usd: float


FundingMode = Literal["incremental", "full", "deferred", "skipped"]


class FundingRun(TypedDict):
    """The manifest's funding block (docs/09 §9.6). Every run records the version and the
    fingerprint it ran with, for stage 0's guard; the funding stage adds the rest."""

    version: RuleVersion
    fingerprint: CacheRef
    mode: NotRequired[FundingMode]
    grants: NotRequired[int]
    amount_usd: NotRequired[int]
    requests: NotRequired[dict[str, int]]


class RunManifest(TypedDict):
    schema: Literal[1]
    run_id: str
    mode: RunMode
    status: RunStatus
    degradations: list[Degradation]
    started: DateTime
    ended: DateTime
    code_version: str
    config_fingerprint: CacheRef
    rules_fingerprint: CacheRef
    overrides_fingerprint: NotRequired[CacheRef]  # added 2026-09-26; older manifests lack it
    funding: NotRequired[FundingRun]  # added 2026-09-26; older manifests lack it
    rule_version: RuleVersion
    note: NotRequired[str]
    channels: dict[str, ChannelRun]
    rules: dict[str, RuleRun]
    official_list_recall: Recall
    fixtures: dict[str, Literal["pass", "fail", "known_miss"]]
    changes: Changes
    api: dict[str, ApiUse]


class GeneratedInputs(TypedDict):
    fingerprint: CacheRef
    parts: list[str]


class Generator(TypedDict):
    name: str
    version: str
    date: Date


class Generated(TypedDict):
    schema: Literal[1]
    work: WorkId
    inputs: GeneratedInputs
    generator: Generator
    content: dict[str, object]


class Override(TypedDict):
    target: WorkId | list[WorkId]
    action: Literal["include", "exclude", "merge", "split", "grant"]
    reason: str
    by: str
    date: Date
    records: NotRequired[list[RecordId]]  # split only
    raw: NotRequired[str]  # grant only: the string as the work writes it (docs/09 §6.6)
    grant: NotRequired[GrantKey | None]  # grant only: None means "not a grant"


# --- store/funding/ (docs/09 §8) ----------------------------------------------------------------
# Kept beside the work files, never in them, like metrics: no work file is rewritten when a grant's
# amount moves. The vocabularies are docs/09's own (§8.3, §7.1, §11.4, §11.5).

FundingSource = Literal["openalex", "crossref", "pubmed", "jats"]
FundingOutcome = Literal["grant", "unresolved", "not_a_grant", "resource_code", "facility_contract"]
FundingMethod = Literal[
    "exact", "normalised", "corrected", "override", "agency_number", "openalex_award", "miscellaneous"
]
GrantFamily = Literal[
    "reporter",  # NIH:, VA: and other RePORTER agencies' grants
    "nih_contract",
    "nih_task_order",
    "nsf",
    "us_federal",  # USA:<AGENCY>:…, amounts from USAspending
    "agency",  # another configured agency
    "openalex_funder",  # F<digits>:…, a funder learned from OpenAlex
    "miscellaneous",  # MISC:…
]
GrantCategory = Literal["research", "center", "training", "instrument", "contract", "other"]
GrantScope = Literal["project", "institution-wide"]
GrantStatus = Literal["resolved", "unresolved"]
GrantFlag = Literal[
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
]
AmountBasis = Literal[
    "reporter_fiscal_years",
    "reporter_contract",
    "reporter_task_order",
    "nsf_obligated",
    "nsf_estimated",
    "usaspending_obligation",
    "openalex_amount",
]
AmountSource = Literal["NIH RePORTER", "NSF Award API", "USAspending", "OpenAlex"]
LookupSource = Literal["reporter", "nsf", "usaspending", "openalex"]
AgencyGroup = Literal["us_federal", "us_nonfederal", "non_us", "miscellaneous"]
AgencyOrigin = Literal["reporter", "config", "openalex"]


class FundingString(TypedDict):
    raw: str
    funders: list[str]
    sources: list[FundingSource]
    first_seen: Date
    last_seen: Date
    outcome: FundingOutcome
    grants: list[GrantKey]
    method: FundingMethod | None  # None for a resource code, a facility contract or a plain not-grant
    note: str | None


class NihLink(TypedDict):
    core: str  # RePORTER's core_project_num, as it gives it
    grant: GrantKey  # not always NIH:<core>: VA's grants and NIH's contracts are keyed otherwise
    first_seen: Date
    last_seen: Date


class FundingCitation(TypedDict):
    schema: Literal[1]
    work: WorkId
    funding_version: RuleVersion
    strings: list[FundingString]
    nih_links: list[NihLink]
    jats_checked: dict[RecordId, Date]
    grants: list[GrantKey]  # derived: the strings' grants and the links' (invariant F3)


class Investigator(TypedDict):
    name: str
    id: str | None  # RePORTER's profile_id; None where the source has no identifier


class ReporterFacts(TypedDict):
    fiscal_years: dict[str, int | None]  # parent rows' Σ award_amount per year; None: rows, no amount
    application_types: list[str]
    first_support_year: int | None
    latest_appl_id: int


class NsfFacts(TypedDict):
    estimated: DecimalString | None
    obligated: DecimalString | None
    exp_date: Date | None
    program: str | None
    type: NotRequired[str | None]  # the award type ("Fellowship Award"), for the category (B7)


class UsaspendingFacts(TypedDict):
    total_obligation: DecimalString | None
    type: str | None
    pop_start: Date | None
    pop_end: Date | None
    generated_id: str


class OpenalexAward(TypedDict):
    id: str  # G2073473589
    amount: DecimalString | None
    currency: str | None
    provenance: str | None
    start_year: int | None


class GrantFacts(TypedDict, total=False):
    reporter: ReporterFacts
    nsf: NsfFacts
    usaspending: UsaspendingFacts
    openalex: list[OpenalexAward]


class Amount(TypedDict):
    usd: int | None  # None only for a currency no rate table covers
    original: DecimalString
    currency: str
    rate: DecimalString | None  # US dollars per unit; None exactly when usd is
    rate_year: int | None
    basis: AmountBasis
    source: AmountSource


class Grant(TypedDict):
    schema: Literal[1]
    key: GrantKey
    agency: AgencyCode
    family: GrantFamily
    number: str
    activity: str | None
    category: GrantCategory
    status: GrantStatus
    scope: GrantScope
    scope_reason: str | None
    title: str | None
    pis: list[Investigator]
    organization: str | None
    start: str | None  # a date, or a year alone where the source gives only that
    end: str | None
    facts: GrantFacts
    amount: Amount | None
    flags: list[GrantFlag]
    openalex_awards: list[str]
    first_seen: Date
    checked: Date


class FundingLookup(TypedDict):
    schema: Literal[1]
    source: LookupSource
    query: str
    found: list[str]
    checked: Date
    recheck_after: Date | None


class Agency(TypedDict):
    schema: Literal[1]
    code: AgencyCode
    name: str
    short_name: str | None
    parent: AgencyCode | None
    group: AgencyGroup
    country: str | None
    origin: AgencyOrigin
