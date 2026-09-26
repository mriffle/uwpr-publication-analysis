"""Stage 11 — the app's JSON (docs/05-metrics-and-data-contract.md §4).

The thin shell around `uwpr_pubs.export`: assemble the metadata a run knows, build the two
documents, validate them against their schemas, and write them canonically. Stage 10 was Phase
4's and was retired with it on 2026-09-20.

**Where it writes.** `export/` is a sibling of `store/` (docs/02 §3), not a directory inside it,
so it is derived from the store path rather than carried separately. A run against a scratch
store therefore writes a scratch export, and development never touches the repository's own.
"""

import gzip
import json
from collections.abc import Iterable, Mapping, Sequence
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
from uwpr_pubs.funding.export import FundingInput
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.store import io
from uwpr_pubs.store.models import (
    Agency,
    Candidate,
    Date,
    DateTime,
    FundingCitation,
    Grant,
    ListEntry,
    MetricsLine,
    Override,
    RunManifest,
    StaffKey,
    Work,
    WorkId,
)
from uwpr_pubs.store.read import FundingSnapshot, StoreSnapshot, read_store

EXPORT_FILE = "uwpr_publications.json"
LOOKUP_FILE = "lookup_index.json"

# The data budget (docs/06 §10, docs/09 §11.9): what the page downloads on first load, which is
# `EXPORT_FILE` alone — the lookup index loads on demand. 500 KiB, gzipped at level 9, the measure
# `web/scripts/check-bundle-budget.mjs` uses for JavaScript. `web/scripts/check-data-budget.mjs`
# enforces the same constant in CI, and a test keeps the two equal. CI never sees the weekly
# run's export (the bot's commit starts no workflow), so stage 11 measures it too, and alerts.
DATA_BUDGET_BYTES = 512_000
GZIP_LEVEL = 9


def export_dir(store: Path) -> Path:
    """`export/` beside `store/` (docs/02 §3)."""
    return store.parent / "export"


def resource_block(config: Config) -> ExportResource:
    """The facility's own names, from config rather than from anywhere in the code.

    `home_institution` and `home_country` are facts about *this* facility, which docs/05 §7.8
    and §7.14 need and which the app must not infer (§1.1 principle 5). `exclusions` is there for
    the same reason: docs/05 §10's method page names what is deliberately not evidence, and it
    can only do that from configuration. Each staff entry carries its `key` as `id`, the same
    identifier `authors[].staff` and `staff_authors` use, which is what lets the app name a staff
    member from an id.
    """
    resource = config.resource
    home = resource["home_institution"]
    return {
        "name": str(resource["name"]),
        "short_name": str(resource["short_name"]),
        "url": str(resource["url"]),
        "identifier": str(config.rules["r2"]["code"]),
        "home_institution": {"ror": str(home["ror"]), "name": str(home["name"])},
        "home_country": str(resource["home_country"]),
        "exclusions": [
            {
                "kind": str(exclusion["kind"]),
                "name": str(exclusion["name"]),
                "note": str(exclusion["note"]),
            }
            for exclusion in resource["exclusions"]
        ],
        "staff": [
            {
                "id": cast(StaffKey, str(person["key"])),
                "name": str(person["name"]),
                "openalex": str(person["openalex"][0]),
            }
            for person in sorted(config.staff, key=lambda p: str(p["key"]))
        ],
    }


# Sources every run queries afresh (a full sweep, docs/03 P1), by the name their evidence gives
# them, each with the degradations that mean it could not. PMC and Europe PMC are not here: a text
# is read once and kept (docs/02 §12), so the date on its evidence is when it was read.
QUERIED_EVERY_RUN = {
    "OpenAlex": ("source:openalex",),
    "Crossref": ("source:crossref",),
    "PRIDE": ("source:pride",),
    "UWPR website": ("source:uwpr_site", "stage:official_list"),
}


def read_on(
    date: Date, degradations: Iterable[Mapping[str, Any]], channels: Iterable[Mapping[str, Any]]
) -> dict[str, Date]:
    """The sources this run read, and the day it read them.

    A failed channel degrades as `channel:<id>`, so `channels.yaml` says which source it counts
    against. PRIDE is reached through channel J alone, so without it a PRIDE outage would still
    be dated as read.
    """
    source_of = {f"channel:{channel['id']}": f"source:{channel['source']}" for channel in channels}
    down = {source_of.get(str(item["source"]), str(item["source"])) for item in degradations}
    return {name: date for name, sources in QUERIED_EVERY_RUN.items() if down.isdisjoint(sources)}


def listings(entries: Iterable[ListEntry]) -> dict[str, tuple[Date, Date]]:
    """Each list entry's own dates, which `entries.jsonl` keeps exactly (docs/02 §7)."""
    return {entry["key"]: (entry["first_seen"], entry["last_seen"]) for entry in entries}


def meta_for(
    config: Config,
    context: RunContext,
    pipeline_version: str,
    *,
    entries: Iterable[ListEntry] = (),
    degradations: Iterable[Mapping[str, Any]] = (),
) -> ExportMeta:
    return ExportMeta(
        run_id=context.run_id,
        generated_at=context.started_at,
        pipeline_version=pipeline_version,
        rule_version=config.rule_version,
        run_year=int(context.date[:4]),
        citations_as_of=context.date,
        resource=resource_block(config),
        listings=listings(entries),
        read_on=read_on(context.date, degradations, config.channels),
    )


