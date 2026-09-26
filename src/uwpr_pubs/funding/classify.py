"""What a funding string is, before any source is asked, and what a grant is (docs/09 §6, §11.4).

- **Not funding at all:** the resource code (`rules.r2.code`, §6.13), a not-grant (§6.12) and a
  DOE facility contract (§6.14). Each is decided by `config/funding.yaml` and the string alone.
- **Whose it is:** the agencies a string's sources name, decided on funder IDs — an OpenAlex
  funder or a Crossref funder DOI — and PubMed's `Agency` (§6.4). A funder's name decides only
  where its source gives no ID, and only by an agency's whole-name patterns (`funder_names`),
  which NIH, HHS and PHS never have. NIH attribution covers NIH, its institutes, HHS and PHS.
  When several configured agencies are named, the one whose number pattern fits decides.
- **What a grant is:** its category (§11.4) and whether it is institution-wide (§6.15).

`FundingRules` compiles the configuration once; everything here is pure.
"""

import re
import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal, cast

from uwpr_pubs.funding.numbers import alnum, clean, phase_partners
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.store.models import AgencyGroup, GrantCategory

NIH = "NIH"
ID_ONLY = frozenset({NIH, "HHS", "PHS"})  # named by funder ID and PubMed alone, never by a name (§6.4)
AmountFrom = Literal["reporter", "nsf", "usaspending", "openalex"]  # where an agency's amounts come from

_OPENALEX_ID = re.compile(r"^(?:https?://openalex\.org/)?(F[0-9]+)$", re.IGNORECASE)
_FUNDER_DOI = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/)?(10\.13039/[0-9A-Za-z]+)$", re.IGNORECASE)


def funder_id(value: str | None) -> str | None:
    """An OpenAlex funder ID (`F4320306076`) or a Crossref funder DOI (`10.13039/100000001`),
    however a source writes it (a URL, `dx.doi.org`), or None."""
    if not value:
        return None
    text = value.strip()
    openalex = _OPENALEX_ID.match(text)
    if openalex:
        return openalex.group(1).upper()
    doi = _FUNDER_DOI.match(text)
    return doi.group(1).lower() if doi else None


@dataclass(frozen=True)
class Agency:
    """One configured agency (`config/funding.yaml` `agencies`)."""

    code: str
    name: str
    group: AgencyGroup
    country: str | None
    amount_source: AmountFrom
    short_name: str | None = None
    parent: str | None = None
    funder_ids: frozenset[str] = frozenset()
    pubmed_patterns: tuple[re.Pattern[str], ...] = ()
    name_patterns: tuple[re.Pattern[str], ...] = ()  # whole funder names, for a sighting without an ID
    number_prefixes: tuple[str, ...] = ()
    number_pattern: re.Pattern[str] | None = None
    year_prefix: bool = False
    default_category: GrantCategory = "other"
    category_rules: tuple[tuple[GrantCategory, str, re.Pattern[str]], ...] = ()  # (category, field, pattern)

    @property
    def us_federal(self) -> bool:
        """Keyed `USA:<AGENCY>:…` and valued by USAspending (§6.9)."""
        return self.amount_source == "usaspending"

    def fits(self, number: str) -> bool:
        """Whether a normalised number fits the agency's configured pattern (any, without one)."""
        return self.number_pattern is None or bool(self.number_pattern.fullmatch(number))


@dataclass(frozen=True)
class NotGrant:
    reason: str
    pattern: re.Pattern[str] | None = None
    string: str | None = None  # compared by `override_match_key`


@dataclass(frozen=True)
class FacilityContract:
    number: str
    tails: tuple[str, ...]
    reason: str


@dataclass(frozen=True)
class Programme:
    """An NSF programme that makes an award institution-wide, matched on the NSF API's name."""

    name: str
    pattern: re.Pattern[str]
    reason: str


