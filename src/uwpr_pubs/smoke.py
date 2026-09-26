"""`uwpr-pubs smoke`: do the sources still answer in the expected shape? (docs/03 §8, §11.3)

The only live test. Each check is measured against what the source last answered, so a source
that changes its syntax, or stops matching our queries, fails here rather than silently shrinking
a run. It is deliberately cheap: about $0.002 of OpenAlex budget.

**A failure is not automatically a reason to skip the week.** Smoke classifies each one the way
§9 classifies a failure during a run, because the two need opposite responses: an outage needs
patience, and a changed source needs a person. Only the second blocks (docs/03 §8, changed
2026-09-20, after a 503 on two of nine Europe PMC queries cost a whole weekly run, and again
2026-09-26, after Europe PMC answering "0 results" cost the first scheduled one).

**The funding sources are checked too, and never block** (docs/09 §13.2, F16). Each has a known
answer, classified like every other check, but funding must never stop the publication update: a
funding source that is down or has changed shape degrades the funding stage, and the week goes
ahead. The verdict names them apart, so a person can see what the funding stage will lack.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any

from uwpr_pubs.config import Config
from uwpr_pubs.http import BudgetExceededError, HttpClient, HttpError
from uwpr_pubs.runtime import api_keys
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.ncbi import Ncbi
from uwpr_pubs.sources.nsf import Nsf
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.sources.reporter import Reporter
from uwpr_pubs.sources.usaspending import UsaSpending
from uwpr_pubs.sources.uwpr_site import UwprSite

# Each floor sits about 10% below what its source answered when re-measured on 2026-09-26: 306
# list entries, 139 OpenAlex works, 63 Crossref works and 185 Europe PMC results. A floor is there
# to catch a query that has stopped matching, which is a collapse, not a dip. Two of them used to
# equal their live counts exactly, and a live index drifts down as well as up — OpenAlex's count
# fell from 140 to 139 in five days — so a single withdrawn record would have blocked a week.
MIN_LIST_ENTRIES = 275
MIN_OPENALEX_AWARD = 125
MIN_CROSSREF_AWARD = 56
MIN_EUROPEPMC_IDENTIFIER = 166
# What a source's control query must reach for the source to count as answering at all
# (`_floor_check`). Measured 2026-09-26: 352,521, 11,473,447 and 124,067,625.
CONTROL_FLOOR = 100_000
EUROPEPMC_CONTROL = "proteomics"
OPENALEX_CONTROL = "publication_year:2020"
CROSSREF_CONTROL = "type:journal-article"
KNOWN_PMID = "19070509"  # the sample store's oldest work
KNOWN_PMCID = "PMC3073872"
SERVER_ERROR_FLOOR = 500

# The funding sources' known answers (docs/09 §13.2), each confirmed live on 2026-09-26. One or two
# requests a source; RePORTER's go through its adapter, sorted and without sub-projects.
# P41GM103533 has ended: 13 parent rows, FY2012-2021, $20,699,505, every one with an amount.
REPORTER_CORE = "P41GM103533"
MIN_REPORTER_ROWS = 12
REPORTER_LINK = "S10RR017262"  # NIH links KNOWN_PMID to it, and to T32GM007750
NSF_AWARD = "1908587"  # fundsObligatedAmt "900000"
USASPENDING_AWARD = "NNX14AJ87G"  # NASA; total_obligation 796,089.19
USASPENDING_OBLIGATION = 796_089.19
AMOUNT_TOLERANCE = 0.01  # as docs/09 §17 compares a contract's amount
PUBMED_GRANT = "RR017262"  # KNOWN_PMID's GrantList has it as "S10 RR017262" and "1S10RR-017262-01"
OPENALEX_AWARD = "G3111500291"  # NSF 1908587 in OpenAlex: 900000.0 USD, from nsf_award_search
# Two records whose Crossref funder metadata names the resource code; one batch must answer both.
CROSSREF_FUNDER_DOIS = ("10.1002/pmic.200900216", "10.1002/pmic.201000616")
RESOURCE_CODE = "UWPR95794"
NOT_ALPHANUMERIC = re.compile(r"[^0-9A-Z]")


class Outcome(StrEnum):
    """What a check found, and therefore what happens to the weekly run (docs/03 §8, §9).

    Three states rather than two, because "this source is down" and "this source has changed"
    are different facts with opposite remedies. Only `PROBLEM` blocks.
    """

    OK = "ok"
    OUTAGE = "outage"
    PROBLEM = "problem"

    @property
    def tag(self) -> str:
        """The four-column marker the log is read by. `PASS` and `FAIL` keep their old meaning."""
        return {Outcome.OK: "PASS", Outcome.OUTAGE: "DOWN", Outcome.PROBLEM: "FAIL"}[self]


@dataclass(frozen=True)
class Check:
    """One source's answer. `blocks` is false for a funding source, which never stops the run."""

    name: str
    outcome: Outcome
    detail: str
    blocks: bool = True

    def line(self) -> str:
        return f"{self.outcome.tag}  {self.name}: {self.detail}"


