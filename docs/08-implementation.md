# Phase 8 — Implementation: status and handoff

**Status:** in progress · last updated 2026-09-19
**Purpose:** everything needed to pick this work up: where the build has got to, what was decided
along the way, and the approved plan in full (§6).
**Depends on:** the frozen specs [01](01-discovery-strategy.md), [01a](01a-discovery-calibration.md),
[02](02-data-model.md) and [03](03-retrieval-pipeline.md). They are the authority; this document
records how they are being built and what implementing them taught us.

---

## 1. Where the build has got to

| Milestone | State |
|---|---|
| M0 Foundations (store models, IO, IDs, config, validator) | **Done** |
| M1 Shell (HTTP, cache, source adapters, live smoke) | **Done** |
| M1.5 Evidence and status core (pure) | **Done** |
| M2 Vertical slice (channels A/B1/B2/C1/C2, R1 + R2 metadata, gate, report) | **Done** |
| M3 Text and rules core (R3–R7) | **Next** |
| M4 Completeness and determinism | Not started |
| M4.5 Seed rehearsal | Not started |
| M5 Live automation (`update.yml`) | Not started |

202 tests, all offline; ruff, `ruff format`, mypy `--strict` and the store validator all clean, and
`check.yml` green on every push. **Nothing is committed to `store/` yet** — the pipeline has only
ever written to scratch stores, by design, until M4.5.

## 2. What exists

```
src/uwpr_pubs/
  config.py      schema-checked config/*.yaml; the two fingerprints (§10.4)
  context.py     RunContext: the only reader of the clock
  schemas.py     schema registry and project-root discovery
  secrets.py     the one place secrets are stripped from URLs, params and text
  cache.py       content-addressed cache; the same format as tests/recordings/
  http.py        rate limits, retries, budget guard, live/replay/record, cost classification
  recording.py   record-mode scrubbing (P10) and the guard the §12.3 test uses
  records.py     source metadata → store records; kind mapping; staff tenure
  match.py       DOI→PMID→PMCID→OpenAlex, then title similarity ≥ 0.85 with year ±1
  evidence.py    identity keys, the merge matrix, the criterion mapping, excerpt limit
  status.py      every row of Phase 2 §13, in precedence order
  channels.py    channel definitions → nominations
  metrics.py     citation lines from the same OpenAlex refresh
  report.py      RunRecorder: the report is accumulated as stages run
  pipeline.py    the stage machine, the staging write and the gate
  validate.py    the store validator (was tools/validate_store.py)
  git.py         clean-tree and reset; the commit half is M4
  runtime.py     builds the client from config; reads .env for local runs
  smoke.py       `uwpr-pubs smoke`, the only live test
  sources/       uwpr_site, openalex, ncbi, crossref, europepmc
  rules/         r1 (official list), r2 (award code, metadata arm)
  stages/        kb.py and export.py: no-ops until Phases 4 and 5
  store/         models (TypedDicts), io, ids, paths, read
```

Commands: `uwpr-pubs validate`, `config`, `smoke`, `run`. `run` takes `--mode`, `--store`,
`--cache`, `--dry-run`, `--channels` and `--summary-out`.

## 3. Measurements so far

**Live smoke, 2026-09-19** (all passing, $0.0011):

| Check | Found | Phase 1 |
|---|---|---|
| Official list | 306 entries (2022:18, 2023:9, 2024:16, 2025:22, 2026:8, older:233) | 306 (§4.1) |
| OpenAlex award filter | 140 | 135 (§4.4) |
| Crossref award filter | 63 | 63 |
| Europe PMC identifier | 185 | 185 |

**M2 live run, 2026-09-19** ($0.006 first run including four title searches; $0.002 steady state,
about 25 seconds):

- 306 list entries, **every one mapped to an included work**;
- 340 works, 71 candidates, 680 metrics lines; validator clean;
- R1 on 306 works; R2 metadata on **115 list papers** (Phase 1 §4.2 measured 111) and 34 off-list
  works, many of them preprint versions that M4's version linking will merge;
