# UWPR Publication Impact

**[mriffle.github.io/uwpr-publication-analysis](https://mriffle.github.io/uwpr-publication-analysis/)**

The publications supported by the [University of Washington Proteomics
Resource](https://proteomicsresource.washington.edu/), found automatically and kept current — and,
for every one of them, the evidence for why it counts.

**339 publications, 2008–2026.** The pipeline runs itself once a week for about a penny.

## What problem this solves

A core facility's contribution is real but hard to prove. Researchers acknowledge it
inconsistently — sometimes with a grant code, sometimes by name, sometimes by thanking a staff
member, often not at all — and a hand-maintained publications page drifts out of date and cannot
show its workings.

So this project does not ask anyone to maintain a list. It searches the literature, decides
inclusion from evidence, and **shows the evidence**: the acknowledgement sentence as published,
which source it came from, and the date it was read. Every number on the site can be traced to a
paper, and every paper to a quotation.

It also states what it misses. Of the 306 papers on UWPR's own list, the pipeline independently
confirms 215; of the rest, it distinguishes those it read and found nothing in from those it could
not read at all. A page arguing its numbers are checkable should be checkable about its limits
too.

## How it works

```
sources ──► pipeline ──► store ──► export ──► web app
(APIs, the      │       (JSON,      (2 JSON     (React,
 UWPR site)     │        committed)  files)      GitHub Pages)
                │
        channels nominate candidates;
        rules decide inclusion
```

**Channels nominate, rules decide.** Twelve channels search award metadata, full text, staff
affiliations and dataset descriptions, and propose candidate papers. Being found by a channel
means nothing on its own. Seven rules then look for actual evidence: the UWPR award code in
funding metadata or text, the resource named, an author affiliated to it, a staff member thanked
for analysis or technical help. **A paper is never included because of who wrote it.**

**Evidence is quoted, never paraphrased.** Each inclusion carries the matching sentence (up to
~300 characters), its section of the paper, the source and the retrieval date. This is why the
site can answer "why is this paper here?" for all 339.

**Nothing is ever lost.** A paper found once stays, even if a source later stops returning it. A
source outage degrades a run; it never shrinks the data. Work IDs are permanent.

**A preprint and its article are one publication.** Linked by Crossref relations, bioRxiv's
`published` field, or matching titles and authors — counted once, dated by the journal version.

The detail — every rule, every judgement call, every measurement — is in
**[docs/](docs/README.md)**.

## Running it

Needs [uv](https://docs.astral.sh/uv/) and Python 3.12. Node 24 for the web app.

```bash
uv sync --locked --all-groups          # creates .venv
```

### The pipeline

```bash
uv run uwpr-pubs explain 10.7554/elife.56582 --store store   # why a paper is, or is not, included
uv run uwpr-pubs report --store store                        # the latest run's report
uv run uwpr-pubs validate store                              # schemas + invariants; exit 1 on error
uv run uwpr-pubs export --store store --out /tmp/export      # build the app's JSON
uv run uwpr-pubs fixtures --store store                      # the known-answer test papers
uv run uwpr-pubs smoke                                       # live check each source answers (~$0.001)
```

> **`uwpr-pubs run` writes and commits to `store/`.** Work and record IDs are permanent and must
> never be renumbered. To experiment, pass `--store` a path **outside** the repository — the
> export is written beside the store, so a path inside it would overwrite the real one.

### The web app

```bash
cd web && npm ci
npm run dev                                                  # the committed 16-work sample

# or against the real data:
uv run uwpr-pubs export --store store --out /tmp/real-export
UWPR_EXPORT_DIR=/tmp/real-export npm run dev
```

The sample is worth using: it contains edge cases the real data has none of, such as a retracted
paper and a 50-author list.

### Checks

Both gates run on every push and both must pass.

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
cd web && npm run lint && npm run typecheck && npm test -- --run && npm run e2e
```

## Layout

| Path | What it is |
|---|---|
| `src/uwpr_pubs/` | The pipeline: a pure core (rules, matching, status) and a thin shell (HTTP, cache, files) |
| `store/` | The data, committed: one JSON file per publication, plus candidates, aliases, metrics and run reports |
| `export/` | The two JSON files the app reads, rebuilt by every run |
| `web/` | The single-page app: React, TypeScript, Vite, visx |
| `config/` | Rules, channels, staff and settings. Changing `rules.yaml` or `staff.yaml` re-evaluates every work |
| `schemas/` | JSON Schema for every file written, enforced before anything is saved |
| `samples/` | A small hand-built store and export, covering cases the real data lacks |
| `docs/` | The specifications — [start here](docs/README.md) |
| `RUNBOOK.md` | Operating it: runs, alerts, overrides, rollback, key rotation |

## Operating it

A GitHub Actions workflow runs the pipeline every Monday, validates the result, commits it, and
publishes the data to the site. It costs about **$0.01 a run** — around **$0.52 a year** — and
needs no attention unless it raises an alert.

A run that hits a failing source **degrades**: it reports the problem, changes nothing it cannot
verify, and carries on. Three degraded runs in a row raise an alert. If the schedule stops
entirely, the site says so on its own face once the data is more than 14 days old.

[RUNBOOK.md](RUNBOOK.md) is the operator's guide. [docs/07](docs/07-operations.md) explains why
each piece is shaped the way it is.

## Contributing and corrections

**If a publication is wrongly included or missing**, open an issue. `uwpr-pubs explain <DOI>`
gives the pipeline's own answer, and the site's lookup page gives the same answer in a browser.
Corrections are made by changing a rule — measured before and after — or, where no rule can
express the case, by an override recorded with a reason and an attribution.

## Licence and attribution

Apache-2.0 ([LICENSE](LICENSE)). Copyright Michael Riffle and the University of Washington.

The store holds short quoted excerpts from published papers as evidence, with attribution and a
link to the source. [NOTICE](NOTICE) explains this. Full text and abstracts are **never**
committed — they live in a local cache that is not in version control.

Bibliographic data, citations, topics and affiliations come from
[OpenAlex](https://openalex.org/); full text from [PubMed Central](https://pmc.ncbi.nlm.nih.gov/)
and [Europe PMC](https://europepmc.org/); version links from [Crossref](https://www.crossref.org/);
dataset descriptions from [PRIDE](https://www.ebi.ac.uk/pride/).
