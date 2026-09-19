"""Run identity and the injected clock (docs/03-retrieval-pipeline.md §12.1).

Nothing in the package reads the clock directly. A `RunContext` is built once, in the shell, and
passed down, so replay runs are reproducible and tests are deterministic.
"""

import datetime as dt
from dataclasses import dataclass
from pathlib import Path

from uwpr_pubs.store.models import Date, DateTime, RunMode


@dataclass(frozen=True)
class RunContext:
    today: dt.date
    started: dt.datetime
    mode: RunMode
    store: Path

    @classmethod
    def now(cls, mode: RunMode, store: Path) -> "RunContext":
        """The only place the real clock is read."""
        started = dt.datetime.now(tz=dt.UTC)
        return cls(today=started.date(), started=started, mode=mode, store=store)

    @property
    def run_id(self) -> str:
        return f"{self.started:%Y-%m-%dT%H-%M}-{self.mode}"

    @property
    def date(self) -> Date:
        return self.today.isoformat()

    @property
    def started_at(self) -> DateTime:
        return self.started.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    def timestamp(self, moment: dt.datetime) -> DateTime:
        return moment.astimezone(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    def days_since(self, date: Date) -> int:
        return (self.today - dt.date.fromisoformat(date)).days

    @property
    def year_month(self) -> str:
        return f"{self.today:%Y-%m}"
