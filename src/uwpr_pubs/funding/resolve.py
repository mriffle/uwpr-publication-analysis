"""From the strings a work lists to its grants (docs/09 §6, §9.1). Pure, in two passes.

1. `plan_lookups` lists what the shell must ask: RePORTER's exact cores and phase partners,
   contracts and task orders, NSF award IDs, USAspending award IDs with their O/0 and I/1
   swaps, and OpenAlex award IDs. Called again with the first round's answers, it adds the
   institute-and-serial probes only those answers show are needed: a bare serial the work's own
   listings do not cover, and the institute and serial of a number RePORTER did not hold.
2. `resolve_work` decides every string in §6.1's order, from the sightings, the work's NIH
   links, its grant overrides, and an explicit record of what the sources said (`Answers`).

`Answers` must answer everything the plan listed. Anything missing reads as "the source does
not hold it", so a caller whose source failed carries the stored funding forward rather than
resolving with partial answers (§9.4).
"""

import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field, replace

from uwpr_pubs.funding.classify import (
    NIH,
    Agency,
    FundingRules,
    choose_agency,
    facility_contract,
    funder_id,
    is_resource_code,
    named_agencies,
    not_a_grant,
    unconfigured_funders,
)
from uwpr_pubs.funding.numbers import (
    CONTRACT_FAMILY,
    MISC,
    NSF_DIGITS,
    SERIAL_DIGITS,
    Contract,
    NihNumber,
    agency_number,
    clean,
    fragments,
    grant_key,
    is_normalised,
    misc_key,
    near_miss,
    nsf_number,
    parse_contracts,
    parse_nih,
    split_list,
    strip_labels,
    swap_variants,
)
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.store.models import FundingMethod, FundingOutcome, FundingSource, GrantFamily

SOURCES: tuple[FundingSource, ...] = ("openalex", "crossref", "pubmed", "jats")
_CORE = re.compile(r"^([A-Z][A-Z0-9]{2})([A-Z]{2})([0-9]{6})$")


@dataclass(frozen=True)
class Sighting:
    """One source's statement that a work lists a string (§6.1)."""

    raw: str
    source: FundingSource
    funder: str | None = None  # the funder's name, as the source gives it; decides only without an ID
    funder_id: str | None = None  # an OpenAlex funder ID or a Crossref funder DOI, in any form
    pubmed_agency: str | None = None  # PubMed's `Agency`
    award_id: str | None = None  # the OpenAlex award (`G…`), kept for amounts only (F11)


@dataclass(frozen=True)
class Answers:
    """What the sources said, for everything `plan_lookups` listed.

    `reporter` holds every core RePORTER holds among those asked or found — exact cores, phase
    partners, the cores under a probed institute and serial, and the work's linked cores — with
    its `agency_code`, which prefixes the key (`VA:I01BX000531`).
    """

    reporter: Mapping[str, str] = field(default_factory=dict)
    reporter_splits: Mapping[tuple[str, str], tuple[str, ...]] = field(default_factory=dict)
    task_orders: Mapping[str, str] = field(default_factory=dict)  # task order → its IDIQ contract
    nsf: frozenset[str] = frozenset()  # award IDs the NSF API knows
    usaspending: frozenset[tuple[str, str]] = frozenset()  # (agency code, award ID) it knows


@dataclass(frozen=True)
class Lookups:
    """What the shell must ask before `resolve_work` can decide."""

    reporter_cores: frozenset[str] = frozenset()
    reporter_splits: frozenset[tuple[str, str]] = frozenset()
    contracts: frozenset[str] = frozenset()
    nsf: frozenset[str] = frozenset()
    usaspending: frozenset[tuple[str, str]] = frozenset()
    openalex_awards: frozenset[str] = frozenset()

    def __or__(self, other: "Lookups") -> "Lookups":
        return Lookups(
            self.reporter_cores | other.reporter_cores,
            self.reporter_splits | other.reporter_splits,
            self.contracts | other.contracts,
            self.nsf | other.nsf,
            self.usaspending | other.usaspending,
            self.openalex_awards | other.openalex_awards,
        )


