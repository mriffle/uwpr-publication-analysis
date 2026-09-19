# UWPR Publication Impact — Project Phases

**Status:** specification stage. No production code is written until the specs below are agreed.
**Last updated:** 2026-09-19

## Goal

A visual, dynamic, single-page web app that displays and substantiates the impact of the
University of Washington Proteomics Resource (UWPR) using publication data. The app is **one
fixed template**; only its input file changes. That input is produced by a pipeline that re-runs
on a schedule so the publication record stays current.

**Publication knowledge base (requirement added 2026-09-19).** The system also produces a
reusable knowledge base: one markdown file per included publication, containing
- a summary;
- what the paper is about, described with a controlled vocabulary (ontology) we define;
- a broad category (e.g. medical, environmental, technology development);
- authors and affiliations;
- **how it was determined to be a UWPR publication**: the evidence, its source and an excerpt.

In the web app, clicking a publication displays its knowledge-base entry.

**Preprints (decided 2026-09-19).** Preprints are included when no journal version exists yet.
They count as one work with their journal version once it appears. Wherever a preprint-only work
is shown, it is labelled as a preprint.

```
 sources ──► retrieval pipeline ──► local store ──┬─► export ──► uwpr_publications.json ──► web app
 (APIs,        (Phase 3)            (Phase 2)     │   (Phase 5)                              (Phase 6)
  UWPR site)        ▲                             │                                            │ click
                    │                             └─► knowledge base: one .md per publication ◄┘
            discovery strategy                         (Phase 4)
           + calibrated rules (Phase 1)
                         scheduling / hosting / QA (Phase 7)
```

## Phases

| # | Phase | Question it answers | Spec | Status |
|---|---|---|---|---|
| 1 | Discovery strategy | How do we find every UWPR-supported publication despite inconsistent acknowledgement, and decide inclusion automatically? | [01-discovery-strategy.md](01-discovery-strategy.md), [01a-discovery-calibration.md](01a-discovery-calibration.md) | **Frozen** 2026-09-19 |
| 2 | Data model & local storage | How are publications, versions, evidence and decisions represented on disk? | [02-data-model.md](02-data-model.md) | **Frozen** 2026-09-19 |
| 3 | Retrieval pipeline | What does the code that discovers, fetches and updates the data do, and how does it re-run safely? | [03-retrieval-pipeline.md](03-retrieval-pipeline.md) | **Draft 3** — review decisions applied (P10–P15); skeleton and config schemas done; needs `check.yml` green on GitHub, then sign-off |
| 4 | Publication knowledge base *(added)* | What does each publication's markdown page contain (summary, subject vocabulary, category, authors, affiliations, UWPR evidence), how is it generated and kept current, and how does the app show it? | *not yet written* | Requirement captured; not yet discussed |
| 5 | Metrics & app data contract *(added)* | Exactly what is in the JSON that drives the app, and how is each number defined? | [05-metrics-and-data-contract.md](05-metrics-and-data-contract.md) | Unreviewed starting point |
| 6 | Web app | What does the single-page app show, how does it behave, and how does data get into it? | [06-web-app.md](06-web-app.md) | Unreviewed starting point |
| 7 | Operations *(added)* | Where does it run, how often, where is it hosted, and how do we know it is still correct? | [07-operations.md](07-operations.md) | Unreviewed starting point |
| 8 | Implementation | Build to the specs, in the order below. | — | Not started |

### Why the three added phases

- **Knowledge base (4).** Your requirement: a reusable page per publication that the app can
  open. It replaces the earlier "curation workflow" draft, which was superseded when inclusion
  became fully automated. That draft is kept in `archive/`; the one-time calibration it
  anticipated now lives in Phase 1a.
- **Data contract (5).** The JSON file is the only interface between the pipeline and the app.
  Specifying it on its own lets the two be built and tested independently, and makes "only the
  input changes" a checkable promise (schema version + validation).
- **Operations (7).** "Re-runs regularly" needs an owner, a schedule, a host, API budgets and a
  way to notice breakage (a source changing its markup, an API changing its terms).

## Dependencies and order of work

1 → 2 → 3, with 4 and 5 specified alongside 2 because they share its vocabulary. Phase 4 depends
on Phase 1's evidence records, which become each page's "how we know" section. Phase 6 depends
only on 5, so app design can proceed in parallel with pipeline work using a hand-made sample
JSON. Phase 7 is settled last but its hosting decision constrains 6 (see 06 §7).

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
| D6 | Who is the app's audience, and is it public? | Public; aimed at UW leadership, funders and prospective users | 06 |
| D7 | ~~Show "probable" works?~~ | Obsolete — inclusion is now yes/no | — |
| D8 | Hosting location and UW branding requirements | **Answered (hosting):** public GitHub repository; pipeline on GitHub Actions; the app most likely on GitHub Pages. UW branding still to discuss. | 03 §11, 06, 07 |
| D9 | Run cadence | **Answered:** weekly scheduled GitHub Actions run (full sweep every run), plus a manual trigger | 03 §2, §11 |
| D10 | Should findings flow back to the official publications page? | Yes — a "missing from site" report each run | 07 |
| D11 | Knowledge base: how are summaries and subject tags generated (e.g. an LLM over abstract + full text), and may abstracts be quoted? | To discuss in Phase 4 | 04 |
| D12 | Knowledge base: build our own subject vocabulary, or reuse existing ones (OpenAlex topics, MeSH, NCBI Taxonomy for organisms, EDAM or PSI-MS for methods and instruments) with our own top-level categories? | To discuss in Phase 4 | 04 |
| D13 | Does the app embed knowledge-base content in its single file, or load pages on click? | To discuss in Phases 4–6 | 05, 06 |

## Glossary

- **Record (manifestation):** one published object with its own identifier — a preprint, a journal
  article, a correction.
- **Work family:** all records that are versions of the same piece of research. The unit of counting.
- **Channel:** one method of nominating candidates (e.g. OpenAlex award search).
- **Evidence:** a specific, quotable reason a record is linked to UWPR.
- **Rule:** an automatic test on metadata or text that, when it fires, includes a work (01 §6).
- **Official list:** the publications pages on proteomicsresource.washington.edu.
- **Knowledge-base entry:** the markdown page for one publication (work family).
