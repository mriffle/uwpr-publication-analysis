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
from typing import Any

from uwpr_pubs.store.models import (
    Candidate,
    Discovery,
    Evidence,
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
