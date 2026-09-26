"""OpenAlex: metadata, award filters, full-text search and citations (Phase 1 §5, docs/03 §7).

Usage-priced, so every request is classified and counted (`http.openalex_cost`). The field list
deliberately omits `abstract_inverted_index`: abstracts belong in the cache, never in the store or
a recording (P10). The key is passed as a parameter and stripped everywhere it could be written.
"""

from collections.abc import Iterator, Mapping, Sequence
from typing import Any, cast
from urllib.parse import urlsplit

from uwpr_pubs.http import HttpClient, Policy, openalex_cost
from uwpr_pubs.sources import ResultLimitError

BASE = "https://api.openalex.org"
PER_PAGE = 200
ID_BATCH = 50

WORK_FIELDS = ",".join(
    (
        "id",
        "doi",
        "ids",
        "display_name",
        "publication_date",
        "publication_year",
        "type",
        "primary_location",
        "locations",
        "authorships",
        "topics",
        "open_access",
        "best_oa_location",
        "is_retracted",
        "cited_by_count",
        "counts_by_year",
        "fwci",
        "citation_normalized_percentile",
        "awards",
    )
)


class OpenAlex:
    def __init__(self, client: HttpClient, contact: str, api_key: str | None = None) -> None:
        self.client = client
        self.contact = contact
        self.api_key = api_key

    def _params(self, extra: Mapping[str, str]) -> dict[str, str]:
        params = {"mailto": self.contact, **extra}
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    def _get(self, path: str, params: Mapping[str, str]) -> dict[str, Any]:
        url = f"{BASE}{path}"
        full = self._params(params)
        cost = openalex_cost(full, urlsplit(url).path)
        reply = self.client.get(url, full, host="openalex", policy=Policy.REFRESH, cost=cost)
        return cast(dict[str, Any], reply.json())

    def pages(
        self,
        path: str,
        params: Mapping[str, str],
        per_page: int = PER_PAGE,
        max_results: int | None = None,
    ) -> Iterator[list[dict[str, Any]]]:
        """Cursor paging; each page is charged separately, so an over-broad query stops at page 1."""
        cursor = "*"
        first = True
        while cursor:
            payload = self._get(path, {**params, "per-page": str(per_page), "cursor": cursor})
            meta = cast(dict[str, Any], payload.get("meta") or {})
            if first and max_results is not None:
                total = int(meta.get("count") or 0)
                if total > max_results:
                    raise ResultLimitError(total, max_results)
            first = False
            results = cast(list[dict[str, Any]], payload.get("results") or [])
            yield results
            cursor = str(meta.get("next_cursor") or "")
            if not results:
                break

    def works(
        self, filter_expr: str, select: str = WORK_FIELDS, max_results: int | None = None
    ) -> Iterator[dict[str, Any]]:
        for page in self.pages("/works", {"filter": filter_expr, "select": select}, max_results=max_results):
            yield from page

    def search_by_title(self, title: str, limit: int = 25) -> list[dict[str, Any]]:
        """One search page, for an official-list entry with no identifier of its own."""
        payload = self._get("/works", {"search": title, "select": WORK_FIELDS, "per-page": str(limit)})
        return cast(list[dict[str, Any]], payload.get("results") or [])

    def works_by_ids(self, ids: Sequence[str], key: str = "openalex_id") -> Iterator[dict[str, Any]]:
        """Batched lookup for the metadata refresh of stage 3 (about 50 per request)."""
        for start in range(0, len(ids), ID_BATCH):
            batch = "|".join(ids[start : start + ID_BATCH])
            if batch:
                yield from self.works(f"{key}:{batch}")

    def authors_by_orcid(self, orcids: Sequence[str]) -> Iterator[dict[str, Any]]:
        """The ORCID check of Phase 1 §5.1: which author IDs carry a staff member's ORCID."""
        fields = {"select": "id,orcid,display_name"}
        for start in range(0, len(orcids), ID_BATCH):
            batch = "|".join(orcids[start : start + ID_BATCH])
            if batch:
                for page in self.pages("/authors", {"filter": f"orcid:{batch}", **fields}):
                    yield from page

    def count(self, filter_expr: str) -> int:
        """Strict: a reply without `meta.count` has changed shape, and is not zero works."""
        payload = self._get("/works", {"filter": filter_expr, "per-page": "1"})
        return int(payload["meta"]["count"])
