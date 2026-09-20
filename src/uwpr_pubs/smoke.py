"""`uwpr-pubs smoke`: do the sources still answer in the expected shape? (docs/03 §8, §11.3)

The only live test. Each check is measured against what Phase 1 §4.1 and §4.4 found, so a source
that changes its syntax, or quietly starts returning nothing, fails here rather than silently
shrinking a run. It is deliberately cheap: about $0.002 of OpenAlex budget.

**A failure is not automatically a reason to skip the week.** Smoke classifies each one the way
§9 classifies a failure during a run, because the two need opposite responses: an outage needs
patience, and a changed source needs a person. Only the second blocks (docs/03 §8, changed
2026-09-20, after a 503 on two of nine Europe PMC queries cost a whole weekly run).
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum

from uwpr_pubs.config import Config
from uwpr_pubs.http import BudgetExceededError, HttpClient, HttpError
from uwpr_pubs.runtime import api_keys
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.ncbi import Ncbi
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.sources.uwpr_site import UwprSite

# Floors from Phase 1's measurements (§4.1 official list, §4.4 per channel). They are minimums:
# the corpus grows, so a number below these means something broke.
MIN_LIST_ENTRIES = 300
MIN_OPENALEX_AWARD = 135
MIN_CROSSREF_AWARD = 63
MIN_EUROPEPMC_IDENTIFIER = 185
KNOWN_PMID = "19070509"  # the sample store's oldest work
KNOWN_PMCID = "PMC3073872"
SERVER_ERROR_FLOOR = 500


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
    name: str
    outcome: Outcome
    detail: str

    def line(self) -> str:
        return f"{self.outcome.tag}  {self.name}: {self.detail}"


def classify(exc: Exception) -> Outcome:
    """Outage or problem? Decided from `HttpError.status`, as §9 decides it during a run.

    `status` is `None` when no answer ever arrived — a timeout, a DNS or connection failure — and
    a 5xx is the source saying it is broken. Both pass with time, and the pipeline is built to
    proceed without a source (P4), so neither blocks.

    Everything else is a statement about us rather than about the source's health: 401 and 403
    mean a key, another 4xx means a query the source no longer accepts, and a `KeyError` or
    `ValueError` means a reply we could no longer parse. Those need a person, and a run spent on
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
    """Does anything here need a person before the run is worth starting?"""
    return any(check.outcome is Outcome.PROBLEM for check in checks)


def _count(names: Sequence[str], singular: str, plural: str) -> str:
    return f"{len(names)} {singular if len(names) == 1 else plural}"


def verdict(checks: Sequence[Check]) -> str:
    """The last line: may the run proceed, and why. Written to be read without counting lines."""
    outages = [check.name for check in checks if check.outcome is Outcome.OUTAGE]
    problems = [check.name for check in checks if check.outcome is Outcome.PROBLEM]
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
        return line
    if outages:
        return (
            f"VERDICT  PROCEED: {_count(outages, 'source is', 'sources are')} down"
            f" ({', '.join(outages)}); the run degrades honestly, removes nothing, and alerts if the"
            " same source fails three runs running."
        )
    return f"VERDICT  PROCEED: all {len(checks)} checks passed."


def _check(name: str, run: Callable[[], tuple[bool, str]]) -> Check:
    try:
        ok, detail = run()
    except (HttpError, KeyError, ValueError) as exc:
        return Check(name, classify(exc), f"{type(exc).__name__}: {exc}")
    # A content assertion that returns false is always a problem: the source answered, and the
    # answer was not the one Phase 1 measured.
    return Check(name, Outcome.OK if ok else Outcome.PROBLEM, detail)


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

    def official_list() -> tuple[bool, str]:
        entries = site.entries()
        pages: dict[str, int] = {}
        for _, entry in entries:
            pages[entry.page] = pages.get(entry.page, 0) + 1
        shape = ", ".join(f"{page}: {count}" for page, count in sorted(pages.items()))
        ok = len(entries) >= MIN_LIST_ENTRIES and all(count > 0 for count in pages.values())
        return ok, f"{len(entries)} entries ({shape}); expected at least {MIN_LIST_ENTRIES}"

    def openalex_award() -> tuple[bool, str]:
        count = openalex.count("awards.funder_award_id:UWPR95794")
        return count >= MIN_OPENALEX_AWARD, f"{count} works; expected at least {MIN_OPENALEX_AWARD}"

    def openalex_fulltext() -> tuple[bool, str]:
        count = openalex.count("fulltext.search:UWPR95794")
        return count > 0, f"{count} works with the code in OpenAlex full text"

    def crossref_award() -> tuple[bool, str]:
        count = crossref.count("award.number:UWPR95794")
        return count >= MIN_CROSSREF_AWARD, f"{count} works; expected at least {MIN_CROSSREF_AWARD}"

    def europepmc_identifier() -> tuple[bool, str]:
        count = europepmc.count('"UWPR95794" OR "UWPR 95794"')
        ok = count >= MIN_EUROPEPMC_IDENTIFIER
        return ok, f"{count} results; expected at least {MIN_EUROPEPMC_IDENTIFIER}"

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
        _check("openalex award filter", openalex_award),
        _check("openalex full-text search", openalex_fulltext),
        _check("crossref award filter", crossref_award),
        _check("europe pmc search", europepmc_identifier),
        _check("europe pmc full text", europepmc_fulltext),
        _check("ncbi id converter", ncbi_converter),
        _check("ncbi pmc full text", ncbi_fulltext),
    ]