@dataclass(frozen=True)
class StringOutcome:
    """One string on one work, and what it lists (a `citations.jsonl` string, §8.3)."""

    raw: str
    sources: tuple[FundingSource, ...]
    funders: tuple[str, ...]
    outcome: FundingOutcome
    method: FundingMethod | None  # None when no rule made a grant of it: a not-grant, the resource code
    grants: tuple[str, ...]
    note: str | None = None
    openalex_awards: tuple[str, ...] = ()
    written: tuple[str, ...] = ()  # every form the sources wrote it in, whitespace collapsed


@dataclass(frozen=True)
class WorkFunding:
    strings: tuple[StringOutcome, ...]
    links: tuple[tuple[str, str], ...]  # (core, grant key) for each NIH link, by core
    grants: tuple[str, ...]  # the strings' grants and the links', sorted (invariant F3)


@dataclass
class _Item:
    """One string on a work, pooled across the sightings that write it the same way."""

    raw: str
    text: str
    nih: tuple[NihNumber, ...]
    contracts: tuple[Contract, ...]
    written: tuple[str, ...] = ()  # every form pooled into it, as written
    sources: set[FundingSource] = field(default_factory=set)
    funders: set[str] = field(default_factory=set)
    funder_ids: set[str] = field(default_factory=set)
    pubmed: set[str] = field(default_factory=set)
    unidentified: set[str] = field(default_factory=set)  # funders named without an ID, by name alone
    awards: set[str] = field(default_factory=set)

    def named(self, rules: FundingRules) -> frozenset[str]:
        """The configured agencies its sources name (§6.4)."""
        return named_agencies(self.funder_ids, self.pubmed, rules, self.unidentified)

    @property
    def full(self) -> list[NihNumber]:
        return [number for number in self.nih if number.full and not number.is_contract]

    @property
    def bare(self) -> list[NihNumber]:
        return [number for number in self.nih if not number.full]

    @property
    def is_contract(self) -> bool:
        return bool(self.contracts) or any(number.is_contract for number in self.nih)


@dataclass(frozen=True)
class _Decision:
    outcome: FundingOutcome
    method: FundingMethod | None
    grants: tuple[str, ...] = ()
    note: str | None = None
    agency: str | None = None  # the agency and number an agency's grant stands on, for §6.10
    number: str | None = None


class _Unset:
    """No override applies (None means the override says "not a grant")."""


_UNSET = _Unset()
_NO_OVERRIDES: Mapping[str, str | None] = {}


def _override_for(raw: str, overrides: Mapping[str, str | None]) -> str | _Unset | None:
    for candidate in (raw, clean(raw)):
        key = override_match_key(candidate)
        if key in overrides:
            return overrides[key]
    return _UNSET


def string_key(piece: str) -> str:
    """What one string on a work is pooled by: its `override_match_key` once cleaned (§6.1, §6.6).

    The stage matches a stored string to this run's sightings by the same key, so a string
    written a new way is still the string it was.
    """
    return override_match_key(clean(piece))


def pieces(raw: str, overrides: Mapping[str, str | None] | None = None) -> list[str]:
    """A sighting's strings: its list split (§6.1), unless an override names it whole."""
    whole = " ".join(raw.split())
    return split_list(whole) if isinstance(_override_for(whole, overrides or {}), _Unset) else [whole]


