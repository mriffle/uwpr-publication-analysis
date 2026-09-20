# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A pipeline plus a single-page web app that documents the publication impact of the UW Proteomics
Resource (UWPR).
- The pipeline finds publications supported by UWPR, decides inclusion **fully automatically**,
  and keeps a committed JSON store current via a weekly GitHub Actions run.
- The web app is one fixed template driven by an exported JSON file.
- Each included publication also gets a markdown knowledge-base page, which the app opens when
  the publication is clicked.

**Current state:** Phases 1-3 frozen. Implementation is under way: milestones M0-M4 are done, so
the pipeline runs every channel, reads PMC full text, applies all rules, links versions and
produces a validating store that matches Phase 1's figures. M4.5 (seeding the real store, which
mints ~1,100 permanent work IDs) is next. **`docs/08-implementation.md` is the handoff: status,
measurements, decisions and the full plan.** Public repo: mriffle/uwpr-publication-analysis.

Work proceeds phase by phase. `docs/00-project-phases.md` is the index; each phase has a numbered
spec in `docs/`.

| Phase | Status |
|---|---|
| 1 Discovery | **Frozen** |
| 2 Data model | **Frozen** |
| 3 Pipeline | **Frozen** |
| 8 Implementation | **In progress** (M0-M4 done; see `docs/08-implementation.md`) |
| 4 Knowledge base | Not written |
| 5 Metrics / app JSON | Unreviewed starting point |
| 6 Web app | Unreviewed starting point |
| 7 Operations | Unreviewed starting point |

## How specs are handled

- **Frozen specs change only deliberately.** Each change is dated and noted in the spec's header
  (see the "Changes since freezing" note in `docs/01-discovery-strategy.md`).
- **Discuss a phase before drafting its spec.** Don't write substantive specs for phases not yet
  discussed.
- **Unreviewed specs are provisional.** 05–07 predate most decisions; expect to rewrite them.
- **Measure before deciding.** Claims in specs come from live API measurements. When changing a
  rule, re-measure its effect (recall on the official list, and new works found).

## Commands

`pyproject.toml` + `uv.lock` define the `uwpr_pubs` package (in `src/`, currently a skeleton) and
its tools. `uv sync` creates `.venv` (Python 3.12, from `.python-version`):

```
uv sync --locked --all-groups                                  # setup; fails if uv.lock is stale
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest   # = check.yml
uv run pytest tests/test_evidence.py::test_the_28_day_rule     # single test
uv run uwpr-pubs validate samples/store                        # schemas + invariants; exit 1 on error
uv run uwpr-pubs config                                        # fingerprints and config summary
uv run uwpr-pubs smoke                                         # live source check (~$0.001)
uv run uwpr-pubs run --store /tmp/scratch-store                # live run (~$0.010, ~110 s, warm cache)
uv run uwpr-pubs explain <DOI|PMID|W-id> --store DIR           # why a paper is, or is not, included
uv run uwpr-pubs fixtures --store DIR                          # the Phase 1 §12 test papers
uv run uwpr-pubs report [RUN_ID] --store DIR                   # a run report (default: the latest)
uv run python samples/build_sample_store.py                    # rebuild sample store from live APIs
```

- **Quality gate:** `.github/workflows/check.yml` runs exactly these checks. Tests are offline:
  `tests/conftest.py` blocks sockets. Actions are pinned to commit SHAs (Dependabot updates
  them).
- **`samples/build_sample_store.py`** is a spec-phase record of how the sample was built and is
  excluded from ruff and mypy. The validator now lives in the package as `uwpr_pubs.validate`.
- **The sample build** needs `OPEN_ALEX_API_KEY` in `.env` (read automatically). It checks every
  PMC evidence excerpt against the paper's live text, and a rebuild must be byte-identical
  apart from `metrics/`.

## Architecture (big picture)

**Discovery vs inclusion** (`docs/01-discovery-strategy.md`).
- **Channels** (A, B1…J) only *nominate* candidates.
- **Rules** decide inclusion. Any one of these includes a work:
  - R1: on UWPR's own publications list, which always wins;
  - R2: the code `UWPR95794` in funding metadata or text;
  - R3: the resource named (R3d: named in a PRIDE dataset description);
  - R4: the early-era name "South Lake Union Mass Spec Facility";
  - R5: an author's affiliation is the resource;
  - R6: an OpenAlex full-text phrase hit, used when we can't read the text;
  - R7: a staff member thanked for analysis or technical help, within tenure.
- **Each rule maps to one of four criteria:** listed on the site; UWPR code as funding; staff in
  their UWPR role; facilities used.
- **Many near-misses are deliberately *not* evidence:**
  - staff co-authorship;
  - the DRC Quantitative & Functional Proteomics Core, or the Dept. of Medicine MS Resource;
  - UWPR software, web tools or hardware designs (Comet, SEQUEST, the fragment calculator, the
    nanospray source).

  Check §6 and `docs/01a-discovery-calibration.md` before changing rule behaviour.

