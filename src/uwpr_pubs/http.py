"""The one HTTP client (docs/03-retrieval-pipeline.md §4, §7).

Per-host rate limits, retries that honour `Retry-After`, an OpenAlex budget guard, and the three
run modes. Everything that could leak a key goes through `secrets.scrub`. The network itself sits
behind a `Transport`, so tests drive the whole client without a socket.

Costs are classified from the request rather than read from a response header, because replay has
no headers to read: an OpenAlex lookup by ID is free, a filter page is $0.0001 and a search page
is $0.001 (CLAUDE.md). The header is used only to see how much budget is left.
"""

import contextlib
import json
import random
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum
from pathlib import Path
from typing import Any, Protocol

import httpx

from uwpr_pubs.cache import Cache, Fetched, request_key
from uwpr_pubs.recording import prepare_recording
from uwpr_pubs.secrets import scrub, strip_url

FILTER_PAGE_USD = 0.0001
SEARCH_PAGE_USD = 0.001
RETRY_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
HTTP_ERROR_FLOOR = 400


class Mode(StrEnum):
    LIVE = "live"
    REPLAY = "replay"
    RECORD = "record"


class Policy(StrEnum):
    IMMUTABLE = "immutable"  # full text and abstracts: cached once, never refetched
    REFRESH = "refresh"  # searches and metadata: refetched every run


class HttpError(RuntimeError):
    """A request that could not be completed after retrying.

    `status` is the last HTTP status seen, when there was one. A caller that treats some statuses
    as an answer rather than a failure needs it: Crossref's 404 means "no such DOI", which is a
    fact about the record, while a 503 means the source is down and the run is degraded (§9).
    """

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class MissingRecordingError(HttpError):
    """Replay mode was asked for a request nobody recorded."""


class BudgetExceededError(HttpError):
    """The OpenAlex spend guard stopped this request (§7)."""


class MalformedReplyError(HttpError, ValueError):
    """A reply that arrived but cannot be parsed: a source failure like any other (§9).

    It used to surface as a bare `JSONDecodeError`, which no stage catches, so one unwell endpoint
    failed the whole run. On 2026-09-26 bioRxiv's `details` answered HTTP 200 with an empty body to
    every request, and the catch-up run stopped in stage 6 instead of degrading. As an `HttpError`
    it is handled wherever a source failure is. An empty body is no answer at all, so like a
    timeout it carries no status and reads as an outage; a body that is there but will not parse
    keeps its status, and reads as a changed shape. It is still a `ValueError` for any caller that
    catches one.
    """


@dataclass(frozen=True)
class Response:
    url: str
    status: int
    body: bytes
    headers: Mapping[str, str] = field(default_factory=dict)
    from_cache: bool = False

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", "replace")

    def json(self) -> Any:
        try:
            return json.loads(self.body)
        except ValueError as exc:  # a JSONDecodeError, or a body that is not UTF-8
            empty = not self.body.strip()
            what = "an empty body" if empty else f"{len(self.body)} bytes that are not JSON"
            where = scrub(strip_url(self.url))
            raise MalformedReplyError(
                f"{where}: HTTP {self.status} with {what}", None if empty else self.status
            ) from exc