def _pool(
    sightings: Iterable[Sighting], overrides: Mapping[str, str | None], rules: FundingRules
) -> list[_Item]:
    """The work's strings, split into items (§6.1) and pooled by `string_key`.

    Case, spacing, dashes, droppable parentheses and trailing punctuation do not make two
    strings: `NRF-2016R1A5A1010764` in one source and the same with a Unicode hyphen in another are
    one string, named by both sources' funders. The item is shown as its most frequent written
    form (the first in sort order on a tie), which is also what an override is matched on. A
    string an override names whole is not split, so an override can name a list. PubMed's
    `Agency` is shown among the funders, as the source names it, but decides only as PubMed's
    agency (§6.4).
    """
    pooled: dict[str, tuple[Counter[str], list[Sighting]]] = {}
    for sighting in sightings:
        for piece in pieces(sighting.raw, overrides):
            forms, seen = pooled.setdefault(string_key(piece), (Counter(), []))
            forms[piece] += 1
            seen.append(sighting)
    items: list[_Item] = []
    for forms, seen in pooled.values():
        raw = min(forms, key=lambda form: (-forms[form], form))
        text = clean(raw)
        item = _Item(
            raw, text, parse_nih(text, rules.ics), parse_contracts(text), written=tuple(sorted(forms))
        )
        for sighting in seen:
            item.sources.add(sighting.source)
            if sighting.funder:
                item.funders.add(" ".join(sighting.funder.split()))
                if funder_id(sighting.funder_id) is None:
                    item.unidentified.add(sighting.funder)
            if sighting.funder_id:
                item.funder_ids.add(sighting.funder_id)
            if sighting.pubmed_agency:
                item.pubmed.add(sighting.pubmed_agency)
                item.funders.add(" ".join(sighting.pubmed_agency.split()))
            if sighting.award_id:
                item.awards.add(sighting.award_id.rsplit("/", 1)[-1])
        items.append(item)
    return sorted(items, key=lambda item: item.raw)


def core_key(core: str, agency_code: str = NIH) -> str:
    """A RePORTER core's grant key: `NIH:R01GM086688`, `VA:I01BX000531`, and a contract under
    its own family (`NIH-contract:N01HV028179`).

    A contract whose core RePORTER truncated (`27220170005`) cannot be keyed from it: the shell
    restores the contract's number from its project number first (§5.1).
    """
    match = _CORE.match(core)
    if match is None:
        raise ValueError(f"not a core project number: {core!r} (restore a contract's number first)")
    if match.group(1).startswith("N"):
        return grant_key(CONTRACT_FAMILY, core)
    return grant_key(agency_code, core)


_FAMILIES: Mapping[str, GrantFamily] = {MISC: "miscellaneous", "NSF": "nsf", "USA": "us_federal"}


def family(key: str, rules: FundingRules) -> GrantFamily:
    """Which of §8.2's families a key is in, which says where its facts and amount come from."""
    prefix, _, rest = key.partition(":")
    agency = rules.agencies.get(prefix)
    if prefix in _FAMILIES:
        return _FAMILIES[prefix]
    if prefix == CONTRACT_FAMILY:
        return "nih_task_order" if ":" in rest else "nih_contract"
    if re.fullmatch(r"F[0-9]+", prefix):
        return "openalex_funder"
    if agency is not None and agency.amount_source == "openalex":
        return "agency"
    return "reporter"  # RePORTER's agency code: NIH, VA and the like


def _describe(fixes: Iterable[str]) -> str | None:
    return "; ".join(dict.fromkeys(fixes)) or None


# --- Steps 1-4: before any source is asked (§6.12-6.14, §6.6) -------------------------------


def _before_sources(
    item: _Item, rules: FundingRules, overrides: Mapping[str, str | None]
) -> _Decision | None:
    if is_resource_code(item.text, rules):
        return _Decision("resource_code", None, note="UWPR's own code: evidence of use, never a grant (F1)")
    reason = not_a_grant(item.text, rules)
    if reason is not None:
        return _Decision("not_a_grant", None, note=reason)
    contract = facility_contract(item.text, rules)
    if contract is not None:
        return _Decision("facility_contract", None, note=f"a DOE facility contract, {contract} (F5)")
    override = _override_for(item.raw, overrides)
    if isinstance(override, _Unset):
        return None
    if override is None:
        return _Decision("not_a_grant", "override", note="a grant override: not a grant")
    outcome: FundingOutcome = "unresolved" if override.startswith("MISC:") else "grant"
    return _Decision(outcome, "override", (override,), note="a grant override")


