# Phase 3 — Retrieval Pipeline Specification

**Status:** Draft 2 · 2026-09-19. Rewritten around the decisions agreed on 2026-09-19 (§2); awaiting
review. It replaces the pre-Phase-1 draft.
**Purpose:** specify the code that finds publications, decides inclusion, and keeps the store and
the app's data current, running unattended on GitHub Actions every week.
**Depends on:**
- [01-discovery-strategy.md](01-discovery-strategy.md) (frozen): channels, rules, text
  sources, matching;
- [02-data-model.md](02-data-model.md) (frozen): every file the pipeline writes, with schemas
  and a validator.

**Hands off to:** Phase 4 (knowledge-base pages) and Phase 5 (app JSON), each as a pipeline
stage (§5, stages 10–11).

---

## 1. Requirements

1. **Unattended and correct.** No human review (Phase 1 §2). A run either finishes with a
   validated store, or changes nothing.
2. **Starts cold.** A GitHub Actions runner has no dependencies installed and no download cache.
   The pipeline must be correct with an empty cache; a warm cache only makes it faster.
3. **Idempotent and deterministic.** Two runs on unchanged sources produce no data diff (Phase 2
   §15).
4. **Never loses a work by accident.**
   - A source outage or empty response never removes anything.
   - Works leave only through a rule-version change or an exclude override (Phase 2 §13).
5. **Polite and cheap.** Rate limits, retries and a contact address. OpenAlex spend stays well
   under the free $1/day.
6. **Everything tested, type-checked and linted.** pytest, mypy (strict) and ruff. Tests run
   offline with no secrets.
7. **Auditable.** Every run writes a readable report. With no human review, the report is the
   audit trail.

## 2. Decisions (agreed 2026-09-19)

| # | Decision |
|---|---|
| P1 | **Search everything on every run.** No date watermarks. Text is downloaded only when a record needs evaluating (§6). |
| P2 | **Fixed stage order with a validation gate** (§5). Nothing after validation runs if validation fails. |
| P3 | **The pipeline commits each successful run.** The update workflow pushes it. |
| P4 | **A failing source degrades the run, never shrinks the data** (§9). |
| P5 | **Python 3.12 package** with a command-line interface. Few dependencies; standard-library XML parsing. |
| P6 | **Everything tunable in `config/*.yaml`.** Changing the rules means bumping `rule_version`, which re-evaluates every work. |
| P7 | **A readable report every run,** shown on the Actions page and committed with the data. |
| P8 | **Tests:** the Phase 1 test papers become automated tests; the sample store is the expected output; tests replay recorded responses; live checks run only in the update workflow. |
| P9 | **Weekly schedule, plus a manual trigger.** Papers with unreadable text are re-checked every 90 days. |
| C1 | **`pyproject.toml` + `uv.lock`**, replacing `requirements.txt`. Development tools go in a dev group. The same `uv` commands work locally and in CI. |
| C2 | **ruff** (lint and format), **mypy --strict**, **pytest** with coverage reported. A coverage threshold is set once the code settles. |
| C3 | **Data commits go directly to `main`,** one bot commit per run, after validation. |
| C4 | **Weekly** (Mondays), plus manual `workflow_dispatch`. |
| C5 | **The OpenAlex key is a GitHub Actions secret.** The contact address lives in `config/settings.yaml`. An NCBI key is an optional secret. |
| C6 | **Run report** in the workflow's job summary and in `store/runs/`. A failed run triggers GitHub's standard failure email. |
| R1 | **The repository is public.** This affects secrets, the cache and inactivity handling (§11.4). |

## 3. Architecture

**Pure core, thin impure shell.** Everything that decides anything (text extraction, rules,
matching, status) is a pure function of its inputs, so it can be unit-tested without the
network. Network access, the cache and file writes sit at the edges, behind small interfaces
that tests replace.

```
             ┌──────────────────────────── impure shell ──────────────────────────────┐
  config/ ──►│ config.py   http.py ◄──► cache.py      sources/*  (one adapter each)     │
             │                  ▲                         │                            │
             │                  └──── replay / record ────┘                            │
             │ store/ (read, write, IDs, aliases)   git.py   report.py                 │
             └───────────────▲──────────────────────────────────┬─────────────────────┘
                             │  plain data in, plain data out   │
             ┌───────────────┴──────────── pure core ───────────▼─────────────────────┐
             │ text.py (JATS → blocks, sentences, sections)   rules/ (R1–R7, R3d)      │
             │ match.py (records → works)   versions.py (links, merges)                │
             │ status.py (inclusion, lifecycle)   evidence.py (identity, merge)        │
             │ validate.py (schemas + Phase 2 §14 invariants)                          │
             └─────────────────────────────────────────────────────────────────────────┘
                                     pipeline.py orchestrates the stages; cli.py wraps it
```