def build(  # noqa: PLR0913 - the store's collections, the run's metadata and its funding
    works: Sequence[Work],
    candidates: Sequence[Candidate],
    metrics: Sequence[MetricsLine],
    aliases: Mapping[str, WorkId],
    meta: ExportMeta,
    *,
    funding: FundingInput | None = None,
) -> tuple[ExportDoc, LookupDoc]:
    return build_export(works, metrics, meta, funding), build_lookup(candidates, aliases, meta)


# --- funding (docs/09 §11) -------------------------------------------------------------------------


def last_full_refresh(runs: Iterable[RunManifest]) -> Date | None:
    """The date of the newest run whose funding stage refreshed every grant (docs/09 §8.1).

    There is no state file: the manifests say it. A manifest written before the funding stage
    existed has no `mode`, and says nothing.
    """
    full = [run for run in runs if "funding" in run and run["funding"].get("mode") == "full"]
    return max(full, key=lambda run: run["run_id"])["started"][:10] if full else None


def funding_input(
    snapshot: StoreSnapshot,
    *,
    overrides: Sequence[Override] = (),
    rate_sources: Sequence[Mapping[str, Any]] = (),
    extra: FundingSnapshot | None = None,
    extra_overrides: Sequence[Override] = (),
) -> FundingInput:
    """What the export says about funding, from a store and what the caller knows beside it.

    `overrides` are the store's `overrides.yaml`, for a `grant` override's attribution, and
    `rate_sources` are `config/exchange_rates.yaml`'s: the export reads no other configuration.
    `extra` is the sample's synthetic funding, merged the way its works are (docs/05 §13).
    """
    funding = snapshot.funding
    citations = dict(funding.citations)
    grants = dict(funding.grants)
    agencies = dict(funding.agencies)
    if extra is not None:
        clash = sorted({*citations} & {*extra.citations}) + sorted({*grants} & {*extra.grants})
        if clash:
            raise ValueError(f"the synthetic funding clashes with the store's: {', '.join(clash)}")
        citations.update(extra.citations)
        grants.update(extra.grants)
        # An agency is a fact about the funder, not about a case, so the store's line wins.
        agencies = {**extra.agencies, **agencies}
    return FundingInput(
        citations=citations,
        grants=grants,
        agencies=agencies,
        overrides=[*overrides, *extra_overrides],
        aliases=snapshot.aliases,
        refreshed=last_full_refresh(snapshot.runs),
        rate_sources=rate_sources,
    )


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


def data_size(export: ExportDoc) -> int:
    """`EXPORT_FILE` as `write` puts it on disk, gzipped at level 9: what the budget measures."""
    text = io.canonical_json(export).encode("utf-8")
    return len(gzip.compress(text, compresslevel=GZIP_LEVEL, mtime=0))


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
    degradations: tuple[Mapping[str, Any], ...] = ()

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
        degradations=tuple(latest.get("degradations") or ()),
    )


def load_extra_funding(path: Path) -> tuple[FundingSnapshot, list[Override]]:
    """The synthetic funding beside the synthetic works: store lines for their `funding/`, and
    the `grant` overrides that attribute them (docs/09 §11.8). Empty for a file without any."""
    if not path.exists():
        return FundingSnapshot(), []
    document = json.loads(path.read_text(encoding="utf-8")).get("funding") or {}
    citations = cast(list[FundingCitation], document.get("citations", []))
    grants = cast(list[Grant], document.get("grants", []))
    agencies = cast(list[Agency], document.get("agencies", []))
    snapshot = FundingSnapshot(
        present=bool(document),
        citations={line["work"]: line for line in citations},
        grants={grant["key"]: grant for grant in grants},
        agencies={agency["code"]: agency for agency in agencies},
    )
    return snapshot, cast(list[Override], document.get("overrides", []))


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


def build_from_store(  # noqa: PLR0913 - a store, and each thing the caller knows beside it
    store: Path,
    resource: ExportResource,
    *,
    extra: Path | None = None,
    rule_version: str | None = None,
    channels: Iterable[Mapping[str, Any]] = (),
    overrides: Sequence[Override] = (),
    rate_sources: Sequence[Mapping[str, Any]] = (),
) -> tuple[ExportDoc, LookupDoc]:
    """Build the two documents from a store on disk, without running the pipeline.

    Every field of the run metadata comes from the store's own latest run manifest, so this
    reproduces what that run wrote rather than stamping the file with today's date or, worse, a
    constant belonging to some other store. Funding comes from the store's `funding/` and its
    manifests; `overrides` (the store's own) and `rate_sources` are the only configuration it
    reads (docs/09 §11).
    """
    snapshot = read_store(store)
    identity = store_identity(snapshot)
    extra_works, extra_metrics = load_extra_works(extra) if extra else ([], [])
    extra_funding, extra_overrides = load_extra_funding(extra) if extra else (None, [])

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
        listings=listings(snapshot.entries),
        read_on=read_on(identity.generated_at[:10], identity.degradations, channels),
    )
    funding = funding_input(
        snapshot,
        overrides=overrides,
        rate_sources=rate_sources,
        extra=extra_funding,
        extra_overrides=extra_overrides,
    )
    return build_export(works, metrics, meta, funding), build_lookup(snapshot.candidates, aliases, meta)
