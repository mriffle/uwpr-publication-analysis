# Phase 3 — Retrieval Pipeline Specification

**Status:** Draft 3 · 2026-09-19. Draft 2 was reviewed against the frozen Phase 1 and 2 specs on
2026-09-19. The review's decisions are P10–P15 (§2); the matching Phase 2 changes are dated in
that spec's header.
**Purpose:** specify the code that finds publications, decides inclusion, and keeps the store and
the app's data current, running unattended on GitHub Actions every week.
**Depends on:**
- [01-discovery-strategy.md](01-discovery-strategy.md) (frozen): channels, rules, text
  sources, matching;
- [02-data-model.md](02-data-model.md) (frozen): every file the pipeline writes, with schemas
  and a validator.

**Hands off to:** Phase 4 (knowledge-base pages) and Phase 5 (app JSON), each as a pipeline
stage (§5, stages 10–11).

**What the review changed (Draft 2 → 3):**
- Metadata for every record is refreshed each run, before the rules (stage 3). Draft 2 took it
  from stage 8, which runs after the rules and never touched works that weren't included.
- Preprint-only works are checked each run for a published version (stage 6).
- A fourth run outcome, **alert** (§9).
- `last_seen` is advanced at most every 28 days in work files (P11).
- Test recordings never contain full text or abstracts (P10, §12.3).
- Staff config is part of the rules fingerprint (P15, §10.4).
- Secret handling covers the NCBI key; secrets are scoped to single workflow steps; actions are
  pinned (§7, §11).
- `defusedxml` added (P14).
- The staged write and a clean-tree check (§5).
- Phase 1 items that had no home: the ORCID check and the misspelling searches (§10.2, §10.3).

---

## 1. Requirements

1. **Unattended and correct.** No human review (Phase 1 §2). A run either finishes with a
   validated store, or changes nothing.
2. **Starts cold.** A GitHub Actions runner has no dependencies installed and no download cache.
   The pipeline must be correct with an empty cache; a warm cache only makes it faster.
3. **Idempotent and deterministic.** Two runs on the same day on unchanged sources produce no
   data diff (Phase 2 §15). Weekly runs on unchanged sources change only the files listed in
   Phase 2 §15.
4. **Never loses a work by accident.**
   - A source outage or empty response never removes anything.
   - Works leave only through a rule-version change or an exclude override (Phase 2 §13).
5. **Polite and cheap.** Rate limits, retries and a contact address. OpenAlex spend stays well
   under the free $1/day.
6. **Everything tested, type-checked and linted.** pytest, mypy (strict) and ruff. Tests run
   offline with no secrets.
7. **Auditable.** Every run writes a readable report. With no human review, the report is the
   audit trail, and anything that needs a person raises an alert (§9).

## 2. Decisions

Agreed 2026-09-19 (Draft 2):

| # | Decision |
|---|---|
| P1 | **Search everything on every run.** No date watermarks. Text is downloaded only when a record needs evaluating (§6). |
| P2 | **Fixed stage order with a validation gate** (§5). Nothing after validation runs if validation fails. |
| P3 | **The pipeline commits each successful run.** The update workflow pushes it. |
| P4 | **A failing source degrades the run, never shrinks the data** (§9). |
| P5 | **Python 3.12 package** with a command-line interface. Few dependencies. |
| P6 | **Everything tunable in `config/*.yaml`.** Changing the rules means bumping `rule_version`, which re-evaluates every work. |
| P7 | **A readable report every run,** shown on the Actions page and committed with the data. |
| P8 | **Tests:** the Phase 1 test papers become automated tests; the sample store is the expected output; tests replay recorded responses; live checks run only in the update workflow. |
| P9 | **Weekly schedule, plus a manual trigger.** Papers with unreadable text are re-checked every 90 days. |
| C1 | **`pyproject.toml` + `uv.lock`**, replacing `requirements.txt`. Development tools go in a dev group. The same `uv` commands work locally and in CI. |
| C2 | **ruff** (lint and format), **mypy --strict**, **pytest** with coverage reported. A coverage threshold is set once the code settles. |
| C3 | **Data commits go directly to `main`,** one bot commit per run, after validation. |
| C4 | **Weekly** (Mondays), plus manual `workflow_dispatch`. |
| C5 | **The OpenAlex key is a GitHub Actions secret.** The contact address lives in `config/settings.yaml`. An NCBI key is an optional secret. |
| C6 | **Run report** in the workflow's job summary and in `store/runs/`. A failed or alerting run triggers GitHub's standard failure email. |
| R1 | **The repository is public.** This affects secrets, the cache, test recordings and inactivity handling (§11.4, §12.3). |