class Transport(Protocol):
    def __call__(
        self, url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response: ...


class HttpxTransport:
    """The real network. Nothing else in the package imports httpx."""

    def __init__(self) -> None:
        self._client = httpx.Client(follow_redirects=True)

    def __call__(
        self, url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response:
        reply = self._client.get(url, params=dict(params), headers=dict(headers), timeout=timeout)
        return Response(
            url=strip_url(str(reply.url)),
            status=reply.status_code,
            body=reply.content,
            headers={k.lower(): v for k, v in reply.headers.items()},
        )

    def close(self) -> None:
        self._client.close()


@dataclass
class Budget:
    """OpenAlex spend for this run (§7). Tripping the guard raises an alert, not a failure."""

    max_run_usd: float
    min_remaining_usd: float
    spent_usd: float = 0.0
    remaining_usd: float | None = None
    tripped: bool = False

    def allows(self, cost: float) -> bool:
        if cost <= 0:
            return True
        if self.spent_usd + cost > self.max_run_usd:
            return False
        return not (self.remaining_usd is not None and self.remaining_usd < self.min_remaining_usd)

    def charge(self, cost: float) -> None:
        self.spent_usd = round(self.spent_usd + cost, 6)

    def observe(self, headers: Mapping[str, str]) -> None:
        raw = headers.get("x-ratelimit-remaining-usd")
        if raw:
            with contextlib.suppress(ValueError):
                self.remaining_usd = float(raw)


class RateLimiter:
    """Per-host minimum spacing, measured on an injectable clock."""

    def __init__(
        self,
        rates: Mapping[str, float],
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._rates = dict(rates)
        self._sleep = sleep
        self._clock = clock
        self._last: dict[str, float] = {}

    def wait(self, host: str) -> float:
        rate = self._rates.get(host)
        if not rate:
            return 0.0
        interval = 1.0 / rate
        now = self._clock()
        earliest = self._last.get(host, 0.0) + interval
        delay = max(0.0, earliest - now)
        if delay:
            self._sleep(delay)
        self._last[host] = self._clock()
        return delay


@dataclass
class ApiUsage:
    calls: int = 0
    cost_usd: float = 0.0


class HttpClient:
    def __init__(  # noqa: PLR0913 - a dependency-injection constructor, all keyword-only
        self,
        *,
        contact: str,
        user_agent: str,
        mode: Mode,
        cache: Cache,
        budget: Budget,
        rate_limiter: RateLimiter,
        transport: Transport,
        recordings: Cache | None = None,
        max_attempts: int = 4,
        timeout: float = 60.0,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], str] = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        jitter: Callable[[], float] = random.random,
    ) -> None:
        self.contact = contact
        self.user_agent = user_agent
        self.mode = mode
        self.cache = cache
        self.recordings = recordings
        self.budget = budget
        self.rate_limiter = rate_limiter
        self.transport = transport
        self.max_attempts = max_attempts
        self.timeout = timeout
        self._sleep = sleep
        self._now = now
        self._jitter = jitter
        self.usage: dict[str, ApiUsage] = {}
        self.last_key: str | None = None

    def _account(self, host: str, cost: float) -> None:
        usage = self.usage.setdefault(host, ApiUsage())
        usage.calls += 1
        usage.cost_usd = round(usage.cost_usd + cost, 6)

    def _backoff(self, attempt: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(float(retry_after), 60.0)
            except ValueError:
                pass
        return min(2.0**attempt, 30.0) + self._jitter()

    def get(  # noqa: PLR0913 - one request, its host, its policy, its cost and its retries
        self,
        url: str,
        params: Mapping[str, str] | None = None,
        *,
        host: str,
        policy: Policy = Policy.REFRESH,
        cost: float = 0.0,
        attempts: int | None = None,
    ) -> Response:
        """`attempts` overrides the retry count for an endpoint whose error is an answer.

        Europe PMC replies 500 to every non-open-access record (Phase 1 §7). Retrying that with
        backoff costs about 14 seconds each, on hundreds of records, for a reply that will not
        change.
        """
        request_params = dict(params or {})
        key = request_key(url, request_params)
        self.last_key = key

        if policy is Policy.IMMUTABLE or self.mode is Mode.REPLAY:
            source = self.recordings if self.mode is Mode.REPLAY else self.cache
            hit = source.get(key) if source else None
            if hit is not None:
                record, body = hit
                return Response(record.url, record.status, body, {}, from_cache=True)
        if self.mode is Mode.REPLAY:
            raise MissingRecordingError(f"no recording for {scrub(strip_url(url))} ({key[:12]})")

        if not self.budget.allows(cost):
            self.budget.tripped = True
            raise BudgetExceededError(
                f"OpenAlex budget guard: {self.budget.spent_usd:.4f} USD spent this run"
            )

        headers = {"User-Agent": f"{self.user_agent} (mailto:{self.contact})"}
        last_error = ""
        last_status: int | None = None
        max_attempts = self.max_attempts if attempts is None else max(1, attempts)
        for attempt in range(max_attempts):
            self.rate_limiter.wait(host)
            try:
                response = self.transport(url, request_params, headers, self.timeout)
            except Exception as exc:  # every transport failure is retried alike
                last_error = f"{type(exc).__name__}: {scrub(str(exc))}"
            else:
                self.budget.observe(response.headers)
                if response.status < HTTP_ERROR_FLOOR:
                    self.budget.charge(cost)
                    self._account(host, cost)
                    self._store(key, url, request_params, response)
                    return response
                last_error = f"HTTP {response.status}"
                last_status = response.status
                if response.status not in RETRY_STATUSES:
                    break
                if attempt + 1 < max_attempts:
                    self._sleep(self._backoff(attempt, response.headers.get("retry-after")))
                continue
            if attempt + 1 < max_attempts:
                self._sleep(self._backoff(attempt, None))
        raise HttpError(f"{scrub(strip_url(url))}: {last_error}", last_status)

    def _store(self, key: str, url: str, params: dict[str, str], response: Response) -> None:
        content_type = response.headers.get("content-type", "")
        fetched = Fetched(url, params, response.status, content_type, response.body, self._now())
        self.cache.put(key, fetched)
        if self.mode is Mode.RECORD and self.recordings is not None:
            scrubbed = prepare_recording(content_type, response.body)
            if scrubbed is not None:
                self.recordings.put(key, replace(fetched, body=scrubbed))


def openalex_cost(params: Mapping[str, str], path: str) -> float:
    """Free by ID; $0.0001 a filter page; $0.001 when a search is involved (CLAUDE.md)."""
    filter_expr = params.get("filter", "")
    if "search" in params or ".search:" in filter_expr or "fulltext.search" in filter_expr:
        return SEARCH_PAGE_USD
    if "filter" in params or "group_by" in params:
        return FILTER_PAGE_USD
    if path.rstrip("/").endswith("/works") or path.rstrip("/").endswith("/authors"):
        return FILTER_PAGE_USD
    return 0.0


def cache_for(root: Path) -> Cache:
    return Cache(root)
