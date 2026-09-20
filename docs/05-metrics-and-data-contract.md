# Phase 5 — Metrics & App Data Contract Specification

**Status:** Agreed · 2026-09-20 · the input to Phase 6. Changes from here are made deliberately,
dated, and noted in this header.
**Purpose:** define the files that drive the web app, the exact meaning of every number they
carry, and what the app can honestly draw from them. These files are the **only** interface
between the pipeline and the app.
**Depends on:** [01](01-discovery-strategy.md), [01a](01a-discovery-calibration.md),
[02](02-data-model.md) and [03](03-retrieval-pipeline.md), all frozen. This spec adds nothing to
the store; it selects from it, and where it needs something the store does not hold, it says so
rather than inventing it.
**Replaces:** the unreviewed draft of 2026-09-19, which predated preprint families, the evidence
model, the four inclusion criteria and retired work IDs, and which described tiers and
incremental runs that no longer exist. It was rewritten rather than edited.

**Changes since agreement** (all 2026-09-20, found while implementing stage 11):
- *§13, where the synthetic cases live:* the sample export is built from `samples/store/` **plus
  `samples/export_cases.json`**, a committed file of synthetic works that the same `build_export`
  consumes. Audited rather than assumed: the sample store covers **nine of the twelve** cases;
  the three it cannot hold are a retracted work, a single-author work and one with more than 50
  authors (its author lists run 4 to 15). They cannot be added to `samples/store/` because it is
  rebuilt from live APIs, must rebuild byte-identically, and holds real papers with real UWPR
  evidence — inventing an acknowledgement for a real paper that has none would put a false claim
  into a committed, validated artifact. Every synthetic title says SAMPLE and every DOI uses the
  unassigned `10.0000` test prefix, both asserted by a test.
- *§12, the alias cross-check:* "every `aliases` target resolves to an exported work" was too
  narrow and failed every pipeline test. `aliases.json` maps every external identifier to its
  work whether that work is included or not, and the lookup index exists precisely so a
  **rejected** paper's DOI still gets an answer. The check is now: a target must be an exported
  work **or** a `not_included` row.
- *§4.4, the size table was understated.* Measured from the export as this spec defines it:
  **2.22 MB compact, 3.48 MB as written** (the canonical writer uses 2-space indent, which §4.1
  requires for diffability), **0.31 MB gzipped**; the lookup index is 0.36 MB, 0.06 MB gzipped.
  The original 1.08 MB / 0.15 MB came from a sizing script that omitted `affiliations_raw` and
  the work-level `institutions`, `countries` and `corresponding_authors`. The conclusion is
  unchanged — A8 still caps nothing, and 0.31 MB gzipped is well inside [06](06-web-app.md) §10's
  budget — but the numbers in that table were wrong.
- *§10, where "last read" comes from:* the records' own `sources` map cannot supply it. Measured:
  every record in the store carries `openalex` and nothing else. The method block derives
  `sources_last_read` from the **evidence** instead, whose `source.name` is already the
  human-facing name the page shows (OpenAlex, PMC, Crossref, PRIDE, the UWPR website). A source
  that produced no evidence is absent rather than guessed at.
- *§4.5 versus §5, open access:* §4.5 said "works with an open-access link" and §5 said "status
  other than `closed`". Both give 307 in today's store, but they are different definitions. §5 is
  the definitions section and wins; `summary.open_access` counts status.
- *`config/settings.yaml` gains a `resource` block* (name, short name, URL), because principle 5
  says the app carries no UWPR text of its own and every name it shows has to arrive through the
  export. The award identifier comes from `rules.yaml` and the staff list from `staff.yaml`.

**Every figure in this document was measured against the committed store on 2026-09-20**
(339 works, rule version `2026-09-20.1`). Figures move as the store grows; the definitions do
not. Where a number is quoted to justify a design decision, re-measure before changing that
decision (see [08](08-implementation.md) §5 on stale figures).

**Implemented 2026-09-20.** Stage 11 writes both files and the gate validates them. Built against
the committed store, every figure in §5 reproduced exactly — 339 works, 29,575 citations, 29,117
in the by-year window with 458 before it, median field-weighted impact 2.68, h-index 83, 307 open
access, 130 journals, 243 institutions, 34 countries, 215 research groups, 155 last authors, 306
listed and 33 beyond, 14 preprint-only, 224 works on more than one criterion, and the 91
listing-only works splitting 44 read to 47 unreadable.

---

## 1. What this phase decides, and what it does not

**This phase decides:** the export files, every field in them, the definition of every metric, and
which visualizations the data can support honestly.

**Phase 6 decides:** layout, typography, colour, interaction detail, and which charts appear on
first paint.

The split matters because the app is *one fixed template driven by a file*
([00](00-project-phases.md), principle 5). If a chart needs a number the contract does not carry,
that is a Phase 5 change, not a Phase 6 workaround.

### 1.1 Principles

1. **Rows, not totals.** The file carries one entry per work, with every dimension the app
   filters or groups by. All aggregates are computed in the browser, so every filter updates
   every figure and every chart. Nothing is pre-aggregated that can be derived from rows.