### 3.1 Repository layout (code)

```
pyproject.toml, uv.lock          packaging, pinned dependencies, ruff/mypy/pytest settings
src/uwpr_pubs/
  cli.py                         `uwpr-pubs` command (§8)
  pipeline.py                    stage orchestration (§5)
  config.py                      loads and validates config/*.yaml into typed objects
  http.py                        client: rate limits, retries, budget guard, secret stripping, modes (§7)
  cache.py                       content-addressed cache (Phase 2 §12)
  sources/                       uwpr_site, openalex, europepmc, ncbi, crossref, biorxiv, pride
  channels.py                    channel definitions → nominations (Phase 1 §5)
  store/                         typed models, reading and writing, ID minting, aliases
  text.py                        structural JATS parsing (Phase 1 §6.1)
  rules/                         one module per rule; pure functions returning evidence
  evidence.py                    evidence identity and merging across runs (§6.3)
  match.py, versions.py, status.py, metrics.py, overrides.py
  validate.py                    replaces tools/validate_store.py (same checks)
  report.py                      markdown report and run manifest
  stages/kb.py, stages/export.py hooks for Phases 4 and 5 (no-ops until specified)
  git.py                         commit step
config/                          settings, staff, channels, rules, fixtures (§10)
schemas/                         Phase 2 schemas, plus schemas/config/ for config files
tests/                           unit/, fixtures/, recordings/, test_*.py (§12)
.github/workflows/check.yml, update.yml   (§11)
```

**Dependencies:**
- runtime: `httpx`, `pyyaml`, `jsonschema`;
- dev group: `pytest`, `pytest-cov`, `mypy`, `ruff`, `types-PyYAML`.

Nothing else without a reason recorded here.

## 4. Run modes

| Mode | Network | Used by |
|---|---|---|
| `live` | Yes; responses are written to the cache | Update workflow, local runs |
| `replay` | None. Every request is answered from recordings; a missing recording is an error. | Tests, offline debugging |
| `record` | Yes; responses also saved as test recordings | Creating or refreshing test recordings (§12.3) |

One more switch: `--dry-run` runs every stage but writes nothing and doesn't commit.

## 5. Stages

`uwpr-pubs run` executes these in order. Each stage takes the in-memory store plus its inputs and
returns the updated store; only stage 13 writes to disk.

| # | Stage | What it does | Spec |
|---|---|---|---|
| 0 | **Pre-check** | Load config (schema-checked) and the committed store. Run the validator; if the committed store is invalid, stop. | Phase 2 §14 |
| 1 | **Official list** | Fetch the UWPR publication pages; parse the entries. Save raw pages only when their hash changes. Update `entries.jsonl` first/last seen. Parse check: every page must yield entries, and the total must not fall more than 10% from the last run; otherwise treat the list as a failed source (§9). | Phase 1 §5 A; Phase 2 §7 |
| 2 | **Discover** | Run every enabled channel (Phase 1 §5). Output: nominations (external IDs + channel). The three R6 phrase queries also run here; their DOI sets are kept for stage 5. | Phase 1 §5, §6.5 |
| 3 | **Resolve** | Match each nomination to an existing record or work (Phase 2 §4), else fetch metadata and create a record and work. Apply the record-type filter and the 2006 window. Update discovery first/last seen. | Phase 1 §8; Phase 2 §4, §6 |
| 4 | **Fetch text** | For each record that needs evaluation (§6.1), get readable text in source order (Phase 1 §7). | Phase 1 §7 |
| 5 | **Apply rules** | Run R1–R7 and R3d; produce evidence under the current `rule_version`. Merge with stored evidence (§6.3). | Phase 1 §6 |
| 6 | **Versions** | Link preprints and articles; merge works (lower ID survives); apply merge and split overrides. | Phase 1 §8; Phase 2 §4, §9 |
| 7 | **Status** | Compute inclusion (Phase 2 §13). Move works between `works/` and `candidates.jsonl`. Record reasons and signals. | Phase 2 §6, §13 |
| 8 | **Citations** | Refresh metrics for every record of every included work: OpenAlex filter by ID, 50 per request. Write `latest.jsonl`; copy it to `<YYYY-MM>.jsonl` on the month's first run. | Phase 2 §10 |
| 9 | **Validate (gate)** | Schemas and invariants on the new store. Positive test papers (§12.2) must pass. **Failure ⇒ stop; nothing is written.** | Phase 2 §14 |
| 10 | Knowledge base | Generate or refresh content and pages (Phase 4). No-op until Phase 4 is specified. | Phase 4 |
| 11 | App export | Write `export/` (Phase 5). No-op until Phase 5 is specified. | Phase 5 |
| 12 | Report | Build the run report and manifest (§10.6, Phase 2 §11). | |
| 13 | Write and commit | Atomic writes; `git commit` with a summary message (skipped with `--dry-run`). | Phase 2 §15 |

