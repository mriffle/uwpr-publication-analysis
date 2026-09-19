"""`uwpr-pubs smoke`: do the sources still answer in the expected shape? (docs/03 §8, §11.3)

The only live test. Each check is measured against what Phase 1 §4.1 and §4.4 found, so a source
that changes its syntax, or quietly starts returning nothing, fails here rather than silently
shrinking a run. It is deliberately cheap: about $0.002 of OpenAlex budget.
"""

from collections.abc import Callable
from dataclasses import dataclass

from uwpr_pubs.config import Config
from uwpr_pubs.http import HttpClient, HttpError
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


@dataclass
class Check:
    name: str
    ok: bool
    detail: str

    def line(self) -> str:
        return f"{'PASS' if self.ok else 'FAIL'}  {self.name}: {self.detail}"


def _check(name: str, run: Callable[[], tuple[bool, str]]) -> Check:
    try:
        ok, detail = run()
    except (HttpError, KeyError, ValueError) as exc:
        return Check(name, False, f"{type(exc).__name__}: {exc}")
    return Check(name, ok, detail)


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
