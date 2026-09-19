# Phase 2 — Data Model & Local Storage Specification

**Status:** Draft 3 · 2026-09-19. Built around the eight decisions agreed on 2026-09-19 (§2). The
JSON Schemas and a validated sample store now exist (§18); awaiting final review.
**Purpose:** define how the pipeline stores what it finds between runs, precisely enough to
implement.
**Depends on:** [01-discovery-strategy.md](01-discovery-strategy.md) (frozen). This spec uses its
rules (R1–R7), inclusion bar (§2.1), record types (§1), matching and versions (§8), and the
evidence fields it hands on (§13).

---

## 1. Requirements

1. **Accumulate.** A paper, once found, is never lost, even if a source stops returning it.
2. **Record why.**
   - Each included work carries the evidence behind it: rule, source, date and excerpt.
   - Each paper that is not included carries the reason it isn't.
3. **Handle versions.** A preprint and its journal article form one work.
4. **Feed the knowledge base.** The store holds everything a knowledge-base page (Phase 4)
   needs, or points to it in the cache.
5. **Re-check without re-downloading.** When a rule changes or new text appears, the pipeline
   can reassess from what it already holds.
6. **No human review.** The only human inputs are configuration and a small overrides file.
7. **Readable changes.** Every run's effect on the data is visible as a normal diff.

**Scale (measured 2026-09-19):**
- about 1,100 candidate works, of which about 340 are included;
- growth of perhaps 30–50 included works a year;
- full text of about 110 KB per paper (105 MB for the ~950 downloaded so far).

## 2. Decisions (agreed 2026-09-19)

| # | Decision |
|---|---|
| S1 | **Plain JSON files, no database.** |
| S2 | **One file per included work.** It holds the work's versions, identifiers, authors, evidence and inclusion status, and maps one-to-one onto its knowledge-base page. Works that are not included go in one table. |
| S3 | **Works that are not included are kept, with the reason.** |
| S4 | **Full text lives in a download cache outside version control.** The store keeps only excerpts and a fingerprint of each cached file. |
| S5 | **Generated knowledge-base content** (summary, subject tags) is stored alongside the work, together with a fingerprint of its inputs. It is regenerated only when those inputs change. Its content is defined in Phase 4. |
| S6 | **Permanent work IDs,** never reused. DOIs, PMIDs and similar are aliases. |
| S7 | **An overrides file** to force a paper in or out, with a reason. It is a correction tool, not a routine step. |
| S8 | **The project is a git repository** (initialised 2026-09-19, local). Each run's changes are committed. Hosting is decided in Phase 7. |

## 3. Repository layout

```
config/                         human-maintained; changes trigger a full re-evaluation
  settings.yaml                 contact address, API budgets, search window start (2006)
  staff.yaml                    staff: name forms, OpenAlex IDs, ORCID, tenure
  channels.yaml                 channel definitions (Phase 1 §5)
  rules.yaml                    rule vocabularies: patterns, exclusion terms, disqualifiers,
                                record-type filters (Phase 1 §6, §8)
  fixtures.yaml                 positive and negative test papers (Phase 1 §12)
overrides.yaml                  forced include/exclude, merge/split (§9)
schemas/                        JSON Schemas for every file type below
store/                          machine-written, committed
  works/
    W-000123.json               one file per included work (§5)
    W-000123.generated.json     generated knowledge-base content for that work (§8)
  candidates.jsonl              one line per work not included (§6)
  aliases.json                  every external ID and retired work ID → current work ID
  official_list/
    entries.jsonl               parsed list entries with first/last seen (§7)
    pages/<YYYY-MM-DD>/*.html   raw pages, saved only when their content changes
  metrics/
    latest.jsonl                citation figures from the most recent run (§10)
    <YYYY-MM>.jsonl             the first run of each month, kept as history
  runs/<run-id>.json            one manifest per run (§11)
kb/                             generated knowledge-base pages, committed (Phase 4)
export/                         generated app input, committed (Phase 5)
cache/                          NOT committed: raw downloads and full text (§12)
```

