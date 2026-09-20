"""Stage 11 — the app's JSON (docs/05-metrics-and-data-contract.md §4).

The thin shell around `uwpr_pubs.export`: assemble the metadata a run knows, build the two
documents, validate them against their schemas, and write them canonically. Stage 10 was Phase
4's and was retired with it on 2026-09-20.

**Where it writes.** `export/` is a sibling of `store/` (docs/02 §3), not a directory inside it,
so it is derived from the store path rather than carried separately. A run against a scratch
store therefore writes a scratch export, and development never touches the repository's own.
"""

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from uwpr_pubs.config import Config
from uwpr_pubs.context import RunContext
from uwpr_pubs.export import (
    ExportDoc,
    ExportMeta,
    ExportResource,
    LookupDoc,
    build_export,
    build_lookup,
)
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.store import io
from uwpr_pubs.store.models import Candidate, MetricsLine, Work, WorkId

EXPORT_FILE = "uwpr_publications.json"
LOOKUP_FILE = "lookup_index.json"


def export_dir(store: Path) -> Path:
    """`export/` beside `store/` (docs/02 §3)."""
    return store.parent / "export"


def resource_block(config: Config) -> ExportResource:
    """The facility's own names, from config rather than from anywhere in the code."""
    resource = config.resource
    return {
        "name": str(resource["name"]),
        "short_name": str(resource["short_name"]),
        "url": str(resource["url"]),
        "identifier": str(config.rules["r2"]["code"]),
        "staff": [
            {"name": str(person["name"]), "openalex": str(person["openalex"][0])}
            for person in sorted(config.staff, key=lambda p: str(p["key"]))
        ],
    }


def meta_for(config: Config, context: RunContext, pipeline_version: str) -> ExportMeta:
    return ExportMeta(
        run_id=context.run_id,
        generated_at=context.started_at,
        pipeline_version=pipeline_version,
        rule_version=config.rule_version,
        run_year=int(context.date[:4]),
        citations_as_of=context.date,
        resource=resource_block(config),
    )


def build(
    works: Sequence[Work],
    candidates: Sequence[Candidate],
    metrics: Sequence[MetricsLine],
    aliases: Mapping[str, WorkId],
    meta: ExportMeta,
) -> tuple[ExportDoc, LookupDoc]:
    return build_export(works, metrics, meta), build_lookup(candidates, aliases, meta)


def schema_problems(export: ExportDoc, lookup: LookupDoc) -> list[str]:
    """Schema errors in either document, named by file so a failure says which one."""
    problems = [f"{EXPORT_FILE}: {message}" for message in schema_errors("export", export)]
    problems += [f"{LOOKUP_FILE}: {message}" for message in schema_errors("lookup-index", lookup)]
    return problems


def write(directory: Path, export: ExportDoc, lookup: LookupDoc) -> int:
    """Returns the number of files written."""
    io.write_json(directory / EXPORT_FILE, export)
    io.write_json(directory / LOOKUP_FILE, lookup)
    return 2


def read(directory: Path) -> tuple[Any, Any]:
    return io.read_json(directory / EXPORT_FILE), io.read_json(directory / LOOKUP_FILE)