2. **A summary block as a cross-check, not a source.** The pipeline computes the headline totals
   independently and writes them; an app test asserts the app's unfiltered figures equal them. A
   mismatch is a bug in one of the two, and the test says which.
3. **Every number carries its definition and its date.** A figure the reader cannot pin down is
   not worth showing.
4. **Provenance travels with the claim.** Each publication carries the evidence for why it counts,
   with the source, the retrieval date and the quoted sentence. This is the project's second
   principle and the reason the app exists in the form it does.
5. **Nothing UWPR-specific in the app.** The resource's name, identifier, links and explanatory
   text come from the file. The same template would serve another facility.
6. **Objective register.** See §11. The page reports; it does not promote.

## 2. Decisions

Agreed 2026-09-20, from the Phase 5 discussion. Each is recorded with the measurement that
informed it.

| # | Decision |
|---|---|
| A1 | **Headline figures are publications, year span, total citations, research groups and journals.** Field-weighted citation impact is shown as a single sentence using the **median**. The OpenAlex citation percentile is **not** a headline figure; it appears on a publication's own detail. |
| A2 | **A publication's year is the publication date of its canonical record** — the journal article where one exists, the preprint where none does. Both dates are exported so the definition is checkable. |
| A3 | **The recall limit is stated on a linked "How this was assembled" page, not as a banner.** It is given as numbers, distinguishing papers read with no trace found from papers that could not be read. |
| A4 | **Rejected candidates are not browsable.** They are exported as a lookup index answering "why is paper X not here?" on request. The file is public and this is a choice about what the app claims, not a way of withholding data. |
| A5 | **Works absent from UWPR's own list are shown as ordinary publications.** The count appears on the method page. The per-paper report stays an operations artifact. |
| A6 | **No UW branding** (D8, answered 2026-09-20). Clean and modern, visually neutral. The resource is named and linked. |
| A7 | **Funders and grants are not exported.** The store does not hold them (§3.1). |
| A8 | **Author and evidence lists are not capped.** Measured: the full export is 1.08 MB, 0.15 MB gzipped (§4.4). Capping saves nothing and hides the evidence the project exists to show. |

### 2.1 Why the year is the article's date (A2)

Measured: **38 of 339 works hold more than one version**, and only **19** have a different year
depending on which version is counted — 18 differ by one year, one by two. It is a 5.6% question,
but it visibly moves single years: 2024 reads 17 or 22, 2025 reads 26 or 22.

The article's date wins because it is what every bibliography, CV and DOI resolution says, and
because it agrees with UWPR's own publications page. A page substantiating UWPR's record should
not disagree with UWPR's own list about which year a paper belongs to. Works that exist only as
preprints — **14 of 339** — are dated by the preprint and labelled as preprints, so nothing is
lost or counted twice.

`first_version_date` is exported alongside, so a future "by first appearance" view costs no
pipeline work and the definition can be audited.

### 2.2 Why the citation percentile is not a headline (A1)

Measured: the **median work sits at the 90.1st percentile**, and **162 of the 323 works that have
a percentile are at or above the 90th**. Both are true, and both are artifacts of OpenAlex
computing the percentile against a denominator that includes a very large tail of never-cited
records. Half a corpus in "the top 10%" invites a knowledgeable reader to discount everything
else on the page, and misleads a reader who does not know how the figure is built.

Field-weighted citation impact has the same normalising intent and behaves sensibly here, so it
carries the quality claim instead: **median 2.68** over the 323 works that have one. The mean is
6.29 and is not used — one work sits at 345 and drags it.

## 3. What the store holds, and what it does not

### 3.1 Not available, and why it matters

**Funder and grant data is not in the store.** The record schema holds fifteen keys and none of
them names a funder. The retired draft proposed a "supporting grants" figure — the research
programmes that depended on the resource — which is a genuinely strong argument for a core
facility and is exactly what a renewal application wants. It cannot be built without adding a
field to a frozen schema and re-fetching every record.

**Decided: out of scope for v1, and recorded as a deliberate omission rather than an oversight.**
If it is wanted, it is a Phase 2 schema change plus a Phase 3 fetch change, and it should be
costed as such.

### 3.2 Two data defects the export will expose

Both were found while preparing this spec. Neither is a Phase 5 problem, but the app is what makes
them visible, so they are recorded here and belong to the pipeline.

| Defect | Detail | Fix |
|---|---|---|
| A title that is a filename | `W-000746` is stored as `1_manuscript_2020-04-14.pdf`, a ChemRxiv preprint. Phase 1 §8 anticipated this ("take the title from Crossref or the preprint server instead") but it is not happening for this record. One of ~390 records. | Pipeline. The export must not paper over it: a placeholder would hide a real gap. |
| An undecoded XML entity in an excerpt | `W-000205` stores `University of Washington&apos;s Proteomics Resource (UWPR95794).` on two evidence entries. | Text extraction. **Needs a rule-version bump to land cleanly:** an evidence entry's identity is partly a hash of its excerpt, so changing the excerpt creates a new entry while the old one — not reproduced, but not superseded under the same rule version — is kept, leaving duplicates. A version bump supersedes the old entry properly. This is also the cold-cache rule-change run that [03](03-retrieval-pipeline.md) §13 still has as an estimate, so the two can be done together. |

