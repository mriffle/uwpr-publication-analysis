"""Validate a store against the schemas and the invariants of docs/02-data-model.md §14.

Ported from the spec-phase `tools/validate_store.py` with the same checks, plus three fixes: a
missing or empty store is an error rather than a silent pass, malformed JSON is reported instead
of raising, and the invariant pass never assumes a field the schema might have rejected, so schema
errors are always printed.

`store/funding/` has invariants of its own, F1-F7 (docs/09 §8.6). Each of their errors names its
invariant ("invariant F4: …"), so neither a test nor a person can mistake one for the store's
invariants 1-8, or for docs/09's decisions F1-F16. A store without `funding/` is checked exactly
as before it existed.
"""

import json
import re
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import yaml

from uwpr_pubs.export import SCHEMA_VERSION, build_summary
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.funding.summary import build_funding_summary
from uwpr_pubs.schemas import project_root, schema_errors
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


def validate_store(  # noqa: PLR0912, PLR0915
    store: Path, overrides_path: Path | None = None, *, resource_code: str | None = None
) -> Report:
    """`resource_code` is `rules.r2.code`; left out, it is read from the project's `rules.yaml`."""
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
            # A target that is not a work ID is a schema error. A DOI or PMID target was once
            # accepted here with a warning, and then ignored by the run (changed 2026-09-26).
            if not isinstance(item, str) or not item.startswith("W-"):
                continue
            if item not in all_ids and item not in retired:
                report.error("overrides", f"{override.get('action')} target {item} does not resolve")
            if override.get("action") == "merge" and item != targets[0] and item not in retired:
                # A merge that has not happened yet is the normal state between someone
                # editing overrides.yaml and the next run applying it. Treating it as an
                # error made stage 0 reject the very store the run was about to fix
                # (changed 2026-09-20); after the run, the warning is gone.
                report.warn("overrides", f"merge: {item} is not yet retired into {targets[0]}")

    # store/funding/ (docs/09 §8.6): invariants F1-F7, then whether each grant override's string
    # is on its work (§6.6)
    citations = _validate_funding(paths, set(works), retired, resource_code, report)
    _check_grant_overrides(overrides, citations, retired, report)

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


# --- store/funding/ (docs/09 §8.6) ------------------------------------------------------------

Located = dict[Any, tuple[str, dict[str, Any]]]  # a line's identity -> (where it is, the line)
NO_GRANT_OUTCOMES = frozenset({"resource_code", "facility_contract", "not_a_grant"})


