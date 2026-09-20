"""The twelve cases the sample export has to cover (docs/05-metrics-and-data-contract.md §13).

`samples/export/` is what the web app is developed and tested against, so it has to contain every
shape the app can meet. Nine of the twelve are already in `samples/store/`. Three are not, and
cannot be:

- **a retracted work** — the real store has none (0 of 339), which §13 itself says;
- **a single-author work** and **one with more than 50 authors** — `samples/store/` runs 4 to 15
  authors, and it is built from live APIs against real UWPR papers.

They cannot be added to `samples/store/` because it is rebuilt from live sources by
`samples/build_sample_store.py`, must rebuild byte-identically, and holds *real* papers with
*real* UWPR evidence. Inventing a UWPR acknowledgement for a real paper that does not have one
would put a false claim into a committed, validated artifact — the one thing this project's
traceability principle exists to prevent — and no real retracted UWPR paper exists to use
instead. So they arrive from `samples/export_cases.json` and are merged by
`uwpr_pubs.stages.export.build_from_store`, which has one path for every store.

**This coverage guard applies to the sample only.** A real store can never satisfy "retracted" or
"override with attribution" — it has no retraction, and its only override is an *exclude*, which
by definition never reaches the export — so applying it everywhere made the export command fail
permanently against its most obvious target.
"""

from collections.abc import Callable, Mapping, Sequence

from uwpr_pubs.export import ExportDoc, ExportWork

LONG_AUTHOR_LIST = 50


def _has_no_excerpt(work: ExportWork, rule: str) -> bool:
    return any(e["rule"] == rule and e["excerpt"] is None for e in work["evidence"])


# One predicate per case, so "it must cover" is a test rather than a promise.
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


def case_report(export: ExportDoc) -> str:
    """Which work covers each case, for the export command's output."""
    lines = []
    for name, matches in CASES.items():
        covered: Sequence[str] = [w["id"] for w in export["works"] if matches(w)]
        mark = "ok  " if covered else "MISS"
        lines.append(f"  {mark} {name}: {', '.join(covered) if covered else '—'}")
    return "\n".join(lines)
