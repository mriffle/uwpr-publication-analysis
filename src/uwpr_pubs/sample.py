"""The sample export, and the twelve cases it has to cover (docs/05-metrics-and-data-contract.md §13).

`samples/export/` is what the web app is developed and tested against, so it has to contain every
shape the app can meet. Nine of the twelve cases are already in `samples/store/`. Three are not,
and cannot be:

- **a retracted work** — the real store has none (0 of 339), which §13 itself says, so the sample
  must carry a synthetic one;
- **a single-author work** and **one with more than 50 authors** — `samples/store/` runs 4 to 15
  authors, and it is built from live APIs against real UWPR papers.

They cannot come from `samples/store/` because that store is rebuilt from live sources by
`samples/build_sample_store.py`, must rebuild byte-identically, and holds *real* papers with
*real* UWPR evidence. Inventing a UWPR acknowledgement for a real paper that does not have one
would put a false claim into a committed, validated artifact — which is the one thing this
project's traceability principle exists to prevent — and no real retracted UWPR paper exists to
use instead.

So the three arrive from `samples/export_cases.json`: synthetic `Work` objects that validate
against `work.schema.json` like any other, carrying SAMPLE in their titles so nobody mistakes
them for real papers, merged with the sample store's works and passed through the **same**
`build_export` the pipeline uses. The export code has one path; only its input is a union.
"""

import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, cast

from uwpr_pubs.export import ExportDoc, ExportMeta, ExportWork, LookupDoc, build_export, build_lookup
from uwpr_pubs.store.models import MetricsLine, Work, WorkId
from uwpr_pubs.store.read import read_store

# The run this sample stands for. Fixed, because a sample that changed every time it was rebuilt
# would show up as a diff in every unrelated commit.
SAMPLE_RUN_ID = "2026-09-19T00-00-sample"
SAMPLE_GENERATED_AT = "2026-09-19T00:00:00Z"
SAMPLE_RUN_YEAR = 2026


LONG_AUTHOR_LIST = 50


def _has_no_excerpt(work: ExportWork, rule: str) -> bool:
    return any(e["rule"] == rule and e["excerpt"] is None for e in work["evidence"])


# docs/05 §13, one predicate per case, so "it must cover" is a test rather than a promise.
CASES: Mapping[str, Callable[[ExportWork], bool]] = {
    "preprint-only work": lambda w: w["is_preprint"],
    "merged preprint and article": lambda w: bool(w["versions"]),
    "listing is the only evidence": lambda w: [e["rule"] for e in w["evidence"]] == ["R1"],
    "listing evidence has no excerpt": lambda w: _has_no_excerpt(w, "R1"),
    "full-text index match, no excerpt": lambda w: _has_no_excerpt(w, "R6"),
    "override with attribution": lambda w: any(e["rule"] == "override" for e in w["evidence"]),
    "no open-access link": lambda w: w["oa"]["url"] is None,
    "no field-weighted impact": lambda w: w["citations"]["fwci"] is None,
    "retracted": lambda w: w["retracted"],
    "single author": lambda w: w["author_count"] == 1,
    "more than 50 authors": lambda w: w["author_count"] > LONG_AUTHOR_LIST,
    "author with no resolved affiliation": lambda w: any(
        not a["institutions"] and a["affiliations_raw"] for a in w["authors"]
    ),
    "retired work ID in aliases": lambda w: bool(w["aliases"]),
}


def missing_cases(export: ExportDoc) -> list[str]:
    """Which of §13's cases no exported work exhibits."""
    works = export["works"]
    return [name for name, matches in CASES.items() if not any(matches(work) for work in works)]


def load_cases(path: Path) -> tuple[list[Work], list[MetricsLine]]:
    """The synthetic works and their citation lines."""
    if not path.exists():
        return [], []
    document = json.loads(path.read_text(encoding="utf-8"))
    return (
        cast(list[Work], document.get("works", [])),
        cast(list[MetricsLine], document.get("metrics", [])),
    )


def build_sample(
    store: Path,
    cases: Path | None,
    resource: Any,
    rule_version: str | None = None,
) -> tuple[ExportDoc, LookupDoc]:
    """The sample export: a real store, plus the shapes a real store cannot supply.

    The rule version describes *the store*, not the config the command happens to be run with, so
    it is read from the store's own run manifest unless a caller names one. Otherwise rebuilding
    the sample after an unrelated rule change would rewrite it with a version its works never saw.
    """
    snapshot = read_store(store)
    if rule_version is None:
        latest = snapshot.latest_run()
        rule_version = str(latest["rule_version"]) if latest else "0000-00-00.0"
    extra_works, extra_metrics = load_cases(cases) if cases else ([], [])

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
        run_id=SAMPLE_RUN_ID,
        generated_at=SAMPLE_GENERATED_AT,
        pipeline_version="sample",
        rule_version=cast(Any, rule_version),
        run_year=SAMPLE_RUN_YEAR,
        citations_as_of=SAMPLE_GENERATED_AT[:10],
        resource=resource,
    )
    return build_export(works, metrics, meta), build_lookup(snapshot.candidates, aliases, meta)


def case_report(export: ExportDoc) -> str:
    """Which work covers each case, for the build script's output."""
    lines = []
    for name, matches in CASES.items():
        covered: Sequence[str] = [w["id"] for w in export["works"] if matches(w)]
        mark = "ok  " if covered else "MISS"
        lines.append(f"  {mark} {name}: {', '.join(covered) if covered else '—'}")
    return "\n".join(lines)