Anything under `store/`, `kb/` and `export/` can be regenerated from `config/`,
`overrides.yaml`, the official-list snapshots and the cache. It is committed anyway, so that git
history is the audit trail.

## 4. Identifiers

- **Work ID:** `W-` plus six digits, minted sequentially the first time a work is seen, included
  or not. Minted IDs are never reused or renumbered.
  - A work keeps its ID when it moves between `works/` and `candidates.jsonl`.
  - Knowledge-base pages and app links use it.
- **Record ID:** `R-` plus six digits, minted for each version (preprint, journal article,
  repository copy). Internal only.
- **Aliases** (`aliases.json`) map to the current work ID. They cover normalised DOIs
  (lower-case, no resolver prefix), PMIDs, PMCIDs, OpenAlex IDs, PRIDE accessions, official-list
  entry keys, and retired work IDs.
- **Merges.** When two works turn out to be one, the lower ID survives and the other becomes an
  alias. A knowledge-base page under the retired ID becomes a redirect.
- **Splits** (only via `overrides.yaml`) mint a new work ID for the part that leaves.
- **Record matching** order: DOI → PMID → PMCID → OpenAlex ID → normalised title plus year ±1
  (Phase 1 §8).
- **Alias keys** in `aliases.json` carry a type prefix: `doi:`, `pmid:`, `pmcid:`, `openalex:`,
  `pride:`, `list:` (official-list entry key), and `work:` (retired work ID). Example:
  `"doi:10.1021/acs.jproteome.5c00706": "W-000006"`, `"work:W-000005": "W-000004"`.
- **Rule version** format: `YYYY-MM-DD.N`, e.g. `2026-09-19.2`. The version is set in
  `rules.yaml`, and N increases for each change made on the same day.

## 5. Included work file (`store/works/W-000123.json`)

### 5.1 Structure

The file has six parts:
- **Status:** whether the work is included, since when, and on what basis (rules or override).
- **Canonical record:** the version shown by default, i.e. the journal article if there is one,
  otherwise the latest preprint.
- **Records:** every version of the work.
- **Evidence:** every reason for inclusion, on any version.
- **Discovery:** which channels found the work, and when.
- **Housekeeping:** created and updated dates, and the rule version used.

Illustrative example (values abbreviated):

```json
{
  "schema": 1,
  "id": "W-000123",
  "aliases": [],
  "status": {"included": true, "since": "2026-09-19", "basis": "rules"},
  "canonical": "R-000321",
  "records": [
    {
      "id": "R-000321",
      "kind": "article",
      "ids": {"doi": "10.1021/acs.jproteome.5c00706", "pmid": null, "pmcid": null, "openalex": "W4…"},
      "title": "Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer",
      "published": "2026-02-06",
      "year": 2026,
      "venue": {"name": "Journal of Proteome Research", "issn_l": "1535-3893", "publisher": "ACS"},
      "authors": [
        {"name": "…", "orcid": null, "openalex": "A5…", "staff": null, "corresponding": false,
         "affiliations": [{"raw": "…", "ror": "00cvxb145", "name": "University of Washington", "country": "US"}]}
      ],
      "topics": [{"domain": "…", "field": "…", "subfield": "…", "topic": "…", "score": 0.99}],
      "oa": {"status": "hybrid", "url": "…", "license": "cc-by"},
      "retracted": false,
      "fulltext": {"status": "unavailable", "checked": "2026-09-19", "recheck_after": "2026-12-18", "cache": null},
      "abstract": {"cache": "sha256:…"},
      "version_link": null,
      "sources": {"openalex": "2026-09-19", "crossref": "2026-09-19"}
    },
    {
      "id": "R-000322",
      "kind": "preprint",
      "ids": {"doi": "10.1101/2025.07.25.666826", "openalex": "W4…"},
      "title": "Improvements to Casanovo, a deep learning de novo peptide sequencer",
      "published": "2025-07-29",
      "year": 2025,
      "version_link": {"to": "R-000321", "method": "crossref_relation"},
      "…": "…"
    }
  ],
  "evidence": [
    {
      "rule": "R2", "criterion": 2,
      "label": "UWPR award code in the publisher's funding metadata",
      "record": "R-000321",
      "source": {"name": "OpenAlex", "url": "https://api.openalex.org/works/W4…", "retrieved": "2026-09-19", "cache": "sha256:…"},
      "section": "metadata",
      "excerpt": "UWPR95794",
      "detail": {"field": "awards[].funder_award_id"},
      "rule_version": "2026-09-19",
      "first_seen": "2026-09-19", "last_seen": "2026-09-19"
    }
  ],
  "discovery": [
    {"channel": "B1", "record": "R-000321", "first_seen": "2026-09-19", "last_seen": "2026-09-19"},
    {"channel": "B1", "record": "R-000322", "first_seen": "2026-09-19", "last_seen": "2026-09-19"}
  ],
  "rule_version": "2026-09-19",
  "created": "2026-09-19",
  "updated": "2026-09-19"
}
```

