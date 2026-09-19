"""Stage 4: getting readable text for the records that need evaluating (Phase 1 §7, docs/03 §6).

Sources are tried in order and the first readable one wins: NCBI `efetch?db=pmc` first, because it
returns author manuscripts that Europe PMC's own endpoint refuses with a 500, then Europe PMC for
open-access records NCBI does not have yet.

"Readable" means a `<body>`. 155 of the PMC records Phase 1 examined have none — the publisher
restricts them — and §4.2 counts a paper as assessable only when it has "a readable body or award
metadata". A record with no readable text is where R6 takes over (§6.5).
"""

import datetime as dt
from dataclasses import dataclass

from uwpr_pubs.cache import sha256_hex
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.ncbi import Ncbi
from uwpr_pubs.store.models import CacheRef, Date, FullText, FullTextStatus, Record, SourceName
from uwpr_pubs.text import Document, TextRules, parse_jats

PMC_ARTICLE = "https://pmc.ncbi.nlm.nih.gov/articles"
EPMC_ARTICLE = "https://europepmc.org/article/PMC"


@dataclass(frozen=True)
class TextResult:
    """What stage 4 learned about one record."""

    status: FullTextStatus
    cache: CacheRef | None = None
    document: Document | None = None
    source_name: SourceName = "PMC"
    url: str | None = None

    @property
    def readable(self) -> bool:
        return self.document is not None and self.document.body_available


def recheck_after(today: Date, days: int) -> Date:
    return (dt.date.fromisoformat(today) + dt.timedelta(days=days)).isoformat()


def fulltext_field(result: TextResult, *, today: Date, recheck_days: int) -> FullText:
    """`unavailable` carries a recheck date; a readable record needs none (P9)."""
    if result.readable:
        return {"status": result.status, "checked": today, "recheck_after": None, "cache": result.cache}
    return {
        "status": "unavailable",
        "checked": today,
        "recheck_after": recheck_after(today, recheck_days),
        "cache": None,
    }


def needs_evaluation(record: Record, *, today: Date, rule_version: str, evidence_version: str | None) -> bool:
    """The four triggers of docs/03 §6.1, less the overrides one, which is a whole-run flag.

    A record is re-read when it is new, when its unreadable text is due another look, or when the
    rules have changed since its evidence was derived.
    """
    fulltext = record.get("fulltext")
    if not fulltext or not fulltext.get("checked"):
        return True
    if evidence_version is not None and evidence_version != rule_version:
        return True
    due = fulltext.get("recheck_after")
    return bool(due and due <= today)


class TextFetcher:
    """The impure half: HTTP in, a parsed document out."""

    def __init__(self, ncbi: Ncbi, europepmc: EuropePmc, rules: TextRules) -> None:
        self.ncbi = ncbi
        self.europepmc = europepmc
        self.rules = rules

    def _parsed(
        self, body: bytes | None, status: FullTextStatus, name: SourceName, url: str
    ) -> TextResult | None:
        if not body:
            return None
        document = parse_jats(body, self.rules)
        if document is None:
            return None
        return TextResult(
            status=status,
            cache=f"sha256:{sha256_hex(body)}",
            document=document,
            source_name=name,
            url=url,
        )

    def fetch(self, pmcid: str | None) -> TextResult:
        """The first readable source wins, and the second is never requested if it does."""
        if not pmcid:
            return TextResult(status="unavailable")
        ncbi = self._parsed(self.ncbi.pmc_xml(pmcid), "pmc_xml", "PMC", f"{PMC_ARTICLE}/{pmcid}/")
        if ncbi is not None and ncbi.readable:
            return ncbi
        epmc = self._parsed(
            self.europepmc.full_text_xml(pmcid), "epmc_xml", "Europe PMC", f"{EPMC_ARTICLE}/{pmcid}"
        )
        if epmc is not None and epmc.readable:
            return epmc
        return TextResult(status="unavailable")