## 6. Evaluation details

### 6.1 Which records need text

A record is (re)evaluated in stage 4–5 when any of the following holds:
1. it is new;
2. its `fulltext.recheck_after` date has passed (90 days after an unreadable result);
3. the stored evidence has a `rule_version` older than the current one;
4. a new version was linked to its work (evidence on one version applies to all).

**Evidence that needs no text is refreshed every run for every record:**
- R1 (from the list);
- R2 metadata (from the OpenAlex record fetched in stage 3 or 8);
- R6 (from the phrase queries in stage 2);
- R3d (from PRIDE in stage 2).

**Load on a normal week:** text for a handful of new papers. **After a rule change:** text for
every record, about 1,100 NCBI requests, roughly 6 minutes at 3 requests a second.

### 6.2 Text for evaluation

- **Cold cache:** fetch the text again. **Warm cache:** use the cached copy (full text is
  immutable once fetched; Phase 2 §12).
- **If text is needed but can't be fetched** (source down): the record's existing evidence is
  kept unchanged, not superseded. The work is flagged "re-evaluation pending" in the report,
  and the run is degraded.

### 6.3 Evidence identity and merging

Each evidence entry has an identity key, so repeated runs update it rather than duplicating it:

| Rule | Identity key |
|---|---|
| R1 | rule + list entry key |
| R2 (metadata) | rule + record + metadata field |
| R2 (text), R3, R4, R5, R7 | rule + record + section + hash of the normalised excerpt |
| R3d | rule + record + dataset accession |
| R6 | rule + record + phrase |
| override | rule + hash of the override's target, action and reason |

**Merging:**
- **Same rule version:**
  - a reproduced entry has its `last_seen` updated;
  - a new entry is added;
  - an entry not reproduced keeps its `last_seen` (the source stopped showing it); it is not
    superseded.
- **New rule version:** every entry is re-derived.
  - A reproduced entry takes the new `rule_version` and keeps its `first_seen`.
  - An entry that is not reproduced is marked `superseded`.
  - Exception: when the record's text couldn't be fetched (§6.2), its entries are left as
    they were.

### 6.4 Signals for works not included

Stage 7 records the `signals` of Phase 2 §6 from the same pass that applied the rules. Each is
a near-miss that the rules deliberately don't count:
- `staff_coauthor`;
- `staff_ack_other`;
- `core_named`;
- `uwpr_tool_mention`;
- `uwpr_hardware_mention`;
- `uwpr_software_mention`;
- `near_miss_identifier`.

## 7. HTTP layer (`http.py`)

- **One client for all sources.**
- **Per-host rate limits:**

| Host | Limit |
|---|---|
| NCBI | 3/s (10/s with an optional key) |
| Europe PMC | 5/s |
| OpenAlex | 5/s |
| Crossref (polite pool) | 5/s |
| PRIDE | 2/s |
| bioRxiv | 2/s |
| UWPR site | 1/s |

- **Retries:** exponential backoff with jitter on timeouts, 429 and 5xx, honouring
  `Retry-After`. At most 4 attempts, then the request fails and the channel or stage is marked
  failed (§9).
- **Identification:** `User-Agent: uwpr-pubs/<version> (mailto:<contact>)`. OpenAlex and
  Crossref also get `mailto=<contact>`, and NCBI gets `tool=uwpr-pubs&email=<contact>`. The
  contact comes from `config/settings.yaml`.
- **Secrets:**
  - the OpenAlex key comes from the `OPEN_ALEX_API_KEY` environment variable;
  - it is stripped from every URL before the URL is logged, cached, recorded or reported;
  - a test asserts that no committed file and no log line contains the key's value.
