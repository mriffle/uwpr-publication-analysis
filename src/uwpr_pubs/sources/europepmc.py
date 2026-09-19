"""Europe PMC: search channels, and full text for open-access records (Phase 1 §5, §7).

`fullTextXML` answers 500 for anything not open access, so a failure there is normal and simply
means the text must come from NCBI instead.
"""

from collections.abc import Iterator
from typing import Any

from uwpr_pubs.http import HttpClient, HttpError, Policy

BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"
PAGE_SIZE = 100


class EuropePmc:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact

    def search(self, query: str, page_size: int = PAGE_SIZE) -> Iterator[dict[str, Any]]:
        cursor = "*"
        while cursor:
            reply = self.client.get(
                f"{BASE}/search",
                {
                    "query": query,
                    "format": "json",
                    "pageSize": str(page_size),
                    "cursorMark": cursor,
                    "email": self.contact,
                },
                host="europepmc",
                policy=Policy.REFRESH,
            )
            payload = reply.json()
            results = (payload.get("resultList") or {}).get("result") or []
            yield from results
            next_cursor = payload.get("nextCursorMark") or ""
            cursor = "" if next_cursor == cursor or not results else next_cursor

    def count(self, query: str) -> int:
        reply = self.client.get(
            f"{BASE}/search",
            {"query": query, "format": "json", "pageSize": "1", "email": self.contact},
            host="europepmc",
            policy=Policy.REFRESH,
        )
        return int(reply.json().get("hitCount", 0))

    def full_text_xml(self, pmcid: str) -> bytes | None:
        """None when the record is not open access, which Europe PMC signals with a 500."""
        try:
            reply = self.client.get(f"{BASE}/{pmcid}/fullTextXML", host="europepmc", policy=Policy.IMMUTABLE)
        except HttpError:
            return None
        return reply.body