# --- Step 5: contracts and task orders (§6.7) -----------------------------------------------


def _contracts(items: Sequence[_Item], answers: Answers) -> dict[str, _Decision]:
    """An IDIQ contract and a task order on one work pair up and list the task order; a task
    order alone takes the IDIQ its RePORTER rows name; an IDIQ alone lists the whole contract."""
    every = [contract for item in items for contract in item.contracts]
    idiqs = sorted({contract.number for contract in every if contract.kind == "idiq"})
    orders = sorted({contract.number for contract in every if contract.kind == "task_order"})
    under: dict[str, str | None] = {
        order: answers.task_orders.get(order) or (idiqs[0] if len(idiqs) == 1 else None) for order in orders
    }

    def order_key(order: str) -> str:
        idiq = under[order]
        return grant_key(CONTRACT_FAMILY, idiq, order) if idiq else grant_key(CONTRACT_FAMILY, order)

    decided: dict[str, _Decision] = {}
    for item in items:
        keys: set[str] = set()
        for contract in item.contracts:
            if contract.kind == "task_order":
                keys.add(order_key(contract.number))
            else:
                ordered = [order_key(order) for order, idiq in under.items() if idiq == contract.number]
                keys |= set(ordered) if ordered else {grant_key(CONTRACT_FAMILY, contract.number)}
        keys |= {grant_key(CONTRACT_FAMILY, n.cores()[0]) for n in item.nih if n.is_contract}
        fixes = [fix for number in item.nih if number.is_contract for fix in number.fixes]
        method: FundingMethod = "normalised" if is_normalised(fixes) else "exact"
        decided[item.raw] = _Decision(
            "grant", method, tuple(sorted(keys)), _describe(["an NIH contract", *fixes])
        )
    return decided


# --- Step 6: NIH (§6.2-6.5) -----------------------------------------------------------------


def _held(number: NihNumber, serial: str, answers: Answers, rules: FundingRules) -> list[str]:
    """The cores RePORTER holds under the number's activity code or its phase partners."""
    activity = number.activity or ""
    codes = [activity, *sorted(rules.partners.get(activity, ()))]
    return [core for code in codes if (core := f"{code}{number.ic}{serial}") in answers.reporter]


def _accept_full(number: NihNumber, answers: Answers, rules: FundingRules) -> tuple[list[str], str | None]:
    """The cores an activity-coded number lists (§6.3), or none and why.

    Of a long serial's head and tail, the one RePORTER holds wins; if both are held they are
    different serials, not phases of one award, so neither is listed.
    """
    accepted = [held for serial in number.serials if (held := _held(number, serial, answers, rules))]
    if len(accepted) == 1:
        return accepted[0], None
    if accepted:
        both = ", ".join(core for held in accepted for core in held)
        return [], f"ambiguous: its serial's head and tail both match ({both})"
    return [], None


def _refused(number: NihNumber, answers: Answers) -> str | None:
    """§6.3's refusal made visible: its institute and serial match a core of another activity."""
    others = sorted(
        core
        for serial in number.serials
        for core in answers.reporter_splits.get((number.ic, serial), ())
        if core[:3] != number.activity
    )
    if not others:
        return None
    return f"its institute and serial match {', '.join(others)}, whose activity code disagrees: refused"


