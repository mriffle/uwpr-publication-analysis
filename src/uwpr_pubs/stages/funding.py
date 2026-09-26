"""Stage 8b: the grants the included works list, and what each is worth (docs/09 §9).

The pure core in `uwpr_pubs.funding` decides; this is the shell around it. Each run the stage
gathers what the sources say each included work lists — its *sightings* — asks NIH RePORTER, the
NSF Award API, USAspending and OpenAlex what `plan_lookups` says must be asked, decides every
string with `resolve_work`, values every grant with `value_grant`, and hands the four files of
`store/funding/` (§8.1) to stage 9, which writes them, and to stage 11, which exports them.

**What is asked, and when (§9.2).** Every run: OpenAlex's awards from the stage-3 payloads, which
cost nothing; RePORTER's links for every PMID; PubMed and Crossref for records the stage has not
read before; JATS once per record (F16); probes for new strings and new keys; and the facts of
grants active within the last year. A **full refresh** reads PubMed and Crossref for every
record, fetches every grant's facts and every OpenAlex award again, and asks again everything it
remembered as a miss. It is due 28 days after the last one, after a `funding_version` change,
or with `--funding full`, and runs only inside RePORTER's window (§9.3) unless forced. Outside
the window RePORTER is asked at most `weekday_request_cap` times, and the rest waits.

**What is remembered.** A miss stays in `lookups.jsonl` until its `recheck_after`, so it is not
asked weekly. A grant a source holds is remembered by its facts in `grants.jsonl`.

**What is kept.** A string a source has shown is never dropped because the source stops showing
it (§9.4): its `last_seen` stops moving. And because PubMed and Crossref are read only for new
records and at a full refresh, and JATS only once, a string is decided afresh only when every
source that has shown it was read in this run. Otherwise it keeps its stored decision, unless
its new one needs no funder at all: an override, a not-grant, the resource code, a facility
contract, or an NIH grant or contract RePORTER resolves (§6.1 steps 1-6). Without that, a string
PubMed and OpenAlex both write would be decided from both at a full refresh and from OpenAlex
alone the week after, and could move between two agencies every month.

**Degradation (§9.4).** Each source degrades on its own and is not asked again this run. A work
whose answers are incomplete — a source down, or a question deferred — keeps its stored line
(a new work gets none yet) rather than being decided on partial answers (`Answers`). A reply of
a changed shape is a source failure like an outage, never an exception: smoke does not block on
these sources (docs/09 §13.2), so this is where a changed shape must be caught.
"""

import datetime as dt
import re
from collections import Counter
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Any, Literal, cast
from zoneinfo import ZoneInfo

from uwpr_pubs.config import Config
from uwpr_pubs.context import RunContext
from uwpr_pubs.evidence import advance_last_seen
from uwpr_pubs.funding.amounts import fiscal_year, parent_rows, reporter_facts, task_order_rows, value_grant
from uwpr_pubs.funding.classify import (
    NIH,
    FundingRules,
    agency_category,
    funder_id,
    institution_wide,
    nih_category,
)
from uwpr_pubs.funding.currency import Rates, decimal_string
from uwpr_pubs.funding.jats import FundingString as JatsString
from uwpr_pubs.funding.jats import funding_strings
from uwpr_pubs.funding.numbers import AGENCY_CODE, CONTRACT_FAMILY, MISC, alnum, grant_key
from uwpr_pubs.funding.overrides import grant_overrides_for
from uwpr_pubs.funding.resolve import (
    Answers,
    Lookups,
    Sighting,
    StringOutcome,
    family,
    pieces,
    plan_lookups,
    resolve_work,
    string_key,
)
from uwpr_pubs.http import HttpClient, HttpError
from uwpr_pubs.report import RunRecorder, adapter_source
from uwpr_pubs.secrets import scrub
from uwpr_pubs.sources import ResultLimitError
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.ncbi import Ncbi, PubmedGrants
from uwpr_pubs.sources.nsf import Nsf
from uwpr_pubs.sources.openalex import ID_BATCH, OpenAlex
from uwpr_pubs.sources.reporter import CORE_BATCH, Reporter
from uwpr_pubs.sources.usaspending import ID_BATCH as USASPENDING_BATCH
from uwpr_pubs.sources.usaspending import UsaSpending
from uwpr_pubs.stages.export import last_full_refresh
from uwpr_pubs.store import io
from uwpr_pubs.store.ids import retired_key
from uwpr_pubs.store.models import (
    Agency,
    AgencyCode,
    Date,
    FundingCitation,
    FundingLookup,
    FundingMethod,
    FundingMode,
    FundingOutcome,
    FundingSource,
    Grant,
    GrantFacts,
    GrantFamily,
    GrantKey,
    Investigator,
    LookupSource,
    NihLink,
    NsfFacts,
    OpenalexAward,
    Record,
    RecordId,
    RunManifest,
    UsaspendingFacts,
    WorkId,
)
from uwpr_pubs.store.models import FundingString as StoredString
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import FundingSnapshot, StoreSnapshot

FundingRequest = Literal["auto", "full", "skip"]
Query = tuple[LookupSource, str]  # (source, question), as `lookups.jsonl` names a probe
Row = dict[str, Any]  # one RePORTER project row, checked by `_reporter_row`

LINKS: Query = ("reporter", "links")
CORE = re.compile(r"^[A-Z][A-Z0-9]{2}[A-Z]{2}[0-9]{6}$")
NSF_AWARD = re.compile(r"^[0-9]{7}$")
OPENALEX_AWARD = re.compile(r"^G[0-9]+$")
TASK_ORDER_DIGITS = re.compile(r"^75[0-9]{10}$")
REPORTER_FAMILIES: frozenset[GrantFamily] = frozenset({"reporter", "nih_contract", "nih_task_order"})
NO_FUNDER_OUTCOMES: frozenset[FundingOutcome] = frozenset(
    {"not_a_grant", "resource_code", "facility_contract"}
)
NIH_METHODS: frozenset[FundingMethod | None] = frozenset({"exact", "normalised", "corrected"})
FORBIDDEN = 403
SATURDAY = 5
# A reply that parses but is not what the stage reads: a changed shape, which degrades the source.
SHAPE_ERRORS = (KeyError, TypeError, ValueError, AttributeError, ArithmeticError, ResultLimitError)
MISC_AGENCY: Agency = {
    "schema": 1,
    "code": MISC,
    "name": "Miscellaneous",
    "short_name": None,
    "parent": None,
    "group": "miscellaneous",
    "country": None,
    "origin": "config",
}


class FundingCheckError(RuntimeError):
    """The stage's own output failed the checks the gate or the export would make (§9.4)."""


@dataclass(frozen=True)
class FundingSources:
    reporter: Reporter
    nsf: Nsf
    usaspending: UsaSpending
    openalex: OpenAlex
    crossref: Crossref
    ncbi: Ncbi


@dataclass(frozen=True)
class WorkInput:
    """One included work, as stage 7 left it, with this run's OpenAlex payloads of its records."""

    id: WorkId
    year: int | None  # its canonical record's, which the export's first years use (§4)
    records: tuple[Record, ...]
    payloads: Mapping[RecordId, Mapping[str, Any]]


@dataclass(frozen=True)
class FundingResult:
    """What the stage hands on: the four files' lines, and what the manifest records (§9.6)."""

    funding: FundingSnapshot
    mode: FundingMode | None  # None when funding is disabled: the manifest then says nothing more
    refreshed: Date | None  # the last full refresh, which the export's `as_of` names
    requests: Mapping[str, int] = field(default_factory=dict)
    resolved: bool = False  # the stage decided the works afresh, rather than carrying them

    def manifest(self) -> dict[str, Any] | None:
        """The manifest's funding fields (§9.6): what the total-drop alert compares run to run.

        The total is every known US-dollar amount, never below zero, which the run schema refuses:
        a manifest that fails it would stop the next run at stage 0.
        """
        if self.mode is None:
            return None
        known = [g["amount"]["usd"] for g in self.funding.grants.values() if g["amount"] is not None]
        return {
            "mode": self.mode,
            "grants": len(self.funding.grants),
            "amount_usd": max(0, sum(usd for usd in known if usd is not None)),
            "requests": {source: count for source, count in sorted(self.requests.items()) if count},
        }


# --- small pieces --------------------------------------------------------------------------------


def in_window(started: dt.datetime, window: Mapping[str, Any]) -> bool:
    """§9.3: a weekend, or the evening and night hours, in RePORTER's time zone.

    RePORTER gives its hours as "EST"; they are read as New York time, which is what its office
    keeps (EDT in summer).
    """
    moment = started if started.tzinfo else started.replace(tzinfo=dt.UTC)
    local = moment.astimezone(ZoneInfo(str(window["tz"])))
    if window.get("weekend") and local.weekday() >= SATURDAY:
        return True
    evening, morning = (int(hour) for hour in window["weekday_hours"])
    return local.hour >= evening or local.hour < morning