### 5.2 Records

| Field | Notes |
|---|---|
| `kind` | `article`, `review`, `letter`, `data-paper`, `book-chapter` or `preprint`. Excluded types (Phase 1 §1) never become records of an included work. |
| `authors[].staff` | Staff key (`eng`, `riffle`, …) when the author is matched by verified OpenAlex ID or ORCID (Phase 1 §5.1), else `null`. |
| `authors[].affiliations` | Keep the raw string as published; the ROR ID and name come from OpenAlex. |
| `topics` | From OpenAlex, stored with the record because they change rarely. |
| `fulltext.status` | One of `pmc_xml`, `epmc_xml`, `abstract_only`, `unavailable`. Records how hard we looked, which distinguishes "no evidence" from "could not read". |
| `fulltext.recheck_after` | When to look again for readable text (Phase 3 sets the interval). |
| `abstract` | A pointer into the cache, not the text. Abstracts are often copyrighted and stay out of git; whether knowledge-base pages quote them is a Phase 4 question. |
| `version_link` | How this record was linked to its sibling: `crossref_relation`, `biorxiv_published`, `openalex_locations`, `title_author` or `override`. |
| `sources` | The date each source was last consulted for this record. |

### 5.3 Evidence

One entry per distinct reason, on any record of the work. The fields follow Phase 1 §13.

| Field | Values |
|---|---|
| `rule` | `R1`–`R7`, `R3d` (R3 applied to a dataset description), or `override` |
| `criterion` | 1 official list · 2 UWPR code as funding · 3 staff in their UWPR role · 4 facilities used. Mapping: R1→1; R2→2; R3→3 if the matched sentence names a staff member, else 4; R3d→4; R4→4; R5→3; R6→2 if the matched phrase is `UWPR95794`, else 4; R7→3. |
| `label` | Plain-language text for the knowledge base and app, taken from `rules.yaml` |
| `record` | The record the evidence was found on. `null` only for `override` evidence, which applies to the whole work. |
| `source.name` | `UWPR website`, `OpenAlex`, `Crossref`, `PMC`, `Europe PMC`, `PRIDE` or `overrides.yaml` |
| `section` | `official list`, `metadata`, `acknowledgements`, `funding`, `methods`, `main text`, `affiliation`, `author notes`, `dataset description`, `full-text index` or `override`. Located structurally (Phase 1 §6.1). |
| `excerpt` | The matching sentence, at most about 300 characters. For R1, none (see `detail`). For R6, none: the page says "phrase found in OpenAlex full-text index". |
| `detail` | Rule-specific facts. **R1:** list page, first seen, last seen. **R6:** phrase and query date. **R7:** staff key. **R3d:** dataset accession. **R2:** metadata field. |
| `rule_version` | The rule-set version that produced the entry (§13) |
| `first_seen`, `last_seen` | `last_seen` stops advancing if the source stops showing the evidence; the entry is not deleted. |
| `superseded` | Present only when a later rule version no longer produces this entry: `{"by_rule_version": …, "date": …}`. Superseded entries are inactive (§13). |