def _near_misses(number: NihNumber, linked: Iterable[str], rules: FundingRules) -> list[str]:
    """§6.5: the cores NIH links to the work, same institute, that the written number nearly is.

    Clause 1: the same activity code (or a phase partner) and a serial one edit from the
    written digits. Clause 2: the same zero-filled serial under a different activity code.
    """
    partners = rules.partners.get(number.activity or "", frozenset())
    matches: list[str] = []
    for core in sorted(set(linked)):
        parts = _CORE.match(core)
        if parts is None or parts.group(2) != number.ic:
            continue
        activity, serial = parts.group(1), parts.group(3)
        same = activity == number.activity or activity in partners
        if (same and near_miss(number.written, serial)) or (not same and serial in number.serials):
            matches.append(core)
    return matches


def _one_award(cores: Sequence[str], rules: FundingRules) -> bool:
    """Whether the cores are one award: a single core, or phases sharing institute and serial."""
    if len({core[3:] for core in cores}) != 1:
        return False
    codes = [core[:3] for core in cores]
    return all(b in rules.partners.get(a, frozenset()) for i, a in enumerate(codes) for b in codes[i + 1 :])


# --- Steps 7-11: other agencies (§6.4, §6.8-6.11) ------------------------------------------


def _plain(item: _Item, agency: Agency, data_year: int) -> str:
    return agency_number(
        item.text,
        agency.number_prefixes,
        year_prefix=agency.year_prefix,
        data_year=data_year,
        drop_sub_award=agency.us_federal,
    )


def _numbers_for(item: _Item, codes: Iterable[str], rules: FundingRules, data_year: int) -> dict[str, str]:
    """The item's number as each named agency normalises it (NSF: its seven digits, if any)."""
    numbers: dict[str, str] = {}
    for code in codes:
        agency = rules.agencies[code]
        if agency.amount_source == "nsf":
            numbers[code] = nsf_number(item.text, agency.number_prefixes) or _plain(item, agency, data_year)
        else:
            numbers[code] = _plain(item, agency, data_year)
    return numbers


def _misc(number: str, note: str) -> _Decision:
    key = misc_key(number)
    if key is None:
        return _Decision("not_a_grant", None, note="no letter or digit to key it by")
    return _Decision("unresolved", "miscellaneous", (key,), note)


def _agency_decision(agency: Agency, number: str, item: _Item, answers: Answers, data_year: int) -> _Decision:
    if agency.amount_source == "nsf":
        if len(number) == NSF_DIGITS and number.isdigit() and number in answers.nsf:
            return _Decision("grant", "agency_number", (grant_key("NSF", number),))
        plain = _plain(item, agency, data_year)
        return _misc(plain, "not an award the NSF API knows, and NSF's registry is complete (§6.8)")
    if agency.us_federal:
        if (agency.code, number) not in answers.usaspending:
            known = [v for v in swap_variants(number) if (agency.code, v) in answers.usaspending]
            if len(known) == 1:
                note = f"{number} is not an award USAspending knows, and {known[0]} is (O for 0, I for 1)"
                key = grant_key("USA", agency.code, known[0])
                return _Decision("grant", "normalised", (key,), note, agency=agency.code, number=known[0])
        key = grant_key("USA", agency.code, number)
        return _Decision("grant", "agency_number", (key,), agency=agency.code, number=number)
    return _Decision(
        "grant", "agency_number", (grant_key(agency.code, number),), agency=agency.code, number=number
    )


def _other_agency(
    item: _Item, answers: Answers, rules: FundingRules, data_year: int, note: str | None
) -> _Decision:
    """Everything NIH did not resolve: whose it is (§6.4), then that agency's number."""
    if item.full:
        return _misc(item.full[0].number, note or "an NIH-format number RePORTER does not hold")
    named = item.named(rules)
    others = sorted(code for code in named if code != NIH and code in rules.agencies)
    if others:
        numbers = _numbers_for(item, others, rules, data_year)
        chosen = choose_agency(others, numbers, rules)
        if chosen is not None:
            return _agency_decision(rules.agencies[chosen], numbers[chosen], item, answers, data_year)
        why = "several agencies named" if len(others) > 1 else "not a number of the agency named"
        return _misc(strip_labels(item.text), f"{why} ({', '.join(others)})")
    if NIH in named:
        return _misc(strip_labels(item.text), note or "named as NIH's, but RePORTER holds no such grant")
    funders = sorted(unconfigured_funders(item.funder_ids, rules))
    number = agency_number(item.text, data_year=data_year)
    if len(funders) == 1 and number:
        note = f"a funder no agency is configured for ({funders[0]})"
        return _Decision(
            "grant", "openalex_award", (grant_key(funders[0], number),), note, funders[0], number
        )
    return _misc(strip_labels(item.text), "no configured agency, and no one OpenAlex funder, is named")


