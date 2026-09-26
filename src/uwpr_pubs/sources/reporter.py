"""NIH RePORTER: which grants NIH links to a paper, and what each grant was awarded (docs/09).

Every question is a POST with a JSON body, and every answer is paged. Four things were measured
on 2026-09-26 and each is a rule here:

- **Every page is sorted.** Unsorted paging repeats some rows and drops others: 1,105 rows came
  back for 1,097 distinct applications, and a $4.94M renewal year was lost. Projects sort by
  `appl_id`, which is unique. The publications search answers HTTP 500 to any sort field but
  `coreproject` and `pmid`, so it sorts by `coreproject` — unique within one paper, but not
  across several. A batch of papers is therefore never paged: one that needs more than a page is
  split in half and asked again, and only a single paper is paged, where the order is total.
- **Sub-project rows are excluded** (`exclude_subprojects`). A multi-project grant's parent row
  already includes its sub-projects; adding theirs inflates a grant by 50 to 100%.
- **The fields are named**, and never include `AbstractText` or `PhrText`: a grant's abstract
  must not reach the store or a recording (P10).
- **Contracts are not stored under their own number.** RePORTER drops the `HHSN` prefix and
  truncates the core number to 11 characters (`272201700059C-0-0-1` has core `27220170005`), so
  a contract is found by its number with a trailing wildcard and read by full project number. An
  IDIQ contract's task orders are rows of their own, the task order number with its letters
  removed as the third part: `272201700036I-0-759302000001-1` is task order 75N93020F00001.
  Newer contracts keep their `75N` prefix (`75N93019D00003-0-759301900131-1`).

RePORTER asks for no more than one request a second (the `reporter` rate limit) and for large
jobs at weekends or between 21:00 and 05:00 Eastern; the caller keeps to that window.
"""

import re
from collections.abc import Generator, Iterable, Iterator, Mapping, Sequence
from typing import Any, cast

from uwpr_pubs.http import HttpClient, MalformedReplyError, Policy
from uwpr_pubs.sources import ResultLimitError

BASE = "https://api.reporter.nih.gov/v2"
HOST = "reporter"
PAGE_LIMIT = 500
PUBLICATION_BATCH = 100
CORE_BATCH = 25
NUMS_BATCH = 100
# The largest offset each search accepts. Paging past it is refused, so a question with more
# rows than it can reach raises `ResultLimitError` instead of returning a silent subset.
PROJECT_OFFSET_CAP = 14_999
PUBLICATION_OFFSET_CAP = 9_999

PROJECT_SORT: Mapping[str, str] = {"sort_field": "appl_id", "sort_order": "asc"}
PUBLICATION_SORT: Mapping[str, str] = {"sort_field": "coreproject", "sort_order": "asc"}

# What the amount rules and the grant pages need; never `AbstractText` or `PhrText` (P10).
PROJECT_FIELDS = (
    "ApplId",
    "CoreProjectNum",
    "ProjectNum",
    "ProjectNumSplit",
    "SubprojectId",
    "FiscalYear",
    "AwardAmount",
    "DirectCostAmt",
    "IndirectCostAmt",
    "AgencyIcAdmin",
    "AgencyIcFundings",
    "AgencyCode",
    "Organization",
    "PrincipalInvestigators",
    "ProjectTitle",
    "ActivityCode",
    "ProjectStartDate",
    "ProjectEndDate",
    "BudgetStart",
    "BudgetEnd",
    "ArraFunded",
    "IsActive",
)

HHSN_PREFIX = re.compile(r"^HHSN[\s-]*", re.IGNORECASE)
NOT_ALPHANUMERIC = re.compile(r"[^0-9A-Za-z]")
LETTERS = re.compile(r"[A-Za-z]")


