"""The run report and manifest (docs/03-retrieval-pipeline.md §10.6, docs/02 §11).

The stages append to a recorder as they go, rather than the report being built from the finished
store, because a run that fails at the validation gate must still produce a report (§10.6).
"""

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
    notes: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
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
        if not self.recall["assessable"]:
            return []
        share = 100 * self.recall["with_evidence"] / self.recall["assessable"]
        return [
            "## Quality",
            "",
            f"- recall on the official list: {self.recall['with_evidence']}/"
            f"{self.recall['assessable']} ({share:.0f}%)",
            "",
        ]

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