def _agency_numbers(keys: Iterable[str], rules: FundingRules) -> Iterator[tuple[str, str, str]]:
    """(agency, number, key) for each key §6.10 compares: another agency's or an OpenAlex funder's."""
    for key in keys:
        kind = family(key, rules)
        segments = key.split(":")
        if kind in ("agency", "openalex_funder") and len(segments) == 2:  # noqa: PLR2004
            yield segments[0], segments[1], key
        elif kind == "us_federal" and len(segments) == 3:  # noqa: PLR2004
            yield segments[1], segments[2], key


def _apply_fragments(
    decided: dict[str, _Decision], rules: FundingRules, standing: Iterable[str] = ()
) -> None:
    """§6.10: on one work, a number that is part of a longer one of the same agency lists it.

    `standing` are keys the work's other strings list as the store holds them, for strings no
    source showed this run: a whole number is still in the work's company when only its
    fragment's source was read.
    """
    by_agency: dict[str, dict[str, str]] = {}
    for agency, number, key in _agency_numbers(standing, rules):
        by_agency.setdefault(agency, {})[number] = key
    for decision in decided.values():
        if decision.agency and decision.number:
            by_agency.setdefault(decision.agency, {})[decision.number] = decision.grants[0]
    for raw, decision in list(decided.items()):
        keyed = by_agency.get(decision.agency or "", {})
        wholes = fragments(keyed).get(decision.number or "")
        if wholes:
            keys = tuple(sorted(keyed[whole] for whole in wholes))
            decided[raw] = replace(
                decision, grants=keys, note=f"a fragment of {', '.join(wholes)} on this work"
            )


# --- Resolution ------------------------------------------------------------------------------