def classify(exc: Exception) -> Outcome:
    """Outage or problem? Decided from `HttpError.status`, as §9 decides it during a run.

    `status` is `None` when no answer ever arrived — a timeout, a DNS or connection failure, or
    an empty body (`MalformedReplyError`) — and a 5xx is the source saying it is broken. Both
    pass with time, and the pipeline is built to proceed without a source (P4), so neither
    blocks.

    Everything else is a statement about us rather than about the source's health: 401 and 403
    mean a key, another 4xx means a query the source no longer accepts, and a `KeyError`, a
    `ValueError` or a body that is there but will not parse means a reply we could no longer
    read. Those need a person, and a run spent on
    them is wasted.

    The budget guard is the one `HttpError` that is not a source failure at all: it is raised
    before anything is sent, so it has no status, and it blocks. A run that begins with no
    OpenAlex budget left would only alert (§9) on its way to the same conclusion.
    """
    if not isinstance(exc, HttpError) or isinstance(exc, BudgetExceededError):
        return Outcome.PROBLEM
    if exc.status is None or exc.status >= SERVER_ERROR_FLOOR:
        return Outcome.OUTAGE
    return Outcome.PROBLEM


def blocked(checks: Sequence[Check]) -> bool:
    """Does anything here need a person before the run is worth starting?

    A funding source never does, whatever it answered: funding must never block the publication
    update (docs/09 F16), and the funding stage degrades on its own when a source fails (§9.4).
    """
    return any(check.blocks and check.outcome is Outcome.PROBLEM for check in checks)


def _count(names: Sequence[str], singular: str, plural: str) -> str:
    return f"{len(names)} {singular if len(names) == 1 else plural}"


def verdict(checks: Sequence[Check]) -> str:
    """The last line: may the run proceed, and why. Written to be read without counting lines.

    Funding sources that failed are named apart, with their state, because they mean something
    different: what the funding stage will lack this week, never whether the week happens.
    """
    outages = [check.name for check in checks if check.blocks and check.outcome is Outcome.OUTAGE]
    problems = [check.name for check in checks if check.blocks and check.outcome is Outcome.PROBLEM]
    funding = ", ".join(
        f"{check.name} ({check.outcome.tag})"
        for check in checks
        if not check.blocks and check.outcome is not Outcome.OK
    )
    if problems:
        line = (
            f"VERDICT  BLOCKED: {_count(problems, 'check needs', 'checks need')} a person "
            f"({', '.join(problems)}); a key, a query or a source's shape has changed."
        )
        if outages:
            line += (
                f" {_count(outages, 'source is', 'sources are')} also down"
                f" ({', '.join(outages)}), which alone would not have blocked the run."
            )
        if funding:
            line += f" Funding sources failed as well ({funding}), which never blocks the run."
        return line
    if outages:
        line = (
            f"VERDICT  PROCEED: {_count(outages, 'source is', 'sources are')} down"
            f" ({', '.join(outages)}); the run degrades honestly, removes nothing, and alerts if the"
            " same source fails three runs running."
        )
        if funding:
            line += f" Funding sources: {funding} — the funding stage will degrade."
        return line
    if funding:
        return (
            f"VERDICT  PROCEED: funding sources: {funding} — the funding stage will degrade; the"
            " publication update proceeds."
        )
    return f"VERDICT  PROCEED: all {len(checks)} checks passed."