@dataclass(frozen=True)
class FundingRules:
    """`config/funding.yaml`, compiled, and the resource code from `rules.yaml` (§8.4)."""

    resource_code: str
    ics: frozenset[str]
    partners: Mapping[str, frozenset[str]]
    categories_exact: Mapping[str, GrantCategory]
    categories_prefix: tuple[tuple[str, GrantCategory], ...]  # longest prefix first
    agencies: Mapping[str, Agency]
    by_funder_id: Mapping[str, str]
    not_grants: tuple[NotGrant, ...]
    facility_contracts: tuple[FacilityContract, ...]
    facility_patterns: tuple[tuple[re.Pattern[str], str], ...]
    institution_wide: Mapping[str, str]
    nsf_programmes: tuple[Programme, ...]
    openalex_excluded: frozenset[str]
    openalex_multipliers: Mapping[str, Decimal] = field(default_factory=dict)
    large_award_review_usd: int = 20_000_000
    total_drop_alert: float = 0.05

    @classmethod
    def from_config(cls, funding: Mapping[str, Any], resource_code: str) -> "FundingRules":
        nih = funding["nih"]
        exact: dict[str, GrantCategory] = {}
        prefix: list[tuple[str, GrantCategory]] = []
        for category, codes in nih["categories"].items():
            for code in codes:
                if code.endswith("*"):
                    prefix.append((code[:-1], cast(GrantCategory, category)))
                else:
                    exact[code] = cast(GrantCategory, category)
        agencies = {entry["code"]: _agency(entry) for entry in funding["agencies"]}
        by_funder_id: dict[str, str] = {}
        for agency in agencies.values():
            for identifier in agency.funder_ids:
                by_funder_id[identifier] = agency.code
        not_grants = tuple(
            NotGrant(
                entry["reason"],
                re.compile(entry["pattern"]) if "pattern" in entry else None,
                override_match_key(entry["string"]) if "string" in entry else None,
            )
            for entry in funding["not_grants"]
        )
        facility = tuple(
            FacilityContract(entry["number"], tuple(alnum(t) for t in entry["tails"]), entry["reason"])
            for entry in funding["facility_contracts"]
            if "number" in entry
        )
        facility_patterns = tuple(
            (re.compile(entry["pattern"]), entry["reason"])
            for entry in funding["facility_contracts"]
            if "pattern" in entry
        )
        wide = funding["institution_wide"]
        amounts = funding["openalex_amounts"]
        return cls(
            resource_code=alnum(resource_code),
            ics=frozenset(nih["ics"]),
            partners=phase_partners(nih["phase_pairs"]),
            categories_exact=exact,
            categories_prefix=tuple(sorted(prefix, key=lambda pair: -len(pair[0]))),
            agencies=agencies,
            by_funder_id=by_funder_id,
            not_grants=not_grants,
            facility_contracts=facility,
            facility_patterns=facility_patterns,
            institution_wide={entry["key"]: entry["reason"] for entry in wide["keys"]},
            nsf_programmes=tuple(
                Programme(entry["name"], re.compile(entry["pattern"]), entry["reason"])
                for entry in wide["nsf_programmes"]
            ),
            openalex_excluded=frozenset(amounts["exclude_provenance"]),
            openalex_multipliers={
                entry["provenance"]: Decimal(str(entry["multiply"])) for entry in amounts["corrections"]
            },
            large_award_review_usd=int(funding["large_award_review_usd"]),
            total_drop_alert=float(funding["total_drop_alert"]),
        )


def _agency(entry: Mapping[str, Any]) -> Agency:
    identifiers = {funder_id(value) for value in [*entry["openalex_funders"], *entry["crossref_funder_dois"]]}
    pattern = entry.get("number_pattern")
    categories = entry.get("categories") or {}
    names = entry.get("funder_names") or []
    if names and ID_ONLY & {entry["code"], entry.get("parent")}:
        raise ValueError(f"{entry['code']}: NIH, HHS and PHS are named by funder ID and PubMed alone (§6.4)")
    for name in names:
        if name != name.casefold():
            raise ValueError(f"{entry['code']}: funder name pattern {name!r} is not written casefolded")
    return Agency(
        code=entry["code"],
        name=entry["name"],
        group=entry["group"],
        country=entry.get("country"),
        amount_source=entry["amount_source"],
        short_name=entry.get("short_name"),
        parent=entry.get("parent"),
        funder_ids=frozenset(identifier for identifier in identifiers if identifier),
        pubmed_patterns=tuple(re.compile(p) for p in entry["pubmed_agency_patterns"]),
        name_patterns=tuple(re.compile(name) for name in names),
        number_prefixes=tuple(entry["number_prefixes"]),
        number_pattern=re.compile(pattern) if pattern else None,
        year_prefix=bool(entry["year_prefix"]),
        default_category=categories.get("default", "other"),
        category_rules=tuple(
            (rule["category"], rule["field"], re.compile(rule["pattern"]))
            for rule in categories.get("match", [])
        ),
    )


# --- Not funding (§6.12-6.14) ----------------------------------------------------------------


def is_resource_code(item: str, rules: FundingRules) -> bool:
    """UWPR's own code, however written: never a grant (F1, §6.13)."""
    return bool(rules.resource_code) and rules.resource_code in alnum(item)


def not_a_grant(item: str, rules: FundingRules) -> str | None:
    """The reason an item is positively not a grant, or None (§6.12).

    Patterns and strings match the whole item, never a part: `K99/R00 1K99HL103768-01` is a
    number, `K99/R00` a mechanism name.
    """
    text = clean(item)
    key = override_match_key(text)
    for entry in rules.not_grants:
        if entry.string is not None and entry.string == key:
            return entry.reason
        if entry.pattern is not None and entry.pattern.fullmatch(text):
            return entry.reason
    return None