@dataclass
class _Work:
    items: list[_Item]
    link_keys: dict[str, str]
    answers: Answers
    rules: FundingRules
    decided: dict[str, _Decision] = field(default_factory=dict)
    notes: dict[str, str] = field(default_factory=dict)
    missed: dict[str, list[NihNumber]] = field(default_factory=dict)

    def open(self) -> list[_Item]:
        return [item for item in self.items if item.raw not in self.decided]

    def full_numbers(self) -> None:
        """Step 6 for activity-coded numbers: exact, a parse fix, or a phase partner (§6.3)."""
        for item in self.open():
            if not item.full or item.is_contract:
                continue
            keys: set[str] = set()
            fixes: list[str] = []
            for number in item.full:
                cores, problem = _accept_full(number, self.answers, self.rules)
                if not cores:
                    self.missed.setdefault(item.raw, []).append(number)
                    if problem:
                        self.notes[item.raw] = problem
                    continue
                keys |= {core_key(core, self.answers.reporter[core]) for core in cores}
                fixes += number.fixes
                if len(cores) > 1:
                    fixes.append(f"lists every phase RePORTER holds ({', '.join(cores)})")
            if keys:
                method: FundingMethod = "normalised" if is_normalised(fixes) else "exact"
                self.decided[item.raw] = _Decision("grant", method, tuple(sorted(keys)), _describe(fixes))
                self.missed.pop(item.raw, None)

    def listed(self) -> dict[str, str]:
        """The cores the work already lists, by an NIH link or another string (§6.3)."""
        cores = dict(self.link_keys)
        for decision in self.decided.values():
            for key in decision.grants:
                family, _, core = key.partition(":")
                if family != CONTRACT_FAMILY and _CORE.match(core):
                    cores[core] = key
        return cores

    def bare_numbers(self) -> None:
        """An institute and serial alone: the cores with them the work already lists; failing
        that, the one core RePORTER holds under a serial written with all six digits."""
        listed = self.listed()
        for item in self.open():
            if item.raw in self.missed or not item.bare:
                continue
            keys: set[str] = set()
            for number in item.bare:
                same = {
                    key
                    for core, key in listed.items()
                    if core[3:5] == number.ic and core[5:] in number.serials
                }
                if not same and len(number.written) == SERIAL_DIGITS:
                    held = self.answers.reporter_splits.get((number.ic, number.serials[0]), ())
                    if len(held) == 1:
                        same = {core_key(held[0], self.answers.reporter.get(held[0], NIH))}
                keys |= same
            if keys:
                fixes = [fix for number in item.bare for fix in number.fixes]
                self.decided[item.raw] = _Decision(
                    "grant", "normalised", tuple(sorted(keys)), _describe(fixes)
                )

    def corrections(self) -> None:
        """§6.5: exactly one near-miss among the cores NIH links to this work."""
        for item in self.open():
            for number in self.missed.get(item.raw, []):
                matches = _near_misses(number, self.link_keys, self.rules)
                if matches and _one_award(matches, self.rules):
                    keys = tuple(sorted(self.link_keys[core] for core in matches))
                    linked = ", ".join(matches)
                    note = f"{number.number} is not a core RePORTER holds; NIH links this paper to {linked}"
                    self.decided[item.raw] = _Decision("grant", "corrected", keys, note)
                    break
                if matches:
                    self.notes[item.raw] = (
                        f"several near-misses NIH links to this paper: {', '.join(matches)}"
                    )
                elif item.raw not in self.notes:
                    refused = _refused(number, self.answers)
                    if refused:
                        self.notes[item.raw] = refused


def resolve_work(  # noqa: PLR0913 - the work's strings, links and overrides, the answers, the rules, the year
    sightings: Iterable[Sighting],
    links: Iterable[str],
    answers: Answers,
    rules: FundingRules,
    *,
    overrides: Mapping[str, str | None] | None = None,
    data_year: int,
    standing: Iterable[str] = (),
) -> WorkFunding:
    """Every string a work lists, decided in §6.1's order, and the work's grants.

    `links` are the cores RePORTER links to the work. `overrides` maps an override's
    `override_match_key` to its grant key, or to None for "not a grant" (§6.6). `standing` are
    the grant keys of the work's strings that no source showed this run, as stored, which the
    stage keeps as they are: they stay in the work's company for §6.10's fragments.
    """
    overrides = overrides or _NO_OVERRIDES
    items = _pool(sightings, overrides, rules)
    link_keys = {core: core_key(core, answers.reporter.get(core, NIH)) for core in sorted(set(links))}
    work = _Work(items, link_keys, answers, rules)
    for item in items:
        before = _before_sources(item, rules, overrides)
        if before is not None:
            work.decided[item.raw] = before
    work.decided.update(_contracts([item for item in work.open() if item.is_contract], answers))
    work.full_numbers()
    work.bare_numbers()
    work.corrections()
    for item in work.open():
        work.decided[item.raw] = _other_agency(item, answers, rules, data_year, work.notes.get(item.raw))
    _apply_fragments(work.decided, rules, standing)

    strings = tuple(_outcome(item, work.decided[item.raw]) for item in items)
    grants = {key for string in strings for key in string.grants} | set(link_keys.values())
    return WorkFunding(strings, tuple(link_keys.items()), tuple(sorted(grants)))