### 3.3 Coverage of the fields the app depends on

Measured over the 339 canonical records:

| Field | Coverage | Consequence for the app |
|---|---|---|
| Title, venue, year, publication date | 339/339 | No empty states needed |
| DOI | 339/339 | Every publication links out |
| Authors | 339/339, 3,062 author slots, median 8 per work, max 82 | No cap needed (§4.4) |
| Author OpenAlex ID | 3,014 of 3,062 (98%) | Author identity is keyed by ID, not name |
| Author ORCID | 2,359 of 3,062 (77%) | Shown where present, never required |
| Affiliation with a ROR ID | 4,009 of 4,907 strings | "Distinct institutions" is a **floor**, and must be labelled as one |
| Topics | 339/339, three per record for 333 of them | Research-area views need no "unclassified" bucket |
| Open-access link | 307 of 339 | 32 works link only to the publisher |
| Citations | 339/339 have a metrics line | No gaps in any citation chart |
| Field-weighted impact, percentile | 323 of 339 | 16 works show neither; usually too recent |
| Retracted | 0 of 339 flagged | The flag is exported and the app handles it; nothing exercises it today |
| Corresponding author marked | 283 of 339 works | The "research groups" figure is a proxy (§5) |

**One presentation wrinkle, as [08](08-implementation.md) §3.3 warned.** OpenAlex returns the same
affiliation twice for one author with only punctuation differing — measured, **301 such pairs**.
The store keeps what the source published. **The export collapses them** (§4.2), because the
alternative is every app doing it again and some of them forgetting.

## 4. The export

### 4.1 Files

```
export/
  uwpr_publications.json     the works, the summary and the method block  (§4.2–4.5)
  lookup_index.json          identifier → outcome, for "why is paper X not here?"  (§8)
```

Two files rather than one, because the lookup index serves a question asked occasionally and
should not be in the way of the first chart drawing. Written by pipeline stage 11, into the
staging directory, and moved into place by stage 13 like every other output
([03](03-retrieval-pipeline.md) §5). They are committed, so the export's history is a normal diff.

Both are deterministic: keys sorted, two-space indent, trailing newline, arrays in a total order
with explicit tie-breakers, exactly as the store is written ([02](02-data-model.md) §15). Two runs
on unchanged sources produce no diff in `export/`.

