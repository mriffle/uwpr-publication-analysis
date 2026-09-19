# Phase 3 — Retrieval Pipeline Specification

> **Starting point only.** Drafted ahead of discussion; nothing here has been reviewed or agreed.
> Expect it to be reworked when we reach this phase.

**Status:** Unreviewed starting point · 2026-09-19
**Purpose:** specify the code that discovers publications, gathers evidence and metadata,
updates the local store (Phase 2) and produces the app input (Phase 5). It runs **unattended on
a schedule**, so safe re-running is the main design constraint.

## 1. Requirements

1. **Idempotent.** Running twice with no upstream change produces no diff.
2. **Incremental.** A routine run asks sources only for what is new or changed.
3. **Additive.** A run may add records and evidence and advance `last_seen`; it never deletes.
4. **Fault-tolerant.** One failing source degrades the run; it does not abort or corrupt it.
5. **Polite and within budget.** Rate limits, contact headers, per-run cost ceiling.
6. **Reproducible.** Every derived fact points to a cached raw response.
7. **Reviewable.** Each run ends with a human-readable summary of what changed.

## 2. Technology

Python ≥ 3.12, packaged with `pyproject.toml`, single CLI entry point `uwpr-pubs`. Dependencies
kept small: `httpx`, `pydantic` (models and schema validation), `lxml`/`selectolax` (HTML, JATS
XML), `rapidfuzz`, `pyyaml`, `typer`. No database, no services.

## 3. Stages

Each stage is a CLI subcommand and can be run alone; `uwpr-pubs run` executes all in order.

| # | Stage | Input → output |
|---|---|---|
| 1 | `snapshot-official` | UWPR pages → saved HTML + parsed entries; diff vs previous snapshot |
| 2 | `discover` | channel queries → nominations (external IDs + channel) |
| 3 | `resolve` | nominations → records: match existing or mint new; fill IDs via OpenAlex, Crossref, Europe PMC, NCBI ID converter |
| 4 | `fetch-fulltext` | records lacking a full-text check → JATS XML / HTML / PDF text in raw cache; set `fulltext.status` |
| 5 | `extract-evidence` | structured metadata + full text → evidence rows (Phase 1 §5 matching rules) |
| 6 | `link-families` | records → families (DOI relations, bioRxiv "published as", title/author similarity, overrides) |
| 7 | `classify` | evidence + decisions → family tier and status (Phase 2 §6) |
| 8 | `enrich` | included/probable families → metrics snapshot (citations, topics, institutions, funders, OA, retraction) |
| 9 | `export` | store → `uwpr_publications.json`, validated against the Phase 5 schema |
| 10 | `report` | run manifest → review queue, change summary, audit report (Phase 4, 7) |

`validate` (store invariants + schemas) runs before stage 1 and after stage 7; a failure stops
the run before export so a bad run can never reach the app.

## 4. Sources

| Source | Used for | Access notes |
|---|---|---|
| proteomicsresource.washington.edu | Channel A | 6 pages; parser asserts entry shape and warns if any page yields zero or drops sharply |
| OpenAlex | B, C, D, F, G, H, M; primary metadata and metrics | Usage-priced since early 2026: free account key gives $1/day; lookups by ID/DOI free, filter pages $0.0001, search and full-text search pages $0.001, PDF download $0.01. A full run is estimated at under $0.10, so the free key suffices; a key is required (unauthenticated allowance observed at $0.10/day) |
| Europe PMC | C, D, E, F; full-text XML for OA subset | cursor paging; `ACK_FUND:` and `AFF:` fields |
| NCBI E-utilities / PMC | full-text XML incl. author manuscripts; PMID↔PMCID↔DOI | API key; ≤ 10 req/s with key. Europe PMC returns HTTP 500 for non-OA full text — fall back to `efetch db=pmc` |
| Crossref | B; relations (preprint↔article), updates/retractions, funder metadata | polite pool via `mailto` |
| bioRxiv / medRxiv API | L; "published as" links | |
| Unpaywall (or OpenAlex OA locations) | locate legal OA full text | |
| PRIDE / MassIVE / Panorama Public | J | later iteration |
| DataCite | datasets carrying the identifier | later iteration |

Some PMC records return XML with no `<body>` (publisher restriction): record
`fulltext.status = abstract_only` and try publisher HTML.

## 5. Channel framework

Each channel in Phase 1 §4 is a small class with one method, `nominate(since) -> Iterable[Nomination]`,
declared in `config/channels.yaml`:

```yaml
- id: C.epmc_identifier
  enabled: true
  source: europepmc
  query: '"UWPR95794" OR "UWPR 95794" OR UWPR*'
  confirm: identifier_regex        # local confirmation step required before evidence is written
  grants_tier: 1
  incremental: first_publication_date
  max_results: 2000                # safety valve; exceeding it fails the channel loudly
```