def _outcome(item: _Item, decision: _Decision) -> StringOutcome:
    listed = decision.outcome in ("grant", "unresolved")
    return StringOutcome(
        raw=item.raw,
        sources=tuple(source for source in SOURCES if source in item.sources),
        funders=tuple(sorted(item.funders)),
        outcome=decision.outcome,
        method=decision.method,
        grants=decision.grants,
        note=decision.note,
        openalex_awards=tuple(sorted(item.awards)) if listed else (),
        written=item.written,
    )


# --- Planning --------------------------------------------------------------------------------


def plan_lookups(  # noqa: PLR0913 - as `resolve_work`, with the first round's answers in place of its own
    sightings: Iterable[Sighting],
    links: Iterable[str],
    rules: FundingRules,
    *,
    overrides: Mapping[str, str | None] | None = None,
    data_year: int,
    answers: Answers | None = None,
) -> Lookups:
    """What must be asked to resolve one work (§9.1).

    Without `answers`, the first round. With the first round's answers, the second: the
    institute-and-serial probes only those answers show are needed. The caller subtracts what
    its lookup memo already knows.
    """
    overrides = overrides or _NO_OVERRIDES
    cores: set[str] = set()
    nsf: set[str] = set()
    usa: set[tuple[str, str]] = set()
    awards: set[str] = set()
    contracts: set[str] = set()
    for key in (value for value in overrides.values() if value):
        _plan_key(key, cores, nsf, usa)
    open_items: list[_Item] = []
    for item in _pool(sightings, overrides, rules):
        before = _before_sources(item, rules, overrides)
        if before is not None:
            if before.outcome == "grant":  # an override's grant: its awards value it, as any string's
                awards |= item.awards
            continue
        open_items.append(item)
        awards |= item.awards
        contracts |= {contract.number for contract in item.contracts}
        cores |= {n.cores()[0] for n in item.nih if n.is_contract}
        for number in item.full:
            codes = [number.activity or "", *rules.partners.get(number.activity or "", ())]
            cores |= {core for code in codes for core in number.cores(code)}
        named = item.named(rules)
        others = sorted(code for code in named if code != NIH and code in rules.agencies)
        for code, written in _numbers_for(item, others, rules, data_year).items():
            agency = rules.agencies[code]
            if agency.amount_source == "nsf" and len(written) == NSF_DIGITS and written.isdigit():
                nsf.add(written)
            elif agency.us_federal and written:
                usa |= {(code, variant) for variant in (written, *swap_variants(written))}
    splits = _second_round(open_items, links, answers, rules) if answers is not None else set()
    return Lookups(
        frozenset(cores),
        frozenset(splits),
        frozenset(contracts),
        frozenset(nsf),
        frozenset(usa),
        frozenset(awards),
    )


def _plan_key(key: str, cores: set[str], nsf: set[str], usa: set[tuple[str, str]]) -> None:
    """An override's grant is asked about too, so the stage can say when the source lacks it."""
    family, _, rest = key.partition(":")
    if family == "NSF":
        nsf.add(rest)
    elif family == "USA":
        agency, _, number = rest.partition(":")
        usa.add((agency, number))
    elif family != "MISC" and _CORE.match(rest):
        cores.add(rest)


def _second_round(
    items: Sequence[_Item], links: Iterable[str], answers: Answers, rules: FundingRules
) -> set[tuple[str, str]]:
    listed = set(links)
    unheld: list[NihNumber] = []
    for item in items:
        for number in item.full:
            held, _ = _accept_full(number, answers, rules)
            if held:
                listed |= set(held)
            else:
                unheld.append(number)
    splits = {(number.ic, serial) for number in unheld for serial in number.serials}
    for item in items:
        for number in item.bare:
            covered = any(core[3:5] == number.ic and core[5:] in number.serials for core in listed)
            if not covered and len(number.written) == SERIAL_DIGITS:
                splits.add((number.ic, number.serials[0]))
    return splits
