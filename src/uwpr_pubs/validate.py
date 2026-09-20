"""Validate a store against the schemas and the invariants of docs/02-data-model.md §14.

Ported from the spec-phase `tools/validate_store.py` with the same checks, plus three fixes: a
missing or empty store is an error rather than a silent pass, malformed JSON is reported instead
of raising, and the invariant pass never assumes a field the schema might have rejected, so schema
errors are always printed.
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from uwpr_pubs.export import build_summary
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.store.ids import external_keys
from uwpr_pubs.store.models import IncludedKind
from uwpr_pubs.store.paths import StorePaths

INCLUDED_KINDS: frozenset[str] = frozenset(IncludedKind.__args__)  # type: ignore[attr-defined]


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")

    @property
    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> str:
        counts = "  ".join(f"{name}: {number}" for name, number in self.counts.items())
        return f"{counts}\n{len(self.errors)} error(s), {len(self.warnings)} warning(s)"


def _load_json(path: Path, where: str, report: Report) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        report.error(where, f"invalid JSON: {exc}")
        return None


def _load_jsonl(path: Path, report: Report) -> list[tuple[int, Any]]:
    rows: list[tuple[int, Any]] = []
    if not path.exists():
        return rows
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append((number, json.loads(line)))
        except json.JSONDecodeError as exc:
            report.error(f"{path.name}:{number}", f"invalid JSON: {exc}")
    return rows


def _check(name: str, instance: object, where: str, report: Report) -> bool:
    errors = schema_errors(name, instance)
    for message in errors:
        report.error(where, message)
    return not errors


def validate_store(store: Path, overrides_path: Path | None = None) -> Report:  # noqa: PLR0912, PLR0915
    paths = StorePaths(store)
    overrides_file = overrides_path if overrides_path else store.parent / "overrides.yaml"
    report = Report()

    if not store.is_dir():
        report.error(str(store), "store directory does not exist")
        return report

    # --- load and schema-check every file (invariant 8)
    works: dict[str, Any] = {}
    for path in sorted(paths.works.glob("W-??????.json")):
        work = _load_json(path, path.name, report)
        if work is None:
            continue
        _check("work", work, path.name, report)
        if work.get("id") != path.stem:
            report.error(path.name, f"file name does not match id {work.get('id')}")
        works[work.get("id")] = work

    generated: dict[str, Any] = {}
    for path in sorted(paths.works.glob("W-??????.generated.json")):
        content = _load_json(path, path.name, report)
        if content is None:
            continue
        _check("generated", content, path.name, report)
        generated[content.get("work")] = content

    candidates: dict[str, Any] = {}
    for number, line in _load_jsonl(paths.candidates, report):
        _check("candidate", line, f"candidates.jsonl:{number}", report)
        candidates[line.get("id")] = line

    entries: list[Any] = []
    for number, line in _load_jsonl(paths.entries, report):
        _check("list-entry", line, f"entries.jsonl:{number}", report)
        entries.append(line)

    metrics: list[tuple[str, Any]] = []
    for path in sorted(paths.metrics.glob("*.jsonl")):
        for number, line in _load_jsonl(path, report):
            _check("metrics", line, f"{path.name}:{number}", report)
            metrics.append((path.name, line))

    for path in sorted(paths.runs.glob("*.json")):
        manifest = _load_json(path, path.name, report)
        if manifest is not None:
            _check("run", manifest, path.name, report)

    aliases: dict[str, str] = {}
    if paths.aliases.exists():
        content = _load_json(paths.aliases, "aliases.json", report)
        if content is not None:
            _check("aliases", content, "aliases.json", report)
            aliases = content.get("aliases", {})
    else:
        report.error("aliases.json", "missing")

    overrides: list[dict[str, Any]] = []
    if overrides_file.exists():
        # Hand-written YAML: an unquoted 2026-09-20 loads as a date object; treat it as the ISO string.
        loaded = yaml.safe_load(overrides_file.read_text(encoding="utf-8")) or []
        overrides = [
            {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in item.items()} for item in loaded
        ]
        _check("overrides", overrides, overrides_file.name, report)

    report.counts = {
        "works": len(works),
        "candidates": len(candidates),
        "list entries": len(entries),
        "metrics lines": len(metrics),
        "overrides": len(overrides),
    }
    if not works and not candidates and not entries:
        report.error(str(store), "store is empty")

    # --- invariant 1: every work ID in exactly one place
    for work_id in set(works) & set(candidates):
        report.error(work_id, "present in both works/ and candidates.jsonl")
    all_ids = set(works) | set(candidates)
    retired = {k.split(":", 1)[1]: v for k, v in aliases.items() if k.startswith("work:")}
    for old, new in retired.items():
        if old in all_ids:
            report.error(old, f"retired ID still in use (aliased to {new})")

    # --- invariant 2: records unique; external IDs resolve to exactly one work
    record_owner: dict[str, str] = {}
    external_owner: dict[str, str] = {}

    def own_ids(work_id: str, record: dict[str, Any]) -> None:
        record_id = record.get("id")
        if record_id is None:
            return
        if record_id in record_owner:
            report.error(record_id, f"record in both {record_owner[record_id]} and {work_id}")
        record_owner[record_id] = work_id
        for key in external_keys(record.get("ids", {})):
            if key in external_owner and external_owner[key] != work_id:
                report.error(key, f"external ID claimed by {external_owner[key]} and {work_id}")
            external_owner[key] = work_id
            if aliases.get(key) != work_id:
                report.error(work_id, f"aliases.json does not map {key} to {work_id} ({aliases.get(key)})")

    for work_id, work in works.items():
        for record in work.get("records", []):
            own_ids(work_id, record)
    for work_id, line in candidates.items():
        for record in line.get("records", []):
            own_ids(work_id, record)
    for key, target in aliases.items():
        if target not in all_ids:
            report.error("aliases.json", f"{key} -> {target}, which is not a current work")

    list_work_ids = {entry.get("work") for entry in entries}
    include_overrides = {
        o.get("target")
        for o in overrides
        if o.get("action") == "include" and isinstance(o.get("target"), str)
    }

    for work_id, work in works.items():
        records = {r.get("id"): r for r in work.get("records", [])}
        # invariant 3: canonical record exists and is an included kind
        canonical = records.get(work.get("canonical"))
        if not canonical:
            report.error(work_id, "canonical record not among its records")
        elif canonical.get("kind") not in INCLUDED_KINDS:
            report.error(work_id, f"canonical record kind {canonical.get('kind')} is not included")
        elif canonical.get("kind") == "preprint" and any(
            r.get("kind") != "preprint" for r in records.values()
        ):
            report.error(work_id, "canonical is a preprint although a journal version exists")
        # references inside the work
        for evidence in work.get("evidence", []):
            if evidence.get("record") and evidence["record"] not in records:
                report.error(work_id, f"evidence {evidence.get('rule')} points to {evidence['record']}")
        for discovery in work.get("discovery", []):
            if discovery.get("record") not in records:
                report.error(work_id, f"discovery points to unknown record {discovery.get('record')}")
        for record in records.values():
            link = record.get("version_link")
            if link and link.get("to") not in records:
                report.error(work_id, f"{record.get('id')} version_link to a record outside the work")
            fulltext = record.get("fulltext") or {}
            if fulltext.get("status") != "pmc_xml" and not fulltext.get("recheck_after"):
                report.warn(work_id, f"{record.get('id')} has unreadable text but no recheck_after")
        # invariant 4: active evidence, or listed, or include override
        active = [e for e in work.get("evidence", []) if "superseded" not in e]
        if not (active or work_id in list_work_ids or work_id in include_overrides):
            report.error(work_id, "included without active evidence, list entry or include override")
        if any(e.get("rule") == "R1" for e in active) and work_id not in list_work_ids:
            report.error(work_id, "has R1 evidence but no official-list entry")
        if work.get("status", {}).get("basis") == "override" and work_id not in include_overrides:
            report.error(work_id, "status basis is override but no include override targets it")
        if any(e.get("rule") == "override" for e in active) and work_id not in include_overrides:
            report.error(work_id, "override evidence without a matching include override")

    # invariant 5: every list entry maps to an included work, with R1 evidence for that entry
    for entry in entries:
        work = works.get(entry.get("work"))
        if not work:
            report.error(entry.get("key"), f"list entry maps to {entry.get('work')}, not an included work")
        elif not any(
            e.get("rule") == "R1" and (e.get("detail") or {}).get("list_key") == entry.get("key")
            for e in work.get("evidence", [])
        ):
            report.error(entry.get("key"), f"{work.get('id')} lacks R1 evidence for this entry")

    # candidates: reason-specific checks
    for work_id, line in candidates.items():
        if line.get("reason") == "override_exclude" and not any(
            o.get("action") == "exclude" and o.get("target") == work_id for o in overrides
        ):
            report.error(work_id, "reason override_exclude but no exclude override targets it")
        if work_id in list_work_ids:
            report.error(work_id, "on the official list but not included (R1 always wins)")

    # invariant 6: cache references (a warning; the cache is not part of the store)
    cache_refs = sum(
        1 for w in works.values() for r in w.get("records", []) if (r.get("fulltext") or {}).get("cache")
    ) + sum(1 for w in works.values() for e in w.get("evidence", []) if (e.get("source") or {}).get("cache"))
    if cache_refs and not (store.parent / "cache" / "index.jsonl").exists():
        report.warn("cache", f"{cache_refs} cache references not checked: no cache/index.jsonl")

    # invariant 7: override targets resolve
    for override in overrides:
        override_target = override.get("target")
        targets = override_target if isinstance(override_target, list) else [override_target]
        for item in targets:
            if not isinstance(item, str):
                continue
            if item.startswith("W-"):
                if item not in all_ids and item not in retired:
                    report.error("overrides", f"{override.get('action')} target {item} does not resolve")
                if override.get("action") == "merge" and item != targets[0] and item not in retired:
                    # A merge that has not happened yet is the normal state between someone
                    # editing overrides.yaml and the next run applying it. Treating it as an
                    # error made stage 0 reject the very store the run was about to fix
                    # (changed 2026-09-20); after the run, the warning is gone.
                    report.warn("overrides", f"merge: {item} is not yet retired into {targets[0]}")
            elif f"doi:{item}" not in aliases and f"pmid:{item}" not in aliases:
                report.warn("overrides", f"{override.get('action')} target {item} not yet in the store")

    # metrics and generated content refer to included works and their records
    for name, line in metrics:
        historical = name != "latest.jsonl"
        named = line.get("work")
        work = works.get(named) or works.get(retired.get(named, ""))
        complain = report.warn if historical else report.error
        if not work:
            # A month's file is a record of what was true then. A work can leave afterwards, by a
            # rule change or an exclude override, and rewriting history to hide that would be
            # wrong — so for past months this is a warning (docs/02 §10, changed 2026-09-20).
            complain(name, f"metrics for {named}, which is not an included work")
        elif line.get("record") not in {r.get("id") for r in work.get("records", [])}:
            complain(name, f"metrics record {line.get('record')} not in {named}")
    for work_id in generated:
        if work_id not in works:
            report.error(f"{work_id}.generated.json", "generated content for a work that is not included")

    return report


def _check_aliases_resolve(lookup: Any, by_id: Mapping[str, Any], report: Report) -> None:
    """An alias that resolves to nothing is an identifier the app can say nothing about.

    docs/05 §12 words this as "resolves to an exported work", but `aliases.json` maps every
    external identifier to its work whether that work is included or not, and the lookup index
    exists precisely so a *rejected* paper's DOI still gets an answer. So a target counts as
    resolved if it is either an exported work or a `not_included` row; only a target in neither
    would 404.
    """
    answerable = set(by_id) | {row["id"] for row in lookup.get("not_included", [])}
    for key, target in lookup.get("aliases", {}).items():
        if target not in answerable:
            report.error("lookup_index.json", f"alias {key} points at {target}, which is not exported")


def _check_criteria_match_evidence(works: Sequence[Any], report: Report) -> None:
    """`criteria` is derived from the evidence, so it cannot disagree with it."""
    for work in works:
        derived = sorted({e["criterion"] for e in work["evidence"] if e["criterion"] is not None})
        if work["criteria"] != derived:
            report.error(work["id"], f"criteria {work['criteria']} does not match evidence {derived}")


def _check_summary(export: Any, works: Sequence[Any], report: Report) -> None:
    """The summary is computed independently; if it disagrees, one of the two is wrong.

    This is the same cross-check the app runs against its own aggregation (docs/05 §1.2), so a
    metric implemented to a subtly different definition is caught on both sides of the contract.
    """
    for key, value in build_summary(works).items():
        if export["summary"].get(key) != value:
            report.error("summary", f"{key} is {export['summary'].get(key)}, recomputed as {value}")


def _check_against_store(
    works: Sequence[Any], by_id: Mapping[str, Any], store_works: Mapping[str, Any], report: Report
) -> None:
    """Every exported work is an included one, and carries only its active evidence."""
    for work in works:
        stored = store_works.get(work["id"])
        if stored is None:
            report.error(work["id"], "exported but not an included work in the store")
            continue
        active = [e for e in stored["evidence"] if "superseded" not in e]
        if len(work["evidence"]) != len(active):
            report.error(
                work["id"],
                f"exported {len(work['evidence'])} evidence entries against {len(active)} active",
            )
    for work_id in store_works:
        if work_id not in by_id:
            report.error(work_id, "an included work that the export leaves out")


def validate_export(
    export: Any,
    lookup: Any,
    *,
    store_works: Mapping[str, Any] | None = None,
    run_year: int | None = None,
) -> Report:
    """The export's schemas and the cross-checks of docs/05 §12.

    The cross-checks all answer the same question in different places: does the export still say
    what the store says? A projection that has drifted from its source is worse than no export,
    because every number on the page would still look self-consistent.
    """
    report = Report()
    export_ok = _check("export", export, "uwpr_publications.json", report)
    _check("lookup-index", lookup, "lookup_index.json", report)
    if not export_ok:
        return report

    works: list[Any] = export["works"]
    by_id = {work["id"]: work for work in works}
    report.counts = {"works": len(works), "not included": len(lookup.get("not_included", []))}

    _check_aliases_resolve(lookup, by_id, report)
    _check_criteria_match_evidence(works, report)
    _check_summary(export, works, report)

    # The current year is partial by definition, so completeness stops at the year before it.
    if run_year is not None and export["period"]["complete_through"] != run_year - 1:
        report.error(
            "period",
            f"complete_through is {export['period']['complete_through']}, expected {run_year - 1}",
        )

    if store_works is not None:
        _check_against_store(works, by_id, store_works, report)

    return report