**Override evidence.** An `include` override adds an entry with `rule: "override"`,
`criterion: null`, `record: null`, `section: "override"`, source `overrides.yaml`, and the
override's reason as its label.

## 6. Works not included (`store/candidates.jsonl`)

One JSON object per line, sorted by work ID:

```json
{"id": "W-000789",
 "records": [{"id": "R-001402", "kind": "article", "ids": {"doi": "…", "pmid": "…"}, "title": "…", "year": 2019}],
 "reason": "no_rule_fired",
 "signals": ["staff_coauthor:riffle", "core_named:drc"],
 "channels": ["G", "E"],
 "fulltext": {"status": "pmc_xml", "checked": "2026-09-19", "recheck_after": null},
 "rule_version": "2026-09-19",
 "first_seen": "2026-09-19", "last_seen": "2026-09-19"}
```

- `records` may be of any type, including excluded ones (`peer-review`, `dissertation`, …).
- `reason_detail` is required when `reason` is `excluded_record_type` (it names the type).
- `former_evidence` is required when `reason` is `no_longer_meets_rules`. It holds the work's
  evidence entries, each marked `superseded`, so the page history of why the work was once
  included is not lost when its work file is removed.

`reason` is one of:
- `no_rule_fired`
- `excluded_record_type` (with the type)
- `before_window` (published before 2006)
- `override_exclude`
- `no_longer_meets_rules`: the work lost its evidence because a rule changed (§13)

`signals` lists anything suggestive that is deliberately not sufficient: a staff co-author, a
staff member thanked outside R7, an excluded core named, a UWPR tool or hardware mention. They
answer "why isn't paper X listed?" without re-running anything.

## 7. Official list (`store/official_list/`)

`entries.jsonl` has one line per list entry:

```json
{"key": "list:2025:5f1c…", "page": "2025", "title": "…", "authors_text": "…", "venue_text": "…",
 "pmid": "40446802", "links": ["https://pubmed.ncbi.nlm.nih.gov/40446802/"],
 "work": "W-000045", "first_seen": "2026-09-19", "last_seen": "2026-09-19"}
```

- **Entry key:** a hash of the year page plus the normalised title, so entries without a PMID
  still have a stable identity.
- **Removed entries:** an entry that disappears from the site keeps its line; `last_seen`
  stops advancing, and the R1 evidence records both dates (Phase 1 §6.0).
- **Raw pages:** saved under `pages/<date>/` only when a page's content hash changes. They are
  small, and they are the primary source, so they are committed.

## 8. Generated knowledge-base content (`store/works/W-000123.generated.json`)

- **Why a separate file:** it keeps regenerated text out of the work file's diffs.
- **Content:** defined in Phase 4. This spec fixes only the envelope:

```json
{"schema": 1, "work": "W-000123",
 "inputs": {"fingerprint": "sha256:…", "parts": ["canonical abstract", "full text", "evidence"]},
 "generator": {"name": "…", "version": "…", "date": "2026-09-19"},
 "content": {}}
```

- **When it is regenerated:** only when the input fingerprint or the generator version changes.
- **Knowledge-base pages** in `kb/` are rendered from the work file plus this file.

## 9. Overrides (`overrides.yaml`)

The only routine human input besides configuration. Used when someone reports a mistake.

```yaml
- target: W-000210            # or a DOI / PMID for a paper not yet in the store
  action: include             # include | exclude | merge | split
  reason: "PI confirmed samples were run at UWPR."
  by: mriffle
  date: 2026-09-20
- target: [W-000301, W-000377]
  action: merge
  reason: "Preprint and article; titles differ too much to link automatically."
  by: mriffle
  date: 2026-09-20
```