- two consecutive runs produce byte-identical data.

## 4. Decisions taken during implementation

Each is already reflected in the code, the config or a dated spec note. They are listed here
because they are the things a reader would otherwise have to rediscover.

**Recorded as dated changes in the frozen specs** (see those specs' headers):
- `ids` accepts a `list` key, so a listed paper we cannot identify anywhere else is storable.
- `former_evidence` is written for `override_exclude` too, and an `overrides.yaml` change
  re-evaluates the works it names.
- Stage 13 deletes only work files whose works have left; everything else is carried forward.
- `run` gained `--store` and `--summary-out`; degradation sources use a controlled vocabulary;
  the stage-1 drop check reads its baseline from `entries.jsonl`.
- R1 takes its dates from the list entry exactly, while every other rule follows the 28-day rule.

**Made while building, worth knowing:**
- **Official-list entries are nominations from channel A.** An entry with a PMID goes through
  stage 3 like any other candidate, so it gets real metadata. Only an entry that matches nothing
  at all becomes a stub. This was a bug first: without it, nearly every list entry became an
  identifier-less stub.
- **A listed entry with no PMID is looked up by title in OpenAlex** ($0.001 a search, four of
  them) before any stub is created. Once stored, later runs match it by title against the store,
  so the searches do not repeat.
- **Every stored record's metadata is refreshed each run**, not only what a channel named, which
  is what §6.1 requires for evidence that needs no text. Without it, citations went stale and a
  stored work's R2 metadata was never re-derived.
- **Record IDs are permanent for candidates too.** A candidate's records are carried forward and
  reused; two separate paths were re-minting them, which only a byte-diff of two runs revealed.
- **A listed work whose record type is excluded is stored as an article**, because R1 always wins
  (Phase 1 §6.0) while invariant 3 needs a canonical record of an included kind. The substitution
  is named in the run report.
- **An unmapped source type degrades to "excluded" and is reported**, rather than producing an
  invalid kind that fails the gate.
- **`data-paper` was missing from the OpenAlex type map**, so two listed data papers failed the
  gate on the first live run. Phase 1 §1 includes data papers; the map now does too.
- **An unexpected error fails the run with a report**, not a traceback (§9).
- **`ruff format` is not applied to Markdown**, and the two spec-phase scripts are excluded from
  linting, so the specs and `samples/build_sample_store.py` are left as they are.

## 5. Gotchas found while building

- **Two consecutive live runs are the only way to catch identity bugs.** Both record-permanence
  bugs above were invisible to the unit tests and obvious in a `diff -rq`.
- **The validation gate works.** It caught the `data-paper` problem on the first live run and
  wrote nothing. Trust it rather than working around it.
- **Channel C1's `UWPR*` wildcard pulls in unrelated papers** — one candidate is a Spanish
  constitutional-law article. Candidates are meant to be noisy; this is the design working.
- **One listed PMID (42201957) has no OpenAlex record at all.** It is reported every run rather
  than silently skipped.
- **The current-year page has grown** from 5 entries to 8 since the handoff was written, and
  `older` from 230 to 233. The list moves; that is what the 10% drop check is for.
- **`ids.anyOf` still rejects a PMCID-only record.** Nominations arriving with only a PMCID must
  be resolved through the NCBI ID converter before a record can be written.
- A monthly metrics file from an earlier month can reference a work that later stops being
  included, which the validator rejects. It cannot happen yet; M4 must handle it.

## 6. The approved implementation plan

Written and approved on 2026-09-19, before M0. Reproduced in full and unedited; §1 above says how
far it has got, and §4 lists where the build knowingly went beyond it.

---

### Context

Phases 1–3 are frozen specs. The repository holds the quality gate (empty `uwpr_pubs` package,
ruff/mypy/pytest, green `check.yml`), the store schemas and validator, a real sample store, and
`config/*.yaml` transcribed from Phase 1. No pipeline code exists.

This plan builds the pipeline: the code that finds UWPR-supported publications, decides inclusion
automatically from evidence rules R1–R7, and keeps a committed JSON store current on a weekly
GitHub Actions run. Phase 1 measured what correct looks like, so every milestone is accepted
against numbers, not opinion:

- **recall 201/246 (82%)** on the official list, per-rule within tolerance of Phase 1 §4.2;
- **~74 off-list records** with evidence → **37 works**, 12 preprint-only, ~32 genuinely new (§4.3);
- all 21 fixtures in `config/fixtures.yaml` as expected, fixture G showing R1 but **not** R3;
- two runs on unchanged sources produce no data diff.

### Approach

Build in the order `docs/00` recommends: **a working vertical slice first** (store + official list
+ identifier channels), then the text-and-rules core, then completeness, then live automation.
Recall becomes measurable at M3 rather than at the end.

- **The JSON is the model.** On-disk shapes are `TypedDict`s written by one canonical writer, as
  tagged unions mirroring the schemas' `if`/`then` blocks (`EvidenceR1`, `EvidenceR6`, … each with
  its own `detail` TypedDict and `Literal` rule tag; `CandidateLine` tagged on `reason`). This
  preserves the absent-vs-null distinction the schemas make deliberately, which a dataclass layer
  would have to re-derive — and getting it wrong changes bytes on disk, breaking Phase 2 §15.
  `store/read.py` is the only place that casts, and it validates first.