- **Budget guard:**
  - read `x-ratelimit-remaining-usd` on each OpenAlex response;
  - stop OpenAlex search requests if the run's spend exceeds `settings.openalex.max_run_usd`
    (default $0.50) or the remaining daily budget falls below $0.10;
  - either way the run is degraded, not failed.
- **Expected spend:** about $0.05 per run. Most of it is full-text searches ($0.001 per page);
  lookups by ID are free.

## 8. Command-line interface

```
uwpr-pubs run [--mode live|replay|record] [--dry-run] [--no-commit] [--channels A,B1,…]
uwpr-pubs validate [STORE]            schemas + invariants (Phase 2 §14)
uwpr-pubs fixtures                    evaluate the Phase 1 test papers; exit non-zero on regression
uwpr-pubs smoke                       live check that each source still answers in the expected shape
uwpr-pubs explain <W-id|DOI|PMID>     everything known about one work: channels, evidence, status, reason
uwpr-pubs report [RUN_ID]             print a run report
```

`explain` is the tool for "why is (or isn't) this paper listed?"

## 9. Failure handling

| Situation | Behaviour | Run result |
|---|---|---|
| A channel's source fails | That channel's nominations are missing this run. Nothing is removed; `last_seen` isn't advanced for what it would have seen. | Degraded |
| Official-list fetch fails, or the parse check fails (§5 stage 1) | Existing list entries and R1 evidence are kept unchanged; no list entry is treated as removed. | Degraded |
| Text fetch fails for a record that needs evaluation | §6.2 | Degraded |
| OpenAlex budget guard trips | Remaining OpenAlex searches are skipped (§7) | Degraded |
| Citation refresh fails | The previous `latest.jsonl` is kept | Degraded |
| Validation fails, or a positive test paper regresses | Stop before writing; nothing is written or committed | **Failed** |
| A known-miss test paper starts passing (e.g. OpenAlex indexes its text) | Reported as good news | OK |
| An unexpected error | Stop before writing; nothing is written or committed | **Failed** |

- **Degraded** runs still write, commit and push. The report lists every degradation, and the
  next run is expected to make good.
- **Failed** runs change nothing, and the workflow fails, so GitHub emails the maintainer.
- **Three degraded runs in a row for the same source** are treated as failed, so a quietly
  broken source can't go unnoticed.

## 10. Configuration (`config/`)

All config files are validated against `schemas/config/*.schema.json` in stage 0.

### 10.1 `settings.yaml`

```yaml
contact: mriffle@uw.edu              # sent to APIs as mailto/email (public)
window_start: 2006
openalex: {max_run_usd: 0.50, min_remaining_usd: 0.10}
recheck_days: 90
list_drop_tolerance: 0.10            # §5 stage 1
degraded_to_failed_after: 3          # §9
timezone_for_dates: UTC
```

### 10.2 `staff.yaml`

Per person:
- key and display name;
- the full-name forms used by R7 (including the `Hal+er` misspelling);
- verified OpenAlex author IDs and ORCID;
- tenure start and end (end `null` means current).

Contents are from Phase 1 §5.1.

### 10.3 `channels.yaml`

One entry per Phase 1 §5 channel:

```yaml
- id: C1
  source: europepmc
  query: '"UWPR95794" OR "UWPR 95794" OR UWPR*'
  enabled: true
  max_results: 3000        # safety valve: more than this fails the channel loudly
```

### 10.4 `rules.yaml`

- `rule_version` (format `YYYY-MM-DD.N`, Phase 2 §4);
- every pattern and word list from Phase 1 §6: resource-name forms, exclusion terms,
  thanks/work/disqualifier vocabularies, sentence-split exceptions, block elements, the section
  map, record-type filters and DOI-prefix exclusions;
- the plain-language evidence labels (Phase 2 §5.3).

**Rule changes:**
- A change to anything in this file requires a new `rule_version`. A test fails if the file's
  content changes while `rule_version` doesn't, which guards against silent rule changes.
- The first scheduled run after a version bump re-evaluates every work (§6.1).

### 10.5 `fixtures.yaml`

The Phase 1 §12 test papers:
- identifiers and expected outcome (`include` with the expected rules, `exclude`, or
  `known_miss`);
- for offline tests, which recording or synthetic document backs each one (§12.2).

### 10.6 Run report