def _failed(name: str, exc: Exception) -> Check:
    return Check(name, classify(exc), f"{type(exc).__name__}: {exc}")


def _check(name: str, run: Callable[[], tuple[bool, str]]) -> Check:
    try:
        ok, detail = run()
    except (HttpError, KeyError, ValueError) as exc:
        return _failed(name, exc)
    # Outside the counts (`_floor_check`), a content assertion that returns false is a problem:
    # the source answered, and the answer was not the one that was measured.
    return Check(name, Outcome.OK if ok else Outcome.PROBLEM, detail)


def _funding_check(name: str, run: Callable[[], tuple[bool, str]]) -> Check:
    """A funding source's check: classified as `_check` classifies, and never blocking.

    Any exception at all is caught here, where `_check` lets an unexpected one through to stop the
    command: a funding source answering in a shape nobody foresaw must not be what stops the
    publication update, as a traceback here would (docs/09 F16).
    """
    try:
        check = _check(name, run)
    except Exception as exc:  # whatever a funding source does, the week goes ahead
        check = _failed(name, exc)
    return replace(check, blocks=False)


def _amount(value: Any) -> float | None:
    """A positive amount, whether the source sends a number or a numeral (NSF sends strings)."""
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        return None
    try:
        amount = float(value)
    except ValueError:
        return None
    return amount if amount > 0 else None


def _years(rows: Sequence[dict[str, Any]]) -> str:
    years = sorted(year for row in rows if isinstance(year := row.get("fiscal_year"), int))
    return f"FY{years[0]}-{years[-1]}" if years else "no fiscal years"


def _floor_check(
    name: str, count: Callable[[], int], floor: int, unit: str, control: Callable[[], int]
) -> Check:
    """A count that must reach its floor, and a control query when it does not (docs/03 §8).

    Below its floor, a count means one of two opposite things and cannot say which: the source has
    stopped matching our query, which needs a person, or it is answering empty for everything,
    which needs patience. A zero is no evidence either way, because Europe PMC answers a field it
    does not know with an ordinary, well-formed zero (measured 2026-09-26). So the same source is
    asked something it answers in the millions. If that collapses too, the source is down; if it
    holds, the fault is in our query. It is asked only on a failure, so a passing check costs
    nothing extra.
    """
    try:
        found = count()
    except (HttpError, KeyError, ValueError) as exc:
        return _failed(name, exc)
    detail = f"{found} {unit}; expected at least {floor}"
    if found >= floor:
        return Check(name, Outcome.OK, detail)
    try:
        baseline = control()
    except (HttpError, KeyError, ValueError) as exc:
        # A control that fails outright is one more failure, and `classify` reads it as any other.
        why = f"{type(exc).__name__}: {exc}"
        return Check(name, classify(exc), f"{detail}; the control query failed too: {why}")
    if baseline < CONTROL_FLOOR:
        return Check(
            name, Outcome.OUTAGE, f"{detail}; the control query found only {baseline}, so the source is empty"
        )
    return Check(
        name,
        Outcome.PROBLEM,
        f"{detail}; the control query found {baseline}, so the source is fine and our query is not",
    )


