"""NCBI: PMC full text, the ID converter and PubMed's grant lists (Phase 1 §7, docs/09).

`efetch?db=pmc` is used rather than Europe PMC's full-text endpoint, which refuses non-open-access
records. The ID converter rejects mixed batches, so PMIDs and DOIs go in separate typed requests.
Full text is immutable once fetched (docs/02 §12), so it is cached and never refetched.

PubMed's `GrantList` is MEDLINE's record of the grants a paper names. It is read from
`efetch?db=pubmed` XML, whose records also carry the abstract: that stays in the cache, and only
the grant list is returned (P10).
"""

from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import Any, Literal
from xml.etree.ElementTree import Element, ParseError  # parsing itself is defusedxml's (P14)

from defusedxml.common import DefusedXmlException
from defusedxml.ElementTree import fromstring

from uwpr_pubs.http import HttpClient, HttpError, MalformedReplyError, Policy

EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ID_CONVERTER = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"
CONVERT_BATCH = 200
PUBMED_BATCH = 200
TOOL = "uwpr-pubs"


@dataclass(frozen=True)
class PubmedGrant:
    grant_id: str | None
    acronym: str | None
    agency: str | None
    country: str | None


@dataclass(frozen=True)
class PubmedGrants:
    """One paper's `GrantList`. `complete` is its `CompleteYN`, None when there is no list."""

    pmid: str
    complete: str | None
    grants: tuple[PubmedGrant, ...]


def _field(grant: Element, name: str) -> str | None:
    value = " ".join((grant.findtext(name) or "").split())
    return value or None


def parse_pubmed_grants(xml: bytes, status: int | None = None) -> dict[str, PubmedGrants]:
    """Each paper's grant list from a PubMed efetch reply, by PMID. Nothing else is kept.

    A paper with no `GrantList` has an empty one. A reply that will not parse is a
    `MalformedReplyError`: with the reply's status when there is a body (a changed shape), and
    none when it is empty (no answer at all, like a timeout), as `Response.json` does.
    """
    try:
        root = fromstring(xml)
    except (ParseError, DefusedXmlException, ValueError) as exc:
        what = f"{EFETCH}: PubMed XML that will not parse ({exc})"
        raise MalformedReplyError(what, status if xml.strip() else None) from exc
    found: dict[str, PubmedGrants] = {}
    for article in root.iter("PubmedArticle"):
        pmid = (article.findtext("MedlineCitation/PMID") or "").strip()
        if not pmid:
            continue
        grant_list = article.find("MedlineCitation/Article/GrantList")
        grants: tuple[PubmedGrant, ...] = ()
        complete = None
        if grant_list is not None:
            complete = grant_list.get("CompleteYN")
            grants = tuple(
                PubmedGrant(
                    grant_id=_field(grant, "GrantID"),
                    acronym=_field(grant, "Acronym"),
                    agency=_field(grant, "Agency"),
                    country=_field(grant, "Country"),
                )
                for grant in grant_list.findall("Grant")
            )
        found[pmid] = PubmedGrants(pmid=pmid, complete=complete, grants=grants)
    return found


class Ncbi:
    def __init__(self, client: HttpClient, contact: str, api_key: str | None = None) -> None:
        self.client = client
        self.contact = contact
        self.api_key = api_key

    @property
    def host(self) -> str:
        return "ncbi_with_key" if self.api_key else "ncbi"

    def _params(self, extra: dict[str, str]) -> dict[str, str]:
        params = {"tool": TOOL, "email": self.contact, **extra}
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    def pmc_xml(self, pmcid: str) -> bytes | None:
        """JATS XML for a PMC record, or None when the record cannot be fetched."""
        numeric = pmcid.removeprefix("PMC")
        try:
            reply = self.client.get(
                EFETCH,
                self._params({"db": "pmc", "id": numeric}),
                host=self.host,
                policy=Policy.IMMUTABLE,
            )
        except HttpError:
            return None
        return reply.body

    def pubmed_grants(self, pmids: Iterable[str]) -> dict[str, PubmedGrants]:
        """MEDLINE's grant list for each paper PubMed returns, `PUBMED_BATCH` to a request.

        Refetched every run: MEDLINE adds grant lists after a record first appears.
        """
        wanted = sorted({pmid.strip() for pmid in pmids if pmid.strip()}, key=int)
        found: dict[str, PubmedGrants] = {}
        for start in range(0, len(wanted), PUBMED_BATCH):
            batch = wanted[start : start + PUBMED_BATCH]
            reply = self.client.get(
                EFETCH,
                self._params({"db": "pubmed", "id": ",".join(batch), "retmode": "xml"}),
                host=self.host,
                policy=Policy.REFRESH,
            )
            found.update(parse_pubmed_grants(reply.body, reply.status))
        return found

    def convert(self, ids: Sequence[str], idtype: Literal["pmid", "doi"]) -> Iterator[dict[str, Any]]:
        """Mixed batches are rejected, so each call sends one identifier type (Phase 1 §7)."""
        for start in range(0, len(ids), CONVERT_BATCH):
            batch = ids[start : start + CONVERT_BATCH]
            if not batch:
                continue
            reply = self.client.get(
                ID_CONVERTER,
                self._params({"ids": ",".join(batch), "idtype": idtype, "format": "json"}),
                host=self.host,
                policy=Policy.REFRESH,
            )
            payload = reply.json()
            yield from payload.get("records", [])
