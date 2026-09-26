# Phase 8 — Implementation: status and handoff

**Status:** Record — the build is done and live, and this is appended to as it runs · last
updated 2026-09-26
**Purpose:** everything needed to pick this work up: what was built, what was measured, what was
decided along the way, and the approved plan in full (§6).
**Depends on:** the frozen specs [01](01-discovery-strategy.md), [01a](01a-discovery-calibration.md),
[02](02-data-model.md) and [03](03-retrieval-pipeline.md), and the agreed specs
[05](05-metrics-and-data-contract.md), [06](06-web-app.md) and [07](07-operations.md). They are
the authority; this document records how they were built and what building them taught us.
**Tidied 2026-09-26:** §1, §2, §7 and §8 describe the present, and were brought up to date: they
still read as if the app were unbuilt. §8's settled questions are cut to one line each; their full
text is in git history. The dated sections (§3–§5) and the plan (§6) were only added to.

---

## 1. Where the build has got to

| Milestone | State |
|---|---|
| M0 Foundations (store models, IO, IDs, config, validator) | **Done** |
| M1 Shell (HTTP, cache, source adapters, live smoke) | **Done** |
| M1.5 Evidence and status core (pure) | **Done** |
| M2 Vertical slice (channels A/B1/B2/C1/C2, R1 + R2 metadata, gate, report) | **Done** |
| M3 Text and rules core (R3–R7) | **Done** (§3.1 has the numbers) |
| M4 Completeness and determinism | **Done** (§3.2 has the numbers) |
| M4.5 Seed rehearsal and seed | **Done** — `store/` seeded 2026-09-20 (§3.3) |
| M5 Live automation (`update.yml`) | **Done** — ran unattended 2026-09-20 and pushed (§3.4) |
| Stage 11, the app's JSON ([05](05-metrics-and-data-contract.md)) | **Done** 2026-09-20 — two files, validated at the gate, committed with the store |
| The web app ([06](06-web-app.md)) | **Done** 2026-09-20 — `web/`: React, TypeScript, Vite, visx |
| Publishing ([07](07-operations.md)) | **Done** 2026-09-20 — `gh-pages`, with the data and the app published separately |
| Scheduled running | **Done, after a false start** — the first scheduled run failed on 2026-09-21; fixed, and caught up on 2026-09-26 (§3.5) |

**The app is live** at <https://mriffle.github.io/uwpr-publication-analysis/>.

**The checks, as of 2026-09-26:** 510 Python tests and 707 web unit tests, all offline, plus 40
Playwright tests against the built app. ruff, `ruff format`, mypy `--strict`, ESLint, Prettier,
`tsc`, the bundle budget and the store validator are all clean. `check.yml` is green on every
push. Besides the code, it validates the committed `store/`, runs the Phase 1 §12 test papers
against it, and checks that the committed export matches the committed store.

**`store/` was seeded on 2026-09-20**: 339 works, 455 candidates, 306 list entries, 754 metrics
lines, 0 errors and 0 warnings. The ~1,100 work and record IDs it minted are permanent from here.
The seeded store is **byte-identical to the rehearsal that was reviewed** (§3.3), so what is
committed is exactly what was read.

**The store after the 2026-09-26 run:** 339 works, 477 candidates, 306 list entries and 754
metrics lines; recall on the official list 208/253 (82%).

**Rule version 2026-09-26.1** fixed §8's two data defects and landed the same day (run
36258998881, `Data update 2026-09-26T17-26-live`: DEGRADED on bioRxiv alone, 189 s, $0.0100). The
store is now 338 works, 477 candidates, 306 list entries and 754 metrics lines, because W-000746
turned out to be a second copy of W-000237's preprint. Recall (208/253) and the test papers are
unchanged. The committed change matched the scratch measurement except for six cache pointers,
which only the local cache had moved (§3.7).

## 2. What exists

```
src/uwpr_pubs/
  config.py      schema-checked config/*.yaml; the two fingerprints (§10.4)
  context.py     RunContext: the only reader of the clock
  schemas.py     schema registry and project-root discovery
  secrets.py     the one place secrets are stripped from URLs, params and text
  cli.py         the `uwpr-pubs` command
  cache.py       content-addressed cache; the same format as tests/recordings/
  http.py        rate limits, retries, budget guard, live/replay/record, cost classification
  recording.py   record-mode scrubbing (P10) and the guard the §12.3 test uses
  records.py     source metadata → store records; kind mapping; staff tenure
  match.py       DOI→PMID→PMCID→OpenAlex, then title similarity ≥ 0.85 with year ±1
  evidence.py    identity keys, the merge matrix, the criterion mapping, excerpt limit
  status.py      every row of Phase 2 §13, in precedence order
  channels.py    channel definitions → nominations
  fulltext.py    stage 4: readable text, NCBI efetch first, then Europe PMC
  text.py        structural JATS extraction (Phase 1 §6.1)
  metrics.py     citation lines from the same OpenAlex refresh
  report.py      RunRecorder: the report is accumulated as stages run
  pipeline.py    the stage machine, the staging write and the gate
  versions.py    the four version-linking signals, and the merge plan they imply
  fixtures.py    the Phase 1 §12 test papers, evaluated against a store
  explain.py     everything known about one work, for `uwpr-pubs explain`
  export.py      the app's data contract, pure: store shapes in, export shapes out (docs/05)
  sample.py      the twelve cases the sample export must cover (docs/05 §13)
  validate.py    the store validator (was tools/validate_store.py)
  git.py         clean-tree, reset, and the run's one data commit
  runtime.py     builds the client from config; reads .env for local runs
  smoke.py       `uwpr-pubs smoke`, the only live test
  sources/       uwpr_site, openalex, ncbi, crossref, europepmc, biorxiv, pride
  rules/         one module per rule, plus staff name forms and the §6.4 signals
  stages/        export.py: stage 11, the shell around export.py (stage 10 retired with Phase 4)
  store/         models (TypedDicts), io, ids, paths, read

web/             the app (docs/06): contract/ (types generated from schemas/), aggregate/ and
                 filter/ (no React), charts/, views/; e2e/ holds the Playwright tests
tools/           publish-site.sh (the two halves of gh-pages); redact_jats.py
.github/         check.yml, update.yml (weekly), pages.yml (app deploy), dependabot.yml
```