def run_smoke(config: Config, client: HttpClient) -> list[Check]:
    openalex_key, ncbi_key = api_keys()
    openalex = OpenAlex(client, config.contact, openalex_key)
    crossref = Crossref(client, config.contact)
    europepmc = EuropePmc(client, config.contact)
    ncbi = Ncbi(client, config.contact, ncbi_key)
    site = UwprSite(
        client,
        config.settings["official_list"]["index_url"],
        config.settings["official_list"]["page_link_pattern"],
    )

    def europepmc_control() -> int:
        return europepmc.count(EUROPEPMC_CONTROL)

    def openalex_control() -> int:
        return openalex.count(OPENALEX_CONTROL)

    def crossref_control() -> int:
        return crossref.count(CROSSREF_CONTROL)

    def official_list() -> tuple[bool, str]:
        entries = site.entries()
        pages: dict[str, int] = {}
        for _, entry in entries:
            pages[entry.page] = pages.get(entry.page, 0) + 1
        shape = ", ".join(f"{page}: {count}" for page, count in sorted(pages.items()))
        ok = len(entries) >= MIN_LIST_ENTRIES and all(count > 0 for count in pages.values())
        return ok, f"{len(entries)} entries ({shape}); expected at least {MIN_LIST_ENTRIES}"

    def europepmc_fulltext() -> tuple[bool, str]:
        body = europepmc.full_text_xml(KNOWN_PMCID)
        return body is None or b"<" in body[:200], "answers (None means not open access, which is fine)"

    def ncbi_converter() -> tuple[bool, str]:
        records = list(ncbi.convert([KNOWN_PMID], "pmid"))
        pmcid = records[0].get("pmcid") if records else None
        return pmcid == KNOWN_PMCID, f"PMID {KNOWN_PMID} -> {pmcid}; expected {KNOWN_PMCID}"

    def ncbi_fulltext() -> tuple[bool, str]:
        body = ncbi.pmc_xml(KNOWN_PMCID)
        ok = bool(body) and b"<article" in (body or b"")[:4000]
        return ok, f"{len(body or b'')} bytes of JATS for {KNOWN_PMCID}"

    return [
        _check("official list", official_list),
        _floor_check(
            "openalex award filter",
            lambda: openalex.count("awards.funder_award_id:UWPR95794"),
            MIN_OPENALEX_AWARD,
            "works",
            openalex_control,
        ),
        _floor_check(
            "openalex full-text search",
            lambda: openalex.count("fulltext.search:UWPR95794"),
            1,
            "works with the code in OpenAlex full text",
            openalex_control,
        ),
        _floor_check(
            "crossref award filter",
            lambda: crossref.count("award.number:UWPR95794"),
            MIN_CROSSREF_AWARD,
            "works",
            crossref_control,
        ),
        _floor_check(
            "europe pmc search",
            lambda: europepmc.count('"UWPR95794" OR "UWPR 95794"'),
            MIN_EUROPEPMC_IDENTIFIER,
            "results",
            europepmc_control,
        ),
        _check("europe pmc full text", europepmc_fulltext),
        _check("ncbi id converter", ncbi_converter),
        _check("ncbi pmc full text", ncbi_fulltext),
        *funding_checks(client, config.contact, openalex_key, ncbi_key),
    ]


def _calls(client: HttpClient, host: str) -> int:
    usage = client.usage.get(host)
    return usage.calls if usage else 0