### 4.2 Top-level structure

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-20T17:07:00Z",
  "run_id": "2026-09-20T17-07-live",
  "pipeline_version": "0.1.0",
  "rule_version": "2026-09-20.1",
  "resource": {
    "name": "University of Washington Proteomics Resource",
    "short_name": "UWPR",
    "url": "https://proteomicsresource.washington.edu/",
    "identifier": "UWPR95794",
    "staff": [{"id": "eng", "name": "Jimmy K. Eng"}]
  },
  "sources": {
    "citations": {"name": "OpenAlex", "as_of": "2026-09-20"},
    "notes": ["Citation counts come from OpenAlex and differ from Google Scholar or Web of Science."]
  },
  "period": {
    "first_year": 2008,
    "last_year": 2026,
    "complete_through": 2025,
    "current_year_partial": true,
    "citation_years_from": 2012,
    "citations_before_window": 458
  },
  "summary": {},
  "method": {},
  "works": []
}
```

**`period` exists because of a measured trap.** The store's most recent year is incomplete: 2026
holds 13 works against 2025's 26, and received 1,949 citations against 2025's 2,937. Drawn without
a flag, **every time-series chart shows a sharp decline in the current year that is an artifact of
the calendar**. The app must mark the current year as partial in every chart that includes it.
This is a requirement, not a suggestion.

`citation_years_from` and `citations_before_window` exist for the same reason at the other end:
OpenAlex reports citations received by year only from **2012**, while the publications start in
**2008**. **458 citations predate the window.** A citations-per-year chart cannot start where the
publications chart starts, and the difference must be stated rather than left as an apparent
discrepancy between two charts on the same page.

**Nothing is recorded for 2006 or 2007.** The search window opens in 2006 and the earliest work is
2008 — Phase 1 §9 explains why (the identifier was not in use, and full-text coverage of that era
is thin). The app either starts its axis at 2008 or marks the two years explicitly; it must not
imply the resource did not exist.

### 4.3 The work entry

One entry per work. The entry describes the canonical record; other versions appear in `versions`.

```json
{
  "id": "W-000457",
  "aliases": ["W-000735"],
  "title": "Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer",
  "year": 2025,
  "date": "2025-11-14",
  "first_version_date": "2025-07-29",
  "kind": "article",
  "is_preprint": false,
  "venue": {"name": "Journal of Proteome Research", "issn_l": "1535-3893"},
  "ids": {"doi": "10.1021/acs.jproteome.5c00706", "pmid": "…", "pmcid": "…", "openalex": "W…"},
  "url": "https://doi.org/10.1021/acs.jproteome.5c00706",
  "oa": {"status": "hybrid", "url": "https://…", "license": "cc-by"},
  "retracted": false,

  "authors": [
    {"name": "…", "openalex": "A5…", "orcid": "0000-…", "staff": null, "corresponding": false,
     "institutions": [{"ror": "00cvxb145", "name": "University of Washington", "country": "US"}],
     "affiliations_raw": ["Department of Genome Sciences, University of Washington, Seattle, USA"]}
  ],
  "author_count": 9,
  "staff_authors": ["riffle"],
  "institutions": [{"ror": "00cvxb145", "name": "University of Washington", "country": "US"}],
  "countries": ["US"],
  "corresponding_authors": [{"name": "…", "openalex": "A5…"}],

  "topics": [
    {"domain": "Physical Sciences", "field": "Chemistry", "subfield": "Spectroscopy",
     "topic": "Advanced Proteomics Techniques and Applications", "score": 0.99, "primary": true}
  ],

  "citations": {"total": 4, "by_year": {"2026": 4}, "fwci": 1.8, "percentile": 0.91,
                "as_of": "2026-09-20"},

  "on_official_list": false,
  "criteria": [2],
  "evidence": [
    {"rule": "R2", "criterion": 2,
     "label": "UWPR award code in the publisher's funding metadata",
     "section": "metadata", "excerpt": "UWPR95794",
     "found_on": {"kind": "article", "doi": "10.1021/…"},
     "source": {"name": "OpenAlex", "url": "https://api.openalex.org/works/W…",
                "retrieved": "2026-09-20"},
     "detail": {"field": "awards[].funder_award_id"},
     "first_seen": "2026-09-20", "last_seen": "2026-09-20"}
  ],

  "versions": [{"kind": "preprint", "doi": "10.1101/2025.07.25.666826",
                "date": "2025-07-29", "year": 2025, "url": "https://doi.org/10.1101/…"}]
}
```

Notes on fields that are not a straight copy from the store:

| Field | Derivation |
|---|---|
| `aliases` | Retired work IDs that merged into this one, so an old permalink still opens. **37 works have at least one.** |
| `is_preprint` | True when the work has no journal version. **14 of 339.** Phase 1 §1 requires the label wherever such a work is displayed. |
| `authors[].institutions` | The author's affiliations, **deduplicated** on a normalised form of the raw string and restricted to those with a ROR ID. |
| `authors[].affiliations_raw` | The strings as published, deduplicated the same way. Kept because the raw string is sometimes the only place the resource is named, which is how one of the rules works. |
| `institutions`, `countries` | Work-level unions of the author lists, so an institution chart does not re-walk every author. Counted **once per work**, never once per author. |
| `topics[].primary` | True for the record's first topic. The others are exported because they make a research-area view denser (§7.5). |
| `criteria` | The distinct inclusion criteria satisfied, from the evidence. A work may satisfy several: **224 of 339 do.** |
| `evidence[].found_on` | Which version carried the evidence. Evidence found on a preprint applies to the whole work (Phase 1 §8), and the app should be able to say so. |
| `evidence[]` | Active entries only. Superseded entries stay in the store and are not exported; the store is the audit trail. **0 works currently carry a superseded entry.** |

**Excluded from the export on purpose:** abstracts (D11 — never quoted, copyrighted, and kept out
of the repository); cache hashes and full-text status (internal); discovery channels (internal —
how a paper was *found* is not why it is *included*, and conflating them is the mistake Phase 1 §2
exists to prevent).

### 4.4 Size

Measured over the real 339 works:

Re-measured 2026-09-20 from the export as built, replacing an earlier estimate that omitted
`affiliations_raw` and the work-level institution, country and corresponding-author lists:

| Variant | Size | Per work |
|---|---:|---:|
| **As written: 2-space indent, sorted keys** (§4.1) | **3.48 MB** | 10,265 B |
| Compact, no indent | 2.22 MB | 6,549 B |
| **gzipped, as written** (GitHub Pages serves compressed) | **0.31 MB** | — |
| Lookup index, all 455 candidates | 0.36 MB (0.06 MB gzipped) | — |

Growth is 30–50 works a year ([02](02-data-model.md) §1), so about 0.4 MB a year as written and
roughly 0.03 MB gzipped. **This is why A8 caps nothing:** what matters is the compressed transfer,
0.31 MB today against [06](06-web-app.md) §10's budget, and capping authors and evidence would buy
a fraction of that in exchange for an app that can show less than it can prove.

### 4.5 The `summary` block

Pre-computed, independently, over all works with no filter applied: publications, first and last
year, total citations, citations in the by-year window, median and mean field-weighted impact,
corpus h-index, works with an open-access link, distinct journals, distinct institutions, distinct
countries, distinct corresponding authors, works on the official list, works not on it, and
preprint-only works.

It is used for three things: the cross-check in §1.2, link previews, and any plain-text report.
**It is never the source for anything the app displays that a filter can change.**

## 5. Metric definitions

Every definition below is exact, and the value measured on 2026-09-20 is given so a reader can
check the app against this document.

| Metric | Definition | Measured |
|---|---|---:|
| **Publications** | Count of works. A preprint and its journal article count once. | **339** |
| **Year span** | First and last publication year of a canonical record. | **2008–2026** |
| **Year of a work** | Publication date of the canonical record (§2.1). | — |
| **Citations of a work** | OpenAlex `cited_by` of the **canonical record only**. | — |
| **Total citations** | Sum over works. | **29,575** |
| **Citations received in year Y** | Sum of each work's citations received in Y. Available from **2012**; 458 earlier citations are outside the window and are reported as a single figure. | 29,117 in window |
| **Field-weighted citation impact** | OpenAlex FWCI: citations against the average for the same field, year and type. 1.0 is average. **Reported as the median** over works that have one (323 of 339). | **median 2.68** |
| **Citation percentile** | OpenAlex percentile within field and year. **Detail view only** (§2.2). | median 0.901 |
| **Corpus h-index** | Largest *h* with *h* works cited at least *h* times. Secondary, not a headline (it largely measures corpus size and age). | **83** |
| **Open-access share** | Works whose canonical record has an open-access status other than `closed`, over all works. | **307 of 339 (91%)** |
| **Distinct journals** | Distinct venues, keyed by ISSN-L where present, else by name. Preprint servers are venues and are counted as such. | **130** |
| **Distinct institutions** | Distinct ROR IDs across all authors of all works. **A floor, and labelled as one:** 898 of 4,907 affiliation strings carry no ROR ID. | **243** |
| **Distinct countries** | Distinct countries across ROR-resolved affiliations. Same floor caveat. | **34** |
| **Research groups** | Distinct corresponding authors, by OpenAlex ID. **A proxy, and labelled as one:** 283 of 339 works mark a corresponding author, and a group may publish under several. Distinct last authors (155) is exported as a second view. | **215** |
| **Works with a staff author** | Works with at least one author identified as UWPR staff. Reported on the method page, never as evidence — staff co-authorship alone never includes a paper (D2). | **104** |
| **On the official list** | Works whose evidence includes the site listing. | **306** |
| **Found beyond the official list** | Works included on evidence but absent from UWPR's own list. | **33** |
| **Preprint-only** | Works with no journal version yet. | **14** |

### 5.1 One claim the app must not make

The defensible statement is that **these publications record use of the resource, and they were
cited this many times**. The app must not state or imply that the resource *caused* the citations.
The distinction is not pedantry: the first is a fact the evidence supports, the second is a causal
claim nothing here tests, and a reader who spots the overreach will discount the rest.

## 6. Publication detail

What a click on a publication shows. Every element is already in the store; nothing is generated,
summarised or paraphrased (D11).

1. **Identity:** title, authors, venue, publication date, kind. A preprint-only work is labelled a
   preprint here and everywhere else.
2. **Links:** DOI, PubMed and PubMed Central where present, and the open-access copy where one
   exists (307 of 339).
3. **Authors and affiliations:** every author, in published order; the institution as resolved,
   the raw affiliation string on demand, an ORCID where known (77%), and a marker for UWPR staff.
   Duplicate affiliations are collapsed (§4.2).
4. **Research areas:** the OpenAlex topics as reported, at all four levels, primary first (D12).
   No vocabulary of our own.
5. **Citations:** total, the by-year series, field-weighted impact and percentile where present,
   each labelled with its source and date.
6. **Why this is a UWPR publication:** every active evidence entry — the plain-language label, the
   section of the paper, the quoted sentence, the source with its URL, and the retrieval date.
   Where the evidence was found on a different version than the one displayed, it says so.
7. **Other versions:** the preprint or article that is not canonical, with its own date and link.
8. **Retraction:** a prominent flag if set. None are currently flagged; the app must still handle
   it, because the flag is refreshed every run and can become true at any time.

**Three evidence cases need specific wording,** because a generic template produces something
false:

| Case | What it must say |
|---|---|
| The listing itself | "Listed on UWPR's publications page", with the page and the first and last dates it was seen. **There is no excerpt** and the app must not leave an empty quotation. **91 works have this as their only evidence.** |
| A full-text index match | "This phrase was found in OpenAlex's full-text index of this paper", with the phrase and the query date. **There is no excerpt**, because we could not read the text ourselves. **49 works carry one.** |
| An override | The reason recorded by the person who made the decision, attributed to them and dated. It is a judgement, not a measurement, and should read as one. |

## 7. Visualizations

Each entry states what the chart shows, what it needs from the contract, what the data measured
today can actually support, and any honesty constraint. **Every chart recomputes under every
filter** (§9) — none of them reads the summary block.

The measurements matter here: two of these would have been specified wrongly without them.

### 7.1 Publications per year

Bar, one per year, 2008–2026. Needs `year`. Range 6–33 a year, median 17.
**Constraint:** the current year is partial (§4.2) and must be marked distinctly — it currently
shows 13 against the previous year's 26.

### 7.2 Cumulative publications

Area or line, 2008 to now. Needs `year`. Runs 6 → 339, a smooth accumulating curve.
This is the clearest single picture of the record growing over time, and it is immune to the
per-year noise that a 339-work corpus produces.

### 7.3 Citations received per year

Bar or area. Needs `citations.by_year`. Measured: 469 in 2012 rising to roughly 3,000 a year from
2020 onward.
**Two constraints, both measured.** The series cannot begin before **2012**, four years after the
publications begin, and **458 citations fall outside it** — the chart must say so rather than let
a reader reconcile it against §7.1 themselves. The current year (1,949 so far against 2,937) must
be marked partial.

### 7.4 Cumulative citations

Area. Needs `citations.by_year`. Runs 469 → 29,117 over 2012–2026.

### 7.5 Research areas over time

Stacked area or stacked bar. Needs `topics`, `year`.

**This is the chart the measurements changed.** At the natural granularity — one year, all 15
fields — the matrix is 285 cells of which only **103 are non-zero**, and the largest is 14. A
15-series stacked area over that is noise presented as a trend.

What the data does support, and what is specified:

- **Group at the field level, the top five by volume plus "Other".** By primary topic the five are
  Chemistry (99 works), Biochemistry/Genetics/Molecular Biology (93), Medicine (72), Environmental
  Science (23) and Immunology and Microbiology (20). The app picks the five from the data rather
  than from this list, since the ranking moves as the corpus grows.
- **Bucket years in threes** by default, with single years available. Buckets take the typical
  cell from about 3 works to about 9, which is enough for the shape to mean something.
- **Count all of a work's topics, not only the primary one.** Measured: this raises non-zero cells
  from 103 to 158. A work then contributes to several areas, and the axis is labelled "topic
  assignments", not "publications", because the total exceeds the number of works.

There is a real pattern underneath: Chemistry is concentrated in the early 2010s, Medicine grows
from 2010, and Environmental Science appears from 2013 and clusters after 2019. Bucketed at the
field level that is visible; at full granularity it is not.

### 7.6 Research areas overall

Treemap or horizontal bar at the **subfield** level, which is the level dense enough to be
informative: 46 distinct values, led by Spectroscopy (97 works) and Molecular Biology (72).
Needs `topics`. The 126 distinct primary topics are too many to chart and belong in the filter and
on the detail view.

### 7.7 Researchers appearing most often

Horizontal bar. Needs `authors[].openalex`, `authors[].name`, `authors[].staff`.

Measured: **1,684 distinct authors**, of whom **89 appear on 5 or more works** and **29 on 10 or
more**. Author identity is keyed by OpenAlex ID, not name — 98% of author slots carry one, and
measured, no author's name varies across papers, so the two agree today; keying by ID keeps that
true when it stops being true.

**Default to non-staff researchers, and mark staff distinctly where shown.** A staff member on 60
papers and an external investigator on 37 are different facts — the first describes staff
contribution, the second describes sustained use of the facility — and a single undifferentiated
ranking conflates them. Top non-staff: 37, 36, 35, 32, 30, 30, 25 works.

### 7.8 Institutions

Horizontal bar, **excluding the University of Washington**, which appears on 316 of 339 works and
would flatten the chart to one bar and a fringe. Needs work-level `institutions`.
Measured: 243 institutions in all; **excluding the University of Washington, 51 appear on three or
more works and 19 on five or more**, led by the Institute for Systems Biology (26) and the Howard
Hughes Medical Institute (18). The tail is long and thin, so the chart shows the top 15 and states
how many institutions are not shown.

### 7.9 Journals

Horizontal bar. Needs `venue`. Measured: 130 distinct, **27 with three or more works**, led by the
Journal of Proteome Research (50). Preprint servers appear here and are labelled as such — bioRxiv
is currently among the most frequent venues with 12, which is a fact about how the corpus is built
and should not be hidden.

### 7.10 Most cited publications

Ranked list or lollipop, top 10–20, each row linking to its detail. Needs `citations.total`,
`title`, `year`. Measured range 1,650 down to 628 in the top ten.

### 7.11 Citation distribution

Histogram, **logarithmic** on the citation axis. Needs `citations.total`. Measured: median 35,
maximum 1,650, and **17 works with no citations yet**. A linear axis renders this as one bar at
zero and a hundred-fold empty span; the log axis is a requirement, and the zero-citation works
need their own bucket since a log axis has no zero.

### 7.12 Open access over time

Stacked bar or share line. Needs `oa.status`, `year`. Measured: 91% overall, rising from about
two-thirds in the early years to consistently above 85%.
**Constraint:** the early years have 6 to 15 works each, so a percentage from 2008 is one paper
either way. Show counts alongside the share, or bucket the early years.

### 7.13 How each publication is known

Horizontal bar, **not a pie**. Needs `criteria`. Measured: listed by UWPR 306, UWPR code as
funding 190, facilities used 185, staff in a UWPR role 67.
**These overlap by design — 224 of 339 works satisfy more than one** — so the bars sum to more
than 339 and the chart must say so. A pie chart would assert a partition that does not exist.
This belongs on the method page (§10), where it is the clearest single statement of how the corpus
was assembled.

### 7.14 Geography

Measured: 34 countries, but the United States appears on 322 of 339 works. **A choropleth is not
recommended for v1** — it would be one saturated country and a scattering, which conveys less than
a sentence does.

What the data supports: the count of works with an author outside the United States — **82 of
339** — and a short bar of the most frequent non-US countries (China 16, United Kingdom 16,
Canada 10, Germany 7, Netherlands 7).

### 7.15 Charts deliberately not specified

| Chart | Why not |
|---|---|
| Co-authorship network graph | The data supports it (1,684 authors, 3,062 slots), but a hairball is a poor first-paint object and the useful version needs interaction design that belongs to Phase 6. Revisit once the rest works. |
| Anything derived from funders or grants | Not stored (§3.1). |
| Citation percentile as a corpus figure | §2.2. |
| A single "impact score" | No defensible definition, and it would obscure the figures it combines. |

## 8. The lookup index

Answers "why is paper X not here?" on demand — the web form of `uwpr-pubs explain`. It is not a
browsable list (A4).

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-20T17:07:00Z",
  "aliases": {"doi:10.1021/…": "W-000457", "pmid:…": "W-000457", "work:W-000735": "W-000457"},
  "not_included": [
    {"id": "W-000789", "title": "…", "year": 2019,
     "ids": {"doi": "…", "pmid": "…"},
     "reason": "no_rule_fired",
     "reason_label": "No evidence of UWPR support was found in this paper",
     "signals": ["staff_coauthor:riffle"],
     "signal_labels": ["A UWPR staff member is a co-author, which on its own is not evidence"]}
  ]
}
```