**Effects:**
- An `include` override creates evidence with `rule: "override"`, criterion `null`, and the
  reason as its label, so it is shown like any other reason.
- An `exclude` override moves the work to `candidates.jsonl` with `reason: override_exclude`.
- Overrides beat rules, except R1: a paper on the official list cannot be excluded by
  override (Phase 1 §6.0).
- A target that no longer resolves is reported by validation (§14).
- A `split` override lists the records that leave: `records: [R-000123]`.
- Dates may be written quoted or unquoted; YAML reads an unquoted date as a date object, and the
  validator treats it as the same ISO string.

## 10. Metrics (`store/metrics/`)

- **Kept apart from work files** so that weekly citation changes don't rewrite every work file.
- **One line per record** of an included work:

```json
{"work": "W-000123", "record": "R-000321", "date": "2026-09-19", "source": "OpenAlex",
 "cited_by": 4, "cites_by_year": {"2026": 4}, "fwci": 1.8, "citation_percentile": 0.91}
```

- **Files:** `latest.jsonl` is replaced every run. The first run of each month is also kept as
  `<YYYY-MM>.jsonl`, giving a citation history at small cost (about 70 KB a month).
- **Scope:** which figures the app shows, and how they are defined, belongs to Phase 5.

## 11. Run manifest (`store/runs/<run-id>.json`)

Each manifest records:
- the run ID (start time plus mode: incremental or full), start and end, code version, and the
  config and rule-set fingerprints;
- per channel: queries run, records nominated, new records, and errors;
- per rule: how many works it fired on, and how many new;
- recall on the official list (Phase 1 §11), and the fixture results;
- the changes: works added, works removed (with reasons), merges, list entries appeared or
  disappeared, and rule-version changes;
- API calls and cost per source.

## 12. Cache (`cache/`, not committed)

- **Content-addressed:** each response body is saved as `cache/blobs/ab/cd/<sha256>`.
  `cache/index.jsonl` records the URL, parameters, status, retrieval time, content type and
  hash.
- **Secrets are stripped before indexing:** the API key never appears in the cache. The contact
  address (`mriffle@uw.edu`) may appear.
- **Full text and abstracts are immutable once fetched successfully.** Search and metadata
  responses are refetched as Phase 3 specifies.
- **The store refers to cached files by hash** (`"cache": "sha256:…"`).
- **Loss is survivable:** if the cache is lost, refetching rebuilds it. Evidence excerpts already
  in the store keep inclusions explained even when text is no longer retrievable.
- **Size:** about 120 MB for the current corpus, growing a few MB a year. It must persist on
  whatever machine runs the pipeline (Phase 7).

## 13. Status, lifecycle and rule versions

**Inclusion status is recomputed every run:**

```
included = override_include
        or on_official_list                          # R1: always wins
        or (not override_exclude and any_active_evidence and passes_record_type_filter)
```

**Active evidence** is evidence produced by the current rule version. Two things can change it,
with different effects:

| Change | Effect on evidence | Effect on the work |
|---|---|---|
| A source stops showing evidence (a page changes, an API drops a field) | Kept; `last_seen` stops advancing | Stays included (requirement 1) |
| A rule changes (new `rule_version` in `rules.yaml`) | Every work is re-evaluated from the cache. Entries that the new version no longer produces are marked `superseded` and kept in the file | If a work has no active evidence left, it moves to `candidates.jsonl` with `reason: no_longer_meets_rules`, carrying its superseded entries as `former_evidence`, and the run report lists it |

**Lifecycle of a new record:**
1. Nominated by a channel.
2. Matched to an existing record or work (§4), or given a new record and work ID.
3. Text fetched, rules applied, and version links resolved.
4. Status computed.
5. If included, the work file is written; if not, the candidates line is written.
6. If two works turn out to be versions of one, they are merged (§4).

## 14. Invariants (checked before and after every run)

1. Every work ID is in exactly one place: `works/` or `candidates.jsonl`.
2. Every record belongs to exactly one work, and every external ID resolves to exactly one work.
3. Every included work has a canonical record of an included type.
4. Every included work has at least one active evidence entry, or is on the official list, or
   has an `include` override.