Adding or tuning a channel is a config change plus, at most, one class. Queries are deliberately
loose; precision comes from the local `confirm` step over fetched text.

## 6. Incremental strategy

- Each channel keeps a **watermark** (last successful run date) in the run manifests. Routine
  runs query with a date filter (`from_updated_date`, `FIRST_PDATE`, Crossref `from-index-date`)
  **with a 60-day overlap**, because indexing lags publication and award metadata is often
  back-filled.
- **Full mode** (`--full`) ignores watermarks. Scheduled monthly, and run automatically whenever
  `search_terms.yaml`, `staff.yaml`, `roster.yaml` or a channel definition changes (detected by
  config hash).
- **Re-checks:** records with `fulltext.status` of `abstract_only`/`unavailable` are retried
  every 90 days (embargoes lift, PMC deposits arrive). Candidate preprints are re-checked for a
  published version every run.
- **Metrics** refresh for all included/probable families on every run (one batched OpenAlex
  call per 50–100 works).

## 7. HTTP layer

One shared client: per-host rate limits, retries with exponential backoff and jitter on
429/5xx/timeouts, `User-Agent` with contact address, and a **content-addressed raw cache**
(`data/raw/`). Cache policy by request class: discovery queries — always refetch; metadata —
refetch if older than the run interval; full text — immutable once fetched successfully.
Secrets (NCBI key, OpenAlex key) come from environment variables, never from the repo.

## 8. Failure handling

| Situation | Behaviour |
|---|---|
| A source is down or rate-limits persistently | Channel marked failed in the manifest; watermark not advanced; run continues |
| Official-list parser finds a changed DOM or a sharp count drop | Stage fails loudly; previous snapshot remains authoritative; no records demoted |
| A channel suddenly returns far more or far fewer hits than its trailing average | Flagged in the report; results still stored (they are only nominations) |
| Ambiguous record match (fuzzy title) | New record minted and a "possible duplicate" item queued for review |
| Store validation fails after classify | No export; previous `uwpr_publications.json` stays live; non-zero exit |
| Budget ceiling reached | Remaining optional channels skipped and listed in the report |

Writes are atomic (temp file + rename), and the store is only rewritten at the end of a stage.

## 9. CLI

```
uwpr-pubs run [--full] [--since DATE] [--channels A,B,C] [--dry-run] [--max-cost USD]
uwpr-pubs snapshot-official | discover | resolve | fetch-fulltext | extract-evidence
uwpr-pubs link-families | classify | enrich | export | report
uwpr-pubs validate
uwpr-pubs build-app                       # inline the export into the app template → dist/index.html (Phase 6 §4)
uwpr-pubs explain <DOI|PMID|R-…|F-…>     # everything known: channels, evidence, decisions, tier
uwpr-pubs review …                        # Phase 4
uwpr-pubs audit recall|precision|overlap  # Phase 1 §8 measurements
```

`explain` is the debugging and defensibility tool: given any paper it answers "why is this in
(or out)?".

## 10. Testing

- **Unit:** normalisers, identifier regex and edit distance, proximity regex, person matcher
  (must ignore author list and references), family linker, tier derivation.
- **Fixtures:** `config/fixtures.yaml` — handoff §25 A–F, one per Phase 1 §3 failure mode, and
  known negatives (e.g. a paper that only cites Comet; same-name authors). Run offline against
  recorded HTTP responses.
- **Parser test** against saved official-list HTML, asserting today's counts (8/22/16/9/18/233).
- **Golden export:** sample store → export → schema-valid and byte-stable.
- **Live smoke test** (scheduled, not in CI): each source answers and returns the expected shape.

## 11. Open questions

1. PDF text extraction for papers with no XML/HTML: in scope for v1, or manual review only?
   Default: out of v1; such records go to the queue with `fulltext.status = unavailable`.
2. Publisher HTML scraping: which publishers tolerate it? Default: only where OA and permitted;
   otherwise rely on PMC and manual review.
3. OpenAlex cost ceiling per run. Default: $0.50, half the free daily allowance; a full run is estimated at under $0.10.
4. Should author disambiguation for staff rely on OpenAlex author IDs alone? Default: OpenAlex ID
   list per person in `staff.yaml`, hand-verified, plus ORCID.

## 12. Exit criteria

- [ ] Stage list, channel config format and CLI agreed.
- [ ] Source list and access requirements (keys, budgets) confirmed.
- [ ] Incremental/full-run policy agreed with Phase 7 cadence.
- [ ] Fixture list complete.