Commands: the full Phase 3 §8 set — `validate`, `config`, `smoke`, `run`, `explain`, `report`
and `fixtures` — plus `export`. `run` takes `--mode`, `--store`, `--cache`, `--dry-run`,
`--channels`, `--no-commit` and `--summary-out`.

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

### 3.1 M3 live runs, 2026-09-20 (UTC)

A full sweep takes about 150 seconds on a warm cache and costs **$0.013**. The first run on a
cold cache downloaded roughly 200 MB of PMC full text and took about 25 minutes at NCBI's
keyless 3 requests a second; every run after that reads the cache, because full text is
immutable (Phase 2 §12).

**Recall on the official list: 206/251 (82%)** — Phase 1 §4.2's baseline. The denominator is 251
rather than 246 because the list has grown since Phase 1 measured it.

| Rule | On list papers | Phase 1 §4.2 | Off list |
|---|---:|---:|---:|
| R2 identifier in metadata | 115 | 111 | 34 |
| R2 identifier in text | 141 | 144 | 9 |
| R3 resource named | 156 | 159 | 14 |
| R4 South Lake Union | 1 | 1 | 0 |
| R5 affiliation is the resource | 33 | 28 | 7 |
| R6 OpenAlex full-text proxy | 20 | 18 | 29 |
| R7 staff thanked | 16 | 18 | 7 |
| R3d dataset description | 0 | 0 | 0 |

Store: 368 works, 845 candidates, 306 list entries, 736 metrics lines; validator clean.

**Not yet at target, and expected:** 62 off-list works against §4.3's ~37, of which 39 are
preprint-only against 12. **M4's version linking is what closes this** — most of the excess is a
preprint and its article counted twice. Judge §4.3 after M4, not now.

**Channel J needs two requests per dataset, not one.** A PRIDE search hit carries the protocol
text but **not** the dataset's references, so nothing links it to a publication and the channel
nominates nothing at all. Only the datasets whose text actually names the resource are fetched
again by accession, which is a handful. Channel J now nominates 8 papers and R3d finds exactly
the one work §4.3 expects — PXD011642 → PMID 32613749, which no other channel finds.

### 3.2 M4 live runs, 2026-09-20 (UTC)

A full sweep takes **about 110 seconds** on a warm cache and costs **$0.010**. Version linking
adds roughly 30 seconds to a first run, and almost nothing afterwards: a work that already holds
both versions needs no request.

**The number M4 had to move.** Phase 1 §4.3 expects about 37 works off the official list, 12 of
them preprint-only. Both figures were measured against the same sources on the same day, so the
comparison is like for like:

| | before M4 | after M4 | Phase 1 §4.3 |
|---|---:|---:|---:|
| Works | 369 | 342 | |
| **Off the official list** | 63 | **36** | ~37 |
| **Of those, preprint-only** | 39 | **12** | 12 |
| Candidates | 476 | 453 | |
| Recall on the official list | 206/251 (82%) | 208/253 (82%) | 82% |

50 merges: 27 works and 23 candidates. The 37 version links are 31 Crossref relations, 2 bioRxiv
`published` fields and 4 title matches. **All 21 fixtures behave** — 19 as expected and B and B2
still known misses — and fixture G still shows R1 without R3.

**Two runs on unchanged sources produce byte-identical data.** This is the check that earns its
keep: it found both of the bugs in §5 below.

**Per-rule counts**, on list papers and off, against Phase 1 §4.2:

| Rule | On list, M4 | before M4 | Phase 1 §4.2 | Off list, M4 | before M4 |
|---|---:|---:|---:|---:|---:|
| R2 identifier in metadata | 120 | 115 | 111 | 11 | 34 |
| R2 identifier in text | 141 | 141 | 144 | 4 | 9 |
| R3 resource named | 156 | 156 | 159 | 9 | 14 |
| R4 South Lake Union | 1 | 1 | 1 | 0 | 0 |
| R5 affiliation is the resource | 33 | 33 | 28 | 4 | 7 |
| R6 OpenAlex full-text proxy | 35 | 20 | 18 | 14 | 29 |
| R7 staff thanked | 16 | 16 | 18 | 7 | 7 |
| R3d dataset description | 0 | 0 | 0 | 1 | 1 |

The on-list rises in R2-metadata and R6 are the merges working, not a rule change: evidence found
on a preprint applies to the whole work (Phase 1 §8), so when a preprint joins a listed article
its evidence moves to the list side of this table. Each rule's total is unchanged. No rule's
behaviour was altered in M4.

**The two duplicates Phase 1 §4.3 predicted, checked one at a time.**
- **Galanthamine was never a duplicate.** The list entry *An Extraction Assay Analysis for
  Galanthamine…* has no PMID and matches the article `10.4172/scientificreports.149` by title, so
  it has been one work since M2. Nothing to merge.
- **NUP153 cannot be merged automatically, and this was measured rather than assumed.** Crossref
  gives the preprint only `is-version-of` pointing at its own v1, and the article's `relation` is
  empty. Neither record's OpenAlex locations names the other. The titles score 0.645 against the
  0.85 threshold and the first authors differ, because the author order changed between versions.
  None of Phase 1 §8's four signals reaches it. `samples/store/` has always linked this pair with
  `method: "override"`, which is the answer: it is the worked example in Phase 2 §9. **It needs a
  merge override, which belongs to M4.5**, because overrides name work IDs and those are not
  permanent until the store is seeded.

### 3.3 M4.5 seed rehearsal, 2026-09-20 (UTC)

The seed run is the one irreversible step, so it was rehearsed into scratch stores first.