def _resource_code() -> str | None:
    """`rules.r2.code`, read where it lives: the resource code is never written twice (docs/09 §4)."""
    path = project_root() / "config" / "rules.yaml"
    if not path.is_file():
        return None
    code = ((yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("r2") or {}).get("code")
    return str(code) if code else None


def _letters_and_digits(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", unicodedata.normalize("NFKC", text).upper())


def _strings_of(values: object) -> set[str]:
    """The strings in a list the schema may already have rejected, so hashing never raises."""
    return {value for value in values if isinstance(value, str)} if isinstance(values, list) else set()


def _dicts_of(values: object) -> list[dict[str, Any]]:
    return [value for value in values if isinstance(value, dict)] if isinstance(values, list) else []


def _hashable(value: object) -> object:
    """An identity usable as a dict key, even from a line the schema has rejected."""
    try:
        hash(value)
    except TypeError:
        return json.dumps(value, sort_keys=True, ensure_ascii=False)
    return value


def _funding_lines(path: Path, schema: str, report: Report) -> list[tuple[str, dict[str, Any]]]:
    """Invariant F1: every line parses and validates. Lines that are objects go on to F2-F7."""
    rows: list[tuple[str, dict[str, Any]]] = []
    if not path.exists():
        return rows
    for number, text in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not text.strip():
            continue
        where = f"funding/{path.name}:{number}"
        try:
            line = json.loads(text)
        except json.JSONDecodeError as exc:
            report.error(where, f"invariant F1: invalid JSON: {exc}")
            continue
        for message in schema_errors(schema, line):
            report.error(where, f"invariant F1: {message}")
        if isinstance(line, dict):
            rows.append((where, line))
    return rows


def _one_line_each(
    rows: Sequence[tuple[str, dict[str, Any]]],
    identity: Callable[[dict[str, Any]], Any],
    what: str,
    report: Report,
) -> Located:
    """Invariant F1 again: one line per work, grant, probe or agency, or a lookup picks one."""
    located: Located = {}
    for where, line in rows:
        key = _hashable(identity(line))
        if key in located:
            report.error(where, f"invariant F1: a second line for {what} {key} (first at {located[key][0]})")
        else:
            located[key] = (where, line)
    return located


def validate_funding(
    store: Path, *, included: set[str], retired: Mapping[str, str], resource_code: str | None
) -> Report:
    """Invariants F1-F7 over one store's `funding/` alone: the funding stage's self-check (§9.4).

    `store` need hold nothing but `funding/`: the stage writes its output to a scratch directory
    and asks this before handing it on, so that anything the gate would refuse is carried
    forward instead of stopping the run. `included` and `retired` are the run's, not the store's.
    """
    report = Report()
    _validate_funding(StorePaths(store), included, retired, resource_code, report)
    return report


def _validate_funding(
    paths: StorePaths,
    included: set[str],
    retired: Mapping[str, str],
    resource_code: str | None,
    report: Report,
) -> dict[str, dict[str, Any]] | None:
    """Invariants F1-F7. Returns the citations lines by work, or None when there is no `funding/`."""
    if not paths.funding.is_dir():
        return None
    citation_rows = _funding_lines(paths.funding_citations, "funding-citation", report)
    grant_rows = _funding_lines(paths.funding_grants, "grant", report)
    lookup_rows = _funding_lines(paths.funding_lookups, "funding-lookup", report)
    agency_rows = _funding_lines(paths.funding_agencies, "agency", report)
    report.counts.update(
        {
            "funding citations": len(citation_rows),
            "grants": len(grant_rows),
            "funding lookups": len(lookup_rows),
            "agencies": len(agency_rows),
        }
    )
    citations = _one_line_each(citation_rows, lambda line: line.get("work"), "work", report)
    grants = _one_line_each(grant_rows, lambda line: line.get("key"), "grant", report)
    _one_line_each(lookup_rows, lambda line: (line.get("source"), line.get("query")), "probe", report)
    agencies = _one_line_each(agency_rows, lambda line: line.get("code"), "agency", report)

    _check_citations(citations, included, retired, grants, report)
    _check_agencies(grants, agencies, report)
    _check_amounts(grants, report)
    _check_no_grant_outcomes(citations, grants, resource_code or _resource_code(), report)
    return {work: line for work, (_, line) in citations.items() if isinstance(work, str)}


def _check_citations(
    citations: Located, included: set[str], retired: Mapping[str, str], grants: Located, report: Report
) -> None:
    """Invariants F2, F3 and F4."""
    listed: set[str] = set()
    for work, (where, line) in citations.items():
        # F2. A retired ID is an error, not a redirect: the stage moves a merged work's line onto
        # the work that survives (docs/09 §8.1), so one left behind was never moved.
        if work in retired:
            report.error(where, f"invariant F2: {work} is a retired work ID, merged into {retired[work]}")
        elif work not in included:
            report.error(where, f"invariant F2: {work} is not an included work")
        # F3: the line's grants are exactly what its strings and its NIH links list.
        strings = _dicts_of(line.get("strings"))
        from_strings = {key for string in strings for key in _strings_of(string.get("grants"))}
        from_links = _strings_of([link.get("grant") for link in _dicts_of(line.get("nih_links"))])
        stated = _strings_of(line.get("grants"))
        if stated != from_strings | from_links:
            report.error(
                where,
                f"invariant F3: {work}'s grants are not those of its strings and NIH links"
                f" (missing {sorted((from_strings | from_links) - stated)},"
                f" listed by no string or link {sorted(stated - from_strings - from_links)})",
            )
        # F4, first half: every key a work lists is a grant.
        mine = stated | from_strings | from_links
        listed |= mine
        for key in sorted(mine - set(grants)):
            report.error(where, f"invariant F4: {work} lists {key}, which grants.jsonl lacks")
    # F4, second half: every grant is listed by some work.
    for key, (where, _) in grants.items():
        if key not in listed:
            report.error(where, f"invariant F4: {key} is listed by no work")


def _check_agencies(grants: Located, agencies: Located, report: Report) -> None:
    """Invariant F5: every grant's agency, and every parent, is an agency; no chain loops."""
    for key, (where, grant) in grants.items():
        if _hashable(grant.get("agency")) not in agencies:
            report.error(
                where, f"invariant F5: {key}'s agency {grant.get('agency')} is not in agencies.jsonl"
            )
    for code, (where, agency) in agencies.items():
        parent = _hashable(agency.get("parent"))
        if parent is not None and parent not in agencies:
            report.error(where, f"invariant F5: {code}'s parent {parent} is not in agencies.jsonl")
    cycles: set[frozenset[Any]] = set()
    for code in agencies:
        chain: list[Any] = []
        current = code
        while current in agencies and current not in chain:
            chain.append(current)
            current = _hashable(agencies[current][1].get("parent"))
        if current not in chain:
            continue
        cycle = chain[chain.index(current) :]
        if frozenset(cycle) not in cycles:
            cycles.add(frozenset(cycle))
            path = " -> ".join(str(member) for member in [*cycle, current])
            report.error(agencies[current][0], f"invariant F5: the agencies' parents form a cycle: {path}")


def _check_amounts(grants: Located, report: Report) -> None:
    """Invariant F6: an amount agrees with itself.

    It reads no config, so editing the rates cannot turn committed data red (docs/09 §8.6): a new
    rate changes the next run's amounts, not the validity of the last one's.
    """
    for key, (where, grant) in grants.items():
        amount = grant.get("amount")
        if not isinstance(amount, dict):
            continue
        usd, original, rate = amount.get("usd"), amount.get("original"), amount.get("rate")
        if isinstance(usd, int) and isinstance(original, str) and isinstance(rate, str):
            try:
                converted = (Decimal(original) * Decimal(rate)).quantize(Decimal(1), rounding=ROUND_HALF_EVEN)
            except InvalidOperation:
                converted = None  # not a decimal, which invariant F1 has already said
            if converted is not None and usd != int(converted):
                report.error(
                    where, f"invariant F6: {key}'s usd {usd} is not round({original} * {rate}) = {converted}"
                )
        if amount.get("basis") == "reporter_fiscal_years":
            years = ((grant.get("facts") or {}).get("reporter") or {}).get("fiscal_years")
            if not isinstance(years, dict):
                report.error(where, f"invariant F6: {key}'s amount is by fiscal year, but it has none")
                continue
            total = sum(value for value in years.values() if isinstance(value, int))
            if usd != total:
                report.error(
                    where, f"invariant F6: {key}'s usd {usd} is not the sum of its fiscal years, {total}"
                )


def _check_no_grant_outcomes(
    citations: Located, grants: Located, resource_code: str | None, report: Report
) -> None:
    """Invariant F7: what is not a grant lists none, and the resource code is never a grant."""
    for work, (where, line) in citations.items():
        for string in _dicts_of(line.get("strings")):
            listed = sorted(_strings_of(string.get("grants")))
            if string.get("outcome") in NO_GRANT_OUTCOMES and listed:
                outcome, raw = string.get("outcome"), string.get("raw")
                report.error(where, f"invariant F7: {work}'s {outcome} string '{raw}' lists {listed}")
    if not resource_code:
        return
    code = _letters_and_digits(resource_code)
    for key, (where, grant) in grants.items():
        for name in ("key", "number"):
            value = grant.get(name)
            if isinstance(value, str) and code in _letters_and_digits(value):
                report.error(
                    where, f"invariant F7: {key}'s {name} contains the resource code {resource_code}"
                )


def _check_grant_overrides(
    overrides: Sequence[Mapping[str, Any]],
    citations: Mapping[str, Mapping[str, Any]] | None,
    retired: Mapping[str, str],
    report: Report,
) -> None:
    """A grant override whose string its work does not show is a warning, like an unapplied merge.

    That is the normal state between someone adding an override and the run that reads the
    string, and after a source stops showing it. A store with no `funding/` has nowhere to look
    yet (the real store, until the seed), which is said once rather than once per override. Two
    overrides giving one string on one work different answers are an error: the stage can honour
    only one of them.
    """
    entries = [
        o
        for o in overrides
        if o.get("action") == "grant" and isinstance(o.get("target"), str) and isinstance(o.get("raw"), str)
    ]
    answers: dict[tuple[str, str], Any] = {}
    for override in entries:
        work = retired.get(override["target"], override["target"])
        slot = (work, override_match_key(override["raw"]))
        if slot in answers and answers[slot] != override.get("grant"):
            report.error(
                "overrides",
                f"grant: two overrides for '{override['raw']}' on {work} disagree"
                f" ({answers[slot]} and {override.get('grant')})",
            )
        answers.setdefault(slot, override.get("grant"))
    if not entries:
        return
    if citations is None:
        report.warn("overrides", f"{len(entries)} grant override(s) not checked: the store has no funding/")
        return
    for override in entries:
        target = override["target"]
        work = retired.get(target, target)
        seen = {
            override_match_key(string["raw"])
            for string in _dicts_of((citations.get(work) or {}).get("strings"))
            if isinstance(string.get("raw"), str)
        }
        if override_match_key(override["raw"]) not in seen:
            merged = f" (merged into {work})" if work != target else ""
            report.warn("overrides", f"grant override: '{override['raw']}' is not seen on {target}{merged}")


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


# --- the export's funding (docs/09 §11.7) ------------------------------------------------------------
# Each check has its own message, so a failure says which promise of the contract broke. They read
# the export alone, except the last, which compares the listings with the store's citations lines
# when the caller has them (the pipeline does).

HOW_ORDER = ("listed", "corrected", "override", "nih_link")  # docs/09 §11.2's precedence


def _chain(code: str, parents: Mapping[str, Any]) -> tuple[list[str], bool]:
    """An agency and its parents, root first, and whether following them closed a cycle."""
    chain = [code]
    parent = parents.get(code)
    while parent is not None:
        if parent in chain:
            return chain[::-1], True
        chain.append(parent)
        parent = parents.get(parent)
    return chain[::-1], False


def _check_no_funding(funding: Any, works: Sequence[Any], report: Report) -> None:
    """§11.1: a null `version` means no funding data at all: every list empty, every count zero."""
    for name in ("sources", "exchange_rates", "agencies", "grants"):
        if funding[name]:
            report.error("funding", f"version is null, but {name} has {len(funding[name])} entries")
    if funding["as_of"] is not None:
        report.error("funding", f"version is null, but as_of is {funding['as_of']}")
    method = funding["method"]
    counts = {
        **{f"strings.{k}": v for k, v in method["strings"].items()},
        **{f"resolution.{k}": v for k, v in method["resolution"].items()},
        "works_without_funding_metadata": method["works_without_funding_metadata"],
    }
    for name, value in counts.items():
        if value:
            report.error("funding", f"version is null, but method.{name} is {value}")
    for name, value in funding["summary"].items():
        if value not in (0, None, {}):
            report.error("funding", f"version is null, but summary.{name} is {value}")
    for work in works:
        if work["grants"]:
            report.error(work["id"], "lists grants, but the export's funding version is null")


def _check_funding_agencies(funding: Any, report: Report) -> dict[str, list[str]]:
    """Every grant's agency, and every parent, is present; no cycles. Returns each grant's chain."""
    parents = {agency["code"]: agency["parent"] for agency in funding["agencies"]}
    for code, parent in parents.items():
        if parent is not None and parent not in parents:
            report.error("funding.agencies", f"{code}'s parent {parent} is not in funding.agencies")
        if _chain(code, parents)[1]:
            report.error("funding.agencies", f"{code}'s parents form a cycle")
    chains: dict[str, list[str]] = {}
    for grant in funding["grants"]:
        if grant["agency"] not in parents:
            message = f"{grant['key']}'s agency {grant['agency']} is not in funding.agencies"
            report.error("funding.grants", message)
        chains[grant["key"]] = _chain(grant["agency"], parents)[0]
    return chains


def _check_listings(works: Sequence[Any], chains: Mapping[str, list[str]], report: Report) -> None:
    """Each listing names a grant the block holds, under its chain, with a coherent `how`."""
    listed: set[str] = set()
    for work in works:
        for row in work["grants"]:
            key = row["grant"]
            listed.add(key)
            if key not in chains:
                report.error(work["id"], f"lists {key}, which funding.grants lacks")
            elif row["agencies"] != chains[key]:
                message = f"lists {key} under agencies {row['agencies']}, but its chain is {chains[key]}"
                report.error(work["id"], message)
            if row["how"] in ("corrected", "override") and "cited_as" not in row:
                report.error(work["id"], f"{key} is how: {row['how']}, but has no cited_as")
            if row["how"] == "override" and "override" not in row:
                report.error(work["id"], f"{key} is how: override, but carries no override attribution")
            if "override" in row and "cited_as" not in row:
                report.error(work["id"], f"{key} carries an override attribution, but no cited_as")
    for key in chains:
        if key not in listed:
            report.error("funding.grants", f"{key} is listed by no exported work")


def _check_first_years(works: Sequence[Any], funding: Any, code: str, report: Report) -> None:
    """A grant's first year is its earliest listing work's; no work writes the resource code."""
    first: dict[str, int] = {}
    for work in works:
        for row in work["grants"]:
            first[row["grant"]] = min(work["year"], first.get(row["grant"], work["year"]))
        for written in (text for row in work["grants"] for text in row.get("cited_as", [])):
            if code and code in _letters_and_digits(written):
                report.error(work["id"], f"the resource code {code} is written in cited_as '{written}'")
    for grant in funding["grants"]:
        key = grant["key"]
        if key in first and grant["first_year"] != first[key]:
            report.error(
                "funding.grants",
                f"{key}'s first_year is {grant['first_year']}, but the earliest exported work listing it"
                f" is from {first[key]}",
            )


def _check_grant_rows(funding: Any, code: str, report: Report) -> None:
    """Fiscal years, Miscellaneous, links, and the resource code in no key or number."""
    groups = {agency["code"]: agency["group"] for agency in funding["agencies"]}
    for grant in funding["grants"]:
        key, amount, where = grant["key"], grant["amount_usd"], "funding.grants"
        years = grant["fiscal_years"]
        if years is not None:
            total = sum(value for value in years.values() if value is not None)
            if amount is None and any(value is not None for value in years.values()):
                report.error(where, f"{key}'s fiscal years hold {total}, but it has no amount_usd")
            elif amount is not None and total != amount:
                report.error(where, f"{key}'s fiscal years sum to {total}, but amount_usd is {amount}")
        if key.startswith("MISC:"):
            if grant["status"] != "unresolved":
                report.error(where, f"{key} is a Miscellaneous grant, but its status is {grant['status']}")
            if groups.get(grant["agency"]) != "miscellaneous":
                report.error(where, f"{key} is a Miscellaneous grant, but its agency is not in that group")
            if amount is not None or grant["amount_original"] is not None:
                report.error(where, f"{key} is a Miscellaneous grant, but has an amount")
        if (grant["url"] is None) != (grant["url_name"] is None):
            report.error(where, f"{key} has a url without a url_name, or a url_name without a url")
        for field_name in ("key", "number"):
            if code and code in _letters_and_digits(grant[field_name]):
                report.error(where, f"the resource code {code} is in the {field_name} of {key}")


def _check_funding_summary(works: Sequence[Any], funding: Any, report: Report) -> None:
    """The funding half of docs/05 §1.2's cross-check, recomputed by the export's own function."""
    for key, value in build_funding_summary(works, funding["grants"], funding["agencies"]).items():
        if funding["summary"].get(key) != value:
            report.error("funding.summary", f"{key} is {funding['summary'].get(key)}, recomputed as {value}")


def _check_listings_against_lines(works: Sequence[Any], citations: Mapping[str, Any], report: Report) -> None:
    """`how`, `cited_as` and `override` are what the work's citations line says (§11.2)."""
    for work in works:
        line = citations.get(work["id"]) or {"strings": [], "nih_links": []}
        hows: dict[str, set[str]] = {}
        written: dict[str, set[str]] = {}
        decided: set[str] = set()
        for string in line["strings"]:
            how = string["method"] if string["method"] in ("corrected", "override") else "listed"
            for key in string["grants"]:
                hows.setdefault(key, set()).add(how)
                if how != "listed":
                    written.setdefault(key, set()).add(" ".join(string["raw"].split()))
                if how == "override":
                    decided.add(key)
        for link in line["nih_links"]:
            hows.setdefault(link["grant"], set()).add("nih_link")
        rows = {row["grant"]: row for row in work["grants"]}
        if set(rows) != set(hows):
            report.error(work["id"], f"lists {sorted(rows)}, but its citations line lists {sorted(hows)}")
        for key in sorted(set(rows) & set(hows)):
            row = rows[key]
            expected = next(how for how in HOW_ORDER if how in hows[key])
            if row["how"] != expected:
                message = f"{key} is how: {row['how']}, but its strings and links make it {expected}"
                report.error(work["id"], message)
            if row.get("cited_as", []) != sorted(written.get(key, ())):
                report.error(
                    work["id"],
                    f"{key}'s cited_as is {row.get('cited_as', [])}, but the forms corrected or overridden"
                    f" to it are {sorted(written.get(key, ()))}",
                )
            if (key in decided) != ("override" in row):
                state = "no attribution" if key in decided else "an attribution no override on it explains"
                report.error(work["id"], f"{key}: its override and its listing disagree ({state})")


def _check_funding(
    export: Any, works: Sequence[Any], report: Report, citations: Mapping[str, Any] | None
) -> None:
    funding = export["funding"]
    if funding["version"] is None:
        _check_no_funding(funding, works, report)
        return
    chains = _check_funding_agencies(funding, report)
    _check_listings(works, chains, report)
    code = _letters_and_digits(str(export["resource"]["identifier"]))
    _check_first_years(works, funding, code, report)
    _check_grant_rows(funding, code, report)
    _check_funding_summary(works, funding, report)
    if citations is not None:
        _check_listings_against_lines(works, citations, report)


def validate_export(
    export: Any,
    lookup: Any,
    *,
    store_works: Mapping[str, Any] | None = None,
    run_year: int | None = None,
    funding_citations: Mapping[str, Any] | None = None,
) -> Report:
    """The export's schemas and the cross-checks of docs/05 §12 and docs/09 §11.7.

    The cross-checks all answer the same question in different places: does the export still say
    what the store says? A projection that has drifted from its source is worse than no export,
    because every number on the page would still look self-consistent. `funding_citations`, the
    store's citations lines by work, lets the listings be checked against what the works wrote.
    """
    report = Report()
    version = export.get("schema_version") if isinstance(export, dict) else None
    if version != SCHEMA_VERSION:
        message = f"schema_version is {version}, but this contract is {SCHEMA_VERSION}"
        report.error("uwpr_publications.json", message)
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
    _check_funding(export, works, report, funding_citations)

    # The current year is partial by definition, so completeness stops at the year before it.
    if run_year is not None and export["period"]["complete_through"] != run_year - 1:
        report.error(
            "period",
            f"complete_through is {export['period']['complete_through']}, expected {run_year - 1}",
        )

    if store_works is not None:
        _check_against_store(works, by_id, store_works, report)

    return report