From the review (2026-09-19):

| # | Decision |
|---|---|
| P10 | **No full text and no abstracts in the repository, including test recordings.** Text tests use synthetic JATS documents; recordings are scrubbed of abstract fields when made (§12.3). |
| P11 | **`last_seen` in work files and `candidates.jsonl` advances at most every 28 days.** Weekly advancing would rewrite every work file every week. `official_list/entries.jsonl` keeps exact dates (Phase 2 §5.3, §7). |
| P12 | **A fourth run outcome, `alert`:** data written and committed as usual, but the workflow fails so GitHub emails the maintainer (§9). |
| P13 | **R6 evidence is kept when our own text later becomes readable** and shows no mention, and the report flags it. It follows the ordinary rules afterwards: at the next rule-version change it is re-derived, and superseded if not reproduced (§6.3). |
| P14 | **XML is parsed with `defusedxml`,** not bare `xml.etree`. The text comes from outside, and ruff's `S` rules (S314) flag the standard-library parser. |
| P15 | **The rules fingerprint covers `rules.yaml` and `staff.yaml`.** R7 depends on staff name forms and tenure, so a staff change is a rule change (§10.4). |

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
.github/dependabot.yml           keeps pinned actions current (§11.1)
```

**Dependencies:**
- runtime: `httpx`, `pyyaml`, `jsonschema`, `defusedxml` (P14);
- dev group: `pytest`, `pytest-cov`, `mypy`, `ruff`, and type stubs for the runtime libraries
  that lack their own (`types-PyYAML`, `types-defusedxml`, `types-jsonschema`).

Nothing else without a reason recorded here. The official-list pages are parsed with the
standard library's `html.parser`.

## 4. Run modes

| Mode | Network | Used by |
|---|---|---|
| `live` | Yes; responses are written to the cache | Update workflow, local runs |
| `replay` | None. Every request is answered from recordings; a missing recording is an error. | Tests, offline debugging |
| `record` | Yes; responses are also saved as test recordings, scrubbed (§12.3) | Creating or refreshing test recordings |

One more switch: `--dry-run` runs every stage but writes nothing and doesn't commit. The mode is
part of the run ID (Phase 2 §11).

## 5. Stages

`uwpr-pubs run` executes these in order. Stages 0–8 work on the in-memory store. Stage 9
serialises the new store to a staging directory and validates the files there. Stages 10–12 add
their outputs to the staging directory. Only stage 13 touches the real `store/`, `kb/` and
`export/`.

| # | Stage | What it does | Spec |
|---|---|---|---|
| 0 | **Pre-check** | Load config (schema-checked) and the committed store. Refuse to run if `store/`, `kb/` or `export/` has uncommitted changes (except with `--dry-run`); a half-finished earlier run is reset with `git checkout`. Run the validator; if the committed store is invalid, stop. Rules-fingerprint guard (§10.4). | Phase 2 §14 |
| 1 | **Official list** | Fetch the index page and the year pages it links to (`settings.official_list`); parse the entries. The "year page" in an entry's key (Phase 2 §7) is the page's year heading ("2026"), or `older` for the page headed "2021 and Previous Years", not its URL. That keeps keys stable when the current year moves from `/publications/` to its own page. Save raw pages only when their hash changes. Update `entries.jsonl` first/last seen (exact dates). Parse check: every page must yield entries, and the total must not fall more than 10% from the last run; otherwise treat the list as a failed source (§9). | Phase 1 §5 A; Phase 2 §7 |
| 2 | **Discover** | Run every enabled channel (Phase 1 §5). Output: nominations (external IDs + channel). Kept for later stages: the B1 and B2 result records (R2 metadata), and the DOI sets of the three R6 phrase queries. Check the staff OpenAlex IDs against ORCID (§10.2). | Phase 1 §5, §5.1, §6.5 |
| 3 | **Resolve and refresh** | Match each nomination to an existing record or work (Phase 2 §4), else create a record and work. Apply the record-type filter and the 2006 window. Update discovery first/last seen. Then **refresh OpenAlex metadata for every record** in the store, included or not, by batched ID filter (50 per request; about 22 requests, ≈ $0.002). This single fetch supplies R2 and R5 metadata and the citations for stage 8. | Phase 1 §8; Phase 2 §4, §6 |
| 4 | **Fetch text** | For each record that needs evaluation (§6.1), get readable text in source order (Phase 1 §7). | Phase 1 §7 |
| 5 | **Apply rules** | Run R1–R7 and R3d; produce evidence under the current `rule_version`. Merge with stored evidence (§6.3). Record signals (§6.4). | Phase 1 §6 |
| 6 | **Versions** | Link preprints and articles; merge works (lower ID survives); apply merge and split overrides. **Check every preprint-only work for a published version** (bioRxiv `published`, Crossref relation, OpenAlex locations). Create the article's record even if no channel nominated it. The article needs no text of its own, because evidence applies to the whole work. | Phase 1 §8; Phase 2 §4, §9 |
| 7 | **Status** | Compute inclusion (Phase 2 §13). Move works between `works/` and `candidates.jsonl`. Record reasons and signals. | Phase 2 §6, §13 |
| 8 | **Citations** | Build the metrics for every record of every included work from the stage 3 refresh. Write `latest.jsonl`; copy it to `<YYYY-MM>.jsonl` on the month's first run. | Phase 2 §10 |
| 9 | **Validate (gate)** | Write the new store to a staging directory and run the same validator as stage 0 on it (schemas and invariants). The positive test papers present in the store must still be included (§12.2). **Failure ⇒ stop; nothing is written.** | Phase 2 §14 |
| 10 | Knowledge base | Generate or refresh content and pages (Phase 4). No-op until Phase 4 is specified. | Phase 4 |
| 11 | App export | Write `export/` (Phase 5). No-op until Phase 5 is specified. | Phase 5 |
| 12 | Report | Build the run report and manifest (§10.6, Phase 2 §11), including the run status (§9). | |
| 13 | Write and commit | Move the staged files into place, one atomic rename per file. Remove files the new store no longer has. `git commit` with a summary message (skipped with `--dry-run` or `--no-commit`). | Phase 2 §15 |

**`last_seen` (P11).** Wherever a stage "updates `last_seen`" in a work file or
`candidates.jsonl`, it advances the date only when the stored value is at least
`settings.last_seen_refresh_days` (28) old. When an official-list entry disappears, its R1
evidence takes the entry's exact dates from `entries.jsonl`.

## 6. Evaluation details

### 6.1 Which records need text

A record is (re)evaluated in stages 4–5 when any of the following holds:
1. it is new;
2. its `fulltext.recheck_after` date has passed (90 days after an unreadable result);
3. its evidence has a `rule_version` older than the current one. For a work that is not
   included, the `rule_version` on its `candidates.jsonl` line plays this role.

**Evidence that needs no text is refreshed every run for every record:**
- R1, from the official list (stage 1);
- R2 metadata:
  - OpenAlex `awards`, from the stage 3 refresh;
  - Crossref `funder[].award[]`, from the B2 channel's result records;
- R5 from OpenAlex raw affiliation strings (stage 3 refresh). R5 from JATS `<aff>` needs text;
- R6, from the phrase queries in stage 2. As Phase 1 §6.5 says, it fires only on records with
  no readable text of our own;
- R3d, from PRIDE in stage 2.

**Load on a normal week:** text for a handful of new papers. **After a rule change:** text for
every record, about 1,100 NCBI requests, roughly 6 minutes at 3 requests a second on a cold
cache.

### 6.2 Text for evaluation

- **Cold cache:** fetch the text again. **Warm cache:** use the cached copy (full text is
  immutable once fetched; Phase 2 §12).
- **If text is needed but can't be fetched** (source down):
  - the record's existing evidence is kept unchanged, not superseded;
  - it stays active (Phase 2 §13, as changed 2026-09-19), so the work stays included;
  - the work is flagged "re-evaluation pending" in the report, and the run is degraded.

### 6.3 Evidence identity and merging

Each evidence entry has an identity key, so repeated runs update it rather than duplicating it:

| Rule | Identity key |
|---|---|
| R1 | rule + list entry key |
| R2 (metadata) | rule + record + source + metadata field |
| R2 (text), R3, R4, R5, R7 | rule + record + section + hash of the normalised excerpt |
| R5 (OpenAlex) | rule + record + hash of the normalised affiliation string |
| R3d | rule + record + dataset accession |
| R6 | rule + record + phrase |
| override | rule + hash of the override's target, action and reason |

**Merging:**
- **Same rule version:**
  - a reproduced entry has its `last_seen` updated (subject to P11);
  - a new entry is added;
  - an entry not reproduced keeps its `last_seen` (the source stopped showing it); it is not
    superseded.
- **New rule version:** every entry is re-derived.
  - A reproduced entry takes the new `rule_version` and keeps its `first_seen`.
  - An entry that is not reproduced is marked `superseded`.
  - Exception: when the record's text couldn't be fetched (§6.2), its entries are left as
    they were.

**R6 after text becomes readable (P13).** A 90-day recheck may find readable text for a record
that has R6 evidence. R6 then no longer applies to that record, so it is not reproduced, and
under the same rule version it is kept like any other entry. The report lists such records
("R6 not confirmed by our own text") when this happens. At the next rule-version change the
entry is re-derived and superseded, and the report shows any work that leaves as a result.

### 6.4 Signals for works not included

Stage 5 computes the `signals` of Phase 2 §6 in the same pass that applies the rules; stage 7
records them. Works not re-evaluated this run keep their stored signals. Each signal is a near-miss
that the rules deliberately don't count:
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
  - the OpenAlex key comes from `OPEN_ALEX_API_KEY`, and the optional NCBI key from
    `NCBI_API_KEY`;
  - every secret query parameter (`api_key`) is stripped from a URL before the URL is logged,
    cached, recorded or reported. Stripping is one function used by all of these paths;
  - an offline test sets fake keys and asserts that neither value reaches a log line, cache
    index, recording or report;
  - the update workflow checks its own commit for the real key before pushing (§11.3).
- **Budget guard:**
  - read `x-ratelimit-remaining-usd` on each OpenAlex response;
  - stop OpenAlex search requests if the run's spend exceeds `settings.openalex.max_run_usd`
    (default $0.50) or the remaining daily budget falls below $0.10;
  - either way the run raises an alert (§9); ID lookups and filters continue.
- **Expected spend:** about $0.05 per run, mostly full-text searches ($0.001 per page). This is
  an estimate. The first live runs measure it, and every manifest records it (`api.cost_usd`).

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

`run` exits 0 when it wrote a store (status `ok`, `degraded` or `alert`), and non-zero when it
failed. It writes its status to `$GITHUB_OUTPUT` when that variable is set (§11.3).

## 9. Failure handling

Four outcomes:

| Outcome | Data | Workflow |
|---|---|---|
| **OK** | Written and committed | Passes |
| **Degraded:** some source failed; the next run is expected to make good | Written and committed; nothing is removed because of the failure | Passes; the report lists each degradation |
| **Alert:** something needs a person | Written and committed | **Fails** after pushing, so GitHub emails the maintainer |
| **Failed** | Nothing written or committed | **Fails** |

| Situation | Behaviour | Outcome |
|---|---|---|
| A channel's source fails | That channel's nominations are missing this run. Nothing is removed; `last_seen` isn't advanced for what it would have seen. | Degraded |
| Official-list fetch fails, or the parse check fails (§5 stage 1) | Existing list entries and R1 evidence are kept unchanged; no list entry is treated as removed. | Degraded |
| Text fetch fails for a record that needs evaluation | §6.2 | Degraded |
| Metadata refresh or citations fail | Stored metadata is kept; the previous `latest.jsonl` is kept | Degraded |
| The same source degraded in 3 consecutive runs | As degraded | **Alert** |
| OpenAlex budget guard trips | Remaining OpenAlex searches are skipped (§7) | **Alert** |
| Recall on the official list falls more than 5 points below the 82% baseline (Phase 1 §11) | Reported with the per-rule counts | **Alert** |
| A staff ORCID carries an OpenAlex ID missing from `staff.yaml` (§10.2) | Reported; channel G may be missing papers until the config is updated | **Alert** |
| Validation fails, or a positive test paper regresses | Stop before writing | **Failed** |
| Rules fingerprint changed without a new `rule_version` (§10.4) | Stop in stage 0 | **Failed** |
| A known-miss test paper starts passing (e.g. OpenAlex indexes its text) | Reported as good news | OK |
| An unexpected error | Stop before writing | **Failed** |

- Consecutive degradations are counted from the `degradations` recorded in earlier run
  manifests (Phase 2 §11).
- Sharp changes in per-rule and per-channel counts (§10.6) are warnings in the report only. They
  are too noisy to email about.

## 10. Configuration (`config/`)

All config files are validated against `schemas/config/*.schema.json` in stage 0. Every file
carries `schema: 1` (Phase 2 §15).

**Drafted 2026-09-19:** the five schemas and the real `config/*.yaml`, transcribed from Phase 1.
`tests/test_config.py` checks the following on every push:
- each file against its schema;
- every regex compiles;
- each Phase 1 §6.6 name form matches exactly its own staff member, and bare surnames match
  no one;
- every Phase 1 channel is configured;
- the R6 phrases are among the OpenAlex queries;
- the evidence labels equal those in the sample store.

It stands in for `uwpr_pubs.config` until that module exists.

### 10.1 `settings.yaml`

```yaml
contact: mriffle@uw.edu              # sent to APIs as mailto/email (public)
window_start: 2006
openalex: {max_run_usd: 0.50, min_remaining_usd: 0.10}
recheck_days: 90
last_seen_refresh_days: 28           # P11
list_drop_tolerance: 0.10            # §5 stage 1
recall_alert_points: 5               # §9
degraded_to_alert_after: 3           # §9
timezone_for_dates: UTC
```

### 10.2 `staff.yaml`

Per person:
- key and display name;
- the full-name forms used by R7 (including the `Hal+er` misspelling);
- verified OpenAlex author IDs and ORCID;
- tenure start and end (end `null` means current).

Contents are from Phase 1 §5.1. The file is part of the rules fingerprint (P15).

**ORCID check (Phase 1 §5.1).** Stage 2 asks OpenAlex for all author IDs that carry each staff
ORCID (a filter, about $0.0005 a run). An ID not in the file raises an alert (§9). The pipeline
never adds IDs itself: same-name authors exist, so a person confirms each ID.

### 10.3 `channels.yaml`

One entry per Phase 1 §5 channel and source. D3 and F each run on Europe PMC and OpenAlex, so
each has two entries.

```yaml
- id: C1
  source: europepmc
  description: UWPR award code or acronym in Europe PMC full text
  enabled: true
  queries:
    - '"UWPR95794" OR "UWPR 95794" OR UWPR*'
  max_results: 3000        # safety valve: more than this fails the channel loudly
```

A channel may have several queries. Channel G has none. It sets `queries_from_staff: true`, and
its queries are built from the staff OpenAlex IDs, each limited to that person's tenure. The early-era misspelling searches of Phase 1 §9
(`"Van Haller"`, `"vonHaller"`) are extra queries in channels E and D3, so the channel IDs in
the schemas are unchanged.

### 10.4 `rules.yaml`

- `rule_version` (format `YYYY-MM-DD.N`, Phase 2 §4);
- every pattern and word list from Phase 1 §6: resource-name forms, exclusion terms,
  thanks/work/disqualifier vocabularies, sentence-split exceptions, block elements, the section
  map, record-type filters and DOI-prefix exclusions;
- the plain-language evidence labels (Phase 2 §5.3).

**Rule changes (P15):**
- The **rules fingerprint** is the SHA-256 of the canonical JSON of the parsed `rules.yaml`
  (without `rule_version`) and `staff.yaml`. Comments and formatting don't count.
- Each run manifest records it (`rules_fingerprint`). Stage 0 compares it with the latest
  manifest: a changed fingerprint with an unchanged `rule_version` fails the run. An offline
  test runs the same check against the committed store, so the mistake is caught on push.
- The first run after a version bump re-evaluates every work (§6.1).

### 10.5 `fixtures.yaml`

The Phase 1 §12 test papers:
- real identifiers (DOI, PMID or PMCID) and the expected outcome: `include` with the expected
  rules, `exclude`, or `known_miss`;
- for offline tests, which recording or synthetic document backs each one (§12.3).

Several negative fixtures are described in Phase 1 §12 without an identifier. Each gets a real
paper where one is known from calibration, for example SAWN (10.1021/ac100372c) and the Hunt
Lab guide (10.1016/j.mcpro.2024.100875). Otherwise the fixture is synthetic, offline only.

### 10.6 Run report

A markdown file committed as `store/runs/<run-id>.md`, beside the JSON manifest, and also posted
to the workflow's job summary. It contains:
- **Headline:** run status (OK, degraded or alert), duration, and OpenAlex spend. Failed runs
  post their report to the job summary only.
- **Alerts first,** each with what to do about it.
- **New works:** title, link, and each reason with its excerpt.
- **Works removed:** title and reason (rule change or override).
- **Works merged,** and **official-list entries appeared or disappeared.**
- **Quality checks:**
  - recall on the official list against the 82% baseline (Phase 1 §11);
  - per-rule and per-channel counts against the trailing 8-run average, with sharp changes
    flagged;
  - test-paper results;
  - R6 entries not confirmed by our own text (§6.3).
- **Degradations and their causes,** and works with re-evaluation pending (§6.2).

## 11. GitHub Actions

### 11.1 Environment setup (both workflows)

A fresh runner has only git and a system Python. Each workflow:

1. `actions/checkout`
2. `astral-sh/setup-uv` with its own dependency cache enabled
3. `uv python install 3.12`
4. `uv sync --locked --all-groups`, which creates `.venv` and fails if `uv.lock` is stale

Locally the commands are identical, so "works on my machine" and "works in CI" mean the same
thing.

Every action is pinned to a full commit SHA, with the version in a comment. The update job can
push to `main`, so a moved tag must not be able to change what runs. Dependabot proposes updates
to the pins.

### 11.2 `check.yml` — on every push and pull request

```yaml
on: {push: {branches: ["**"]}, pull_request: {}}
permissions: {contents: read}
steps:                       # after §11.1
  - uv run ruff check .
  - uv run ruff format --check .
  - uv run mypy
  - uv run pytest --cov=uwpr_pubs --cov-report=term-missing
  - uv run uwpr-pubs validate store          # the committed store, once it exists
  - uv run uwpr-pubs validate samples/store  # the Phase 2 sample
```

No secrets and no network access by tests (§12.1), so it runs identically on forks' pull
requests. Until `uwpr-pubs validate` exists, the sample is validated with
`tools/validate_store.py`.

### 11.3 `update.yml` — weekly data update

```yaml
on:
  schedule: [{cron: "17 13 * * 1"}]      # Mondays 13:17 UTC (≈ 06:17 Seattle); off the hour to avoid queueing
  workflow_dispatch: {}
permissions: {contents: write}
concurrency: {group: update, cancel-in-progress: false}
timeout-minutes: 60
steps:                                   # after §11.1; no job-level secrets
  - actions/cache/restore  key: dlcache-v1-${{ github.run_id }}  restore-keys: dlcache-v1-
  - uv run uwpr-pubs smoke                                 # env: OPEN_ALEX_API_KEY, NCBI_API_KEY
  - id: run
    uv run uwpr-pubs run --mode live     # stages 0–13; commits locally; env: the same two secrets
  - append store/runs/<run-id>.md to $GITHUB_STEP_SUMMARY   (always, even on failure)
  - secret check: fail if the new commit contains either key's value   # env: the same two secrets
  - git pull --rebase && git push        # as github-actions[bot]; only if a commit was made
  - actions/cache/save  key: dlcache-v1-${{ github.run_id }}   (if the run wrote a store)
  - fail the job if steps.run.outputs.status == 'alert'   # GitHub emails the maintainer
```

Secrets are passed only to the steps that need them. Dependency installation (`uv sync`) and
the push never see them.

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
  - The API keys are available only to the update workflow on `main`. Forks' pull requests
    never receive secrets.
  - The download cache holds only publicly readable content (PMC, OpenAlex and the other APIs'
    responses) and never a key. Pull-request workflows can read caches created on `main`, and
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
- **No real secrets.** Tests never read `OPEN_ALEX_API_KEY` or `NCBI_API_KEY`; the secret tests
  use fake values (§7).
- **Deterministic.** Fixed dates (the run date is injected, never read from the clock); no
  randomness.

### 12.2 What is tested

| Level | Tests |
|---|---|
| **Unit** (the bulk) | `text.py`: blocks, sentence splitting (initials, "et al."), sections, labels. Each rule: positive and negative sentences from Phase 1 §6 and 01a, including every exclusion and disqualifier. `match.py`: every matching path and title normalisation. `evidence.py`: identity and all merge cases in §6.3, including P11 and P13. `status.py`: every row of Phase 2 §13, R1 always wins, overrides, rule-change removal. `versions.py`: links, merges (lower ID survives), splits, a preprint gaining its article. `http.py`: retries, `Retry-After`, secret stripping, budget guard. `validate.py`: broken-store cases, one per invariant and schema (the 11 mutation cases from Phase 2 were scratch work and must be recreated). Config loading and the rules-fingerprint guard (§10.4). |
| **Test papers** | Every Phase 1 §12 fixture, through the real code: A, C, D, E, F, G, H, I, J pass; B and B2 are `known_miss`; the negative fixtures are excluded. Each is backed by scrubbed recordings and, where text matters, a synthetic document (§12.3). |
| **Replay** | The whole pipeline, stages 0–13, in `replay` mode over a small recorded corpus. It runs as a scripted two-run scenario: run 1 at one rule version, then run 2 at a new version with an overrides file. That reproduces the sample store's merge, override and rule-change removal, which one run cannot. The result is compared with an expected store built from the Phase 2 sample. |
| **Determinism** | The replay run twice on the same date gives a byte-identical store. |
| **Degradation** | The replay with one source's recordings removed: the run is degraded, and nothing is removed from the store. Three such runs in a row raise an alert. |
| **Live smoke** (`uwpr-pubs smoke`, update workflow only) | Each source returns the expected response shape for one known query. |

### 12.3 Recordings and synthetic documents (P10)

- **Location:** `tests/recordings/`, in the same content-addressed format as the cache.
- **Never committed:** full text or abstracts, whatever the paper's licence (CLAUDE.md,
  repository rules).
- **Text:** every case that needs a paper's text uses a **synthetic** JATS document in
  `tests/fixtures/`, labelled as synthetic. It reproduces the structure and only the relevant
  sentences, each within the excerpt limit (about 300 characters) and attributed to its paper.
  These are the same quotations the store already holds as evidence.
- **Metadata responses** (OpenAlex, Crossref, Europe PMC, PRIDE, bioRxiv) are recorded, but
  scrubbed when recorded:
  - OpenAlex `abstract_inverted_index`, Europe PMC `abstractText` and Crossref `abstract` are
    removed;
  - full-text responses (`efetch`, `fullTextXML`) are never recorded; a test that needs one is
    pointed at a synthetic document instead;
  - a test fails if any recording contains one of those fields or a JATS `<body>`.
- **Refreshing:** `uwpr-pubs run --mode record` rebuilds the recordings. Updates are reviewed in
  the pull request diff.

### 12.4 Code quality settings (`pyproject.toml`)

- **ruff:** line length 110; rule sets `E, F, W, I, B, UP, SIM, RUF, PL, N, S`. In tests,
  `S101` (assert) and `PLR2004` (literal values) are off. `ruff format` for formatting, not
  applied to Markdown: the code blocks in the specs are illustrations.
- **mypy:** `strict = true`; no untyped definitions; `warn_unused_ignores`; checks `src` and
  `tests`.
- **pytest:** `--strict-markers`, `--strict-config`, strict xfail. Coverage (with branches) is
  reported every run; a threshold is enforced once the code settles.
- **Not checked:** the spec-phase scripts `tools/validate_store.py` and
  `samples/build_sample_store.py` (§14). They are records, and the validator is replaced by
  `uwpr_pubs.validate`.

## 13. Run time and cost

| Run | Time (estimate) | OpenAlex | Other APIs |
|---|---|---|---|
| Normal weekly | 5–15 min | ≈ $0.05 (to be measured) | Free |
| After a rule change | + ~6 min (re-fetching ~1,100 texts from NCBI on a cold cache) | ≈ $0.05 | Free |
| Check workflow | 2–4 min | none | none |

Well within GitHub's free minutes for public repositories, and the OpenAlex free tier. The
metadata refresh of stage 3 adds about 22 filter requests (≈ $0.002).

## 14. Migration from the spec-phase tools

- `requirements.txt` is replaced by `pyproject.toml` + `uv.lock` (done 2026-09-19).
- `tools/validate_store.py` moves into the package as `uwpr_pubs.validate` and the
  `uwpr-pubs validate` command, with the same checks.
- `samples/build_sample_store.py` stays as the spec-phase record of how the sample was made. The
  replay test (§12.2) becomes the maintained way to produce the expected store.
- Done 2026-09-19: the run manifest schema has the Phase 3 modes, `status`, `degradations` and
  `rules_fingerprint` (Phase 2 header). The sample was rebuilt to match; only its manifest
  changed.

## 15. Open items

1. **Knowledge-base generation (Phase 4):** its inputs, cost, and whether it needs an LLM API
   secret.
2. **App export (Phase 5) and deployment (Phases 6/7):** GitHub Pages from `update.yml`.
3. **Confirm the scheduled workflow stays enabled** after 60 days on bot commits alone
   (§11.4). If it doesn't, add a keep-alive.
4. **Branch protection** on `main`, and how the bot is allowed to push (§11.4).
5. **Measure OpenAlex spend** in the first live runs and replace the §7/§13 estimates.

## 16. Exit criteria

- [ ] Reviewed and agreed.
- [x] Draft 2 reviewed against Phases 1–2; gaps resolved (P10–P15, Phase 2 changes dated
      2026-09-19).
- [x] Config schemas (`schemas/config/`) drafted, with the real `config/*.yaml` validated
      against them (2026-09-19, §10).
- [x] `pyproject.toml` with ruff/mypy/pytest settings and an empty package that passes all three
      checks (2026-09-19; also rehearsed on a clean copy of the repository).
- [ ] `check.yml` running green on GitHub, so the quality gate exists before any pipeline code.
