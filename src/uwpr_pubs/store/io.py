"""Canonical file writing and the store's array ordering (docs/02-data-model.md §15).

Every write goes through here, so that a run on unchanged inputs produces no diff: UTF-8, 2-space
indent, sorted keys, trailing newline, and a temporary file renamed into place. The sort helpers
give each array a total order; the specs name the first key or two, and the rest are tie-breakers
so that equal primary keys can never reorder between runs.
"""

import json
import os
import tempfile
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any, cast

from uwpr_pubs.store.models import (
    Agency,
    Candidate,
    Discovery,
    Evidence,
    FundingCitation,
    FundingLookup,
    FundingString,
    Grant,
    GrantFacts,
    ListEntry,
    MetricsLine,
    Record,
)


def canonical_json(obj: object) -> str:
    return json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def canonical_jsonl(rows: Iterable[object]) -> str:
    return "".join(json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n" for row in rows)


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def write_bytes_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(handle, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def write_json(path: Path, obj: object) -> None:
    write_text_atomic(path, canonical_json(obj))


def write_jsonl(path: Path, rows: Iterable[object]) -> None:
    write_text_atomic(path, canonical_jsonl(rows))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[Any]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _detail_key(evidence: Evidence) -> str:
    return json.dumps(evidence.get("detail", {}), sort_keys=True, ensure_ascii=False)


def sort_records(records: Sequence[Record]) -> list[Record]:
    """Journal articles before preprints, then by date (docs/02 §15)."""
    return sorted(records, key=lambda r: (r["kind"] == "preprint", r["published"] or "", r["id"]))


def sort_evidence(evidence: Sequence[Evidence]) -> list[Evidence]:
    return sorted(
        evidence,
        key=lambda e: (e["rule"], e["record"] or "", e["section"], e["excerpt"] or "", _detail_key(e)),
    )


def sort_discovery(discovery: Sequence[Discovery]) -> list[Discovery]:
    return sorted(discovery, key=lambda d: (d["channel"], d["record"]))


def sort_candidates(candidates: Sequence[Candidate]) -> list[Candidate]:
    return sorted(candidates, key=lambda c: c["id"])


def sort_entries(entries: Sequence[ListEntry]) -> list[ListEntry]:
    return sorted(entries, key=lambda e: e["key"])


def sort_metrics(metrics: Sequence[MetricsLine]) -> list[MetricsLine]:
    return sorted(metrics, key=lambda m: (m["work"], m["record"]))


# --- store/funding/ (docs/09 §8.3) ------------------------------------------------------------
# Each sorter puts the lines in order *and* every array inside a line, so writing what one returns
# is canonical whatever order the stage built things in. Nothing is dropped or merged: a duplicate
# is the validator's to report (invariant F1), not the writer's to hide.


def _json_key(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def _canonical_string(string: FundingString) -> FundingString:
    return cast(
        FundingString,
        {
            **string,
            "funders": sorted(string["funders"]),
            "sources": sorted(string["sources"]),
            "grants": sorted(string["grants"]),
        },
    )


def _canonical_citation(line: FundingCitation) -> FundingCitation:
    strings = [_canonical_string(s) for s in line["strings"]]
    return cast(
        FundingCitation,
        {
            **line,
            "strings": sorted(strings, key=lambda s: (s["raw"], _json_key(s))),
            "nih_links": sorted(line["nih_links"], key=lambda n: (n["core"], n["grant"], _json_key(n))),
            "grants": sorted(line["grants"]),
        },
    )


def _canonical_facts(facts: GrantFacts) -> GrantFacts:
    canonical = cast(GrantFacts, dict(facts))
    if "reporter" in facts:
        reporter = facts["reporter"]
        canonical["reporter"] = {**reporter, "application_types": sorted(reporter["application_types"])}
    if "openalex" in facts:
        canonical["openalex"] = sorted(facts["openalex"], key=lambda a: (a["id"], _json_key(a)))
    return canonical


def _canonical_grant(grant: Grant) -> Grant:
    return cast(
        Grant,
        {
            **grant,
            "pis": sorted(grant["pis"], key=lambda p: (p["name"], p["id"] or "")),
            "facts": _canonical_facts(grant["facts"]),
            "flags": sorted(grant["flags"]),
            "openalex_awards": sorted(grant["openalex_awards"]),
        },
    )


def sort_funding_citations(lines: Sequence[FundingCitation]) -> list[FundingCitation]:
    """By work; each line's strings by what they say, links by core, keys alphabetically."""
    return sorted((_canonical_citation(line) for line in lines), key=lambda c: (c["work"], _json_key(c)))


def sort_grants(grants: Sequence[Grant]) -> list[Grant]:
    """By key; each grant's people by name, its flags and OpenAlex awards alphabetically."""
    return sorted((_canonical_grant(grant) for grant in grants), key=lambda g: (g["key"], _json_key(g)))


def sort_funding_lookups(lookups: Sequence[FundingLookup]) -> list[FundingLookup]:
    """By source, then query; what each found, alphabetically."""
    canonical = [cast(FundingLookup, {**lookup, "found": sorted(lookup["found"])}) for lookup in lookups]
    return sorted(canonical, key=lambda f: (f["source"], f["query"], _json_key(f)))


def sort_agencies(agencies: Sequence[Agency]) -> list[Agency]:
    return sorted(agencies, key=lambda a: (a["code"], _json_key(a)))