- **Frozen dataclasses in the pure core** for things that never touch disk: `Block`, `Sentence`,
  `Mention`, `Nomination`, `EvidenceKey`, `Degradation`, `RunOutcome`. Immutability here prevents
  shared-mutable-state non-determinism.
- **Purity boundary as Phase 3 §3 specifies**, plus a `RunContext` supplying the run date, id and
  mode from M0 onward. Nothing calls `datetime.now()`; otherwise the determinism tests become a
  refactor.

### Decisions to record before coding

Three gaps where the frozen specs can't be implemented as written. Each becomes a dated change,
as Phase 1/2 require:

1. **A list-only work cannot be stored.** Phase 1 §8 says an official-list entry that matches
   nothing becomes "a list-only work so R1 still counts it", and Phase 2 invariant 5 requires every
   entry to map to an *included* work. But `ids` in `common.schema.json:34-38` demands a non-null
   DOI, PMID or OpenAlex ID, and 8 of 306 list entries have no PMID. The sample store never
   exercises this, so it went unnoticed. **Fix:** add `list` (the entry key) to `ids` and a fourth
   `anyOf` branch, and have stage 3 try a title match and an OpenAlex title lookup first, so the
   identifier-less record is a genuine last resort.
2. **An excluded work can be stranded.** `candidates.jsonl` has no `evidence` field, and
   `former_evidence` is required only for `no_longer_meets_rules`. A work removed by an
   `override_exclude` therefore loses its evidence, and since its line carries the current
   `rule_version`, Phase 3 §6.1 never re-evaluates it — removing the override later would not bring
   it back. **Fix:** write `former_evidence` for `override_exclude` too (the schema already allows
   it), and make a change to `overrides.yaml` a re-evaluation trigger, fingerprinted in the manifest
   like the rules.
3. **Stage 13 as written would delete the store's history.** "Remove files the new store no longer
   has" would take out page snapshots, monthly metrics, past run manifests and `.generated.json`
   files, none of which a normal run regenerates. **Fix:** an owned-paths policy in
   `store/paths.py` — the sweep only removes `works/W-??????.json` for works that left `works/`;
   everything else is carried forward. Also: a failed run must still produce a report (§10.6), but
   stage 12 runs after the gate, so the report is accumulated by a `RunRecorder` as stages execute
   and written via `--summary-out PATH` outside `store/`.

Smaller corrections, same batch: three Phase 2 examples violate their own schemas (`rule_version`
without the mandatory `.N`; missing `schema` and `fulltext.cache`); `config/fixtures.schema.json`
allows `PXD[0-9]+` where the store requires six digits; `common.schema.json` hard-codes the five
staff keys, which `staff.yaml` should note; and Phase 2 §11's "manifest records rule-version
changes" has nowhere to go in a closed `changes` block — the manifest's `rule_version` plus the
previous manifest covers it, and the report narrates it.

