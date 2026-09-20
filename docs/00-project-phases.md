# UWPR Publication Impact — Project Phases

**Status:** the pipeline is built and running weekly; the app is not. See 08.
**Last updated:** 2026-09-20 (Phase 4 retired; **every remaining phase is agreed** — 5, 6 and 7
are specified, and all that is left is to build them)

## Goal

A visual, dynamic, single-page web app that displays and substantiates the impact of the
University of Washington Proteomics Resource (UWPR) using publication data. The app is **one
fixed template**; only its input file changes. That input is produced by a pipeline that re-runs
on a schedule so the publication record stays current.

**Publication detail (requirement added 2026-09-19; reshaped 2026-09-20).** Clicking a
publication shows its detail: what the paper is about, its authors and their affiliations, and
**how it was determined to be a UWPR publication** — the evidence, its source and an excerpt.

This began as a separate "knowledge base" of one markdown page per publication (Phase 4). It was
**retired on 2026-09-20**, because the store already holds all of it but the summary, and a
summary is the one thing on such a page that could not be traced to a source. The detail is now
part of the app's data contract (Phase 5). See "Why Phase 4 was retired" below.

**Preprints (decided 2026-09-19).** Preprints are included when no journal version exists yet.
They count as one work with their journal version once it appears. Wherever a preprint-only work
is shown, it is labelled as a preprint.

```
 sources ──► retrieval pipeline ──► local store ──► export ──► uwpr_publications.json ──► web app
 (APIs,        (Phase 3)            (Phase 2)       (Phase 5)                               (Phase 6)
  UWPR site)        ▲                                   │                                      │ click
                    │                                   └──► publication detail: subject,  ─────┘
            discovery strategy                               authors, affiliations, evidence
           + calibrated rules (Phase 1)
                         scheduling / hosting / QA (Phase 7)
```

## Phases

| # | Phase | Question it answers | Spec | Status |
|---|---|---|---|---|
| 1 | Discovery strategy | How do we find every UWPR-supported publication despite inconsistent acknowledgement, and decide inclusion automatically? | [01-discovery-strategy.md](01-discovery-strategy.md), [01a-discovery-calibration.md](01a-discovery-calibration.md) | **Frozen** 2026-09-19 |
| 2 | Data model & local storage | How are publications, versions, evidence and decisions represented on disk? | [02-data-model.md](02-data-model.md) | **Frozen** 2026-09-19 |
| 3 | Retrieval pipeline | What does the code that discovers, fetches and updates the data do, and how does it re-run safely? | [03-retrieval-pipeline.md](03-retrieval-pipeline.md) | **Frozen** 2026-09-19 |
| 4 | ~~Publication knowledge base~~ | — | *never written* | **Retired 2026-09-20.** The store already carries everything it was to contain except a summary, which was not wanted. Publication detail moved into Phase 5. |
| 5 | Metrics & app data contract *(added)* | Exactly what is in the JSON that drives the app, and how is each number defined? | [05-metrics-and-data-contract.md](05-metrics-and-data-contract.md) | **Agreed** 2026-09-20 |
| 6 | Web app | What does the single-page app show, how does it behave, and how does data get into it? | [06-web-app.md](06-web-app.md) | **Agreed** 2026-09-20 |
| 7 | Operations *(added)* | Where does it run, how often, where is it hosted, and how do we know it is still correct? | [07-operations.md](07-operations.md) | **Agreed** 2026-09-20 |
| 8 | Implementation | Build to the specs, in the order below. | [08-implementation.md](08-implementation.md) | **In progress** — M0–M5 done; the store is seeded and the weekly run works |

### Why Phase 4 was retired (2026-09-20)

It was to produce one markdown page per publication, holding a summary, a subject vocabulary we
would define, a broad category, authors and affiliations, and the UWPR evidence. Measured against
the seeded store, four of those five already exist and are better than a generated page:

| Phase 4 was to provide | Where it already is |
|---|---|
| Authors and affiliations | `records[].authors[]`: 99% of works, with the raw string as published, a ROR-resolved institution and a `staff` key |
| How we know it is a UWPR publication | `evidence[]`: rule, plain-language label, section, source name and URL, retrieval date, excerpt |
| Subject vocabulary | `records[].topics[]`: OpenAlex topics, 100% of works, four levels (domain → field → subfield → topic) with scores |
| A broad category | The topic's `domain` and `field` — decided 2026-09-20 to use these as reported rather than define our own |
| A summary | Not held, and **not wanted** (decided 2026-09-20) |

The summary was the only gap, and it is the one element of such a page that could not be traced
to a source. This project's second principle is that every claim is traceable and therefore
defensible; an unsourced paraphrase of someone else's paper sitting beside evidence that *is*
sourced would be the weakest thing on the page. Generating one would also put an LLM key in CI
and cost the pipeline its byte-identical determinism, which has caught six identity and date bugs
so far.

A separate `kb/` tree would also have duplicated the store as ~340 generated files regenerated
from JSON the app already reads. Removing it dissolves D13 entirely.