**The minting order is reproducible.** Two independent builds from an empty store, run half an
hour apart, produced **byte-identical stores** — the same ~1,100 work IDs against the same
papers. So a rehearsal says exactly what the seed will mint, and the review below is a review of
the real thing rather than of something close to it.

**The NUP153 merge override was written against the rehearsal's IDs** (`W-000329` the listed
article, `W-000735` the preprint) and verified: the preprint joins the article with
`version_link.method: override`, `W-000735` is retired and aliased, and **every other work ID is
unchanged** — an override merges after minting, so it cannot shift the order. Two runs with the
override in place are byte-identical, and the store validates.

| | without the override | with it | Phase 1 §4.3 |
|---|---:|---:|---:|
| Works | 342 | 341 | |
| Off the official list | 36 | 35 | ~37, of which 2 are probable duplicates |
| Of those, preprint-only | 12 | 11 | 12 |

**The off-list works, by the evidence behind them**, against §4.3's table. All 36 were read; the
groups agree, and every one is consistent with a decision already recorded in
[01a](01a-discovery-calibration.md):

| Evidence | Works | Phase 1 §4.3 |
|---|---:|---:|
| More than one rule | 9 | 13 |
| R6 only (text we cannot read) | 8 | 8 |
| R7 only (staff thanked) | 6 | 5 |
| R3 only (resource named) | 5 | 7 |
| R5 only (affiliation) | 4 | 1 |
| R2 metadata only | 3 | 2 |
| R3d only (dataset description) | 1 | 1 |

Fixture J's paper is the R3d one — PMID 32613749, via PXD011642, which no other channel finds.

**Reviewed 2026-09-20: 33 of the 35 confirmed, two dropped.** Both were R7-only credits to the
same staff member, and they are the two C2 examples in
[01a](01a-discovery-calibration.md) that name no work — the third, the kinetochore paper
("assistance with data analysis and visualization"), stands. The two were handled differently on
purpose:

| Work | Wording | Handled by | Why |
|---|---|---|---|
| `W-000761` | "technical support in assembling and sharing data" | **rule change** (`2026-09-20.1`) | It is C4 — repository help — with the repository not named. Measured: of 23 R7 entries it disqualifies exactly that one, none on the list, so recall is unchanged. |
| `W-000686` | "their excellent technical assistance" | **override** | Word for word what listed papers say when crediting real UWPR work, so no rule reaches it without dropping papers UWPR itself lists. |

After both: **339 works, 33 off the official list, 11 preprint-only**, recall 208/253 (82%), all
21 fixtures behaving. Every other work ID is untouched — a rule change does not move the minting
order, because it does not change which records are nominated.

**Author affiliations are captured** for the web app and knowledge base (Phase 1 §13): 99% of
included works have at least one, 3,098 authors and 4,956 affiliation strings, each keeping the
raw string as published plus OpenAlex's ROR ID, institution name and country, and a `staff` key
where the author is UWPR staff. Coverage holds back to 2005. One presentation wrinkle for Phase
5: OpenAlex often returns the same affiliation twice with trivially different punctuation, so the
app should collapse them on display rather than the store dropping what a source published.

**One case remains genuinely uncertain, and it is the same one calibration flagged.** `W-000664`
(*Low Clusterin Levels in High-Density Lipoprotein…*, 2010) is [01a](01a-discovery-calibration.md)
Part 2 row 2, marked "?" there and never resolved. Its R3 match sits inside a long funding list
that names several centres. The frozen rules include it, and the spot-check was approved with it
left uncertain rather than rejected, so it stays — but it is the one work to look at first if a
precision question is ever raised.

### 3.4 M5: `update.yml`, written 2026-09-20

The weekly workflow exists and follows §11.3. It is **not yet proven**, because the only honest
test of a workflow is running it, and that needs a `workflow_dispatch` from someone with access.

What it does, and why each part is there:
- **Secrets are scoped to three steps** — the smoke check, the run, and the key scan. The push
  step never sees them.
- **The key scan skips an unset secret.** `NCBI_API_KEY` is optional, and `grep -F ""` matches
  every line, so without the guard every run would fail for the wrong reason. All three paths
  were exercised by hand before committing: unset, set and absent, set and present.
- **`fetch-depth: 0`**, because the push rebases onto `main` first and a shallow clone cannot.
- **A git identity is configured**, because a runner has none and the pipeline commits for
  itself. Without it stage 13 fails.
- **The report is posted with `if: always()`**, read from `--summary-out` rather than from the
  store, so a run that stopped at the validation gate still explains itself — that report is the
  only place the explanation exists (§10.6).
- **The alert check runs last**, after the data is pushed. An alert means something needs a
  person, not that the run was wrong (§9), so the data lands and then the job fails to send mail.

**It ran, unattended, on 2026-09-20** (`workflow_dispatch`, run 35524865177). Every step
succeeded and the bot pushed `Data update 2026-09-20T17-07-live`, which reported "no change to
the works" — correct, since the store had been seeded from the same sources an hour earlier.

**This settles the question the documentation could not.** The repository's default workflow
token is read-only (`default_workflow_permissions: "read"`), and the workflow's explicit
`permissions: {contents: write}` **is** honoured for a same-repository trigger. No repository
setting had to change.

**Measured, replacing the estimates in Phase 3 §7 and §13:**

| | Estimate | Measured |
|---|---|---|
| Duration | 5–15 min | **4m 34s**, on a cold cache |
| OpenAlex spend | ≈ $0.05 | **$0.0100** |
| Requests | — | 435: 313 NCBI, 35 Crossref, 28 OpenAlex, 26 Europe PMC, 23 bioRxiv, 6 UWPR, 4 PRIDE |

The estimate was five times high because it assumed paging through full-text searches, which
`max_results` now stops at the first page. Only OpenAlex costs anything. The one figure still
unmeasured is a rule-change run on a cold runner, which needs a `rule_version` bump to land on
a cold cache. *(Measured 2026-09-26 on a local cold cache: 6m 38s; §3.7.)*

