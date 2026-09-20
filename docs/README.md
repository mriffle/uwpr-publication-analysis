# Specifications

How this project was designed, phase by phase. Each document answers one question and was agreed
before the code it governs was written.

**Read [00-project-phases.md](00-project-phases.md) first.** It is the index: the goal, the phase
table, the decisions asked of UWPR, the cross-cutting principles and the glossary.

## What each document is, and whether you may change it

Status is not decoration. It says what you are allowed to do with the document.

| Document | What it answers | Status |
|---|---|---|
| [00-project-phases.md](00-project-phases.md) | What are the phases, the principles and the decisions? | **Living** — updated as phases complete |
| [01-discovery-strategy.md](01-discovery-strategy.md) | How do we find every supported publication, and decide inclusion with no human review? | **Frozen** 2026-09-19 |
| [01a-discovery-calibration.md](01a-discovery-calibration.md) | The judgement calls the rules had to encode, settled against real examples | **Complete** 2026-09-19 |
| [02-data-model.md](02-data-model.md) | How are works, versions, evidence and decisions stored on disk? | **Frozen** 2026-09-19 |
| [03-retrieval-pipeline.md](03-retrieval-pipeline.md) | What does the pipeline do, and how does it re-run safely? | **Frozen** 2026-09-19 |
| [05-metrics-and-data-contract.md](05-metrics-and-data-contract.md) | Exactly what is in the JSON that drives the app, and how is each number defined? | **Agreed** 2026-09-20 |
| [06-web-app.md](06-web-app.md) | What does the app show, how does it behave, and how is it built and tested? | **Agreed** 2026-09-20 |
| [07-operations.md](07-operations.md) | Where does it run, how is it published, and how do we know it still works? | **Agreed** 2026-09-20 |
| [08-implementation.md](08-implementation.md) | What was actually built, what was measured, and what did building it teach us? | **Record** — appended to, not rewritten |
| [archive/](archive/) | Superseded documents, kept because they are cited | — |

**Frozen** means the document is the authority and changes to it are deliberate: dated, explained
in the header's "Changes since freezing" note, and accompanied by a re-measurement of whatever the
change affects. Several rules were changed after freezing, and each carries the recall figure
before and after.

**Agreed** means the same, except these three were settled later and their headers carry a
"Changes since agreement" changelog instead. Building the app corrected the contract a dozen
times; each correction says what was wrong and how it was found.

**Record** means 08 is not a specification at all. It is the implementation's own account:
milestones, measured costs and timings, decisions taken while building, and a list of things that
only went wrong once. Read §4 and §5 before changing pipeline code.

## The order that makes sense

1. **[00](00-project-phases.md)** — the shape of the whole thing.
2. **[01](01-discovery-strategy.md)** — how a publication is found and why it counts. Everything
   else rests on this. [01a](01a-discovery-calibration.md) is its companion: the borderline cases,
   decided one at a time against real papers.
3. **[02](02-data-model.md)** — what is written to disk, with the schemas as the authority.
4. **[03](03-retrieval-pipeline.md)** — the code that does it, stage by stage.
5. **[05](05-metrics-and-data-contract.md)** — the single file the app reads, and the exact
   meaning of every number in it.
6. **[06](06-web-app.md)** — the app itself.
7. **[07](07-operations.md)** — running and publishing it, and how a failure becomes visible.
8. **[08](08-implementation.md)** — what happened when all of that was built.

## Phase 4 is missing on purpose

There is no `04`. It was to be a knowledge base of one page per publication, and it was **retired
on 2026-09-20** because the store already held everything it wanted except a summary — and a
summary is the one element of such a page that could not be traced to a source. Its draft is in
[archive/04-curation-workflow.md](archive/04-curation-workflow.md) and
[00](00-project-phases.md) explains the reasoning. The publication detail it was to carry is part
of [05](05-metrics-and-data-contract.md) instead.

## Two conventions worth knowing before you read

**Every figure was measured.** Claims here come from live API calls on a stated date, not from
estimation. Where a figure has gone stale, the correction is dated. [08](08-implementation.md) §5
records the time a documented figure was trusted over a re-measurement and produced a
392-candidate regression that had never happened.

**Discovery and inclusion are separate, everywhere.** *Channels* nominate candidate papers;
*rules* decide whether a paper counts. Nothing is included because of who wrote it or where it was
found. Conflating the two is the single easiest way to misread [01](01-discovery-strategy.md).

## Related documents outside this folder

- **[../README.md](../README.md)** — what the project is and how to run it.
- **[../RUNBOOK.md](../RUNBOOK.md)** — operating it: triggering a run, reading a report, responding
  to an alert, rolling back, rotating a key.
- **[../CLAUDE.md](../CLAUDE.md)** — the working brief for Claude Code, including the data-source
  gotchas learned the hard way.
- **[../samples/README.md](../samples/README.md)** — the sample store and what it covers.