def funding_checks(
    client: HttpClient, contact: str, openalex_key: str | None, ncbi_key: str | None
) -> list[Check]:
    """One known answer per funding source (docs/09 §13.2), none of which ever blocks the run.

    Eight requests in all, one OpenAlex filter page among them ($0.0001).
    """
    reporter = Reporter(client, contact)
    nsf = Nsf(client, contact)
    usaspending = UsaSpending(client, contact)
    ncbi = Ncbi(client, contact, ncbi_key)
    openalex = OpenAlex(client, contact, openalex_key)
    crossref = Crossref(client, contact)

    def reporter_projects() -> tuple[bool, str]:
        rows = reporter.projects([REPORTER_CORE])
        ours = [row for row in rows if row.get("core_project_num") == REPORTER_CORE]
        amounts = [amount for row in ours if (amount := _amount(row.get("award_amount"))) is not None]
        subprojects = sum(1 for row in rows if row.get("subproject_id"))
        ok = len(rows) == len(ours) == len(amounts) >= MIN_REPORTER_ROWS and not subprojects
        return ok, (
            f"{len(rows)} rows for {REPORTER_CORE} ({_years(ours)}), {len(amounts)} with an award_amount"
            f" (${sum(amounts):,.0f}), {subprojects or 'none'} a sub-project; expected at least"
            f" {MIN_REPORTER_ROWS} parent rows, every one with an amount"
        )

    def reporter_links() -> tuple[bool, str]:
        cores = sorted({str(link.get("coreproject") or "") for link in reporter.publications([KNOWN_PMID])})
        return REPORTER_LINK in cores, (
            f"PMID {KNOWN_PMID} links {', '.join(cores) or 'nothing'}; expected {REPORTER_LINK} among them"
        )

    def nsf_award() -> tuple[bool, str]:
        award = nsf.award(NSF_AWARD)
        if award is None:
            return False, f"NSF knows no award {NSF_AWARD}; expected one with fundsObligatedAmt"
        obligated = award.get("fundsObligatedAmt")
        return _amount(obligated) is not None, (
            f"award {NSF_AWARD}: fundsObligatedAmt {obligated!r}; expected an amount"
        )

    def usaspending_award() -> tuple[bool, str]:
        searched = usaspending.awards([USASPENDING_AWARD])
        rows = [row for row in searched if row.get("Award ID") == USASPENDING_AWARD]
        generated = str(rows[0].get("generated_internal_id") or "") if len(rows) == 1 else ""
        if not generated:
            return False, f"{len(rows)} grants numbered {USASPENDING_AWARD}, expected 1 with an internal id"
        detail = usaspending.award_detail(generated)
        obligation = _amount(detail.get("total_obligation")) if detail else None
        expected = USASPENDING_OBLIGATION
        ok = obligation is not None and abs(obligation - expected) <= AMOUNT_TOLERANCE * expected
        shown = "none" if obligation is None else f"${obligation:,.2f}"
        return ok, (
            f"{USASPENDING_AWARD}: total_obligation {shown}; expected ${expected:,.2f}"
            f" ± {AMOUNT_TOLERANCE:.0%}"
        )

    def pubmed_grant_list() -> tuple[bool, str]:
        found = ncbi.pubmed_grants([KNOWN_PMID]).get(KNOWN_PMID)
        grants = found.grants if found else ()
        numbers = [NOT_ALPHANUMERIC.sub("", (grant.grant_id or "").upper()) for grant in grants]
        ok = any(PUBMED_GRANT in number for number in numbers)
        return ok, (
            f"PMID {KNOWN_PMID}: {len(numbers)} grants in its GrantList; expected {PUBMED_GRANT} among them"
        )

    def openalex_award() -> tuple[bool, str]:
        award = next(iter(openalex.awards_by_ids([OPENALEX_AWARD])), None)
        if award is None:
            return False, f"no award {OPENALEX_AWARD}; expected one with an amount"
        amount = award.get("amount")
        return _amount(amount) is not None, (
            f"{OPENALEX_AWARD} ({award.get('funder_award_id')}): amount {amount!r}"
            f" {award.get('currency')}; expected an amount"
        )

    def crossref_funders() -> tuple[bool, str]:
        # The adapter asks any DOI a batch misses on its own, which would hide a batch filter that
        # had stopped working. So the requests are counted: both answers must come from one.
        before = _calls(client, "crossref")
        found = crossref.funders_by_dois(CROSSREF_FUNDER_DOIS)
        asked = _calls(client, "crossref") - before
        naming = [
            doi
            for doi in CROSSREF_FUNDER_DOIS
            if any(RESOURCE_CODE in (funder.get("award") or []) for funder in found.get(doi, []))
        ]
        ok = asked == 1 and len(naming) == len(CROSSREF_FUNDER_DOIS)
        return ok, (
            f"{len(found)} of {len(CROSSREF_FUNDER_DOIS)} DOIs in {asked} request{'s' * (asked != 1)},"
            f" {len(naming)} naming {RESOURCE_CODE}; expected both, in one request"
        )

    return [
        _funding_check("nih reporter projects", reporter_projects),
        _funding_check("nih reporter publications", reporter_links),
        _funding_check("nsf award api", nsf_award),
        _funding_check("usaspending award", usaspending_award),
        _funding_check("pubmed grant list", pubmed_grant_list),
        _funding_check("openalex award amount", openalex_award),
        _funding_check("crossref funder batch", crossref_funders),
    ]