### 3.5 The first scheduled run, 2026-09-21, and what it found

The cron is Mondays 13:17 UTC. **GitHub started the first scheduled run at 18:44** — five and a
half hours late, which GitHub's queue does not promise against — and it **failed in 25 seconds**,
at smoke. Seven checks passed; one read `FAIL europe pmc search: 0 results; expected at least
185`, and the verdict was `BLOCKED`. The pipeline never ran, so nothing was committed or
published that week, and GitHub's failure email reached the maintainer.

**It was not a changed query.** Europe PMC answered exactly 185 on 2026-09-20 and 2026-09-26.
The 2026-09-20 smoke change could not have saved the week, because nothing had failed: the source
answered 200, and a content assertion that failed was always a problem. Measuring Europe PMC
directly on 2026-09-26 found why the check could not tell:
- **Europe PMC reports its errors inside an HTTP 200**, as `{"errCode": …, "errMsg": …}` with no
  `hitCount`, and `count()` read the missing total as zero. `search()` had the same blind spot, so
  the same reply during a run was an empty channel rather than a degradation. Which the
  2026-09-21 reply was — an error body, or a well-formed empty answer — the log cannot say.
- **An unknown field answers a well-formed zero** (`NOSUCHFIELD:"UWPR95794"` → `hitCount: 0`), so
  a zero is exactly what a renamed field looks like. Treating every zero as an outage would have
  swapped a blocked week for a channel that could die silently.
- **Two floors equalled their live counts** (Crossref 63, Europe PMC 185), and OpenAlex's count
  fell from 140 to 139 in the same five days. One withdrawn record would have blocked a week.

The fix is recorded in [03](03-retrieval-pipeline.md)'s header (changed 2026-09-26): errors in the
body become `HttpError`, counts are strict, the floors sit about 10% below the live counts, and a
count below its floor asks a **control query** on the same source (Europe PMC `proteomics`
352,521; OpenAlex `publication_year:2020` 11,473,447; Crossref `type:journal-article`
124,067,625) to tell an empty source from a query that has stopped matching. Both paths were
exercised against live Europe PMC before committing: the unknown field reads as a `FAIL` beside a
healthy control, and the error body as a `FAIL` carrying its `errCode 404`.

**The catch-up run then failed too, one stage later** (run 36247387416, 2026-09-26). Smoke passed,
discovery completed with no channel errors, and stage 6 stopped on `JSONDecodeError: Expecting
value`. It reproduced locally, and the report could not say where, because the failure note keeps
only the traceback's last line; a scratch run that printed the whole traceback found
`Biorxiv.details`. **bioRxiv's `details` endpoint was answering HTTP 200 with an empty body to
every request** — all 58 stored preprint DOIs, both servers, the date-range form too — while its
documented `pubs` endpoint answered normally. The source failure was ordinary; its exception type
was not an `HttpError`, so the stage's own degrade-and-continue never caught it. Unparseable
replies are `MalformedReplyError` now (docs/03, changed 2026-09-26), and a pipeline test with an
empty bioRxiv body fails on the old code (`failed`) and passes on the new (`degraded`). The same
scratch run then completed: **DEGRADED**, 176 s, $0.0101, one degradation (`source:biorxiv`), 339
works and no work added or removed.