def reachable(cap: int, limit: int = PAGE_LIMIT) -> int:
    """How many rows paging can reach when no offset may exceed `cap`."""
    return (cap // limit) * limit + limit


def contract_number(number: str) -> str:
    """A contract number as RePORTER stores it: `HHSN272201700059C` → `272201700059C`."""
    return HHSN_PREFIX.sub("", NOT_ALPHANUMERIC.sub("", number.strip())).upper()


def task_order_part(task_order: str) -> str:
    """A task order as the third part of its RePORTER project number: letters removed.

    `75N93020F00001` → `759302000001`, as in `272201700036I-0-759302000001-1`.
    """
    return LETTERS.sub("", NOT_ALPHANUMERIC.sub("", task_order))


def _chunks(items: Sequence[Any], size: int) -> Iterator[list[Any]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


class Reporter:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact  # sent in the User-Agent, by the client

    def _post(self, endpoint: str, body: Mapping[str, Any]) -> tuple[int, list[dict[str, Any]]]:
        """One page: the total the search reports, and this page's rows.

        A reply without `meta.total` has changed shape. It is a source failure, not zero rows.
        """
        url = f"{BASE}/{endpoint}"
        reply = self.client.post_json(url, dict(body), host=HOST, policy=Policy.REFRESH)
        payload = reply.json()
        meta = payload.get("meta") if isinstance(payload, dict) else None
        total = meta.get("total") if isinstance(meta, dict) else None
        if not isinstance(total, int):
            raise MalformedReplyError(f"POST {url}: HTTP {reply.status} with no meta.total", reply.status)
        results = payload.get("results") or []
        return total, cast(list[dict[str, Any]], results)

    def _pages(
        self, endpoint: str, body: Mapping[str, Any], cap: int
    ) -> Generator[tuple[int, list[dict[str, Any]]], None, None]:
        offset = 0
        while True:
            total, results = self._post(endpoint, {**body, "offset": offset, "limit": PAGE_LIMIT})
            yield total, results
            offset += PAGE_LIMIT
            if offset >= total or not results:
                return
            if offset > cap:
                raise ResultLimitError(total, reachable(cap))

    def _search(self, endpoint: str, body: Mapping[str, Any], cap: int) -> list[dict[str, Any]]:
        """Every row, or `ResultLimitError` from the first page if paging cannot reach them all."""
        rows: list[dict[str, Any]] = []
        for page, (total, results) in enumerate(self._pages(endpoint, body, cap)):
            if page == 0 and total > reachable(cap):
                raise ResultLimitError(total, reachable(cap))
            rows.extend(results)
        return rows

    # --- publications ----------------------------------------------------------------------

    def publications(self, pmids: Iterable[str | int]) -> list[dict[str, Any]]:
        """NIH's links from papers to grants: `{"pmid", "coreproject", "applid"}` rows.

        A link names a grant's latest application, not the year that funded the paper.
        """
        numbers = sorted({int(pmid) for pmid in pmids})
        links: list[dict[str, Any]] = []
        for batch in _chunks(numbers, PUBLICATION_BATCH):
            links.extend(self._links(batch))
        return links

    def _links(self, pmids: list[int]) -> list[dict[str, Any]]:
        body = {"criteria": {"pmids": pmids}, **PUBLICATION_SORT}
        pages = self._pages("publications/search", body, PUBLICATION_OFFSET_CAP)
        total, first = next(pages)
        if total > len(first) and len(pmids) > 1:
            pages.close()  # the sort is not total across papers: ask each half on one page
            half = len(pmids) // 2
            return self._links(pmids[:half]) + self._links(pmids[half:])
        if total > reachable(PUBLICATION_OFFSET_CAP):
            raise ResultLimitError(total, reachable(PUBLICATION_OFFSET_CAP))
        rows = list(first)
        for _, results in pages:
            rows.extend(results)
        return rows

    # --- projects --------------------------------------------------------------------------

    def _projects(self, criteria: Mapping[str, Any]) -> list[dict[str, Any]]:
        body = {
            "criteria": {**criteria, "exclude_subprojects": True},
            "include_fields": list(PROJECT_FIELDS),
            **PROJECT_SORT,
        }
        return self._search("projects/search", body, PROJECT_OFFSET_CAP)

    def projects(self, core_nums: Iterable[str]) -> list[dict[str, Any]]:
        """Every parent row of these core projects, one per award action, across all years."""
        return self.projects_by_nums(core_nums, batch=CORE_BATCH)

    def projects_by_nums(self, nums: Iterable[str], batch: int = NUMS_BATCH) -> list[dict[str, Any]]:
        """Rows for project numbers: core or full numbers, and trailing wildcards (`R01GM08668*`).

        The near-miss search asks many candidates that mostly match nothing, so its batches are
        larger than `projects`'s.
        """
        rows: list[dict[str, Any]] = []
        for chunk in _chunks(sorted(set(nums)), batch):
            rows.extend(self._projects({"project_nums": chunk}))
        return rows

    def projects_by_split(
        self, activity: str | None = None, ic: str | None = None, serial: str | None = None
    ) -> list[dict[str, Any]]:
        """Rows by the parts of a project number, any of which may be left open.

        The same serial under any institute finds a grant whose institute code was mistyped.
        """
        split = {
            key: value
            for key, value in (("activity_code", activity), ("ic_code", ic), ("serial_num", serial))
            if value
        }
        if not split:
            raise ValueError("projects_by_split needs at least one part of a project number")
        return self._projects({"project_num_split": split})

    def contracts(self, number: str) -> dict[str, list[dict[str, Any]]]:
        """A contract's rows, keyed by full project number (its core number is truncated).

        `HHSN272201700059C` and `272201700059C` ask the same question. The rows of an IDIQ
        contract include every task order under it; `task_order_part` names the one cited.
        """
        stored = contract_number(number)
        if not stored:
            raise ValueError(f"not a contract number: {number!r}")
        by_number: dict[str, list[dict[str, Any]]] = {}
        for row in self._projects({"project_nums": [f"{stored}*"]}):
            by_number.setdefault(str(row.get("project_num") or ""), []).append(row)
        return by_number