def core_query(core: str) -> Query:
    return ("reporter", f"core:{core}")


def split_query(ic: str, serial: str) -> Query:
    return ("reporter", f"split:{ic}:{serial}")


def contract_query(number: str) -> Query:
    return ("reporter", f"contract:{number}")


def link_query(core: str) -> Query:
    return ("reporter", f"link:{core}")


def nsf_query(award: str) -> Query:
    return ("nsf", f"award:{award}")


def usaspending_query(agency: str, number: str) -> Query:
    return ("usaspending", f"award:{agency}:{number}")


def award_query(award: str) -> Query:
    return ("openalex", f"award:{award}")


def _chunks[T](items: Sequence[T], size: int) -> Iterator[list[T]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def _text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        value = "; ".join(str(part) for part in value if part)
    text = " ".join(str(value).split())
    return text or None


def _decimal(value: object) -> str | None:
    """A source's amount as a decimal string; a non-number is a changed shape, and raises."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise TypeError(f"an amount of {value!r}")
    return decimal_string(value)


def _iso(value: object) -> str | None:
    """A date as the store writes it, from RePORTER's `2019-04-01T00:00:00` or NSF's `04/01/2019`."""
    text = _text(value)
    if text is None:
        return None
    us = re.fullmatch(r"([0-9]{2})/([0-9]{2})/([0-9]{4})", text)
    if us:
        text = f"{us.group(3)}-{us.group(1)}-{us.group(2)}"
    return dt.date.fromisoformat(text[:10]).isoformat()


def _year(value: object) -> int | None:
    return None if value is None or value == "" else int(str(value)[:4])


def _end_date(end: str) -> dt.date:
    """An end date, or a year alone taken as its last day."""
    return dt.date(int(end), 12, 31) if len(end) == 4 else dt.date.fromisoformat(end[:10])  # noqa: PLR2004


def _sorted_people(people: Iterable[Investigator]) -> list[Investigator]:
    unique = {(person["name"], person["id"]): person for person in people}
    return [unique[key] for key in sorted(unique, key=lambda pair: (pair[0], pair[1] or ""))]


def contract_key(project_num: str) -> GrantKey | None:
    """A contract's key from one of its RePORTER project numbers, or None (§5.1, §6.7).

    RePORTER drops `HHSN` and writes a task order as the third part with its letters removed:
    `272201700036I-0-759302000001-1` is task order 75N93020F00001 under HHSN272201700036I. The
    letter restored is F, which marks an order (FAR 4.1603).
    """
    parts = project_num.upper().split("-")
    first = parts[0]
    number = f"HHSN{first}" if re.fullmatch(r"[0-9]{12}[A-Z]", first) else first
    if not re.fullmatch(r"HHSN[0-9]{12}[A-Z]|75N[0-9]{5}[A-Z][0-9]{5}", number):
        return None
    digits = parts[2] if len(parts) > 2 else ""  # noqa: PLR2004 - the third part
    if TASK_ORDER_DIGITS.fullmatch(digits):
        return grant_key(CONTRACT_FAMILY, number, f"75N{digits[2:7]}F{digits[7:]}")
    return grant_key(CONTRACT_FAMILY, number)


# --- what the sources say, checked -------------------------------------------------------------


def _reporter_pi(person: Mapping[str, Any]) -> Investigator | None:
    names = (person.get("first_name"), person.get("middle_name"), person.get("last_name"))
    name = _text(person.get("full_name")) or _text(" ".join(str(part) for part in names if part))
    profile = person.get("profile_id")
    return {"name": name, "id": str(profile) if profile else None} if name else None


def _reporter_row(raw: object) -> Row:
    """One RePORTER project row, checked: what the amount rules and the grant page read.

    A row without an application ID or a fiscal year, or with an amount that is not a number, is a
    reply of a changed shape and raises, so the source degrades rather than a grant being valued
    from half a row.
    """
    if not isinstance(raw, Mapping):
        raise TypeError(f"a RePORTER row that is a {type(raw).__name__}")
    ic = raw.get("agency_ic_admin")
    organization = raw.get("organization")
    people = raw.get("principal_investigators") or []
    amount = raw.get("award_amount")
    return {
        "appl_id": int(raw["appl_id"]),
        "fiscal_year": int(raw["fiscal_year"]),
        "project_num": str(raw.get("project_num") or ""),
        "project_num_split": raw.get("project_num_split") or {},
        "core_project_num": alnum(str(raw.get("core_project_num") or "")),
        "subproject_id": raw.get("subproject_id"),
        "award_amount": None if amount is None else int(amount),
        "agency_code": str(raw.get("agency_code") or NIH).upper(),
        "ic": (_text(ic.get("abbreviation")), _text(ic.get("name")))
        if isinstance(ic, Mapping)
        else (None, None),
        "organization": _text(organization.get("org_name")) if isinstance(organization, Mapping) else None,
        "pis": [pi for person in people if isinstance(person, Mapping) and (pi := _reporter_pi(person))],
        "title": _text(raw.get("project_title")),
        "start": _iso(raw.get("project_start_date")),
        "end": _iso(raw.get("project_end_date")),
    }


@dataclass(frozen=True)
class _Info:
    """A grant's facts and its public record, as one source gives them."""

    facts: GrantFacts  # the facet this source fills
    agency: AgencyCode | None = None
    title: str | None = None
    pis: tuple[Investigator, ...] = ()
    organization: str | None = None
    start: str | None = None
    end: str | None = None
    learned: tuple[AgencyCode, str, AgencyCode | None] | None = None  # (code, name, parent) from RePORTER


def _reporter_agency(row: Row) -> tuple[AgencyCode, tuple[AgencyCode, str, AgencyCode | None] | None]:
    """An NIH grant's administering institute (§4), or another RePORTER agency itself (VA)."""
    code = row["agency_code"]
    abbreviation, name = row["ic"]
    if code == NIH:
        ic = (abbreviation or "").upper()
        if ic and ic != NIH and AGENCY_CODE.fullmatch(ic):
            return ic, (ic, name or ic, NIH)
        return NIH, None
    if AGENCY_CODE.fullmatch(code):
        return code, (code, name if name and abbreviation == code else code, None)
    return NIH, None


def _reporter_info(rows: Sequence[Row]) -> _Info | None:
    """RePORTER's facts and public record for a grant, contract or task order, from its rows."""
    parents = [cast(Row, row) for row in parent_rows(rows)]
    if not parents:
        return None
    latest = max(parents, key=lambda row: (row["fiscal_year"], row["appl_id"]))
    agency, learned = _reporter_agency(latest)
    starts = [row["start"] for row in parents if row["start"]]
    ends = [row["end"] for row in parents if row["end"]]
    return _Info(
        facts={"reporter": reporter_facts(parents)},
        agency=agency,
        title=latest["title"],
        pis=tuple(latest["pis"]),
        organization=latest["organization"],
        start=min(starts, default=None),
        end=max(ends, default=None),
        learned=learned,
    )


def _nsf_info(award: Mapping[str, Any]) -> _Info:
    facts: NsfFacts = {
        "estimated": _decimal(award.get("estimatedTotalAmt")),
        "obligated": _decimal(award.get("fundsObligatedAmt")),
        "exp_date": _iso(award.get("expDate")),
        "program": _text(award.get("fundProgramName")),
        "type": _text(award.get("transType")),
    }
    names = (award.get("piFirstName"), award.get("piLastName"))
    name = _text(award.get("pdPIName")) or _text(" ".join(str(part) for part in names if part))
    return _Info(
        facts={"nsf": facts},
        agency="NSF",
        title=_text(award.get("title")),
        pis=({"name": name, "id": None},) if name else (),
        organization=_text(award.get("awardeeName")),
        start=_iso(award.get("startDate")),
        end=facts["exp_date"],
    )


def _usaspending_info(detail: Mapping[str, Any]) -> _Info:
    period = detail.get("period_of_performance") or {}
    generated = _text(detail.get("generated_unique_award_id"))
    if not generated:
        raise ValueError("a USAspending award without its generated_unique_award_id")
    facts: UsaspendingFacts = {
        "total_obligation": _decimal(detail.get("total_obligation")),
        "type": _text(detail.get("type")),
        "pop_start": _iso(period.get("start_date")),
        "pop_end": _iso(period.get("end_date")),
        "generated_id": generated,
    }
    return _Info(
        facts={"usaspending": facts},
        organization=_text(detail.get("recipient_name")),
        start=facts["pop_start"],
        end=facts["pop_end"],
    )


@dataclass(frozen=True)
class _Award:
    """An OpenAlex award entity: its amount facts, and the award's own record."""

    fact: OpenalexAward
    title: str | None
    pis: tuple[Investigator, ...]
    organization: str | None
    start: str | None
    end: str | None


def _person(value: object) -> Investigator | None:
    if not isinstance(value, Mapping):
        return None
    names = (value.get("given_name"), value.get("family_name"))
    name = _text(value.get("display_name")) or _text(" ".join(str(part) for part in names if part))
    return {"name": name, "id": None} if name else None


def _awarded(value: object) -> str | None:
    """The institution an OpenAlex award names: a list of institutions (seen live in B6's reads),
    of which the first is the awardee; a lone mapping is read the same way."""
    first = value[0] if isinstance(value, list) and value else value
    return _text(first.get("display_name")) if isinstance(first, Mapping) else None


def _openalex_award(raw: object) -> _Award:
    if not isinstance(raw, Mapping):
        raise TypeError(f"an OpenAlex award that is a {type(raw).__name__}")
    award = str(raw["id"]).rsplit("/", 1)[-1]
    if not OPENALEX_AWARD.fullmatch(award):
        raise ValueError(f"an OpenAlex award id {raw['id']!r}")
    currency = (_text(raw.get("currency")) or "").upper()
    start, end = _year(raw.get("start_year")), _year(raw.get("end_year"))
    lead = _person(raw.get("lead_investigator"))
    return _Award(
        fact={
            "id": award,
            "amount": _decimal(raw.get("amount")),
            "currency": currency if re.fullmatch(r"[A-Z]{3}", currency) else None,
            "provenance": _text(raw.get("provenance")),
            "start_year": start,
        },
        title=_text(raw.get("display_name")),
        pis=(lead,) if lead else (),
        organization=_awarded(raw.get("institution_awarded")),
        start=str(start) if start else None,
        end=str(end) if end else None,
    )


# --- sightings (§6.1) ----------------------------------------------------------------------------


def openalex_sightings(payload: Mapping[str, Any]) -> list[Sighting]:
    """OpenAlex's awards on a work: the string, the funder it names, and the award (F11)."""
    awards = payload.get("awards") or []
    if not isinstance(awards, list):
        raise TypeError(f"OpenAlex awards that are a {type(awards).__name__}")
    found: list[Sighting] = []
    for award in awards:
        raw = _text(award.get("funder_award_id")) if isinstance(award, Mapping) else None
        if raw:
            found.append(
                Sighting(
                    raw,
                    "openalex",
                    funder=_text(award.get("funder_display_name")),
                    funder_id=_text(award.get("funder_id")),
                    award_id=_text(award.get("id")),
                )
            )
    return found


def pubmed_sightings(grants: PubmedGrants) -> list[Sighting]:
    """PubMed's `GrantList`: PubMed's `Agency` decides as PubMed's, never as a name (§6.4)."""
    return [Sighting(g.grant_id, "pubmed", pubmed_agency=g.agency) for g in grants.grants if g.grant_id]


def crossref_sightings(funders: Sequence[Mapping[str, Any]]) -> list[Sighting]:
    """Crossref's funder entries; a funder with no registry DOI is named by its name alone (B3a)."""
    found: list[Sighting] = []
    for funder in funders:
        name, doi = _text(funder.get("name")), _text(funder.get("DOI"))
        for award in funder.get("award") or []:
            if _text(award):
                found.append(Sighting(str(award), "crossref", funder=name, funder_id=doi))
    return found


def jats_sightings(found: Iterable[JatsString]) -> list[Sighting]:
    """JATS's strings: an award group's with its funders, a number from prose with none (§5.8).

    A group's registry IDs decide, and its names are shown beside the first of them; a group
    that gives names but no ID is named by them, as a Crossref entry without a DOI is (B3a).
    """
    sightings: list[Sighting] = []
    for item in found:
        if item.kind != "award":
            sightings.append(Sighting(item.raw, "jats"))
            continue
        ids = [value for value in item.funder_ids if funder_id(value)]
        if ids:
            named = [Sighting(item.raw, "jats", funder=name, funder_id=ids[0]) for name in item.funders]
            sightings += named or [Sighting(item.raw, "jats", funder_id=ids[0])]
            sightings += [Sighting(item.raw, "jats", funder_id=value) for value in ids[1:]]
        else:
            sightings += [Sighting(item.raw, "jats", funder=name) for name in item.funders] or [
                Sighting(item.raw, "jats")
            ]
    return sightings


# --- carrying forward (§8.1, §9.1) ----------------------------------------------------------------


def _derived(strings: Iterable[StoredString], links: Iterable[NihLink]) -> list[GrantKey]:
    """A line's grants: its strings' and its links' (invariant F3)."""
    return sorted({key for string in strings for key in string["grants"]} | {link["grant"] for link in links})


def merge_lines(kept: FundingCitation, other: FundingCitation) -> FundingCitation:
    """Two works' lines as one, after a merge: the union of their strings and links (§8.1).

    Where both hold a string, the kept line's decision stands and the sightings are pooled.
    """
    strings = {string_key(string["raw"]): string for string in kept["strings"]}
    for string in other["strings"]:
        key = string_key(string["raw"])
        mine = strings.get(key)
        strings[key] = (
            string
            if mine is None
            else cast(
                StoredString,
                {
                    **mine,
                    "sources": sorted({*mine["sources"], *string["sources"]}),
                    "funders": sorted({*mine["funders"], *string["funders"]}),
                    "first_seen": min(mine["first_seen"], string["first_seen"]),
                    "last_seen": max(mine["last_seen"], string["last_seen"]),
                },
            )
        )
    links = {link["core"]: link for link in kept["nih_links"]}
    for link in other["nih_links"]:
        mine_link = links.get(link["core"])
        links[link["core"]] = (
            link
            if mine_link is None
            else cast(
                NihLink,
                {
                    **mine_link,
                    "first_seen": min(mine_link["first_seen"], link["first_seen"]),
                    "last_seen": max(mine_link["last_seen"], link["last_seen"]),
                },
            )
        )
    merged = cast(
        FundingCitation,
        {
            **kept,
            "funding_version": max(kept["funding_version"], other["funding_version"]),
            "strings": list(strings.values()),
            "nih_links": list(links.values()),
            "jats_checked": dict(sorted({**other["jats_checked"], **kept["jats_checked"]}.items())),
            "grants": _derived(strings.values(), links.values()),
        },
    )
    return io.sort_funding_citations([merged])[0]


def _closure(codes: Iterable[AgencyCode], known: Mapping[AgencyCode, Agency]) -> dict[AgencyCode, Agency]:
    """The agencies named and every parent, as `known` holds them (invariant F5)."""
    needed: dict[AgencyCode, Agency] = {}
    for code in codes:
        current: AgencyCode | None = code
        while current is not None and current in known and current not in needed:
            needed[current] = known[current]
            current = known[current]["parent"]
    return dict(sorted(needed.items()))


def canonical(
    lines: Iterable[FundingCitation],
    grants: Iterable[Grant],
    lookups: Iterable[FundingLookup],
    agencies: Iterable[Agency],
) -> FundingSnapshot:
    """A funding snapshot in the order and shape the files are written in (docs/02 §15)."""
    return FundingSnapshot(
        present=True,
        citations={line["work"]: line for line in io.sort_funding_citations(list(lines))},
        grants={grant["key"]: grant for grant in io.sort_grants(list(grants))},
        lookups={
            (lookup["source"], lookup["query"]): lookup for lookup in io.sort_funding_lookups(list(lookups))
        },
        agencies={agency["code"]: agency for agency in io.sort_agencies(list(agencies))},
    )


def carry(stored: FundingSnapshot, included: set[WorkId], aliases: Mapping[str, WorkId]) -> FundingSnapshot:
    """The stored funding, moved to the works as they are now (§9.1's `skip`).

    A retired work's line joins its survivor's, a work that left takes its line with it, and a
    grant no remaining line lists goes too. Without it, invariants F2 and F4 would fail the gate
    on the first merge or removal of a run that did not decide funding.
    """
    if not stored.present:
        return FundingSnapshot()
    lines: dict[WorkId, FundingCitation] = {}
    for work, line in sorted(stored.citations.items(), key=lambda item: (item[0] not in included, item[0])):
        target = work if work in included else aliases.get(retired_key(work))
        if target is None or target not in included:
            continue
        moved = cast(FundingCitation, {**line, "work": target})
        lines[target] = merge_lines(lines[target], moved) if target in lines else moved
    listed = {key for line in lines.values() for key in line["grants"]}
    grants = [grant for key, grant in stored.grants.items() if key in listed]
    agencies = _closure((grant["agency"] for grant in grants), stored.agencies)
    return canonical(lines.values(), grants, stored.lookups.values(), agencies.values())


def write_funding(store: Path, funding: FundingSnapshot) -> None:
    """The four files of `store/funding/`, canonically (docs/02 §15)."""
    paths = StorePaths(store)
    io.write_jsonl(paths.funding_citations, io.sort_funding_citations(list(funding.citations.values())))
    io.write_jsonl(paths.funding_grants, io.sort_grants(list(funding.grants.values())))
    io.write_jsonl(paths.funding_lookups, io.sort_funding_lookups(list(funding.lookups.values())))
    io.write_jsonl(paths.funding_agencies, io.sort_agencies(list(funding.agencies.values())))


# --- one work in progress --------------------------------------------------------------------------


@dataclass
class _Work:
    input: WorkInput
    stored: FundingCitation | None
    overrides: dict[str, GrantKey | None]
    sightings: list[Sighting] = field(default_factory=list)  # this run's
    read: set[FundingSource] = field(default_factory=set)  # sources read in full for it this run
    jats: dict[RecordId, Date] = field(default_factory=dict)  # records whose JATS was read now
    fresh: set[str] = field(default_factory=set)  # string keys a source showed this run
    links: dict[str, int | None] = field(default_factory=dict)  # this run's links: core → appl_id
    first: Lookups = field(default_factory=Lookups)
    second: Lookups = field(default_factory=Lookups)

    @property
    def id(self) -> WorkId:
        return self.input.id

    @property
    def pmids(self) -> list[str]:
        return sorted({str(r["ids"]["pmid"]) for r in self.input.records if r["ids"].get("pmid")})

    def everything(self) -> list[Sighting]:
        """This run's sightings, and each stored string no source showed, standing for itself.

        The stored string keeps its sources and funders; it is here so that the work's other
        strings are decided in its company (a bare serial, a fragment, a contract's task order).
        """
        kept = [
            Sighting(string["raw"], string["sources"][0])
            for string in (self.stored["strings"] if self.stored else [])
            if string_key(string["raw"]) not in self.fresh
        ]
        return [*self.sightings, *kept]

    def stored_links(self) -> dict[str, NihLink]:
        return {link["core"]: link for link in self.stored["nih_links"]} if self.stored else {}

    def link_cores(self) -> list[str]:
        """The work's NIH links whose cores `resolve_work` can key; contracts are keyed here."""
        return sorted(core for core in {*self.links, *self.stored_links()} if CORE.fullmatch(core))


# --- the stage -------------------------------------------------------------------------------------


class FundingStage:
    """One run's stage 8b: `run` decides, and `carried` is what a skipped or failed run hands on."""

    def __init__(  # noqa: PLR0913 - the run, the store, the client and the sources, all keyword-only
        self,
        *,
        config: Config,
        context: RunContext,
        recorder: RunRecorder,
        snapshot: StoreSnapshot,
        client: HttpClient,
        sources: FundingSources,
        unreachable: set[str],
    ) -> None:
        self.config = config
        self.context = context
        self.recorder = recorder
        self.snapshot = snapshot
        self.stored = snapshot.funding
        self.client = client
        self.sources = sources
        self.unreachable = unreachable  # shared with the pipeline: a source down is down for the run
        self.rules = FundingRules.from_config(config.funding, str(config.rules["r2"]["code"]))
        self.rates = Rates.from_config(config.exchange_rates)
        self.today = context.date
        self.refresh = config.funding["refresh"]
        self.cap = int(config.funding["reporter"]["weekday_request_cap"])
        self.capped = False  # outside RePORTER's window, and not forced
        self.requests: Counter[str] = Counter()
        self.missing: set[Query] = set()  # wanted and not answered: a source down, or deferred
        self.deferred: set[Query] = set()
        # This run's answers.
        self.rows: dict[str, list[Row]] = {}  # held cores' rows, from core and split probes
        self.unheld: set[str] = set()
        self.splits: dict[tuple[str, str], tuple[str, ...]] = {}
        self.contracts: dict[str, list[Row]] = {}  # contract number asked → its rows, none if unknown
        self.nsf: dict[str, _Info | None] = {}
        self.usaspending: dict[tuple[str, str], _Info | None] = {}
        self.awards: dict[str, _Award | None] = {}
        self.funders: dict[str, tuple[str, str | None] | None] = {}
        self.links: dict[WorkId, dict[str, int | None]] | None = None
        self.restored: dict[str, GrantKey | None] = {}  # a link's truncated contract core → its key
        self.learned: dict[AgencyCode, tuple[str, AgencyCode | None]] = {}
        self.funder_names: dict[str, str] = {}
        self.aliases: Mapping[str, WorkId] = {}
        self._memo()

    # --- the run ---------------------------------------------------------------------------------

    def carried(self, works: Sequence[WorkInput], aliases: Mapping[str, WorkId]) -> FundingResult:
        """The stored funding carried forward (§9.1's `skip`, and §9.4 after an error)."""
        included = {work.id for work in works}
        return FundingResult(
            carry(self.stored, included, aliases),
            "skipped" if self.config.funding.get("enabled") else None,
            last_full_refresh(self.snapshot.runs),
            dict(self.requests),
        )

    def run(
        self, works: Sequence[WorkInput], aliases: Mapping[str, WorkId], *, request: FundingRequest
    ) -> FundingResult:
        """Stage 8b. `enabled: false` and `skip` carry the stored funding forward (§9.1)."""
        if not self.config.funding.get("enabled") or request == "skip":
            return self.carried(works, aliases)
        self.aliases = aliases
        last = self._last_full()
        mode = self._mode(request, last)
        funding = self._decide(works, full=mode == "full")
        refreshed = self.today if mode == "full" else last_full_refresh(self.snapshot.runs)
        return FundingResult(funding, mode, refreshed, dict(self.requests), resolved=True)

    def _last_full(self) -> RunManifest | None:
        full = [run for run in self.snapshot.runs if run.get("funding", {}).get("mode") == "full"]
        return max(full, key=lambda run: run["run_id"], default=None)

    def _mode(self, request: FundingRequest, last: RunManifest | None) -> FundingMode:
        """Full when forced, or due and inside RePORTER's window; else incremental (§9.2, §9.3)."""
        if request == "full":
            return "full"
        window = in_window(self.context.started, self.config.funding["reporter"]["window"])
        self.capped = not window
        if not self._due(last):
            return "incremental"
        if window:
            return "full"
        self.recorder.note(
            "funding: a full refresh is due and was deferred, because the run started outside NIH"
            " RePORTER's window for large jobs (weekends, or 21:00-05:00 New York time); it runs"
            " incrementally until then, or with `run --funding full`"
        )
        return "deferred"

    def _due(self, last: RunManifest | None) -> bool:
        """28 days since the last full refresh, or a `funding_version` it did not run with (§9.2)."""
        if last is None:
            return True
        if last["funding"]["version"] != self.config.funding_version:
            return True
        return self.context.days_since(last["started"][:10]) >= int(self.refresh["full_every_days"])

    def _decide(self, inputs: Sequence[WorkInput], *, full: bool) -> FundingSnapshot:
        base = carry(self.stored, {work.id for work in inputs}, self.aliases)
        works = self._gather(inputs, base, full=full)
        self._read_links(works)
        for work in works:
            work.links = (self.links or {}).get(work.id, {})
        self._restore_links(works)
        for work in works:
            work.first = self._plan(work)
        self._probe(works, base, full=full)
        first = self._answers()
        for work in works:
            work.second = self._plan(work, first)
        self._probe_splits(works, full=full)
        answers = self._answers()
        self._alert_unknown_overrides(works, answers)

        lines: dict[WorkId, FundingCitation] = {}
        awards: dict[GrantKey, set[str]] = {}
        carried = 0
        for work in works:
            if self._unanswered(work):
                carried += 1
                if work.stored is not None:
                    lines[work.id] = work.stored
                continue
            lines[work.id] = self._line(work, answers, awards)
        if carried:
            self.recorder.note(
                f"funding: {carried} work(s) kept their stored funding, because a source they need"
                " did not answer or was deferred this run"
            )
        if self.deferred:
            self.recorder.note(
                f"funding: {len(self.deferred)} RePORTER question(s) deferred: the run started outside"
                f" its window, and the cap of {self.cap} requests was reached"
            )
        grants = self._grants(lines, inputs, awards)
        agencies = self._agencies(grants, full=full)
        return canonical(lines.values(), grants.values(), self._lookups(), agencies.values())

    # --- asking, guarded ---------------------------------------------------------------------------

    def _host(self, source: str) -> str:
        return self.sources.ncbi.host if source in ("pubmed", "pmc") else source

    def _calls(self, host: str) -> int:
        usage = self.client.usage.get(host)
        return usage.calls if usage else 0

    def _ask[T](self, source: str, queries: Iterable[Query], call: Callable[[], T]) -> list[T]:
        """One question to a source: its answer, or none and the source degraded (§9.4).

        A source that failed once is not asked again this run (the pipeline's `_unreachable`),
        and outside RePORTER's window its questions stop at the cap. Either way the questions are
        `missing`, and a work that needs one keeps its stored line.
        """
        asked = set(queries)
        if source in self.unreachable:
            self.missing |= asked
            return []
        if source == "reporter" and self.capped and self.requests["reporter"] >= self.cap:
            self.deferred |= asked
            self.missing |= asked
            return []
        host = self._host(source)
        before = self._calls(host)
        try:
            return [call()]
        except HttpError as exc:
            self._fail(source, f"{type(exc).__name__}: {exc}", exc.status)
        except SHAPE_ERRORS as exc:
            self._fail(source, f"a reply of a changed shape ({type(exc).__name__}: {exc})", None)
        finally:
            self.requests[source] += self._calls(host) - before
        self.missing |= asked
        return []

    def _fail(self, source: str, cause: str, status: int | None) -> None:
        self.unreachable.add(source)
        self.recorder.degrade(adapter_source(source), f"funding: {scrub(cause)}")
        if source == "reporter" and status == FORBIDDEN:
            self.recorder.alert(
                "NIH RePORTER answered HTTP 403: possible IP block — RUNBOOK",
                "start no more runs outside RePORTER's window, and follow RUNBOOK.md's funding section",
            )

    # --- sightings --------------------------------------------------------------------------------

    def _known_records(self) -> set[RecordId]:
        """Records of works the stage has already read: their PubMed and Crossref wait for a full refresh."""
        funded = self.stored.citations
        return {
            r["id"]
            for work, stored in self.snapshot.works.items()
            if work in funded
            for r in stored["records"]
        }

    def _gather(self, inputs: Sequence[WorkInput], base: FundingSnapshot, *, full: bool) -> list[_Work]:
        known = self._known_records()
        unread = {w.id: [r for r in w.records if full or r["id"] not in known] for w in inputs}
        pmids = sorted({str(r["ids"]["pmid"]) for rs in unread.values() for r in rs if r["ids"].get("pmid")})
        dois = sorted(
            {str(r["ids"]["doi"]).lower() for rs in unread.values() for r in rs if r["ids"].get("doi")}
        )
        pubmed = self._read_pubmed(pmids)
        crossref = self._read_crossref(dois)
        works: list[_Work] = []
        for work_input in inputs:
            work = _Work(
                work_input,
                base.citations.get(work_input.id),
                grant_overrides_for(self.config.overrides, work_input.id, self.aliases),
            )
            self._openalex_seen(work)
            self._pubmed_seen(work, unread[work.id], pubmed)
            self._crossref_seen(work, unread[work.id], crossref)
            self._jats_seen(work)
            work.fresh = {
                string_key(piece) for s in work.sightings for piece in pieces(s.raw, work.overrides)
            }
            works.append(work)
        return works

    def _read_pubmed(self, pmids: Sequence[str]) -> dict[str, PubmedGrants] | None:
        if not pmids:
            return {}
        found = self._ask("pubmed", (), partial(self.sources.ncbi.pubmed_grants, pmids))
        return found[0] if found else None

    def _read_crossref(self, dois: Sequence[str]) -> dict[str, list[dict[str, Any]]] | None:
        if not dois:
            return {}
        found = self._ask("crossref", (), partial(self.sources.crossref.funders_by_dois, dois))
        return found[0] if found else None

    def _openalex_seen(self, work: _Work) -> None:
        payloads = work.input.payloads
        found = self._ask(
            "openalex", (), lambda: [s for rid in sorted(payloads) for s in openalex_sightings(payloads[rid])]
        )
        if not found:
            return
        work.sightings += found[0]
        for sighting in found[0]:
            identifier = funder_id(sighting.funder_id)
            if identifier and identifier.startswith("F") and sighting.funder:
                self.funder_names.setdefault(identifier, sighting.funder)
        with_ids = [record for record in work.input.records if record["ids"].get("openalex")]
        if all(record["id"] in payloads for record in with_ids):
            work.read.add("openalex")

    def _pubmed_seen(
        self, work: _Work, unread: Sequence[Record], pubmed: Mapping[str, PubmedGrants] | None
    ) -> None:
        asked = {str(r["ids"]["pmid"]) for r in unread if r["ids"].get("pmid")}
        if pubmed is None:
            return
        for pmid in sorted(asked):
            if pmid in pubmed:
                work.sightings += pubmed_sightings(pubmed[pmid])
        if set(work.pmids) <= asked:
            work.read.add("pubmed")

    def _crossref_seen(
        self, work: _Work, unread: Sequence[Record], crossref: Mapping[str, list[dict[str, Any]]] | None
    ) -> None:
        asked = {str(r["ids"]["doi"]).lower() for r in unread if r["ids"].get("doi")}
        if crossref is None:
            return
        for doi in sorted(asked):
            work.sightings += crossref_sightings(crossref.get(doi, []))
        if {str(r["ids"]["doi"]).lower() for r in work.input.records if r["ids"].get("doi")} <= asked:
            work.read.add("crossref")

    def _jats_seen(self, work: _Work) -> None:
        """JATS once per record (F16): each PMC record not yet checked, from the cached XML."""
        checked = work.stored["jats_checked"] if work.stored else {}
        pmc = [record for record in work.input.records if record["ids"].get("pmcid")]
        for record in pmc:
            if record["id"] in checked:
                continue
            xml = self._ask("pmc", (), partial(self.sources.ncbi.pmc_xml, str(record["ids"]["pmcid"])))
            if not xml or xml[0] is None:
                continue  # not fetched: asked again next run
            work.jats[record["id"]] = self.today
            work.sightings += jats_sightings(funding_strings(xml[0]) or [])
        if all(record["id"] in work.jats for record in pmc):
            work.read.add("jats")

    # --- links ----------------------------------------------------------------------------------

    def _read_links(self, works: Sequence[_Work]) -> None:
        """RePORTER's links for every PMID, every run (§9.2): NIH's word on what each paper lists."""
        by_pmid = {pmid: work.id for work in works for pmid in work.pmids}
        if not by_pmid:
            self.links = {}
            return

        def call() -> dict[WorkId, dict[str, int | None]]:
            found: dict[WorkId, dict[str, int | None]] = {}
            for row in self.sources.reporter.publications(sorted(by_pmid, key=int)):
                core = alnum(str(row["coreproject"]))
                if not core:
                    raise ValueError(f"a link with no core project: {row!r}")
                work = by_pmid.get(str(row["pmid"]))
                if work is not None:
                    found.setdefault(work, {})[core] = int(row["applid"]) if row.get("applid") else None
            return found

        found = self._ask("reporter", [LINKS], call)
        self.links = found[0] if found else None

    def _restore_links(self, works: Sequence[_Work]) -> None:
        """A link to a contract names RePORTER's truncated core (`27220170005`): its own rows,
        found by that core as a prefix and matched by application, give the contract (§5.1)."""
        known = {core for work in works for core in work.stored_links()}
        for work in works:
            for core, applid in sorted(work.links.items()):
                if CORE.fullmatch(core) or core in known or core in self.restored:
                    continue
                for key in self._ask("reporter", [link_query(core)], partial(self._restore, core, applid)):
                    self.restored[core] = key
                    if key is None:
                        self.recorder.note(
                            f"funding: NIH links {work.id} to {core}, which could not be keyed"
                        )

    def _restore(self, core: str, applid: int | None) -> GrantKey | None:
        rows = [_reporter_row(raw) for raw in self.sources.reporter.projects_by_nums([f"{core}*"])]
        row = next((row for row in rows if row["appl_id"] == applid), None)
        return contract_key(row["project_num"]) if row else None

    def _contract_links(self, work: _Work) -> dict[str, GrantKey]:
        stored = work.stored_links()
        keyed: dict[str, GrantKey] = {}
        for core in sorted({*work.links, *stored}):
            if CORE.fullmatch(core):
                continue
            key = self.restored.get(core) or (stored[core]["grant"] if core in stored else None)
            if key:
                keyed[core] = key
        return keyed

    # --- planning and probing -----------------------------------------------------------------------

    def _plan(self, work: _Work, answers: Answers | None = None) -> Lookups:
        return plan_lookups(
            work.everything(),
            work.link_cores(),
            self.rules,
            overrides=work.overrides,
            data_year=self.context.today.year,
            answers=answers,
        )

    def _key_queries(self, key: GrantKey) -> set[Query]:
        """What a grant's facts are asked by."""
        kind = family(key, self.rules)
        _, _, rest = key.partition(":")
        if kind == "reporter":
            return {core_query(rest)} if CORE.fullmatch(rest) else set()
        if kind == "nih_contract":
            return {core_query(rest)} if CORE.fullmatch(rest) else {contract_query(rest)}
        if kind == "nih_task_order":
            return {contract_query(rest.split(":")[0])}
        if kind == "nsf":
            return {nsf_query(rest)}
        if kind == "us_federal":
            agency, _, number = rest.partition(":")
            return {usaspending_query(agency, number)}
        return set()

    @staticmethod
    def _lookup_queries(lookups: Lookups) -> set[Query]:
        return {
            *(core_query(core) for core in lookups.reporter_cores),
            *(split_query(ic, serial) for ic, serial in lookups.reporter_splits),
            *(contract_query(number) for number in lookups.contracts),
            *(nsf_query(award) for award in lookups.nsf),
            *(usaspending_query(agency, number) for agency, number in lookups.usaspending),
            *(award_query(award) for award in lookups.openalex_awards),
        }

    def _needs(self, work: _Work) -> set[Query]:
        """Every answer the work's decision rests on; one missing, and it keeps its stored line."""
        needs = self._lookup_queries(work.first) | self._lookup_queries(work.second)
        needs |= {core_query(core) for core in work.link_cores()}
        needs |= {link_query(core) for core in work.links if not CORE.fullmatch(core)}
        needs |= {query for key in work.overrides.values() if key for query in self._key_queries(key)}
        if work.pmids:
            needs.add(LINKS)
        return needs

    def _unanswered(self, work: _Work) -> set[Query]:
        """What the work needs that neither this run nor the store answers (`Answers` must be
        complete): a question a source could not answer, the store having no answer of its own."""
        return {
            query
            for query in self._needs(work) & self.missing
            if query not in self.memo_positive and query not in self.stored.lookups
        }

    def _memo(self) -> None:
        """What the store already knows: a held grant by its facts, a miss by its lookup."""
        self.memo_held: dict[str, str] = {}
        self.memo_nsf: set[str] = set()
        self.memo_usaspending: set[tuple[str, str]] = set()
        self.memo_orders: dict[str, str] = {}
        self.memo_positive: set[Query] = set()
        for key, grant in self.stored.grants.items():
            prefix, _, rest = key.partition(":")
            facts = grant["facts"]
            kind = family(key, self.rules)
            if any(facet in facts for facet in ("reporter", "nsf", "usaspending")):
                self.memo_positive |= self._key_queries(key)
            self.memo_positive |= {award_query(award["id"]) for award in facts.get("openalex", [])}
            if "reporter" in facts and CORE.fullmatch(rest):
                self.memo_held[rest] = NIH if kind == "nih_contract" else prefix
            if kind == "nih_task_order":
                idiq, order = rest.split(":")
                self.memo_orders[order] = idiq
            if "nsf" in facts:
                self.memo_nsf.add(rest)
            if "usaspending" in facts:
                agency, _, number = rest.partition(":")
                self.memo_usaspending.add((agency, number))
        self.memo_splits: dict[tuple[str, str], tuple[str, ...]] = {}
        for (_, question), lookup in self.stored.lookups.items():
            asked, _, split = question.partition(":")
            if asked == "split":
                ic, _, serial = split.partition(":")
                self.memo_splits[(ic, serial)] = tuple(lookup["found"])

    def _known(self, query: Query) -> bool:
        """Answered already, by a held grant's facts or a miss not yet due to be asked again."""
        if query in self.memo_positive:
            return True
        lookup = self.stored.lookups.get(query)
        return lookup is not None and (
            lookup["recheck_after"] is None or lookup["recheck_after"] > self.today
        )

    def _recent(self, grant: Grant) -> bool:
        """Active within `active_within_days`: an end, or a fiscal year, that recent (§9.2)."""
        since = self.context.today - dt.timedelta(days=int(self.refresh["active_within_days"]))
        if grant["end"] and _end_date(grant["end"]) >= since:
            return True
        reporter = grant["facts"].get("reporter")
        years = reporter["fiscal_years"] if reporter else {}
        return bool(years) and max(int(year) for year in years) >= fiscal_year(since)

    def _probe(self, works: Sequence[_Work], base: FundingSnapshot, *, full: bool) -> None:
        """The first round: new strings and keys, and the facts of the grants due a refresh."""
        wanted: set[Query] = set()
        refresh: set[Query] = set()
        for work in works:
            wanted |= self._lookup_queries(work.first)
            wanted |= {core_query(core) for core in work.link_cores()}
            wanted |= {query for key in work.overrides.values() if key for query in self._key_queries(key)}
            wanted |= {
                query for key in self._contract_links(work).values() for query in self._key_queries(key)
            }
        for key, grant in base.grants.items():
            queries = self._key_queries(key) | {award_query(award) for award in grant["openalex_awards"]}
            if full or self._recent(grant):
                refresh |= queries
            elif not grant["facts"]:
                wanted |= queries
        # A refresh asks again what a source holds; a remembered miss waits for its recheck date,
        # or its lookup would move every week (§8.1). A full refresh asks everything.
        asked = {query for query in wanted if full or not self._known(query)}
        asked |= {
            query for query in refresh if full or query not in self.stored.lookups or not self._known(query)
        }
        self._ask_cores(sorted(q[1][5:] for q in asked if q[1].startswith("core:")))
        for query in sorted(q for q in asked if q[1].startswith("contract:")):
            number = query[1][9:]
            for rows in self._ask("reporter", [query], partial(self._contract_rows, number)):
                self.contracts[number] = rows
        for query in sorted(q for q in asked if q[0] == "nsf" and NSF_AWARD.fullmatch(q[1][6:])):
            award = query[1][6:]
            for info in self._ask("nsf", [query], partial(self._nsf_award, award)):
                self.nsf[award] = info
        self._ask_usaspending(
            sorted(
                cast(tuple[str, str], tuple(q[1][6:].split(":", 1))) for q in asked if q[0] == "usaspending"
            )
        )
        self._ask_awards(sorted(q[1][6:] for q in asked if q[0] == "openalex" and q[1].startswith("award:")))

    def _probe_splits(self, works: Sequence[_Work], *, full: bool) -> None:
        """The second round: an institute and serial, where the first round's answers leave one open."""
        wanted = {split for work in works for split in work.second.reporter_splits}
        for ic, serial in sorted(wanted):
            query = split_query(ic, serial)
            if not full and self._known(query):
                continue
            for rows in self._ask("reporter", [query], partial(self._split_rows, ic, serial)):
                held = sorted(
                    {row["core_project_num"] for row in rows if CORE.fullmatch(row["core_project_num"])}
                )
                self.splits[(ic, serial)] = tuple(held)
                for core in held:
                    self.rows[core] = [row for row in rows if row["core_project_num"] == core]
                    self.unheld.discard(core)

    def _ask_cores(self, cores: Sequence[str]) -> None:
        for batch in _chunks(sorted(set(cores)), CORE_BATCH):
            for found in self._ask(
                "reporter", [core_query(c) for c in batch], partial(self._core_rows, batch)
            ):
                for core in batch:
                    if found.get(core):
                        self.rows[core] = found[core]
                        self.unheld.discard(core)
                    else:
                        self.unheld.add(core)

    def _core_rows(self, batch: Sequence[str]) -> dict[str, list[Row]]:
        found: dict[str, list[Row]] = {}
        for raw in self.sources.reporter.projects(batch):
            row = _reporter_row(raw)
            found.setdefault(row["core_project_num"], []).append(row)
        return found

    def _split_rows(self, ic: str, serial: str) -> list[Row]:
        return [_reporter_row(raw) for raw in self.sources.reporter.projects_by_split(ic=ic, serial=serial)]

    def _contract_rows(self, number: str) -> list[Row]:
        by_number = self.sources.reporter.contracts(number)
        return [_reporter_row(raw) for project in sorted(by_number) for raw in by_number[project]]

    def _nsf_award(self, award: str) -> _Info | None:
        found = self.sources.nsf.award(award)
        return _nsf_info(found) if found is not None else None

    def _ask_usaspending(self, pairs: Sequence[tuple[str, str]]) -> None:
        numbers = sorted({number for _, number in pairs})
        details: dict[str, _Info | None] = {}
        for batch in _chunks(numbers, USASPENDING_BATCH):
            queries = [usaspending_query(agency, number) for agency, number in pairs if number in batch]
            for found in self._ask("usaspending", queries, partial(self._usaspending_search, batch)):
                for agency, number in pairs:
                    if number not in batch:
                        continue
                    generated = found.get(number)
                    if generated is None:
                        self.usaspending[(agency, number)] = None
                        continue
                    if generated not in details:
                        query = usaspending_query(agency, number)
                        answer = self._ask(
                            "usaspending", [query], partial(self._usaspending_detail, generated)
                        )
                        if not answer:
                            continue
                        details[generated] = answer[0]
                    self.usaspending[(agency, number)] = details[generated]

    def _usaspending_search(self, batch: Sequence[str]) -> dict[str, str]:
        """Each number's award, by its generated ID (the lowest, where a number names two)."""
        found: dict[str, str] = {}
        for row in self.sources.usaspending.awards(batch):
            number, generated = alnum(str(row["Award ID"])), str(row["generated_internal_id"])
            if number in batch:
                found[number] = min(found.get(number, generated), generated)
        return found

    def _usaspending_detail(self, generated: str) -> _Info | None:
        detail = self.sources.usaspending.award_detail(generated)
        return _usaspending_info(detail) if detail is not None else None

    def _ask_awards(self, awards: Sequence[str]) -> None:
        for batch in _chunks(sorted(set(awards)), ID_BATCH):
            queries = [award_query(award) for award in batch]
            for found in self._ask("openalex", queries, partial(self._award_entities, batch)):
                for award in batch:
                    self.awards[award] = found.get(award)

    def _award_entities(self, batch: Sequence[str]) -> dict[str, _Award]:
        entities = map(_openalex_award, self.sources.openalex.awards_by_ids(batch))
        return {entity.fact["id"]: entity for entity in entities}

    # --- answers --------------------------------------------------------------------------------

    def _answers(self) -> Answers:
        """What the sources said, from this run's answers over the store's memory (§6)."""
        reporter = dict(self.memo_held)
        for core, rows in self.rows.items():
            reporter[core] = max(rows, key=lambda row: (row["fiscal_year"], row["appl_id"]))["agency_code"]
        for core in self.unheld:
            reporter.pop(core, None)
        orders = dict(self.memo_orders)
        for number, rows in self.contracts.items():
            for row in rows:
                key = contract_key(row["project_num"])
                if key and key.count(":") == 2:  # noqa: PLR2004 - a task order's key
                    orders[key.split(":")[2]] = number
        for key in self.restored.values():
            if key and key.count(":") == 2:  # noqa: PLR2004 - a task order's key
                orders[key.split(":")[2]] = key.split(":")[1]
        nsf = (self.memo_nsf | {a for a, info in self.nsf.items() if info}) - {
            a for a, info in self.nsf.items() if info is None
        }
        usa = (self.memo_usaspending | {p for p, info in self.usaspending.items() if info}) - {
            p for p, info in self.usaspending.items() if info is None
        }
        return Answers(
            reporter=reporter,
            reporter_splits={**self.memo_splits, **self.splits},
            task_orders=orders,
            nsf=frozenset(nsf),
            usaspending=frozenset(usa),
        )

    def _alert_unknown_overrides(self, works: Sequence[_Work], answers: Answers) -> None:
        """§9.5: an override naming an NIH grant RePORTER does not hold needs a person."""
        named = sorted({(key, work.id) for work in works for key in work.overrides.values() if key})
        for key, work in named:
            _, _, core = key.partition(":")
            if family(key, self.rules) != "reporter" or not CORE.fullmatch(core):
                continue
            if core not in answers.reporter and core_query(core) not in self.missing:
                self.recorder.alert(
                    f"a grant override on {work} names {key}, which NIH RePORTER does not hold",
                    "check the number in RePORTER, then correct the override in overrides.yaml",
                )

    # --- a work's line ----------------------------------------------------------------------------

    def _line(self, work: _Work, answers: Answers, awards: dict[GrantKey, set[str]]) -> FundingCitation:
        decided = resolve_work(
            work.everything(),
            work.link_cores(),
            answers,
            self.rules,
            overrides=work.overrides,
            data_year=self.context.today.year,
        )
        stored = {string_key(s["raw"]): s for s in work.stored["strings"]} if work.stored else {}
        strings: list[StoredString] = []
        for outcome in decided.strings:
            key = string_key(outcome.raw)
            string = self._string(outcome, stored.get(key), fresh=key in work.fresh, read=work.read)
            strings.append(string)
            if string["outcome"] == "grant":
                for grant in string["grants"]:
                    awards.setdefault(grant, set()).update(outcome.openalex_awards)
        links = self._nih_links(work, dict(decided.links))
        records = {record["id"] for record in work.input.records}
        stored_jats = work.stored["jats_checked"] if work.stored else {}
        jats = {record: date for record, date in stored_jats.items() if record in records} | work.jats
        return cast(
            FundingCitation,
            {
                "schema": 1,
                "work": work.id,
                "funding_version": self.config.funding_version,
                "strings": strings,
                "nih_links": links,
                "jats_checked": dict(sorted(jats.items())),
                "grants": _derived(strings, links),
            },
        )

    def _independent(self, outcome: StringOutcome) -> bool:
        """A decision no funder has a part in: it may replace a stored one at any time."""
        if outcome.method == "override" or outcome.outcome in NO_FUNDER_OUTCOMES:
            return True
        return (
            outcome.outcome == "grant"
            and outcome.method in NIH_METHODS
            and all(family(key, self.rules) in REPORTER_FAMILIES for key in outcome.grants)
        )

    def _string(
        self, outcome: StringOutcome, old: StoredString | None, *, fresh: bool, read: set[FundingSource]
    ) -> StoredString:
        """One string's line: its sightings pooled with the stored ones, and its decision.

        The stored decision stands unless every source that has shown the string was read this
        run, its new decision needs no funder, or the override that made it has been lifted.
        """
        new: StoredString = {
            "raw": outcome.raw,
            "funders": sorted(outcome.funders),
            "sources": sorted(outcome.sources),
            "first_seen": self.today,
            "last_seen": self.today,
            "outcome": outcome.outcome,
            "grants": sorted(outcome.grants),
            "method": outcome.method,
            "note": outcome.note,
        }
        if old is None:
            return new
        sources = sorted({*old["sources"], *(outcome.sources if fresh else ())})
        lifted = old["method"] == "override" and outcome.method != "override"
        decided = new if (fresh and set(sources) <= read) or lifted or self._independent(outcome) else old
        last = old["last_seen"]
        return {
            "raw": old["raw"],
            "funders": sorted({*old["funders"], *(outcome.funders if fresh else ())}),
            "sources": sources,
            "first_seen": old["first_seen"],
            "last_seen": advance_last_seen(last, self.today, self._refresh_days) if fresh else last,
            "outcome": decided["outcome"],
            "grants": decided["grants"],
            "method": decided["method"],
            "note": decided["note"],
        }

    @property
    def _refresh_days(self) -> int:
        return int(self.config.settings["last_seen_refresh_days"])

    def _nih_links(self, work: _Work, keyed: dict[str, GrantKey]) -> list[NihLink]:
        """The work's links: this run's and every stored one, which a source never removes (§9.4)."""
        keyed |= self._contract_links(work)
        stored = work.stored_links()
        links: list[NihLink] = []
        for core, key in sorted(keyed.items()):
            old = stored.get(core)
            seen = core in work.links
            last = old["last_seen"] if old else self.today
            links.append(
                {
                    "core": core,
                    "grant": key,
                    "first_seen": old["first_seen"] if old else self.today,
                    "last_seen": advance_last_seen(last, self.today, self._refresh_days) if seen else last,
                }
            )
        return links

    # --- grants -----------------------------------------------------------------------------------

    def _grants(
        self,
        lines: Mapping[WorkId, FundingCitation],
        inputs: Sequence[WorkInput],
        awards: Mapping[GrantKey, set[str]],
    ) -> dict[GrantKey, Grant]:
        years = {work.id: work.year for work in inputs}
        first: dict[GrantKey, int] = {}
        written: dict[GrantKey, Counter[str]] = {}
        for line in lines.values():
            year = years.get(line["work"])
            for key in line["grants"]:
                if year is not None:
                    first[key] = min(year, first.get(key, year))
            for string in line["strings"]:
                for key in string["grants"]:
                    if alnum(key.rsplit(":", 1)[-1]) in alnum(string["raw"]):
                        written.setdefault(key, Counter())[" ".join(string["raw"].split())] += 1
        keys = sorted({key for line in lines.values() for key in line["grants"]})
        return {
            key: self._grant(key, awards.get(key, set()), written.get(key), first.get(key)) for key in keys
        }

    def _info(self, key: GrantKey, kind: GrantFamily) -> _Info | None:
        """This run's facts and record for a grant, from whichever source holds it (§7.1)."""
        _, _, rest = key.partition(":")
        info: _Info | None = None
        if kind == "reporter" or (kind == "nih_contract" and CORE.fullmatch(rest)):
            info = _reporter_info(self.rows[rest]) if rest in self.rows else None
        elif kind == "nih_contract":
            info = _reporter_info(self.contracts[rest]) if self.contracts.get(rest) else None
        elif kind == "nih_task_order":
            idiq, order = rest.split(":")
            rows = task_order_rows(self.contracts.get(idiq) or [], order)
            info = _reporter_info([cast(Row, row) for row in rows])
        elif kind == "nsf":
            info = self.nsf.get(rest)
        elif kind == "us_federal":
            agency, _, number = rest.partition(":")
            info = self.usaspending.get((agency, number))
        if info is not None and info.learned is not None:
            code, name, parent = info.learned
            self.learned[code] = (name, parent)
        return info

    def _award_info(self, awards: Iterable[str]) -> _Info | None:
        """An OpenAlex-valued grant's record, from the lowest-numbered award fetched this run."""
        fetched = [entity for award in awards if (entity := self.awards.get(award)) is not None]
        if not fetched:
            return None
        lead = min(fetched, key=lambda entity: (len(entity.fact["id"]), entity.fact["id"]))
        return _Info({}, None, lead.title, lead.pis, lead.organization, lead.start, lead.end)

    def _default_agency(self, key: GrantKey, kind: GrantFamily) -> AgencyCode:
        prefix, _, rest = key.partition(":")
        if kind in ("nih_contract", "nih_task_order"):
            return NIH
        if kind == "us_federal":
            return rest.partition(":")[0]
        if kind == "nsf":
            return "NSF"
        return prefix

    def _grant(
        self, key: GrantKey, found: set[str], written: Mapping[str, int] | None, first_year: int | None
    ) -> Grant:
        stored = self.stored.grants.get(key)
        kind = family(key, self.rules)
        _, _, rest = key.partition(":")
        info = self._info(key, kind)
        facts: dict[str, Any] = dict(stored["facts"]) if stored else {}
        if info is not None:
            facts.update(info.facts)
        awards = (
            set() if kind == "miscellaneous" else found | set(stored["openalex_awards"] if stored else ())
        )
        kept = {award["id"]: award for award in facts.get("openalex", [])}
        entries = []
        for award in sorted(awards):
            entity = self.awards.get(award)
            if entity is not None:
                entries.append(entity.fact)
            elif award in kept:
                entries.append(kept[award])
        facts.pop("openalex", None)
        if entries:
            facts["openalex"] = entries
        if kind == "miscellaneous":
            facts = {}
        fetched = info is not None or any(self.awards.get(award) is not None for award in awards)
        described = (
            info
            if info is not None
            else (self._award_info(awards) if kind in ("agency", "openalex_funder") else None)
        )
        start = described.start if described else (stored["start"] if stored else None)
        end = described.end if described else (stored["end"] if stored else None)
        nsf = cast(dict[str, Any], facts.get("nsf") or {})
        agency = (described.agency if described else None) or (stored["agency"] if stored else None)
        agency = agency or self._default_agency(key, kind)
        reason = institution_wide(key, nsf.get("program"), self.rules)
        valued = value_grant(
            kind,
            cast(GrantFacts, facts),
            end=end,
            first_year=first_year,
            rules=self.rules,
            rates=self.rates,
            today=self.context.today,
        )
        checked = self.today
        if stored is not None:
            checked = (
                advance_last_seen(stored["checked"], self.today, self._refresh_days)
                if fetched
                else stored["checked"]
            )
        return {
            "schema": 1,
            "key": key,
            "agency": agency,
            "family": kind,
            "number": self._number(key, kind, written),
            "activity": rest[:3] if kind in ("reporter", "nih_contract") and CORE.fullmatch(rest) else None,
            "category": self._category(key, kind, agency, nsf),
            "status": "unresolved" if kind == "miscellaneous" else "resolved",
            "scope": "institution-wide" if reason else "project",
            "scope_reason": reason,
            "title": described.title if described else (stored["title"] if stored else None),
            "pis": _sorted_people(described.pis if described else (stored["pis"] if stored else [])),
            "organization": described.organization
            if described
            else (stored["organization"] if stored else None),
            "start": start,
            "end": end,
            "facts": cast(GrantFacts, facts),
            "amount": valued.amount,
            "flags": sorted(valued.flags),
            "openalex_awards": sorted(awards),
            "first_seen": stored["first_seen"] if stored else self.today,
            "checked": checked,
        }

    @staticmethod
    def _number(key: GrantKey, kind: GrantFamily, written: Mapping[str, int] | None) -> str:
        """The display form (§11.4): the core, the contract, the order, NSF's digits, else as written."""
        _, _, rest = key.partition(":")
        if kind in ("reporter", "nih_contract", "nsf"):
            return rest
        if kind == "nih_task_order":
            return rest.split(":")[1]
        if written:
            return min(written, key=lambda form: (-written[form], form))
        return rest.rsplit(":", 1)[-1]

    def _category(self, key: GrantKey, kind: GrantFamily, agency: AgencyCode, nsf: Mapping[str, Any]) -> Any:
        _, _, rest = key.partition(":")
        if kind == "reporter":
            return nih_category(rest[:3] if CORE.fullmatch(rest) else None, self.rules)
        if kind in ("nih_contract", "nih_task_order"):
            return "contract"
        if kind == "nsf":
            values = {"programme": nsf.get("program"), "type": nsf.get("type")}
            return agency_category(self.rules.agencies.get("NSF"), values)
        if kind in ("us_federal", "agency"):
            return agency_category(self.rules.agencies.get(agency), {})
        return "other"

    # --- agencies and lookups ------------------------------------------------------------------------

    def _agencies(self, grants: Mapping[GrantKey, Grant], *, full: bool) -> dict[AgencyCode, Agency]:
        """Every agency a grant names, with every parent (invariant F5, §8.3)."""
        unknown = sorted(
            {
                grant["agency"]
                for grant in grants.values()
                if grant["family"] == "openalex_funder"
                and (full or grant["agency"] not in self.stored.agencies)
            }
        )
        for batch in _chunks(unknown, ID_BATCH):
            for found in self._ask("openalex", (), partial(self._funder_entities, batch)):
                self.funders.update({code: found.get(code) for code in batch})
        lines: dict[AgencyCode, Agency] = {}
        pending = sorted({grant["agency"] for grant in grants.values()}, reverse=True)
        while pending:
            code = pending.pop()
            if code in lines:
                continue
            lines[code] = self._agency(code)
            parent = lines[code]["parent"]
            if parent is not None and parent not in lines:
                pending.append(parent)
        return dict(sorted(lines.items()))

    def _funder_entities(self, batch: Sequence[str]) -> dict[str, tuple[str, str | None]]:
        found: dict[str, tuple[str, str | None]] = {}
        for entity in self.sources.openalex.funders_by_ids(batch):
            code = str(entity["id"]).rsplit("/", 1)[-1].upper()
            name = _text(entity.get("display_name"))
            country = (_text(entity.get("country_code")) or "").upper()
            if name:
                found[code] = (name, country if re.fullmatch(r"[A-Z]{2}", country) else None)
        return found

    def _agency(self, code: AgencyCode) -> Agency:
        """One agency's line: configured, learned from RePORTER or OpenAlex, or as stored."""
        if code == MISC:
            return MISC_AGENCY
        configured = self.rules.agencies.get(code)
        if configured is not None:
            return {
                "schema": 1,
                "code": code,
                "name": configured.name,
                "short_name": configured.short_name,
                "parent": configured.parent,
                "group": configured.group,
                "country": configured.country,
                "origin": "config",
            }
        if code in self.learned:
            name, parent = self.learned[code]
            return {
                "schema": 1,
                "code": code,
                "name": name,
                "short_name": code,
                "parent": parent,
                "group": "us_federal",
                "country": "US",
                "origin": "reporter",
            }
        funder = self.funders.get(code)
        if funder is None and code in self.stored.agencies:
            return self.stored.agencies[code]
        if funder is not None or re.fullmatch(r"F[0-9]+", code):
            name, country = funder or (self.funder_names.get(code, code), None)
            return {
                "schema": 1,
                "code": code,
                "name": name,
                "short_name": None,
                "parent": None,
                "group": "us_nonfederal" if country == "US" else "non_us",
                "country": country,
                "origin": "openalex",
            }
        return {  # an institute RePORTER named without its name: NIH's, by its code
            "schema": 1,
            "code": code,
            "name": code,
            "short_name": code,
            "parent": NIH,
            "group": "us_federal",
            "country": "US",
            "origin": "reporter",
        }

    def _lookups(self) -> list[FundingLookup]:
        """The memo (§8.1): each miss or institute-and-serial answer asked this run, and the rest
        as stored. A probe asked again moves its `recheck_after`; one now answered is forgotten."""
        lookups = dict(self.stored.lookups)
        answered: dict[Query, list[str] | None] = {core_query(core): [] for core in self.unheld}
        answered |= {core_query(core): None for core in self.rows}
        answered |= {split_query(ic, serial): list(cores) for (ic, serial), cores in self.splits.items()}
        answered |= {contract_query(number): None if rows else [] for number, rows in self.contracts.items()}
        answered |= {nsf_query(award): None if info else [] for award, info in self.nsf.items()}
        answered |= {
            usaspending_query(*pair): None if info else [] for pair, info in self.usaspending.items()
        }
        answered |= {award_query(award): None if entity else [] for award, entity in self.awards.items()}
        recheck = (
            self.context.today + dt.timedelta(days=int(self.refresh["recheck_unresolved_days"]))
        ).isoformat()
        for query, found in answered.items():
            if found is None:
                lookups.pop(query, None)
                continue
            old = lookups.get(query)
            same = old is not None and old["found"] == sorted(found)
            lookups[query] = {
                "schema": 1,
                "source": query[0],
                "query": query[1],
                "found": sorted(found),
                "checked": advance_last_seen(old["checked"], self.today, self._refresh_days)
                if old and same
                else self.today,
                "recheck_after": recheck,
            }
        return list(lookups.values())
