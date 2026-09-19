"""NCBI: PMC full text and the ID converter (Phase 1 §7).

`efetch?db=pmc` is used rather than Europe PMC's full-text endpoint, which refuses non-open-access
records. The ID converter rejects mixed batches, so PMIDs and DOIs go in separate typed requests.
Full text is immutable once fetched (docs/02 §12), so it is cached and never refetched.
"""

from collections.abc import Iterator, Sequence
from typing import Any, Literal

from uwpr_pubs.http import HttpClient, HttpError, Policy

EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ID_CONVERTER = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"
CONVERT_BATCH = 200
TOOL = "uwpr-pubs"


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