**That scratch run also showed that a weekly run rewrites every work file**, which Phase 2 §15
says it must not ("weekly runs on unchanged sources change only `official_list/entries.jsonl`,
`metrics/` and `runs/`, plus a `last_seen` refresh about once a month"). All 339 changed, six
days after the seed, almost all of it dates: 1,325 `discovery[].last_seen`, 305 evidence
`last_seen` (R1 copies the list's exact dates), 385 `source.retrieved`, 375 `sources.openalex`,
80 R6 `query_date`, and `updated` on every file. Every run before this one was on the seed's own
day, so nothing could show it: another date bug that only running on a second day finds. The
dates are true, so nothing is wrong, only noisy; it is **left for a deliberate fix** rather than
patched under a catch-up run, and the next scheduled run would have done the same. *(Fixed the
same day; §3.6.)*

**The catch-up then landed** (run 36248419286, on `10e364a`): smoke `PROCEED`, the run
**DEGRADED** in 150 s for $0.0101 with the one expected degradation (`source:biorxiv`), data commit
`Data update 2026-09-26T14-25-live` pushed, and the export on `gh-pages` and live. 339 works, no
work added or removed, 477 candidates (456 before), recall 208/253, fixtures unchanged. If
bioRxiv's `details` stays empty for three runs, §9's alert will say so.

### 3.6 The weekly rewrite, fixed 2026-09-26

**Measured before fixing.** The committed store, run live as if on 2026-10-03: a scratch script
builds a `RunContext` for that day, and everything else is the real pipeline. **All 339 work
files and all 477 candidate lines changed, and every difference was a date:**

| Field | Changed | Why |
|---|---:|---|
| `discovery[].last_seen` | 1,335 | P11 was applied to evidence only, although Phase 2 §5.3 names discovery entries too |
| `evidence[].source.retrieved` | 389 | only because the R1 and R6 entries below were replaced whole (306 + 83) |
| `records[].sources.openalex` | 375 | set to the run's date on every record rebuilt from OpenAlex |
| `updated` | 339 | set to the run's date on every file |
| R1 `last_seen`, in the entry and its detail | 306 + 306 | copied from the list entry, which moves every week |
| R6 `detail.query_date` | 83 | counted as content, so every R6 entry was replaced |
| candidate `last_seen` | 477 | P11 again |
| candidate `fulltext.checked` | 476 | every candidate was read again (below) |

**R1 was the spec's own contradiction.** docs/03 §6.3 said R1 keeps the entry's dates exactly;
docs/03 §5's P11 paragraph and Phase 2 §7 say it takes them exactly *once the entry has gone*. The
code followed §6.3, which made Phase 2 §15 impossible for all 306 listed works. R1 now follows P11
while listed and takes the exact last day once delisted. A list that cannot be fetched now leaves
R1 alone. Otherwise its frozen dates would read as every paper being delisted.

**Every candidate was read again, every run.** A candidate line keeps one text status (Phase 2
§6), and nothing put it back on the record when the line was read. So each re-nominated candidate
looked new to §6.1. In CI the reads came from the restored download cache (3 NCBI requests on
2026-09-26), so the cost was churn rather than requests. The status now goes back to the line's
lowest-numbered record, the one it is written from, unless the rule version has changed.

**The fix itself exposed two older bugs.** The live runs found both, and the tests found neither:
- **304 of 477 candidates lost their PMCID** on the first fixed run. Only the NCBI ID converter
  knows a PMCID, and it runs only on records being read. So re-reading every candidate each week
  was what had kept theirs. Identifiers now accumulate on a candidate's records as they always
  did on an included work's (`merge_ids`).
- **The first 28-day refresh changed the source of 6 R5 entries** from PMC to OpenAlex, dropping
  the cache pointer to the text they were read from. The same affiliation appears in the PMC text
  and in OpenAlex's strings, with one identity. A refresh now moves only `retrieved`, and only
  when this run looked at the same source.

**Measured after**, the same way:

| | a week on (2026-10-03) | a month on (2026-10-24) |
|---|---:|---:|
| Work files changed | **0** of 339 | 339, dates only |
| Candidate lines changed | **0** of 477 | 477, `last_seen` only |
| Other files changed | the list entries, `metrics/`, `runs/` | the same |

**The app kept its exact dates.** "First on X and most recently on Y" and the method page's "last
read" had been kept current by the churn. The export changes every run anyway, so it now takes a
listing's dates from `entries.jsonl` and a queried source's last read from the run itself
([05](05-metrics-and-data-contract.md), changed 2026-09-26). That also corrected Crossref's last
read, which had said 2026-09-20 since the seed.

A month on is P11's refresh, which Phase 2 §15 allows: every date that records when the run
looked moves once, together, and nothing else does. 618 `retrieved` dates moved against 624
`last_seen`: the other six are the R5 entries, which keep their PMC source. Both stores validate,
and recall (208/253) and the test papers are unchanged. Each run cost $0.0100. `tests/test_pipeline.py` now runs a week and 28 days apart. It also
covers a failed list fetch and a candidate not being read again.

### 3.7 Rule version 2026-09-26.1: the two data defects, measured 2026-09-26

The bump §8 item 1 was waiting for, with the fixes it carries. Every figure below comes from a
live run on a scratch copy of the committed store, all on the same afternoon.

**What the fixes are:**
- **W-000205:** PMC's XML for the paper escapes its funding apostrophe twice (`&amp;apos;`), so
  the parsed text still said `&apos;`. Extracted text now decodes a character reference left
  after parsing, but only a numeric one or a known name: `html.unescape` alone would also turn
  `&notes;` into `¬es;`.
- **Three works' affiliations:** OpenAlex keeps some raw strings HTML-escaped ("Computer Science
  `&amp;` Engineering"), and the app showed them that way. Decoded where they are read, for the
  record and for R5 alike.
- **W-000746 was never a title problem.** It was a duplicate. W-000237, the listed ACS Chem Biol
  article, already held the ChemRxiv preprint under its concept DOI
  (`10.26434/chemrxiv.12148524`, with the real title). W-000746 held the same preprint under its
  revision DOI (`….v1`), whose Crossref record carries the file name as its title and states no
  relation. Only the concept DOI's record names the article. Stage 6 now asks about the DOI
  without its revision when the revision's own record states nothing, and `.v1` counts as a
  revision (it did not: only `-v2` and `/v2` did). W-000746 merges into W-000237 and becomes an
  alias. Among included works it was the only such pair. Five more pairs are among the candidates:
  figshare tables and datasets, excluded record types, never shown.

**Measured.** A is the previous commit and B this one. Both share the warm cache, on the same
day. C is B's code with an empty cache.

| | A: before | B: the bump | C: the bump, cold cache |
|---|---:|---:|---:|
| Outcome | DEGRADED (bioRxiv) | DEGRADED (bioRxiv) | DEGRADED (bioRxiv) |
| Time | 74 s | 164 s | **6m 38s** |
| OpenAlex | $0.0100 | $0.0100 | $0.0100 |
| Requests | — | 35 Crossref, one more than A | **703**: 604 NCBI, 35 Crossref, 28 OpenAlex, 25 Europe PMC, 6 UWPR, 4 PRIDE, 1 bioRxiv |
| Works / candidates | 339 / 477 | **338** / 477 | 338 / 477 |
| Recall on the list | 208/253 | 208/253 | 208/253 |
| Test papers | 19, 2 known misses | the same | the same |

- **A changed nothing** against the committed store: 0 work files and 0 candidate lines.
- **B against A**, apart from the merge, the two decoded excerpts and the five decoded affiliation
  strings, is what a bump must do: every file carries the new version. Evidence changed on 1,011
  entries; 376 records were read again (137 of them unreadable, so rechecked in 90 days from
  today). Six cache pointers also moved, because the local cache holds different copies of some
  PMC texts from CI's (§5). No work was added or removed by the rules.
- **C against B:** 25 cache pointers (9 works, 16 candidates) point at freshly fetched copies of
  PMC texts whose bytes changed. No excerpt, evidence entry or inclusion changed.
- **The cold-cache figure replaces Phase 3 §13's estimate:** 6m 38s rather than 4m 34s plus
  ~6 minutes, and 604 NCBI requests rather than ~1,100. A record with no PMCID is never fetched.

**A week later, the bump showed a bug of its own.** The same code, run on B's output as if on
2026-10-03, read W-000205 again and rewrote its file. Stage 4 re-reads a work whose evidence has an
older `rule_version` (Phase 3 §6.1), and it counted superseded entries. Those keep the version that
produced them, as history, so each entry a rule change superseded made its work look out of date
for good. The committed store held no superseded evidence at all, so no run before could show it.
Superseded entries no longer count. The same run on the fixed code changed **0 work files and 0
candidate lines**: only the list entries, `metrics/` and `runs/`, as Phase 2 §15 says. The bump
itself is unaffected, because a changed config fingerprint re-reads every record anyway. A
scenario test runs a rule change and then a week on; it fails on the old code with a dropped
candidate read again.

Both week-on runs ended **ALERT**, which is correct: bioRxiv's `details` had now failed in three
runs in a row of that scratch store's history (§3.5).

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
  **Reversed 2026-09-26** for a listed paper, which it made rewrite every week (§3.6).

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

**Made during M3** (the five rule changes are dated in `docs/01`'s header):
- **Identifiers accumulate** (`records.merge_ids`). The NCBI ID converter finds a PMCID in stage
  4; OpenAlex, which does not carry it, blanked it again on the next run's metadata refresh. A
  source that stops reporting an identifier never takes it away. A new identifier is also added
  to `aliases.json`, or the gate rejects the store.
- **R6 is decided from the record's stored text status, not this run's fetch.** A record read on
  an earlier run and not re-read today still has text of its own, and P13 says R6 stands in only
  where we have none.
- **`max_results` is enforced from the first page,** using the total the API reports. D3's
  `"Van Haller"` full-text search matches 13,612 works; paging through them to discover that
  cost $0.068 of the $0.080 the run spent. Now $0.013.
- **Europe PMC's 500 is an answer, not a wobble** (Phase 1 §7), so `fullTextXML` is asked once.
  Retrying it with backoff cost about 14 seconds on every non-open-access record, which made the
  first full run take hours rather than minutes.
- **A text fetch is not retried per record beyond the client's own retries**; a failure adds the
  record to the run's unevaluated set, so its stored evidence is left exactly as it was (§6.2).

**Made during M4** (the two spec changes are dated in `docs/02` and `docs/03`'s headers):
- **Crossref states the relation from the article's side far more often than the preprint states
  it from its own.** 13 of the 63 works the award filter returns carry `has-preprint`, against
  one carrying `is-preprint-of`. Phase 1 §8 names both directions; reading the article's side
  costs no request at all, because channel B2 has already fetched those records.
- **Only preprint-only works are asked about.** A work that already holds both versions keeps
  them in one file and carries its `version_link` forward, so it needs no request. That is what
  keeps version linking to about 30 seconds on a first run and nothing on a normal week.
- **A preprint server mints a DOI per revision** (`…-33v24-v2`, `…/v2`), and a relation may name
  a revision we do not hold. The revision is stripped as a *second* chance, after the exact DOI
  fails, and only when exactly one record matches — so an ambiguous revision links nothing.
- **A DOI read out of an OpenAlex location URL is only used if it matches a record we already
  hold.** That is what makes parsing DOIs out of URLs safe: a mis-parse finds nothing.
- **`HttpError` carries its status.** Crossref's 404 means "no such DOI", which is a fact about
  the record; anything else means the source is down. Without the distinction, an outage would
  have looked like "no preprint has a published version".
- **A positive fixture whose paper is absent from the store is not a regression.** Phase 3 §12.2
  says the positive papers *present in the store* must stay included, and the qualifier matters:
  without it, the first run into an empty store fails on every fixture at once.
- **The run's commit is made after the report,** because the report and the manifest are among
  the files it commits. So the report does not name the commit it is part of; the CLI prints it.
- **A commit that fails raises an alert rather than failing the run.** The data is already
  written by then, and what needs a person is the repository, not the run.

**Made with rule version 2026-09-26.1** (§3.7; dated in `docs/01` and `docs/03`'s headers):
- **A character reference left in text after parsing is decoded**, whether a numeric one or a
  known name, and nothing else. It is done in extraction, not in the app: [06](06-web-app.md) §5
  keeps the app showing what the store holds.
- **OpenAlex's raw affiliation strings are decoded where they are read**, so the record and R5
  see the same string.
- **A revision DOI whose own Crossref record states no relation is asked about without its
  revision**, and `.v1` is a revision. It is still the Crossref relation signal, read from the
  record that states it, so the version linking trusts nothing new. It cost one request this time.
- **Phase 1 §8's title repair is still not built.** Its one case turned out to be a duplicate,
  and the fix above removes it. Crossref's record for that revision DOI had the same file name,
  so "take the title from Crossref" would not have mended it anyway.

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

**Found during M3:**
- **The CLI kept the M2 channel list.** `run` passed `IDENTIFIER_CHANNELS`, so D1, D2, D3, E, F,
  G and J never ran, and the first "complete" run was nothing of the kind — while still
  reporting a plausible 82% recall, because R1 and R2 carry most list papers on their own.
  **Read the channel table in the report before believing any number under it.**
- **An OpenAlex institution may carry `ror: null`,** so `.get("ror", "")` returns None rather
  than "". M2's narrow channels never met one; M3's broad ones do, and the run died on it.
- **PMC answers 200 with no `<body>`** for publisher-restricted records, carrying the comment
  "The publisher of this article does not allow downloading of the full text in XML form". That
  is Phase 1 §4.1's 155 records, and it is what `fulltext: unavailable` means.
- **NCBI is fast (about 0.4 s a request); the slowness was ours.** Measure a real request before
  assuming a source is the bottleneck.

**Found while building the app against the contract (2026-09-20):**
- **The pipeline never constructed override evidence at all**, though Phase 2 §9 specifies it. It
  went unnoticed because the only thing that exercised it was `samples/store/`, whose override
  evidence is written by `samples/build_sample_store.py` rather than by the pipeline — a
  hand-built sample can mask the absence of the code it is meant to stand in for. The consequence
  was worse than a missing field: a work whose only reason for inclusion was an `include`
  override reached the export with an empty evidence array, which the export schema rejects, so
  **the whole run would have failed and written nothing**. Now built in stage 7, and covered by a
  scenario test where a rule change supersedes the only rule evidence and the override alone
  holds the work in.
- **A work included by an override claimed the rules had included it.** `_work_file` hard-coded
  `status.basis` to `"rules"`, contradicting Phase 2 §13 and the sample store's own contents. No
  effect on the real store, where nothing is override-included.

**Found during M4** — both by running twice and diffing, and neither by any unit test:
- **A candidate's stored records were dropped whenever one of them was re-nominated.** The
  candidate line was rebuilt from this run's nominations, falling back to the stored list only
  when the draft had no records at all. Every candidate record used to arrive from a nomination
  each run, so it never showed. Stage 6 creates records no channel ever nominates, and those
  vanished on the following run. The line now merges the two lists. **A record ID, once minted,
  is permanent — including one nothing will name again.**
- **A record created in stage 6 must not be dated for rechecking today.** Doing so had the next
  run fetch its text, find none, and rewrite the record with a 90-day date — a data diff on the
  second run, from a store nobody had touched.
- **The docs' own figures go stale, so re-measure the baseline rather than trusting a table.**
  §3.1 recorded 845 candidates; the same code on the same day now produces 476, because three
  commits landed after that measurement was written. Comparing M4 against the recorded figure
  would have shown a 392-candidate "regression" that never happened. The comparison in §3.2 is
  against a run of the previous commit made the same afternoon, on the same cache.
- **The stage-0 validator can reject the store a run was about to fix.** A merge override names
  works that are, by definition, not yet merged. As an error, that made the override unusable;
  it is now a warning. Any check that asserts a *post-run* state has this problem.

**Found after going live (2026-09-26):**
- **The run report's Notes were 222 lines of false duplicates.** Every "OpenAlex has 2 records
  for …" note named the *same* id twice (`W1985458075, W1985458075`): three notes, one per
  identifier, for each of 74 papers. Nominations are grouped by their first identifier. So a
  paper nominated once with a DOI and once with only a PMID is fetched by both batches, and
  `_choose_payloads` counted the copies. It now keys by OpenAlex id. A live run on a copy of the
  store left **one** such note, a real triple (`doi:10.1136/jnnp.73.2.213`) that had been buried
  among the 222. The payload chosen is unchanged, so no data moved.
- **PMC full text is not quite immutable.** In a local run against a copy of the committed store,
  four candidates' `fulltext.cache` hashes differed from CI's run an hour earlier. The local
  cache fetched those texts at 00:01 on 2026-09-20. CI's cache got them from its first run, at
  17:07 the same day (313 NCBI requests, from empty), and `update.yml` has restored that cache for
  every run since. PMC's XML changed in those 17 hours. None of the four is included, so inclusion
  was untouched. The two caches can therefore disagree, so a local run can diff against the
  committed store even with the same code on the same day. *(Corrected the same day: this first
  said CI starts cold, which it does not; the 2026-09-26 run made 3 NCBI requests.)*
- **Stage 0 and the gate read different `overrides.yaml` files** (§8, open item 4). It was found
  when that local run stopped at stage 0. *(Fixed the same day.)*
- **Superseded evidence made its work look out of date for good** (§3.7). Stage 4 counted a
  superseded entry's `rule_version`, which is history, so every entry a rule change superseded
  would have had its work read again, and its file rewritten, every week. The real store held no
  superseded evidence until its first bump, and a run on the bump's own day could not show it:
  **run a week on after a bump, not only after a code change.**
- **Crossref can hold a preprint twice, and state its relation on only one copy.** ChemRxiv's
  concept DOI names the article; the `….v1` revision DOI names nothing and has a file name for a
  title. OpenAlex knew only the revision.
- **A data update can break the test suite, and `check` will not see it until someone pushes.**
  The bot's commit is pushed with `GITHUB_TOKEN`, which starts no workflow, so `check.yml` never
  runs against the store it writes. A test that pinned docs/05's figures to the real store (316
  and 322 of 339 works) failed after 2026-09-26.1 merged a UW duplicate, and CI stayed green. It
  now asserts what the figures show, not the figures. A second test pinned which §13 cases the
  store lacks, which the first retraction a run finds would change; it now asserts only that the
  store exports, and the guard's scope is tested on the fixed sample store instead. **A test that
  reads `store/` must hold for any store the weekly run could write.**

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

## 6a. The expected-store reconciliation (the M4 plan's written task)

The plan asked for the replay scenarios' expected store to be *derived* from `samples/store/`,
and for the reconciliation to be written down. Having done the derivation, the answer is that
**the sample store should not be the expected output of a run, and the scenarios assert
behaviour instead.** The reasons are not incidental:

- its manifest is `mode: sample`, and the run ID's suffix is its mode, so no run can produce it;
- `W-000003`'s R1 dates are hand-made, to show a list entry that has disappeared;
- its list keys use `page: "current"`, which the live parser now keys by year heading;
- it links the NUP153 pair by `override`, which requires an `overrides.yaml` naming work IDs that
  only exist once a store has been seeded;
- it is a curated cross-section — one work per rule — not the output of any channel sweep.

Forcing a run to reproduce it would mean special-casing the pipeline to match a fixture, which is
the wrong direction. What the sample is genuinely good for, and is now used for, is as a real
validated store to read: `tests/test_fixtures_and_explain.py` runs the fixture evaluator and
`explain` against it, so both are exercised against shapes a hand-built store produced
independently of the pipeline.

`tests/test_scenarios.py` covers what the plan wanted from the replay runs, over a two-paper
corpus: an exclude override and a rule change removing a work and carrying its superseded
evidence forward (and restoring it when the rule comes back), byte-identical determinism between
two stores built from scratch, and a failing source that shrinks nothing.

## 7. How to pick this up

```
uv sync --locked --all-groups
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
uv run uwpr-pubs validate store
uv run uwpr-pubs smoke                              # live; about $0.001
uv run uwpr-pubs run --store /tmp/scratch-store     # live; about $0.010, ~150 s, warm cache
uv run uwpr-pubs fixtures --store /tmp/scratch-store        # the Phase 1 §12 papers
uv run uwpr-pubs explain 10.1021/acs.jproteome.5c00706 --store /tmp/scratch-store
uv run uwpr-pubs report --store /tmp/scratch-store          # the latest run's report
```

The app's commands are in `CLAUDE.md` and `web/package.json`; operating the system — triggering a
run, reading a report, rolling back — is `RUNBOOK.md`'s.

- **A scratch run into an empty directory mints a fresh store.** To exercise the real one, copy
  `store/` and `export/` into one scratch directory, outside the repository, and run against the
  copy. The run validates against the project's `overrides.yaml` wherever the store is (§8 item
  4); `uwpr-pubs validate` still looks beside the store, so give it `--overrides overrides.yaml`.
- **Work in small steps,** committing as you go, with `check.yml` green on every push.
- **Measure, don't assume.** Phase 1 §4 is the yardstick; a change is done when its numbers
  match, not when the tests pass.
- **Run twice and diff — on two different days.** It is the only reliable way to catch identity
  and date bugs, and a same-day rerun cannot see a date bug (§3.6).
- **Frozen specs change only deliberately,** with a dated note in the spec's header.
- **Never commit full text, abstracts, `.env` or the API key.** The repository is public.

## 8. Open questions for the maintainer

*Brought up to date 2026-09-26.*

**Settled**, each with where the answer is recorded:
- **Workflow token permissions.** `update.yml`'s own `permissions: {contents: write}` is honoured,
  and no repository setting had to change (§3.4, 2026-09-20).
- **Licence.** Apache-2.0, held jointly by Michael Riffle and the University of Washington
  (`LICENSE`, `NOTICE`; 2026-09-20).
- **`OPEN_ALEX_API_KEY`** is a repository secret (2026-09-20).
- **Phases 4 to 7.** Phase 4 is retired and D11–D13 are answered; 5, 6 and 7 are agreed, built
  and live (2026-09-20; §1).
- **The NUP153 merge override** was committed with the seed, and holds (§3.3).
- **Maintainer and fallback.** Michael Riffle is the maintainer, and Michael Hoopmann the
  fallback (2026-09-26; `RUNBOOK.md` §1). The fallback does not receive the scheduled run's
  failure email; [07](07-operations.md) §6 says why, and what they watch instead.

**Open:**
1. ~~**Two data defects found while specifying Phase 5**~~ (2026-09-20). **Fixed 2026-09-26 by
   rule version 2026-09-26.1** (§3.7), which landed the same day.
   - **`W-000746`'s title was a filename**, `1_manuscript_2020-04-14.pdf`, because the work was a
     second copy of W-000237's ChemRxiv preprint under its `.v1` revision DOI. It merges into
     W-000237, whose title is the article's; the app does not show a version's own title.
   - **`W-000205` stored an undecoded XML entity** in two evidence excerpts. A bump was needed,
     because an entry's identity is partly a hash of its excerpt (§6.3). The corrected excerpts
     are new entries, and the bump supersedes the old ones rather than leaving duplicates.

   The bump was also the cold-cache rule-change run that Phase 3 §13 carried as an estimate:
   6m 38s, 604 NCBI requests.
2. ~~**An override that names a DOI or PMID silently does nothing**~~ (found 2026-09-20). Phase 2
   §9 allowed an `include` or `exclude` target to be "a DOI / PMID for a paper not yet in the
   store", and `overrides.schema.json` accepted one, but the pipeline matches overrides only by
   work ID, so such an entry was accepted, validated and ignored. **Fixed 2026-09-26 by rejecting
   it** rather than resolving it through `aliases.json`: every paper the pipeline has seen has a
   work ID, candidates included, and one it has never seen has nothing to attach to. The schema
   now takes work IDs only, so config load stops the run, and the validator reports it (Phase 2's
   header has the change). Both current overrides name work IDs and still load.
3. ~~**A weekly run rewrites every work file**~~ (§3.5). **Fixed 2026-09-26** (§3.6): a week on,
   no work file or candidate line changes.
4. ~~**Stage 0 validates against a different `overrides.yaml` from the gate**~~ (found
   2026-09-26). `precheck` called `validate_store(store)`, which looks for
   `<store>/../overrides.yaml`, while the run and the gate use `config.overrides_path`. For the
   real store they are the same file; for a scratch copy of it they were not, and the run stopped
   at stage 0 (`W-000686: reason override_exclude but no exclude override targets it`). **Fixed
   2026-09-26:** stage 0 passes `_overrides_path(config)` as the gate does. A scenario test keeps
   the overrides away from the store and runs twice; it fails on the old code with that error.
5. **Two Phase 7 exit criteria** ([07](07-operations.md) §17). The `gh-pages` rollback has not
   been rehearsed. The schedule surviving 60+ days without a human commit cannot be checked
   before late November 2026.
6. **An `NCBI_API_KEY`** would take NCBI from 3 to 10 requests a second. It matters only on a
   cold cache, and CI restores its cache each run (§5). Optional: without it, a normal run takes
   2–5 minutes and a rule change on a cold cache 6m 38s (§3.7).
7. **Visual-regression tests** ([06](06-web-app.md) §12.2) are not written.
8. **[07](07-operations.md) §9.1's missing-from-site list** has no report section, and nobody owns
   acting on it (07 §16 item 0).
9. **Any config change re-reads every record** (found 2026-09-26). Stage 4's
   `_overrides_changed` compares the whole config fingerprint, which covers every `config/*.yaml`
   as well as `overrides.yaml`. So a change to `channels.yaml` alone re-reads every text.
   Phase 3 §10.4 says only a rule-version change or an `overrides.yaml` change should. With CI's
   warm cache that costs time, not requests, so it is left alone for now; the fix is to compare
   the overrides themselves.
