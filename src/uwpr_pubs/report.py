"""The run report and manifest (docs/03-retrieval-pipeline.md §10.6, docs/02 §11).

The stages append to a recorder as they go, rather than the report being built from the finished
store, because a run that fails at the validation gate must still produce a report (§10.6).
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, cast

from uwpr_pubs.context import RunContext
from uwpr_pubs.store.models import (
    ApiUse,
    Changes,
    ChannelRun,
    Degradation,
    MergedChange,
    RemovedChange,
    RunManifest,
    RunStatus,
    WorkId,
)


# Degradations are matched across runs to spot a source that has been failing for three runs
# (§9), so their names come from a fixed vocabulary rather than free text.
def channel_source(channel: str) -> str:
    return f"channel:{channel}"


def adapter_source(adapter: str) -> str:
    return f"source:{adapter}"


def stage_source(stage: str) -> str:
    return f"stage:{stage}"


MAX_LISTED_WORKS = 50
TRAILING_RUNS = 8  # the average per-rule and per-channel counts are compared with (§10.6)
SHARP_CHANGE = 0.25  # a quarter either way, and at least MIN_CHANGE, is worth a line in the report
MIN_CHANGE = 3


@dataclass(frozen=True)
class Trend:
    """One count against its trailing average. A warning in the report only, never an alert (§9)."""

    name: str
    now: int
    average: float

    @property
    def sharp(self) -> bool:
        difference = abs(self.now - self.average)
        return difference >= MIN_CHANGE and difference > SHARP_CHANGE * max(self.average, 1.0)

    def line(self) -> str:
        direction = "up from" if self.now > self.average else "down from"
        return f"- {self.name}: {self.now}, {direction} a trailing average of {self.average:.1f}"


def trailing_average(runs: Sequence[Mapping[str, Any]], section: str, field: str) -> dict[str, float]:
    """The mean of one count across the last few runs, per rule or per channel (§10.6).

    Runs are ordered by their IDs, which begin with the start time, so "the last eight" needs no
    other bookkeeping. A name that appears in only some of them averages over those.
    """
    recent = sorted(runs, key=lambda run: str(run.get("run_id", "")))[-TRAILING_RUNS:]
    totals: dict[str, list[int]] = {}
    for run in recent:
        for name, counts in (run.get(section) or {}).items():
            totals.setdefault(str(name), []).append(int(counts.get(field, 0)))
    return {name: sum(values) / len(values) for name, values in totals.items() if values}


def trends(now: Mapping[str, Mapping[str, int]], averages: Mapping[str, float], field: str) -> list[Trend]:
    found = [
        Trend(name, int(counts.get(field, 0)), averages[name])
        for name, counts in now.items()
        if name in averages
    ]
    found += [Trend(name, 0, average) for name, average in averages.items() if name not in now]
    return sorted((trend for trend in found if trend.sharp), key=lambda trend: trend.name)


@dataclass
class NewWork:
    work: WorkId
    title: str
    link: str | None
    reasons: list[tuple[str, str | None]] = field(default_factory=list)  # label, excerpt


@dataclass
class RunRecorder:
    context: RunContext
    rule_version: str
    config_fingerprint: str
    rules_fingerprint: str
    code_version: str
    channels: dict[str, ChannelRun] = field(default_factory=dict)
    rules: dict[str, dict[str, int]] = field(default_factory=dict)
    degradations: list[Degradation] = field(default_factory=list)
    alerts: list[tuple[str, str]] = field(default_factory=list)
    added: list[WorkId] = field(default_factory=list)
    removed: list[RemovedChange] = field(default_factory=list)
    merged: list[MergedChange] = field(default_factory=list)
    list_appeared: list[str] = field(default_factory=list)
    list_disappeared: list[str] = field(default_factory=list)
    new_works: list[NewWork] = field(default_factory=list)
    recall: dict[str, int] = field(default_factory=lambda: {"assessable": 0, "with_evidence": 0})
    fixtures: dict[str, str] = field(default_factory=dict)
    fixture_detail: list[str] = field(default_factory=list)
    good_news: list[str] = field(default_factory=list)
    trends: list[Trend] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    commit: str | None = None
    failure: str | None = None

    def degrade(self, source: str, cause: str) -> None:
        self.degradations.append({"source": source, "cause": cause})

    def alert(self, reason: str, what_to_do: str) -> None:
        self.alerts.append((reason, what_to_do))

    def note(self, text: str) -> None:
        self.notes.append(text)

    def rule_fired(self, rule: str, *, new: bool) -> None:
        counts = self.rules.setdefault(rule, {"works": 0, "new": 0})
        counts["works"] += 1
        if new:
            counts["new"] += 1

    @property
    def status(self) -> RunStatus:
        if self.alerts:
            return "alert"
        return "degraded" if self.degradations else "ok"

    def commit_message(self) -> str:
        """The one bot commit a successful run makes (docs/03 §5 stage 13, C3)."""
        counts = ", ".join(f"{number} {name}" for name, number in self.counts.items())
        changed = [
            f"{len(self.added)} added" if self.added else "",
            f"{len(self.removed)} removed" if self.removed else "",
            f"{len(self.merged)} merged" if self.merged else "",
            f"{len(self.list_appeared)} list entries appeared" if self.list_appeared else "",
            f"{len(self.list_disappeared)} list entries disappeared" if self.list_disappeared else "",
        ]
        summary = "; ".join(part for part in changed if part) or "no change to the works"
        return (
            f"Data update {self.context.run_id}\n\n"
            f"{counts}\n"
            f"{summary}\n"
            f"status {self.status}, rules {self.rule_version}\n"
        )

    def manifest(self, ended: str, api: dict[str, ApiUse]) -> RunManifest:
        changes: Changes = {
            "added": sorted(self.added),
            "removed": sorted(self.removed, key=lambda r: r["work"]),
            "merged": sorted(self.merged, key=lambda m: m["retired"]),
            "list_appeared": sorted(self.list_appeared),
            "list_disappeared": sorted(self.list_disappeared),
        }
        manifest: dict[str, Any] = {
            "schema": 1,
            "run_id": self.context.run_id,
            "mode": self.context.mode,
            "status": self.status,
            "degradations": self.degradations,
            "started": self.context.started_at,
            "ended": ended,
            "code_version": self.code_version,
            "config_fingerprint": self.config_fingerprint,
            "rules_fingerprint": self.rules_fingerprint,
            "rule_version": self.rule_version,
            "channels": self.channels,
            "rules": {rule: cast(Any, counts) for rule, counts in sorted(self.rules.items())},
            "official_list_recall": self.recall,
            "fixtures": self.fixtures,
            "changes": changes,
            "api": api,
        }
        if self.notes:
            manifest["note"] = " | ".join(self.notes)
        return cast(RunManifest, manifest)

    def markdown(self, *, duration_seconds: float, spend_usd: float) -> str:
        status = "FAILED" if self.failure else self.status.upper()
        # The commit is deliberately not named here: it is made *after* this report, because the
        # report is one of the files it commits.
        lines = [
            f"# Run {self.context.run_id}",
            "",
            f"**{status}** · {duration_seconds:.0f}s · OpenAlex ${spend_usd:.4f} · rules {self.rule_version}",
            "",
        ]
        for section in (
            self._failure_section,
            self._alert_section,
            self._store_section,
            self._quality_section,
            self._channel_section,
            self._rule_section,
            self._new_work_section,
            self._change_section,
            self._degradation_section,
            self._note_section,
        ):
            lines += section()
        return "\n".join(lines)

    def _failure_section(self) -> list[str]:
        return ["## Failure", "", self.failure, ""] if self.failure else []

    def _alert_section(self) -> list[str]:
        if not self.alerts:
            return []
        return ["## Alerts", "", *[f"- **{reason}** — {action}" for reason, action in self.alerts], ""]

    def _store_section(self) -> list[str]:
        if not self.counts:
            return []
        return ["## Store", "", *[f"- {name}: {number}" for name, number in self.counts.items()], ""]

    def _quality_section(self) -> list[str]:
        lines: list[str] = []
        if self.recall["assessable"]:
            share = 100 * self.recall["with_evidence"] / self.recall["assessable"]
            lines.append(
                f"- recall on the official list: {self.recall['with_evidence']}/"
                f"{self.recall['assessable']} ({share:.0f}%)"
            )
        if self.fixtures:
            failed = sorted(name for name, outcome in self.fixtures.items() if outcome == "fail")
            passed = sum(1 for outcome in self.fixtures.values() if outcome == "pass")
            missed = sum(1 for outcome in self.fixtures.values() if outcome == "known_miss")
            lines.append(
                f"- test papers: {passed} as expected, {missed} known misses, {len(failed)} failing"
                + (f" ({', '.join(failed)})" if failed else "")
            )
        lines += [f"- good news: {item}" for item in self.good_news]
        lines += [trend.line() for trend in self.trends]
        return ["## Quality", "", *lines, ""] if lines else []

    def _channel_section(self) -> list[str]:
        if not self.channels:
            return []
        lines = [
            "## Channels",
            "",
            "| channel | queries | nominated | new | errors |",
            "|---|---:|---:|---:|---|",
        ]
        for name, run in sorted(self.channels.items()):
            errors = "; ".join(run["errors"]) if run["errors"] else ""
            lines.append(f"| {name} | {run['queries']} | {run['nominated']} | {run['new']} | {errors} |")
        return [*lines, ""]

    def _rule_section(self) -> list[str]:
        if not self.rules:
            return []
        rows = [
            f"| {rule} | {counts['works']} | {counts['new']} |" for rule, counts in sorted(self.rules.items())
        ]
        return ["## Rules", "", "| rule | works | new |", "|---|---:|---:|", *rows, ""]

    def _new_work_section(self) -> list[str]:
        if not self.new_works:
            return []
        lines = ["## New works", ""]
        for work in self.new_works[:MAX_LISTED_WORKS]:
            link = f" ({work.link})" if work.link else ""
            lines.append(f"- **{work.title}**{link} — {work.work}")
            for label, excerpt in work.reasons:
                quoted = f': "{excerpt}"' if excerpt else ""
                lines.append(f"  - {label}{quoted}")
        if len(self.new_works) > MAX_LISTED_WORKS:
            lines.append(f"- …and {len(self.new_works) - MAX_LISTED_WORKS} more")
        return [*lines, ""]

    def _change_section(self) -> list[str]:
        lines: list[str] = []
        if self.removed:
            lines += ["## Works removed", "", *[f"- {i['work']} — {i['reason']}" for i in self.removed], ""]
        if self.merged:
            rows = [
                f"- {m['retired']} → {m['into']}" for m in sorted(self.merged, key=lambda m: m["retired"])
            ]
            lines += [f"## Works merged ({len(self.merged)})", "", *rows[:MAX_LISTED_WORKS]]
            if len(rows) > MAX_LISTED_WORKS:
                lines.append(f"- …and {len(rows) - MAX_LISTED_WORKS} more")
            lines += [""]
        if self.list_appeared or self.list_disappeared:
            lines += ["## Official list", ""]
            lines += [f"- appeared: {key}" for key in sorted(self.list_appeared)]
            lines += [f"- disappeared: {key}" for key in sorted(self.list_disappeared)]
            lines += [""]
        return lines

    def _degradation_section(self) -> list[str]:
        if not self.degradations:
            return []
        rows = [f"- {item['source']}: {item['cause']}" for item in self.degradations]
        return ["## Degradations", "", *rows, ""]

    def _note_section(self) -> list[str]:
        return ["## Notes", "", *[f"- {note}" for note in self.notes], ""] if self.notes else []
