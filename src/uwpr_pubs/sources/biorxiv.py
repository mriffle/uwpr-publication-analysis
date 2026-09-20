"""bioRxiv and medRxiv: whether a preprint has been published (Phase 1 §8).

The `published` field of the details endpoint is the most reliable of the four version-linking
signals, because the preprint server learns of the journal version directly. Stage 6 uses it in
M4; the adapter lives here from M3 so the source layer is complete.

Also useful for Phase 1 §8's "broken titles": some preprint records carry a file name as their
title (`1_manuscript_2020-04-14.pdf`), and the server's own metadata has the real one.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from uwpr_pubs.http import HttpClient, HttpError, Policy

BASE = "https://api.biorxiv.org/details"
SERVERS = ("biorxiv", "medrxiv")
NOT_PUBLISHED = frozenset({"", "na", "n/a", "none"})
NOT_FOUND = frozenset({404, 410})


@dataclass(frozen=True)
class Preprint:
    doi: str
    title: str
    published_doi: str | None
    server: str


def _published(record: Mapping[str, Any]) -> str | None:
    value = str(record.get("published") or "").strip()
    return None if value.casefold() in NOT_PUBLISHED else value


class Biorxiv:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact

    def details(self, doi: str) -> Preprint | None:
        """The latest revision of a preprint, or None when neither server knows the DOI."""
        for server in SERVERS:
            try:
                reply = self.client.get(f"{BASE}/{server}/{doi}", {}, host="biorxiv", policy=Policy.REFRESH)
            except HttpError as exc:
                if exc.status in NOT_FOUND:
                    continue  # the other server may still know it
                raise
            payload = reply.json()
            if not isinstance(payload, dict):
                continue
            collection = payload.get("collection")
            if not isinstance(collection, list) or not collection:
                continue
            record = collection[-1]  # the newest revision
            if not isinstance(record, dict):
                continue
            return Preprint(
                doi=str(record.get("doi") or doi),
                title=str(record.get("title") or ""),
                published_doi=_published(record),
                server=server,
            )
        return None