### Milestones

Each is a short series of commits, CI green throughout.

#### M0 — Foundations (no network)

`config.py` (schema-validated load, compiled regexes, **both** fingerprints — `config_fingerprint`
over all config, `rules_fingerprint` over `rules.yaml` + `staff.yaml` only); `store/models.py`
(the TypedDict unions), `store/io.py` (canonical writer: 2-space indent, sorted keys, trailing
newline, atomic rename; total sort orders with explicit tie-breakers), `store/ids.py`,
`store/paths.py` (owned paths), `overrides.py`, `RunContext`; `validate.py` ported from
`tools/validate_store.py` with three fixes — a missing store must fail rather than exit 0,
`json.loads` guarded, and invariants not indexing fields a schema-invalid file may lack.

**Accept:** every file in `samples/store/` round-trips byte-identically; next IDs from that store
are `W-000022`/`R-000023`; minting is stable under shuffled input and never reuses a retired ID;
the 11 mutation stores (recreated — the originals were scratch) each fail for the right reason;
editing `channels.yaml` moves `config_fingerprint` and leaves `rules_fingerprint` alone.

#### M1 — Shell: HTTP, cache, sources

`http.py` (rate limits, retries with `Retry-After`, one secret-stripping function used by logging,
caching and recording, budget guard, three modes), `cache.py`, and adapters for the UWPR site,
OpenAlex, NCBI, Crossref and Europe PMC (B2 and C1 need the last two in M2). Request-classified
cost accounting ($0 lookup / $0.0001 filter / $0.001 search) shared by live and replay, since
replay has no `x-ratelimit` header. Record-mode scrubber plus the §12.3 guard test.

Notes: the list parser reads all six pages, keyed by the page's **year heading**; OpenAlex paging
is cursor-based with an explicit `select=` that adds `awards` and `locations` and **drops
`abstract_inverted_index`**; the NCBI ID converter needs separate `idtype=pmid` and `idtype=doi`
batches and exists in no code anywhere, so it needs a live smoke check.

**Accept:** fake keys appear in no log, cache entry, recording or report; no recording contains an
abstract field or a JATS `<body>`; a live smoke shows B1 ≥ 135, C1 ≥ 185, B2 ≥ 63 (§4.4) and ≥ 306
list entries with at least one per page (§4.1).

#### M1.5 — Evidence and status core (pure)

`evidence.py` with all seven identity-key shapes from §6.3 — including rules that don't exist yet —
and the full merge matrix: same version, new version, text-unavailable exception, the P11 28-day
rule, and a per-entry `reproduced` flag (distinct from staleness, because §9 forbids advancing
`last_seen` for a source that failed). `status.py` covering every row of Phase 2 §13. Tests use
hand-built evidence dicts; no rules, no network, no store.

This exists because R1 and R2-metadata are the two outliers in §6.3 — R1 is the only key without a
record and the only evidence whose dates are copied from `entries.jsonl`; R2-metadata is the only
key without a section or excerpt hash. Designing the merge from those two alone would bake in the
wrong shape. Evidence is keyed by **record**, with override evidence keyed by work, and projected
onto the work's array in stage 7 — after stage 6 may have merged works and moved records.

#### M2 — Vertical slice: a real store from the cheap evidence

Channels A/B1/B2/C1/C2; `match.py` (DOI normalisation, the DOI→PMID→PMCID→OpenAlex order, title
similarity ≥ 0.85 with year ±1 for the no-PMID entries); rules R1 and **R2 metadata arm only**
(the text arm waits for `text.py`); `git.py`'s read-only half (clean tree, reset, and an untracked
-file check, since `git checkout` won't remove an orphaned `W-000123.json` from a crashed run);
`RunRecorder` and `report.py`; `pipeline.py` stages 0–3, 7, 9, 12–13 with the staging write and
gate; `stages/kb.py` and `stages/export.py` as no-ops.

