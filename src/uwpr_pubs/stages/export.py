"""Stage 11 — the app's JSON (docs/05-metrics-and-data-contract.md §4).

The thin shell around `uwpr_pubs.export`: assemble the metadata a run knows, build the two
documents, validate them against their schemas, and write them canonically. Stage 10 was Phase
4's and was retired with it on 2026-09-20.

**Where it writes.** `export/` is a sibling of `store/` (docs/02 §3), not a directory inside it,
so it is derived from the store path rather than carried separately. A run against a scratch
store therefore writes a scratch export, and development never touches the repository's own.
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

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
from uwpr_pubs.store.models import Candidate, Date, DateTime, MetricsLine, Work, WorkId
from uwpr_pubs.store.read import StoreSnapshot, read_store

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


# --- building an export from a store, outside a run -----------------------------------------


class NoRunError(ValueError):
    """A store that no run has written cannot say when it was generated."""


@dataclass(frozen=True)
class StoreIdentity:
    """Who last wrote this store, read from its own latest run manifest.

    Everything here used to be a fixed sample constant, which made the builder unusable against
    any store but the sample — and would have put a sample year into a real export's
    `period.complete_through`, the exact partial-year trap docs/05 §4.2 exists to prevent. The
    store already records all of it, so nothing needs to be assumed.
    """

    run_id: str
    generated_at: DateTime
    pipeline_version: str
    rule_version: str
    citations_as_of: Date

    @property
    def run_year(self) -> int:
        """Run IDs start with the date (docs/02 §11), so the year is the first four characters."""
        return int(self.run_id[:4])


def store_identity(snapshot: StoreSnapshot) -> StoreIdentity:
    latest = snapshot.latest_run()
    if latest is None:
        raise NoRunError("this store has no run manifest, so it has no generation date or run year")
    dates = [line["date"] for line in snapshot.latest_metrics]
    return StoreIdentity(
        run_id=str(latest["run_id"]),
        generated_at=latest["started"],
        pipeline_version=str(latest["code_version"]),
        rule_version=str(latest["rule_version"]),
        citations_as_of=max(dates) if dates else latest["started"][:10],
    )


def load_extra_works(path: Path) -> tuple[list[Work], list[MetricsLine]]:
    """Works to export alongside a store's own, with their citation lines.

    Used only by the sample, whose §13 coverage needs shapes no real store holds
    (docs/05 §13). They are ordinary `Work` objects and go through the same builder.
    """
    if not path.exists():
        return [], []
    document = json.loads(path.read_text(encoding="utf-8"))
    return (
        cast(list[Work], document.get("works", [])),
        cast(list[MetricsLine], document.get("metrics", [])),
    )


def build_from_store(
    store: Path,
    resource: ExportResource,
    *,
    extra: Path | None = None,
    rule_version: str | None = None,
) -> tuple[ExportDoc, LookupDoc]:
    """Build the two documents from a store on disk, without running the pipeline.

    Every field of the run metadata comes from the store's own latest run manifest, so this
    reproduces what that run wrote rather than stamping the file with today's date or, worse, a
    constant belonging to some other store.
    """
    snapshot = read_store(store)
    identity = store_identity(snapshot)
    extra_works, extra_metrics = load_extra_works(extra) if extra else ([], [])

    works: list[Work] = [*snapshot.works.values(), *extra_works]
    metrics: list[MetricsLine] = [*snapshot.latest_metrics, *extra_metrics]
    aliases: dict[str, WorkId] = dict(snapshot.aliases)
    for work in extra_works:
        for alias in work["aliases"]:
            aliases[f"work:{alias}"] = work["id"]
        for record in work["records"]:
            for kind in ("doi", "pmid", "pmcid", "openalex"):
                value = record["ids"].get(kind)
                if value:
                    aliases[f"{kind}:{value}"] = work["id"]

    meta = ExportMeta(
        run_id=identity.run_id,
        generated_at=identity.generated_at,
        pipeline_version=identity.pipeline_version,
        rule_version=cast(Any, rule_version or identity.rule_version),
        run_year=identity.run_year,
        citations_as_of=identity.citations_as_of,
        resource=resource,
    )
    return build_export(works, metrics, meta), build_lookup(snapshot.candidates, aliases, meta)