**What is kept:** `store/works/W-*.generated.json` (Phase 2 §8) stays as a documented, validated
envelope that nothing currently writes. It is the door left open: if generated content is ever
wanted, it has a home, a regeneration trigger and an owned-paths rule already.

### Why the other added phases

- **Data contract (5).** The JSON file is the only interface between the pipeline and the app.
  Specifying it on its own lets the two be built and tested independently, and makes "only the
  input changes" a checkable promise (schema version + validation).
- **Operations (7).** "Re-runs regularly" needs an owner, a schedule, a host, API budgets and a
  way to notice breakage (a source changing its markup, an API changing its terms).

## Dependencies and order of work

1 → 2 → 3 are done and frozen. **5, 6 and 7 are all agreed** (2026-09-20): 5 is the data contract
and carries the publication detail Phase 4 was to hold, 6 is the app, and 7 is how both are
published and kept running. **Every phase is now specified, and what remains is implementation**,
starting with the sample export, which the app cannot be developed or tested without (05 §13).

Suggested implementation order once specs are agreed:

1. Store + official-list scraper + identifier channels (gives a real corpus quickly).
2. Export + a sample `uwpr_publications.json`; web app built against it.
3. Remaining discovery channels, evidence extraction, family linking.
4. Review tooling, then scheduling and deployment.

## Cross-cutting principles

1. **Nominate broadly, include on evidence.** Channels propose; automatic evidence rules decide.
   No human review in regular operation. Nothing is included because of authorship alone.
2. **Provenance everywhere.** Every inclusion can be traced to a source URL, a retrieval time and
   a quoted excerpt. The app exposes this so the numbers are defensible.
3. **Accumulate, never forget.** A work found once stays in the store even if an API later drops
   it.
4. **Work families, not records.** Preprint + final article count once.
5. **One template, one input.** The app has no knowledge of UWPR beyond what the JSON tells it.
6. **Reproducible and cheap to re-run.** Cached, idempotent, within API budgets. Correct even with
   an empty cache, as on a fresh CI runner.
7. **Tested, type-checked and linted.** pytest, mypy (strict) and ruff on every push, via GitHub
   Actions (Phase 3 §11–12).

## Decisions needed from UWPR (collected from all specs)

| # | Decision | Default assumed until answered | Spec |
|---|---|---|---|
| D1 | Related cores | **Answered:** neither the DRC core nor the Dept. of Medicine Mass Spectrometry Resource is UWPR; "South Lake Union Mass Spec Facility" is | 01 §3 |
| D2 | Is UWPR staff co-authorship alone sufficient? | **Answered:** no | 01 §3 |
| D3 | User/PI roster from UWPR records? | **Answered:** not used | 01 §3 |
| D4 | Earliest year and staff list | **Answered:** 2006; only the five named staff | 01 §3 |
| D5 | Human review? | **Answered:** none in regular operation; rules are calibrated once | 01 §2 |
| D6 | Who is the app's audience, and is it public? | **Answered:** public; aimed at UW leadership, funders and prospective users. The page reports rather than promotes (05 §11) | 05, 06 |
| D7 | ~~Show "probable" works?~~ | Obsolete — inclusion is now yes/no | — |
| D8 | Hosting location and UW branding requirements | **Answered:** public GitHub repository; pipeline on GitHub Actions; the app most likely on GitHub Pages. **No UW branding** (2026-09-20) — clean and modern, visually neutral; the resource is named and linked | 03 §11, 05, 06, 07 |
| D9 | Run cadence | **Answered:** weekly scheduled GitHub Actions run (full sweep every run), plus a manual trigger | 03 §2, §11 |
| D10 | Should findings flow back to the official publications page? | **Answered:** yes — a "missing from site" report each run, as an operations artifact rather than a public claim (07 §9.1). 33 works today. An owner for acting on it is still needed | 05, 07 |
| D11 | ~~How are summaries generated, and may abstracts be quoted?~~ | **Answered 2026-09-20: no summaries, and no abstracts.** A summary is the one thing on a publication page that could not be traced to a source, and abstracts are copyrighted, which is why they stay in the cache and out of the repository | — |
| D12 | ~~Own subject vocabulary, or reuse an existing one?~~ | **Answered 2026-09-20:** use OpenAlex topics as reported — domain, field, subfield, topic — which cover 100% of included works. No vocabulary of our own | 05 |
| D13 | ~~Embed knowledge-base content, or load pages on click?~~ | **Obsolete** — there is no separate knowledge base to embed or load. Publication detail is part of the app's data contract | 05 |

## Glossary

- **Record (manifestation):** one published object with its own identifier — a preprint, a journal
  article, a correction.
- **Work family:** all records that are versions of the same piece of research. The unit of counting.
- **Channel:** one method of nominating candidates (e.g. OpenAlex award search).
- **Evidence:** a specific, quotable reason a record is linked to UWPR.
- **Rule:** an automatic test on metadata or text that, when it fires, includes a work (01 §6).
- **Official list:** the publications pages on proteomicsresource.washington.edu.
- **Knowledge-base entry:** the markdown page for one publication (work family).
