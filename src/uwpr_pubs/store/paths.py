"""Where things live in a store, and which of them a run owns (docs/03 §5 stage 13).

A run regenerates only some of the store. Page snapshots are written when a page changes, monthly
metrics when a month turns over, run manifests accumulate, and generated knowledge-base files come
from Phase 4. So stage 13 may delete only the work files of works that have left `works/`;
everything else is carried forward. Getting this wrong would delete the audit trail.
"""

from dataclasses import dataclass
from pathlib import Path

WORK_GLOB = "W-??????.json"
GENERATED_GLOB = "W-??????.generated.json"


@dataclass(frozen=True)
class StorePaths:
    root: Path

    @property
    def works(self) -> Path:
        return self.root / "works"

    @property
    def candidates(self) -> Path:
        return self.root / "candidates.jsonl"

    @property
    def aliases(self) -> Path:
        return self.root / "aliases.json"

    @property
    def official_list(self) -> Path:
        return self.root / "official_list"

    @property
    def entries(self) -> Path:
        return self.official_list / "entries.jsonl"

    @property
    def pages(self) -> Path:
        return self.official_list / "pages"

    @property
    def metrics(self) -> Path:
        return self.root / "metrics"

    @property
    def latest_metrics(self) -> Path:
        return self.metrics / "latest.jsonl"

    @property
    def runs(self) -> Path:
        return self.root / "runs"

    def work_file(self, work_id: str) -> Path:
        return self.works / f"{work_id}.json"

    def generated_file(self, work_id: str) -> Path:
        return self.works / f"{work_id}.generated.json"

    def monthly_metrics(self, year_month: str) -> Path:
        return self.metrics / f"{year_month}.jsonl"

    def run_manifest(self, run_id: str) -> Path:
        return self.runs / f"{run_id}.json"

    def run_report(self, run_id: str) -> Path:
        return self.runs / f"{run_id}.md"

    def work_ids_on_disk(self) -> list[str]:
        return sorted(p.stem for p in self.works.glob(WORK_GLOB))

    def carried_forward(self) -> list[Path]:
        """Files a run does not regenerate and must never delete."""
        kept: list[Path] = []
        kept.extend(sorted(self.pages.rglob("*.html")))
        kept.extend(sorted(p for p in self.metrics.glob("*.jsonl") if p.name != "latest.jsonl"))
        kept.extend(sorted(self.runs.glob("*.json")))
        kept.extend(sorted(self.runs.glob("*.md")))
        kept.extend(sorted(self.works.glob(GENERATED_GLOB)))
        return kept