Fix in passing: the stage-1 drop check needs "the total from the last run", which the manifest has
no field for — derive it from `entries.jsonl` and test it, or it silently never fires. Degradation
sources need a controlled vocabulary (`channel:C1`, `source:europepmc`, `stage:official_list`) or
the three-in-a-row detector can never match.

**Accept:** ≥ 298 works carry R1; R2-metadata fires on ≥ 111 list papers and the 2 off-list
metadata-only works (§4.2–4.3); all 8 no-PMID entries map to included works (invariant 5); a second
same-day run diffs nothing outside `runs/`; a planted untracked work file is refused; planted page
snapshots, monthly metrics and a `.generated.json` all survive a run.

#### M3 — Text and rules core

`text.py` (structural JATS per Phase 1 §6.1, `defusedxml`); rules R3, R3d, R4, R5, R6, R7 and the
signals of §6.4; PRIDE and bioRxiv adapters; channels D1, D2, D3, E, F, G with `max_results` as a
loud failure; the ORCID check of staff IDs. R6 applies only to records with no readable text of our
own, which is known only after stage 4 — so "refresh R6 every run" must not re-add it to records
that have become readable (P13).

Test documents come from a **redaction tool** (`tools/redact_jats.py`, run locally against the warm
cache): it keeps the whole element tree and attributes and replaces every text node with a
length-matched placeholder, except the sentences already committed as evidence excerpts. Hand-written
JATS would lack namespaces, inline markup, entities and a DOCTYPE, so a parser that passed it would
still fall over on real PMC. A coverage matrix test asserts the fixture set exercises every §6.1
behaviour, and a guard test fails on any over-long text node.

**Accept:** recall exactly **201/246**; per-rule on list papers within tolerance of §4.2 (R2-text
144, R3 159, R5 28, R7 18, R4 1, R3d 0); ~74 off-list records with evidence (§4.3); zero near-miss
identifiers across ~850 readable texts (§4.6); every fixture as expected.

#### M4 — Completeness and determinism

`versions.py` (Crossref relations, bioRxiv `published`, OpenAlex locations, title/author fallback;
preprint-only works checked each run for a published version — deciding how a record created in
stage 6 fills the required `fulltext` field, since its status enum has no "not checked"); merges
across the works/candidates boundary; `metrics.py` (the monthly file written when
`<YYYY-MM>.jsonl` does not exist, which is idempotent, rather than "earliest run this month");
`git.py`'s commit half; `explain`, `report`, `fixtures`, `smoke`; the §9 machinery including the
trailing-8-run average, the recall alert with a written definition of "assessable" (and R6's two
hits sitting outside the 246 denominator), and `--channels` implying `--no-commit`.

Three replay scenarios, not two: the two-run rule-change plus overrides case (which needs a second
config tree at `rule_version` 2026-09-19.1 whose R3 exclusions lack `plans`/`manufactured`, so the
SAWN work is included then superseded), determinism, and three consecutive degraded runs tripping
an alert. The expected store is *derived* from `samples/store/`, not equal to it: the sample's
`mode: sample` manifest, its hand-made `W-000003` R1 dates and its `page: "current"` keys cannot be
reproduced by replay runs. That reconciliation is a written task.

**Accept:** 37 works from 41 new records with 12 preprint-only (§4.3); the galanthamine and NUP153
duplicates merge by Crossref relation, not title; byte-identical determinism; the third degraded
run reports `alert` and removes nothing.

#### M4.5 — Seed rehearsal

Seeding the real store is the one irreversible step: a single run mints ~1,100 permanent work IDs
in an order fixed forever. Rehearse into a scratch store, run twice and diff, hand-review the ~37
new works (Phase 1 §2 allows exactly this one-time calibration), confirm 201/246 and ~32 new works,
then commit the seed as one reviewed change.

#### M5 — Live automation

`update.yml` per §11.3, with secrets scoped per step, the run id as well as the status in
`$GITHUB_OUTPUT`, and an empty-secret guard in the key scan (an unset variable makes `grep -F`
match everything). Measure the real OpenAlex spend against the $0.05 estimate and a cold-cache
rule-change run against the ~1,100-request estimate, replacing both in the spec. Set the pytest
coverage threshold. **The repository currently defaults to read-only workflow permissions, so the
bot cannot push** — fix that before enabling the schedule, and settle branch protection and the
60-day inactivity question (§15 items 3–4).

