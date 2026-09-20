"""Crossref: award metadata, preprint relations and publisher titles (Phase 1 §5 B2, §8)."""

from collections.abc import Iterator, Mapping
from typing import Any

from uwpr_pubs.http import HttpClient, HttpError, Policy

BASE = "https://api.crossref.org/works"
ROWS = 100
NOT_FOUND = frozenset({404, 410})


class Crossref:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact

    def _get(self, url: str, params: Mapping[str, str]) -> dict[str, Any]:
        reply = self.client.get(
            url, {"mailto": self.contact, **params}, host="crossref", policy=Policy.REFRESH
        )
        payload: dict[str, Any] = reply.json()
        message: dict[str, Any] = payload.get("message", {})
        return message

    def by_filter(self, filter_expr: str, rows: int = ROWS) -> Iterator[dict[str, Any]]:
        """Deep paging with a cursor, which Crossref requires beyond the first page."""
        cursor = "*"
        while cursor:
            message = self._get(BASE, {"filter": filter_expr, "rows": str(rows), "cursor": cursor})
            items = message.get("items") or []
            yield from items
            cursor = message.get("next-cursor") or ""
            if not items:
                break

    def count(self, filter_expr: str) -> int:
        message = self._get(BASE, {"filter": filter_expr, "rows": "0"})
        return int(message.get("total-results", 0))

    def by_doi(self, doi: str) -> dict[str, Any] | None:
        """One record, or None when Crossref has no such DOI.

        Only "not found" becomes None. Any other failure is the source being unwell, and the
        caller degrades the run rather than concluding the record has no preprint relation.
        """
        try:
            return self._get(f"{BASE}/{doi}", {})
        except HttpError as exc:
            if exc.status in NOT_FOUND:
                return None
            raise

    @staticmethod
    def award_numbers(work: Mapping[str, Any]) -> list[str]:
        """Every award number in a Crossref record's funder metadata (rule R2)."""
        numbers: list[str] = []
        for funder in work.get("funder") or []:
            numbers.extend(str(award) for award in funder.get("award") or [])
        return numbers

    @staticmethod
    def preprint_of(work: Mapping[str, Any]) -> str | None:
        """The DOI this record is a preprint of, if Crossref says so (Phase 1 §8)."""
        relations = work.get("relation") or {}
        for name in ("is-preprint-of", "is-manuscript-of"):
            for item in relations.get(name) or []:
                identifier = item.get("id")
                if identifier:
                    return str(identifier)
        return None