- **`aliases`** resolves any identifier — including a **retired work ID**, of which 37 exist — to
  the current work, so every permalink the app has ever issued keeps working.
- **`not_included`** carries all 455 candidates: 341 where no rule fired, 85 of an excluded record
  type, 28 published before the 2006 window, and 1 excluded by override.
- **`signal_labels`** matters more than it looks. A signal is a near-miss the rules deliberately
  do not count, and the plain-language label is what turns a rejection into an explanation. Of the
  341 where no rule fired, **136 carry a signal** — 100 of them a staff co-author — and **205 carry
  none at all**.
- **Three outcomes**, and the app must distinguish them: included; considered and not included,
  with the reason; and not found at all, which means no channel ever nominated it and says nothing
  about the paper.

**The file is public and complete.** Anyone who fetches it can read every candidate line. Showing
it only on lookup is a decision about what the page asserts, not a way of keeping data back, and
the spec says so rather than implying a privacy property the file does not have. Measured at
0.10 MB, so it costs nothing to ship and is loaded on demand.

**Why there is no browsable rejection list.** Measured, 205 of the 341 have no suggestive signal
whatsoever, and the pool includes a Spanish constitutional-law article, a Canadian literature
paper and a ctenophore taxonomy note — channel noise working exactly as designed
([08](08-implementation.md) §5). A visitor skimming that list concludes the method is sloppy, and
publishing it also puts UWPR in the position of having publicly declined other people's papers.