A markdown file committed as `store/runs/<run-id>.md`, beside the JSON manifest, and also posted
to the workflow's job summary. It contains:
- **Headline:** run status (OK, degraded or failed), duration, and OpenAlex spend.
- **New works:** title, link, and each reason with its excerpt.
- **Works removed:** title and reason (rule change or override).
- **Works merged,** and **official-list entries appeared or disappeared.**
- **Quality checks:**
  - recall on the official list against the 82% baseline (Phase 1 §11), with a warning if it
    falls more than 5 points;
  - per-rule and per-channel counts against the trailing 8-run average, with sharp changes
    flagged;
  - test-paper results.
- **Degradations and their causes.**

## 11. GitHub Actions

### 11.1 Environment setup (both workflows)

A fresh runner has only git and a system Python. Each workflow:

1. `actions/checkout`
2. `astral-sh/setup-uv` with its own dependency cache enabled
3. `uv python install 3.12`
4. `uv sync --locked --all-groups`, which creates `.venv` and fails if `uv.lock` is stale

Locally the commands are identical, so "works on my machine" and "works in CI" mean the same
thing.

### 11.2 `check.yml` — on every push and pull request

```yaml
on: {push: {branches: ["**"]}, pull_request: {}}
permissions: {contents: read}
steps:                       # after §11.1
  - uv run ruff check .
  - uv run ruff format --check .
  - uv run mypy
  - uv run pytest --cov=uwpr_pubs --cov-report=term-missing
  - uv run uwpr-pubs validate store          # the committed store
  - uv run uwpr-pubs validate samples/store  # the Phase 2 sample
```

No secrets and no network access by tests (§12.1), so it runs identically on forks' pull
requests.

### 11.3 `update.yml` — weekly data update

```yaml
on:
  schedule: [{cron: "17 13 * * 1"}]      # Mondays 13:17 UTC (≈ 06:17 Seattle); off the hour to avoid queueing
  workflow_dispatch: {}
permissions: {contents: write}
concurrency: {group: update, cancel-in-progress: false}
timeout-minutes: 60
env: {OPEN_ALEX_API_KEY: "${{ secrets.OPEN_ALEX_API_KEY }}"}
steps:                                   # after §11.1
  - actions/cache/restore  key: dlcache-v1-${{ github.run_id }}  restore-keys: dlcache-v1-
  - uv run uwpr-pubs smoke               # sources still answer as expected
  - uv run uwpr-pubs run --mode live     # stages 0–13; commits locally on success
  - append store/runs/<run-id>.md to $GITHUB_STEP_SUMMARY   (always, even on failure)
  - git pull --rebase && git push        # as github-actions[bot]; only if a commit was made
  - actions/cache/save  key: dlcache-v1-${{ github.run_id }}   (on success)
```

### 11.4 Consequences of the setup

- **Bot commits don't trigger `check.yml`.** GitHub doesn't start workflows from commits made
  with `GITHUB_TOKEN`. So the update run validates and checks the test papers itself (stage 9)
  before committing.
- **Code and data never race.** Runs can't overlap (`concurrency`). The pipeline pulls the latest
  `main` before pushing; if the rebase conflicts, the run fails, and the next run starts clean.
- **The download cache is an accelerator only.**
  - GitHub evicts caches unused for 7 days, so a weekly run may start cold (requirement 2).
  - Size: about 120 MB, against a 10 GB repository limit.
  - A new cache is saved each run, and older ones age out automatically.
- **Public-repository specifics:**
  - The API key is available only to the update workflow on `main`. Forks' pull requests never
    receive secrets.
  - The download cache holds only publicly readable content (PMC, OpenAlex and the other APIs'
    responses) and never the key. Pull-request workflows can read caches created on `main`, and
    that is acceptable for this content.
  - GitHub disables scheduled workflows in public repositories after 60 days without activity.
    The weekly data commit should count as activity; §15 has an item to confirm this after the
    first two months. If it doesn't count, a monthly keep-alive step is added.
- **Branch protection.** If `main` is protected, the bot must be allowed to push: either
  exempt `github-actions[bot]`, or push with a deploy key or GitHub App token. This is decided
  when branch protection is enabled.
- **Later additions (Phases 4, 6 and 7):**
  - deploying the web app, e.g. to GitHub Pages, becomes a final job in `update.yml`;
  - knowledge-base generation may need a further secret, e.g. an LLM API key.

## 12. Testing

### 12.1 Rules for all tests