5. Every official-list entry maps to a work, and that work is included.
6. Every `cache` hash referenced by the store exists in the cache index (a warning, not an
   error, since the cache may be rebuilt).
7. Every override target resolves.
8. Every file validates against its schema in `schemas/`.

A failed invariant stops the run before anything is exported (Phase 3).

## 15. File conventions

- UTF-8 JSON with 2-space indentation, sorted keys, and a trailing newline.
- Arrays are sorted deterministically: records by kind then date, evidence by rule then record,
  and so on.
- Dates are ISO 8601.
- Writes are atomic (write a temporary file, then rename).
- Every file carries a `schema` version. Additive changes keep the number; breaking changes bump
  it and ship with a migration.
- Result: running twice on unchanged inputs produces no diff. Verified on the sample store: a
  rebuild from live sources was byte-identical.

## 16. Left to later phases

- **Phase 4:** the content of `generated.json` and the `kb/` pages, including whether abstracts
  may be quoted.
- **Phase 5:** which metrics are exported, and the app JSON derived from `store/`.
- **Phase 3:** refetch and recheck intervals, budgets, and the order in which stages run.
- **Phase 7:** where the repository and cache live, and whether the repository is public. Short
  evidence excerpts are quotations with attribution; a public repository is not expected to be
  a problem, but it should be confirmed then.

## 17. What building the sample taught us (2026-09-19)

Building a real sample store exposed several gaps. All are now fixed in this spec or in Phase 1.

| Finding | Fix |
|---|---|
| A work dropped by a rule change lost its history once its work file was removed | `former_evidence` on the candidates line (§6) |
| Flattened text glued headings onto sentences and started excerpts inside journal front matter | Structural sentence splitting (Phase 1 §6.1, dated change) |
| A listed paper's R3 match was a software credit ("Sequest HT search engine (…Proteomics Resource)") | `SEQUEST` and `search engine` added to the software exclusions (Phase 1 §6.3, dated change) |
| Affiliation excerpts began with footnote numbers ("3University of Washington…") | `<label>` dropped from affiliations (Phase 1 §6.1) |
| Affiliations can sit inside the author block, which text search skips | R5 searches `<aff>` elements separately |
| Hand-written YAML dates broke validation | The validator accepts quoted or unquoted dates (§9) |
| Section, source and rule vocabularies needed `main text`, `overrides.yaml` and `override` | Added to §5.3 |

## 18. Artifacts

| Path | What it is |
|---|---|
| `schemas/*.schema.json` | JSON Schemas (draft 2020-12) for every file type: work, candidate line, list entry, generated envelope, metrics line, run manifest, overrides and aliases. `common.schema.json` holds shared definitions. |
| `tools/validate_store.py` | Checks a store against the schemas and the §14 invariants, plus cross-file references. Mutation-tested: 11 deliberately broken stores, all caught for the right reason. |
| `samples/sample_works.yaml` | The sample definition: real papers and excerpts, plus synthetic scenarios marked SAMPLE |
| `samples/build_sample_store.py` | Builds `samples/store/` from live sources |
| `samples/store/`, `samples/overrides.yaml` | The sample store: 13 included works, 7 works not included, 4 official-list entries |

Commands (from the repository root, with `.venv` set up per `requirements.txt`):

```
.venv/bin/python samples/build_sample_store.py        # rebuild the sample
.venv/bin/python tools/validate_store.py samples/store # validate it
```

## 19. Exit criteria

- [ ] Reviewed and agreed.
- [x] JSON Schemas written for the work file, candidates line, list entry, generated envelope,
      metrics line, run manifest, overrides and aliases.
- [x] Sample store covering every rule, a preprint/article pair, a list-only work, a removed
      list entry, a merge and an include override, and a work that fails a rule change.
      Validates with no errors (one expected warning: no cache beside the sample).
