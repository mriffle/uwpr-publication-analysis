"""Reading a store from disk (docs/02-data-model.md §3).

The only place that casts parsed JSON to the typed shapes. The pipeline validates the committed
store in stage 0 and the staged store in stage 9, so the cast is backed by a schema check rather
than being an unchecked promise.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import cast

from uwpr_pubs.store.ids import Minter, retired_key
from uwpr_pubs.store.io import read_json, read_jsonl
from uwpr_pubs.store.models import (
    Agency,
    AgencyCode,
    Aliases,
    Candidate,
    FundingCitation,
    FundingLookup,
    Grant,
    GrantKey,
    ListEntry,
    LookupSource,
    MetricsLine,
    RecordId,
    RunManifest,
    Work,
    WorkId,
)
from uwpr_pubs.store.paths import StorePaths


@dataclass(frozen=True)
class FundingSnapshot:
    """`store/funding/` (docs/09 §8.1), keyed as the stage looks things up.

    A store without the directory is valid, and reads as empty collections with `present` false:
    "no funding data yet" is not the same thing as "no grants".
    """

    present: bool = False
    citations: dict[WorkId, FundingCitation] = field(default_factory=dict)
    grants: dict[GrantKey, Grant] = field(default_factory=dict)
    lookups: dict[tuple[LookupSource, str], FundingLookup] = field(default_factory=dict)
    agencies: dict[AgencyCode, Agency] = field(default_factory=dict)


def read_funding(paths: StorePaths) -> FundingSnapshot:
    if not paths.funding.is_dir():
        return FundingSnapshot()
    citations = [cast(FundingCitation, line) for line in read_jsonl(paths.funding_citations)]
    grants = [cast(Grant, line) for line in read_jsonl(paths.funding_grants)]
    lookups = [cast(FundingLookup, line) for line in read_jsonl(paths.funding_lookups)]
    agencies = [cast(Agency, line) for line in read_jsonl(paths.funding_agencies)]
    return FundingSnapshot(
        present=True,
        citations={line["work"]: line for line in citations},
        grants={grant["key"]: grant for grant in grants},
        lookups={(lookup["source"], lookup["query"]): lookup for lookup in lookups},
        agencies={agency["code"]: agency for agency in agencies},
    )


@dataclass(frozen=True)
class StoreSnapshot:
    paths: StorePaths
    works: dict[WorkId, Work]
    candidates: list[Candidate]
    aliases: dict[str, WorkId]
    entries: list[ListEntry]
    latest_metrics: list[MetricsLine]
    runs: list[RunManifest]
    funding: FundingSnapshot = field(default_factory=FundingSnapshot)

    @property
    def record_ids(self) -> list[RecordId]:
        ids = [r["id"] for work in self.works.values() for r in work["records"]]
        ids.extend(r["id"] for line in self.candidates for r in line["records"])
        return ids

    @property
    def retired_work_ids(self) -> list[WorkId]:
        return [key.removeprefix("work:") for key in self.aliases if key.startswith("work:")]

    def minter(self) -> Minter:
        known = [*self.works, *(line["id"] for line in self.candidates)]
        return Minter.from_store(known, self.record_ids, self.retired_work_ids)

    def latest_run(self) -> RunManifest | None:
        return max(self.runs, key=lambda r: r["run_id"], default=None)

    def is_retired(self, work: WorkId) -> bool:
        return retired_key(work) in self.aliases


def read_store(root: Path) -> StoreSnapshot:
    paths = StorePaths(root)
    works: dict[WorkId, Work] = {}
    for path in sorted(paths.works.glob("W-??????.json")):
        works[path.stem] = cast(Work, read_json(path))
    aliases: dict[str, WorkId] = {}
    if paths.aliases.exists():
        aliases = cast(Aliases, read_json(paths.aliases))["aliases"]
    runs = [cast(RunManifest, read_json(p)) for p in sorted(paths.runs.glob("*.json"))]
    return StoreSnapshot(
        paths=paths,
        works=works,
        candidates=[cast(Candidate, line) for line in read_jsonl(paths.candidates)],
        aliases=aliases,
        entries=[cast(ListEntry, line) for line in read_jsonl(paths.entries)],
        latest_metrics=[cast(MetricsLine, line) for line in read_jsonl(paths.latest_metrics)],
        runs=runs,
        funding=read_funding(paths),
    )