def facility_contract(item: str, rules: FundingRules) -> str | None:
    """The DOE facility (M&O) contract an item names, by number, tail or the `DE-AC` pattern.

    O written for 0 and any separators are tolerated: `76RLO 1830` is PNNL's `76RL01830`.
    """
    text = clean(item).upper()
    compact = alnum(text).replace("O", "0")
    for contract in rules.facility_contracts:
        number = alnum(contract.number).replace("O", "0")
        if number in compact or any(tail.replace("O", "0") in compact for tail in contract.tails):
            return contract.number
    for pattern, _ in rules.facility_patterns:
        if pattern.search(text):
            return "DE-AC"
    return None


# --- Whose it is (§6.4) -----------------------------------------------------------------------


def funder_name_key(name: str) -> str:
    """A funder's name as `funder_names` patterns see it: NFKC, casefolded, whitespace collapsed,
    and the punctuation around it trimmed, brackets apart (`(NSF)` keeps both)."""
    text = " ".join(unicodedata.normalize("NFKC", name).casefold().split())
    start, end = 0, len(text)
    while start < end and _trimmed(text[start]):
        start += 1
    while end > start and _trimmed(text[end - 1]):
        end -= 1
    return text[start:end]


def _trimmed(char: str) -> bool:
    category = unicodedata.category(char)
    return char == " " or (category.startswith("P") and category not in ("Ps", "Pe"))


def named_agencies(
    funder_ids: Iterable[str | None],
    pubmed_agencies: Iterable[str | None],
    rules: FundingRules,
    names: Iterable[str | None] = (),
) -> frozenset[str]:
    """The configured agencies (NIH among them) that a string's sources name.

    By funder ID and PubMed's `Agency`; and by `names`, the funder names of sightings that carry
    no funder ID, each matched whole against the agencies' `funder_names` (§6.4). An agency named
    by its name counts exactly as one named by ID. A name given beside an ID is the caller's to
    leave out: the ID decides.
    """
    named = {rules.by_funder_id[i] for i in map(funder_id, funder_ids) if i and i in rules.by_funder_id}
    for agency_text in pubmed_agencies:
        if not agency_text:
            continue
        for agency in rules.agencies.values():
            if any(pattern.search(agency_text) for pattern in agency.pubmed_patterns):
                named.add(agency.code)
    for key in {funder_name_key(name) for name in names if name}:
        for agency in rules.agencies.values():
            if any(pattern.fullmatch(key) for pattern in agency.name_patterns):
                named.add(agency.code)
    return frozenset(named)


def unconfigured_funders(funder_ids: Iterable[str | None], rules: FundingRules) -> frozenset[str]:
    """OpenAlex funders named that no configured agency claims (§6.1 step 10)."""
    return frozenset(
        identifier
        for identifier in map(funder_id, funder_ids)
        if identifier and identifier.startswith("F") and identifier not in rules.by_funder_id
    )


def choose_agency(named: Iterable[str], number_for: Mapping[str, str], rules: FundingRules) -> str | None:
    """The one agency a string belongs to once NIH has declined it (§6.4), or None.

    `number_for` maps each named agency to the string's number as that agency normalises it.
    An agency whose configured pattern the number does not fit is out; among several that fit,
    those with a pattern it fits beat those with none. Anything but exactly one is None, and the
    string goes to Miscellaneous.
    """
    codes = sorted(code for code in set(named) if code != NIH and code in rules.agencies)
    candidates = [rules.agencies[code] for code in codes]
    fitting = [agency for agency in candidates if agency.fits(number_for.get(agency.code, ""))]
    if len(fitting) > 1:
        fitting = [agency for agency in fitting if agency.number_pattern is not None]
    return fitting[0].code if len(fitting) == 1 else None


# --- What a grant is (§11.4, §6.15) ---------------------------------------------------------


def nih_category(activity: str | None, rules: FundingRules) -> GrantCategory:
    """An NIH grant's category from its activity code (§11.4); contracts are `contract`."""
    if not activity:
        return "other"
    if activity in rules.categories_exact:
        return rules.categories_exact[activity]
    for prefix, category in rules.categories_prefix:
        if activity.startswith(prefix):
            return category
    return "other"


def agency_category(agency: Agency | None, values: Mapping[str, str | None]) -> GrantCategory:
    """Another agency's grant's category, from the agency's configured rules (§11.4).

    `values` holds the facts the rules match on, by field: for NSF, `programme` (the NSF API's
    programme name) and `type` (its award type, "Fellowship Award"). An agency without rules
    gives `other`.
    """
    if agency is None:
        return "other"
    for category, field_name, pattern in agency.category_rules:
        if pattern.search(values.get(field_name) or ""):
            return category
    return agency.default_category


def institution_wide(key: str, nsf_programme: str | None, rules: FundingRules) -> str | None:
    """Why a grant is institution-wide, or None (§6.15): an explicit key, or an NSF programme."""
    if key in rules.institution_wide:
        return rules.institution_wide[key]
    if key.startswith("NSF:") and nsf_programme:
        for programme in rules.nsf_programmes:
            if programme.pattern.search(nsf_programme):
                return programme.reason
    return None