**Versions and merges** (Phase 1 §8; stage 6).
- Four signals link a preprint to its article, in descending order of trust: a Crossref relation
  (**both** directions — `has-preprint` on the article is far commoner than `is-preprint-of` on
  the preprint), bioRxiv's `published` field, a DOI among an OpenAlex record's locations, and
  only then title + first author + year.
- **Only preprint-only works are asked about.** A work already holding both versions needs no
  request, which is what keeps this cheap.
- Merging is union-find over work IDs: **the lowest ID survives**, the rest become `work:`
  aliases, and everything that named a retired ID is repointed.
- Some real pairs no source links at all. Those need a **merge override** (`overrides.yaml`);
  the NUP153 preprint/article pair is the worked example, in `samples/store/`.

**Store** (`docs/02-data-model.md`; `samples/store/` is a real, validated example of the layout).
- **One JSON file per included work:** `store/works/W-000123.json`. It holds the work's records
  (preprint and article versions), evidence and discovery. Works not included go in
  `candidates.jsonl`, with a reason and "signals".
- **IDs:** work IDs `W-` and record IDs `R-` are permanent. External IDs map to work IDs through
  `aliases.json`, using type-prefixed keys.
- **Evidence** carries `rule_version` (`YYYY-MM-DD.N`). A rule change supersedes evidence and can
  remove a work, which then keeps its `former_evidence`. A source outage never removes anything.
- **Citations** live in `store/metrics/`, apart from the work files, so weekly citation changes
  don't rewrite every work.

**Schemas** (`schemas/`).
- JSON Schema draft 2020-12.
- `common.schema.json` holds the shared `$defs`; other schemas reference it by relative `$ref`.
  All `$id`s live under `https://uwpr-pubs.local/schemas/`.
- The validator builds a `referencing.Registry` from every `*.schema.json`.
- Cross-file invariants (Phase 2 §14) are enforced in `uwpr_pubs.validate`, not in the schemas.

**Pipeline (Phase 3, frozen).**
- Pure core (text extraction, rules, matching, status) and a thin impure shell (HTTP, cache,
  file writes).
- Three modes: `live`, `replay` (tests; no network) and `record`.
- A full sweep every run, with a validation gate before any write.
- **The download cache (`cache/`, git-ignored) is only an accelerator.** CI runners start
  cold, so the pipeline must be correct with an empty cache.

## Data-source gotchas (learned the hard way)

- **OpenAlex is usage-priced.**
  - Costs: lookup by ID is free; list/filter pages are $0.0001; search and full-text search
    pages are $0.001.
  - The key allows $1/day. The key is `OPEN_ALEX_API_KEY`; it must be stripped from any URL
    that is logged or cached.
- **Contact address.** Use `mriffle@uw.edu` for `mailto=`, `email=` and the User-Agent contact.
  Never use any other personal address.
- **PMC full text:**
  - Europe PMC `fullTextXML` returns HTTP 500 for non-open-access records; use NCBI
    `efetch?db=pmc` instead.
  - Some PMC records have no `<body>` (publisher restriction).
- **NCBI ID converter:** mixing PMIDs and DOIs in one request fails; send separate
  `idtype=pmid` and `idtype=doi` batches.
- **JATS text must be parsed structurally** (Phase 1 §6.1):
  - block elements end sentences;
  - `<label>` is dropped;
  - don't split sentences after initials ("P. D. von Haller").

  Flattening the XML glues headings onto sentences and breaks the excerpts.
- **Match `UWPR` case-sensitively,** and exclude URL/software/hardware contexts, e.g.
  `github.com/UWPR/Comet` or "UWPR nanospray source". Fred Hutch also has a "Proteomics
  Resource" in Seattle.
- **Hand-written YAML dates** (`date: 2026-09-20`) load as date objects; normalise them to ISO
  strings before schema validation.
- **Crossref's 404 is an answer, not an outage.** `HttpError.status` carries the distinction; a
  real outage must degrade the run rather than read as "this DOI has no preprint relation".
- **Preprint servers mint a DOI per revision** (`…-33v24-v2`, `…/v2`), so a stated relation may
  name a revision the store does not hold.

## Measuring

- **`docs/08` §3's figures go stale.** Before claiming a change moved a number, re-run the
  *previous commit* against the same cache the same day. Comparing against a recorded table once
  showed a 392-candidate regression that had never happened.
- **Run twice and diff the store.** It has now found six identity and date bugs, and no unit
  test has ever caught one of them. The most recent: a candidate's stored records were dropped
  whenever another of its records was re-nominated.
- **Read the channel table in the run report before believing any number under it.** A whole
  class of channels silently didn't run during M3 while recall still looked fine.

## Repository rules

- **The repository is public.** Never commit full text (it lives in `cache/`), abstracts, `.env`
  or the API key. The store may hold short attributed excerpts (≤ ~300 characters).
- **Scratch exploration scripts and their outputs lived outside the repo** and are not
  available. The figures they produced are recorded in the specs.