### What to reuse

`samples/build_sample_store.py` is a store *assembler*, not a pipeline — its works and excerpts come
from YAML. Reuse its conventions: alias-key grammar, canonical-record choice, array sort keys, the
OpenAlex→record mapping with its staff-tenure gate, `norm_title`, the run-manifest shape, and
`check_excerpt` (which becomes a test-time guarantee that every stored excerpt really occurs in the
extracted text). Rewrite its fetcher, its `Minter` and its list parser. **Do not port `xml_text`**:
it flattens the document with `itertext()` and implements none of §6.1. The handoff document has
`normalize_doi`, `normalize_award_text` and the near-miss regex, which agree with `rules.yaml`.

### Constraints the schemas cannot express (so code must)

Excerpts truncated to ~300 characters though the schema allows 400; R1 evidence has no excerpt;
the full criterion mapping (R3 is 3 when the sentence names a staff member else 4; R6 is 2 only for
the award code; R5 is 3); `record` null only on override evidence; canonical = article else latest
preprint; the run id's suffix equals its mode; metrics only for included works; file name equals
`id`; DOIs normalised before writing; the 28-day `last_seen` rule in `works/` and `candidates.jsonl`
but exact dates in `entries.jsonl`; and every list entry matched to a work before writing.

### Verification

Per milestone: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest`,
plus `uv run uwpr-pubs validate <store>` — the same commands `check.yml` runs.

End to end, before the first scheduled run:
1. `uwpr-pubs run --mode live --dry-run --store /tmp/store` — full sweep, nothing written.
2. The same twice without `--dry-run` — the second run produces no data diff.
3. A third run at an injected date 29 days later — only the expected files change (P11).
4. `uwpr-pubs fixtures` — every Phase 1 §12 paper as expected, offline.
5. Read the run report: recall against 201/246, per-rule counts against §4.2, new works with their
   excerpts, and spend against the $0.05 estimate.
6. `uwpr-pubs explain <DOI>` on a known inclusion, a known miss and a negative fixture.
7. Trigger `update.yml` by hand, confirm the bot commit and job summary, then enable the schedule.

### Notes

- **`--store DIR` is an addition** to the Phase 3 §8 CLI (default `store/`), so development and
  tests never touch the real store; recorded as a dated change.
- **The real store is not committed until M4.5.** Everything before that is regenerable.
- **Phases 5 and 7 drafts are stale** (tiers, incremental runs, human merges — all superseded).
  Stages 10 and 11 stay no-ops until those phases are discussed.

---

## 7. How to pick this up

```
uv sync --locked --all-groups
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
uv run uwpr-pubs validate samples/store
uv run uwpr-pubs smoke                              # live; about $0.001
uv run uwpr-pubs run --store /tmp/scratch-store     # live; about $0.002 with a warm cache
```

- **Work one milestone at a time,** committing as you go, with `check.yml` green on every push.
- **Measure, don't assume.** Phase 1 §4 is the yardstick; a milestone is done when its numbers
  match, not when the tests pass.
- **Run twice and diff.** It is the only reliable way to catch identity and date bugs.
- **Frozen specs change only deliberately,** with a dated note in the spec's header.
- **Never commit full text, abstracts, `.env` or the API key.** The repository is public.

## 8. Open questions for the maintainer

1. **Workflow permissions** are read-only, so the weekly bot cannot push. Needed before M5.
2. **No `LICENSE`**, so the public repository is "all rights reserved" by default.
3. **The `OPEN_ALEX_API_KEY` repository secret** has not been added; nothing needs it until M5.
4. **Phases 4 to 7 have not been discussed.** Phase 4 (knowledge base) is the next specification
   conversation, and its decisions — an LLM for summaries, the subject vocabulary, whether
   abstracts may be quoted — are the ones that most affect later work.