## 9. Filtering

Every filter recomputes every figure and every chart, from the rows. The dimensions:

| Filter | Source field | Range measured |
|---|---|---|
| Year | `year` | 2008–2026 |
| Research area | `topics` (domain, field, subfield, topic) | 4 / 15 / 46 / 126 values |
| Journal | `venue` | 130 values |
| Institution | `institutions` | 243 values |
| Country | `countries` | 34 values |
| Author | `authors[].openalex` | 1,684 values |
| Open access | `oa.status` | 6 values |
| Kind | `kind`, `is_preprint` | article 323, preprint 14, data paper 2 |
| How it is known | `criteria` | 4 values, overlapping |
| On UWPR's list | `on_official_list` | 306 / 33 |

**Clicking a chart element applies the corresponding filter** — a bar for 2019, a band for
Environmental Science, an institution's row. This is the main reason the contract carries every
dimension on every row rather than pre-aggregating.

**The active filter is always stated in words, with the resulting count**, and every figure on
screen is understood to be under it. A filtered figure that looks like a total is the easiest way
for an honest page to mislead.

## 10. The method page

A linked page, not a banner (A3). It carries, in plain numbers:

- **How the corpus is assembled:** the four ways a publication qualifies, with the chart of §7.13
  and the note that they overlap.
