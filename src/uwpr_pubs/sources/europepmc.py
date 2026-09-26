"""Europe PMC: search channels, and full text for open-access records (Phase 1 §5, §7).

`fullTextXML` answers 500 for anything not open access, so a failure there is normal and simply
means the text must come from NCBI instead.
"""

from collections.abc import Iterator
from typing import Any, cast

from uwpr_pubs.http import HttpClient, HttpError, Policy
from uwpr_pubs.sources import ResultLimitError

BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest"
PAGE_SIZE = 100


class EuropePmc:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact

    def search(
        self, query: str, page_size: int = PAGE_SIZE, max_results: int | None = None
    ) -> Iterator[dict[str, Any]]:
        cursor = "*"
        first = True
        while cursor:
            payload = self._search(
                {
                    "query": query,
                    "format": "json",
                    "pageSize": str(page_size),
                    "cursorMark": cursor,
                    "email": self.contact,
                }
            )
            if first and max_results is not None:
                total = int(payload.get("hitCount") or 0)
                if total > max_results:
                    raise ResultLimitError(total, max_results)
            first = False
            results = (payload.get("resultList") or {}).get("result") or []
            yield from results
            next_cursor = payload.get("nextCursorMark") or ""
            cursor = "" if next_cursor == cursor or not results else next_cursor

    def _search(self, params: dict[str, str]) -> dict[str, Any]:
        """One search reply, or `HttpError` when Europe PMC reports a failure inside it.

        Europe PMC reports its errors as an HTTP 200 whose body is `{"errCode": 404, "errMsg": …}`,
        with no `hitCount` and no results (measured 2026-09-26). Read unchecked, that is an empty
        result: smoke reads "0 results" and blocks the week, and a channel sees no nominations and
        records no degradation, so the three-runs alert can never count it. `errCode` becomes the
        status, so a 5xx is an outage and a 4xx a problem, exactly as a real one would be.
        """
        reply = self.client.get(f"{BASE}/search", params, host="europepmc", policy=Policy.REFRESH)
        payload = cast(dict[str, Any], reply.json())
        if "errCode" in payload:
            message = payload.get("errMsg") or "no message"
            raise HttpError(f"europepmc: {message} (errCode {payload['errCode']})", int(payload["errCode"]))
        return payload

    def count(self, query: str) -> int:
        """Strict: a reply without `hitCount` has changed shape, and is not zero results."""
        payload = self._search({"query": query, "format": "json", "pageSize": "1", "email": self.contact})
        return int(payload["hitCount"])

    def full_text_xml(self, pmcid: str) -> bytes | None:
        """None when the record is not open access, which Europe PMC signals with a 500.

        That 500 is the answer, not a wobble, so it is asked once. Retrying it with backoff cost
        about 14 seconds on every non-open-access record, and there are hundreds of them.
        """
        try:
            reply = self.client.get(
                f"{BASE}/{pmcid}/fullTextXML",
                host="europepmc",
                policy=Policy.IMMUTABLE,
                attempts=1,
            )
        except HttpError:
            return None
        return reply.body