- **No network.** A pytest fixture blocks sockets; any real request fails the test.
- **No secrets.** Tests never read `OPEN_ALEX_API_KEY`.
- **Deterministic.** Fixed dates (the run date is injected, never read from the clock); no
  randomness.

### 12.2 What is tested

| Level | Tests |
|---|---|
| **Unit** (the bulk) | `text.py`: blocks, sentence splitting (initials, "et al."), sections, labels. Each rule: positive and negative sentences from Phase 1 §6 and 01a, including every exclusion and disqualifier. `match.py`: every matching path and title normalisation. `evidence.py`: identity and all merge cases in §6.3. `status.py`: every row of Phase 2 §13, R1 always wins, overrides, rule-change removal. `versions.py`: links, merges (lower ID survives), splits. `http.py`: retries, `Retry-After`, secret stripping, budget guard. `validate.py`: the mutation cases from Phase 2 (11 broken stores). Config loading and the `rule_version` guard (§10.4). |
| **Test papers** | Every Phase 1 §12 fixture, through the real code: A, C, D, E, F, G, H, I, J pass; B and B2 are `known_miss`; the negative fixtures are excluded. Each is backed by a recording or a synthetic document (§12.3). |
| **Replay** | The whole pipeline, stages 0–13, in `replay` mode over a small recorded corpus, compared with an expected store (built from the Phase 2 sample). |
| **Determinism** | The replay run twice gives a byte-identical store. |
| **Degradation** | The replay with one source's recordings removed: the run is degraded, and nothing is removed from the store. |
| **Live smoke** (`uwpr-pubs smoke`, update workflow only) | Each source returns the expected response shape for one known query. |

### 12.3 Recordings and licensing

- **Location:** `tests/recordings/`, in the same content-addressed format as the cache.
- **Licensing (the repository is public):**
  - Recordings of **full text** are committed only for openly licensed papers (CC BY or CC0,
    as stated in the PMC record).
  - Cases that need a paywalled or non-open paper use a **synthetic** JATS document that
    reproduces just the relevant sentence and structure. These live in `tests/fixtures/`,
    labelled as synthetic.
  - API metadata responses (OpenAlex, Crossref, Europe PMC search results) are fine to commit.
- **Refreshing:** `uwpr-pubs run --mode record` rebuilds the recordings. Updates are reviewed in
  the pull request diff.

### 12.4 Code quality settings (`pyproject.toml`)

- **ruff:** line length 110; rule sets `E, F, W, I, B, UP, SIM, RUF, PL, N, S` (with `S` relaxed
  in tests); `ruff format` for formatting.
- **mypy:** `strict = true`; no untyped definitions; `warn_unused_ignores`.
- **pytest:** `--strict-markers`. Coverage is reported every run; a threshold is enforced once
  the code settles.

## 13. Run time and cost

| Run | Time (estimate) | OpenAlex | Other APIs |
|---|---|---|---|
| Normal weekly | 5–15 min | ≈ $0.05 | Free |
| After a rule change | + ~6 min (re-fetching ~1,100 texts from NCBI) | ≈ $0.05 | Free |
| Check workflow | 2–4 min | none | none |

Well within GitHub's free minutes for public repositories, and the OpenAlex free tier.

## 14. Migration from the spec-phase tools

- `requirements.txt` is replaced by `pyproject.toml` + `uv.lock`.
- `tools/validate_store.py` moves into the package as `uwpr_pubs.validate` and the
  `uwpr-pubs validate` command, with the same checks.
- `samples/build_sample_store.py` stays as the spec-phase record of how the sample was made. The
  replay test (§12.2) becomes the maintained way to produce the expected store.

## 15. Open items

1. **Knowledge-base generation (Phase 4):** its inputs, cost, and whether it needs an LLM API
   secret.
2. **App export (Phase 5) and deployment (Phases 6/7):** GitHub Pages from `update.yml`.
3. **Confirm the scheduled workflow stays enabled** after 60 days on bot commits alone
   (§11.4). If it doesn't, add a keep-alive.
4. **Branch protection** on `main`, and how the bot is allowed to push (§11.4).

## 16. Exit criteria

- [ ] Reviewed and agreed.
- [ ] Config schemas (`schemas/config/`) drafted.
- [ ] `pyproject.toml` with ruff/mypy/pytest settings and an empty package that passes all three
      checks, and `check.yml` running green on GitHub, so the quality gate exists before any
      pipeline code.