- **What is independently confirmed.** Of the **306 works on UWPR's own list, 215 carry evidence
  the pipeline found for itself**. The remaining **91 split into 44 whose full text we read and
  found no trace in, and 47 we could not read at all.** That distinction is the point: one is a
  gap in the paper's acknowledgements, the other is a gap in open-access publishing, and only one
  of them is about UWPR.
- **What the pipeline adds:** **33 works are included on evidence and are not on UWPR's own
  publications page** (A5). The individual papers are shown as ordinary publications throughout
  the app; this page carries the count.
- **What is known to be missed:** publications that used the resource but record no trace of it
  anywhere we can read. Phase 1 §10 measures and accepts this; the page states it in the same
  terms.
- **Where the numbers come from:** OpenAlex for citations, topics and affiliations; PubMed Central
  and Europe PMC for full text; Crossref for version links; UWPR's own publications pages. Each
  with the date it was last read.
- **How current it is:** the run date, and the weekly schedule.

**The register here is the same as everywhere else** (§11). The honest version of a limitation is
more convincing than a defensive one, and the audience for this page — a reader asking how the
numbers were produced — is the audience most likely to notice the difference.

## 11. Writing rules

These apply to every string the app displays and to the explanatory text in the contract.

1. **No promotional register.** No superlatives, no "world-class", "cutting-edge", "leading",
   "impressive", "remarkable". The numbers are the argument; adjectives weaken them by suggesting
   they need help.
