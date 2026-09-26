"""USAspending: amounts for US federal awards outside NIH and NSF (docs/09).

Two steps. `awards` searches `spending_by_award` by award number, batched; `award_detail` then
reads one award's `total_obligation`, which is the amount to use. `total_funding` also counts
non-federal matching money (Washington Sea Grant: $20.8M against $13.4M obligated), so it is not
even returned from here.

Measured 2026-09-26:
- the search matches award numbers exactly, not as substrings;
- it reaches only awards with activity since 2007-10-01, and says so in its reply, so a miss is
  not proof of a typo;
- one request may name award types from one group only (grants, or contracts, …), else 422;
- httpx verifies the site's certificate (docs/03 §7).
"""

from collections.abc import Iterable, Iterator, Mapping, Sequence
from typing import Any, Literal, cast
from urllib.parse import quote

from uwpr_pubs.http import HttpClient, HttpError, MalformedReplyError, Policy

SEARCH = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
AWARD = "https://api.usaspending.gov/api/v2/awards/{}/"
HOST = "usaspending"
ID_BATCH = 25
PAGE_LIMIT = 100  # the most one page may hold
SEARCH_FROM = "2007-10-01"  # the earliest date the search accepts
# A fixed end, well after any award's activity, so one question is one cache key every week.
SEARCH_UNTIL = "2100-09-30"
NOT_FOUND = frozenset({404})

AwardGroup = Literal["grants", "contracts"]
AWARD_TYPES: Mapping[AwardGroup, tuple[str, ...]] = {
    "grants": ("02", "03", "04", "05"),
    "contracts": ("A", "B", "C", "D"),
}
SEARCH_FIELDS = (
    "Award ID",
    "Recipient Name",
    "Start Date",
    "End Date",
    "Award Amount",
    "Awarding Agency",
    "Awarding Sub Agency",
    "Award Type",
    "generated_internal_id",
)
DETAIL_FIELDS = (
    "generated_unique_award_id",
    "fain",
    "piid",
    "uri",
    "category",
    "type",
    "type_description",
    "total_obligation",
    "date_signed",
    "period_of_performance",
)


def _chunks(items: Sequence[str], size: int) -> Iterator[list[str]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def _names(agency: Any) -> dict[str, str | None]:
    """An agency block's top-tier and sub-tier names and abbreviations."""
    block = agency if isinstance(agency, dict) else {}
    top = block.get("toptier_agency") or {}
    sub = block.get("subtier_agency") or {}
    return {
        "name": top.get("name"),
        "abbreviation": top.get("abbreviation"),
        "sub_name": sub.get("name"),
        "sub_abbreviation": sub.get("abbreviation"),
    }


class UsaSpending:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact  # sent in the User-Agent, by the client

    def awards(self, award_ids: Iterable[str], group: AwardGroup = "grants") -> list[dict[str, Any]]:
        """Search rows for these award numbers, `ID_BATCH` numbers to a request.

        Each row's `Award ID` says which number it answers; a number may match more than one
        award, or none.
        """
        rows: list[dict[str, Any]] = []
        for batch in _chunks(sorted({i.strip() for i in award_ids if i.strip()}), ID_BATCH):
            page = 1
            while True:
                body = {
                    "filters": {
                        "award_ids": batch,
                        "award_type_codes": list(AWARD_TYPES[group]),
                        "time_period": [{"start_date": SEARCH_FROM, "end_date": SEARCH_UNTIL}],
                    },
                    "fields": list(SEARCH_FIELDS),
                    "limit": PAGE_LIMIT,
                    "page": page,
                    "sort": "Award ID",
                    "order": "asc",
                }
                reply = self.client.post_json(SEARCH, body, host=HOST, policy=Policy.REFRESH)
                payload = reply.json()
                results = payload.get("results") if isinstance(payload, dict) else None
                if not isinstance(results, list):
                    what = f"POST {SEARCH}: HTTP {reply.status} with no results"
                    raise MalformedReplyError(what, reply.status)
                rows.extend(cast(list[dict[str, Any]], results))
                if not (payload.get("page_metadata") or {}).get("hasNext") or not results:
                    break
                page += 1
        return rows

    def award_detail(self, generated_id: str) -> dict[str, Any] | None:
        """One award's amount, dates and agencies, or None when USAspending has no such award."""
        url = AWARD.format(quote(generated_id, safe=""))
        try:
            reply = self.client.get(url, {}, host=HOST, policy=Policy.REFRESH)
        except HttpError as exc:
            if exc.status in NOT_FOUND:
                return None
            raise
        payload = reply.json()
        if not isinstance(payload, dict) or "total_obligation" not in payload:
            raise MalformedReplyError(f"{url}: HTTP {reply.status} with no total_obligation", reply.status)
        detail: dict[str, Any] = {key: payload.get(key) for key in DETAIL_FIELDS}
        detail["recipient_name"] = (payload.get("recipient") or {}).get("recipient_name")
        detail["awarding_agency"] = _names(payload.get("awarding_agency"))
        detail["funding_agency"] = _names(payload.get("funding_agency"))
        return detail