2. **No causal claims** from support to outcome (§5.1).
3. **Every figure carries its definition and its date**, or links to §5.
4. **A proxy says it is a proxy.** "Research groups" is distinct corresponding authors.
   "Institutions" is a floor. Both are useful; neither is what it would be if the underlying data
   were complete, and the label says so.
5. **A partial period is marked** wherever it appears (§4.2).
6. **Evidence is quoted, never paraphrased.** The excerpt is the sentence as published, with its
   source and date. Paraphrasing evidence is the one thing this project decided not to do
   ([00](00-project-phases.md), "Why Phase 4 was retired").
7. **Plain language before jargon.** Say what a thing is, then name it — "the paper names the
   resource in its acknowledgements" before any rule identifier. Rule identifiers may appear in
   the detail view as provenance; they are never the primary label.

## 12. Schema, versioning and validation

- JSON Schema (draft 2020-12) at `schemas/export.schema.json` and
  `schemas/lookup-index.schema.json`, registered like every other schema and reachable under
  `https://uwpr-pubs.local/schemas/` ([02](02-data-model.md) §18).
- **Stage 11 validates before writing.** A file that does not validate stops the run at the gate,
  exactly as a bad store does. The export is part of the staged write, so a failed export leaves
  the previous one in place.
- **The app checks `schema_version` on load** and refuses a major version it does not know, with a
  message naming the version it found and the one it expects. Additive changes bump the minor
  version; renames and removals bump the major version.
- **Cross-checks, run by the validator:** every `aliases` target resolves to an exported work
  **or to a `not_included` row** (corrected 2026-09-20 — aliases cover every work, included or
  not, and the lookup index is how a rejected paper's identifier still gets an answer); every
  work's `criteria` matches its evidence; the `summary` block equals a recomputation from the
  rows; `period.complete_through` is the year before the run's year; every exported work is
  included in the store; no exported work carries a superseded evidence entry.

## 13. The sample export

A committed sample drives app development and tests without the real store: `samples/export/`,
built by the same `build_export` that writes the real one, from `samples/store/` **plus
`samples/export_cases.json`**. It is regenerated with

```
uv run uwpr-pubs export --store samples/store --out samples/export --cases samples/export_cases.json
```

which refuses to write if any case below is missing, and a test asserts the committed sample
still matches a fresh build.

It must cover, because each of these is a case the app gets wrong if it never sees one: a
preprint-only work; a merged preprint-and-article pair; a work whose only evidence is the site
listing, with no excerpt; a full-text-index match, with no excerpt; an override with its
attribution; a work with no open-access link; a work with no field-weighted impact; a retracted
work; a work with a single author; a work with more than 50; an author with no ROR-resolved
affiliation; and a retired work ID in `aliases`. Each is a predicate in `uwpr_pubs.sample`, so
"it must cover" is checked rather than promised.

**Nine of the twelve come from `samples/store/`** (audited 2026-09-20). The three that cannot are
a retracted work, a single-author work, and one with more than 50 authors — the sample store's
author lists run 4 to 15, and **the real store contains no retracted work at all** (0 of 339). An
app that has never rendered a retraction flag will render it wrongly the first time a real one
appears, and citation metadata refreshes every run, so that can happen any week.

**Why they are a separate file rather than more sample works.** `samples/store/` is rebuilt from
live APIs by `samples/build_sample_store.py`, must rebuild byte-identically, and holds *real*
papers with *real* UWPR evidence. Adding a retracted paper to it would mean inventing a UWPR
acknowledgement for a paper that does not have one, inside a committed and validated artifact —
which is the one thing this project's traceability principle exists to prevent. The synthetic
works instead live in their own file, validate against `work.schema.json` like any other, carry
`SAMPLE` in every title and the unassigned `10.0000` test DOI prefix, and are merged with the
sample store's works before the one export function sees them. The export code has a single path;
only its input is a union.

## 14. Open items

1. **Two pipeline defects** (§3.2) are recorded but not fixed. The entity fix needs a rule-version
   bump, which is also the unmeasured cold-cache scenario in [03](03-retrieval-pipeline.md) §13.
2. **Funders and grants** (§3.1) are out of scope for v1 as a deliberate decision, not an
   oversight. Reopening it is a frozen-schema change.
3. **A co-authorship network** (§7.15) is supported by the data and deferred to Phase 6.
4. **Hosting** is Phase 7's, and constrains Phase 6. GitHub Pages published from the weekly
   workflow is the assumption; this contract assumes only that two static JSON files are served
   next to the app.

## 15. Exit criteria

- [x] The six open questions answered and recorded as decisions A1–A8.
- [x] Field list and every metric defined, each with the value measured on 2026-09-20.
- [x] Visualizations specified against measured feasibility, including the two the measurements
      corrected (research areas over time, geography).
- [x] Publication detail specified, including the three evidence cases that need their own wording.
- [x] JSON Schemas written for both files (2026-09-20).
- [x] Stage 11 implemented, with the export validated at the gate (2026-09-20).
- [x] Sample export committed, covering all twelve cases in §13 (2026-09-20).
- [x] The `summary` cross-check asserted by a test, on the pipeline side (2026-09-20). The app
      side of the same check is [06](06-web-app.md) §12.1's, and waits for the app.
