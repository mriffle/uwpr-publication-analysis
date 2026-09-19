# Phase 5 — Metrics & App Data Contract Specification

> **Starting point only.** Drafted ahead of discussion; nothing here has been reviewed or agreed.
> Expect it to be reworked when we reach this phase.

**Status:** Unreviewed starting point · 2026-09-19
**Purpose:** define the single JSON file that drives the web app, and the exact meaning of every
number the app shows. This file is the **only** interface between the pipeline and the app.

## 1. Principles

1. **One file, versioned.** `uwpr_publications.json` carries a `schema_version`; the app refuses
   (with a clear message) a major version it does not understand.
2. **Rows, not just totals.** The file carries one entry per work family. The app computes its
   aggregates client-side so that every filter (years, tier, support type) updates every figure.
3. **Totals as a cross-check.** The pipeline also writes a `summary` block computed
   independently; app tests assert that the app's unfiltered numbers equal it.
4. **Nothing UWPR-specific in the app.** Names, identifier, links and explanatory text come from
   the file, so the same template could serve another core facility.
5. **Public-safe.** Only `included` and `probable` families are exported. No roster, no
   reviewer names, no excluded or candidate works.

Expected size: roughly 1.5–2.5 KB per work, under 1.5 MB for ~500 works; acceptable to inline.

## 2. Top-level structure

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-09-19T18:04:00Z",
  "run_id": "2026-09-19T17-40-full",
  "pipeline_version": "0.1.0",
  "resource": {
    "name": "University of Washington Proteomics Resource",
    "short_name": "UWPR",
    "url": "https://proteomicsresource.washington.edu/",
    "identifier": "UWPR95794",
    "acknowledgement_text": "This work is supported in part by the University of Washington's Proteomics Resource (UWPR95794).",
    "staff": [{"id": "eng", "name": "Jimmy K. Eng"}]
  },
  "sources": {
    "citations": {"name": "OpenAlex", "as_of": "2026-09-19"},
    "notes": ["Citation counts are from OpenAlex and may differ from Google Scholar or Web of Science."]
  },
  "summary": { },
  "works": [ ],
  "coverage": { }
}
```

## 3. Work entry

```json
{
  "id": "F-000045",
  "title": "Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer",
  "year": 2026,
  "date": "2026-02-06",
  "kind": "article",
  "venue": "Journal of Proteome Research",
  "doi": "10.1021/acs.jproteome.5c00706",
  "pmid": "…", "pmcid": "…",
  "url": "https://doi.org/10.1021/acs.jproteome.5c00706",
  "oa": "hybrid",
  "authors": ["…", "…"],
  "author_count": 9,
  "staff_authors": ["riffle"],
  "institutions": [{"name": "University of Washington", "ror": "00cvxb145", "country": "US"}],
  "topics": {"domain": "Life Sciences", "field": "Biochemistry, Genetics and Molecular Biology",
             "subfield": "Molecular Biology", "topic": "Mass Spectrometry Techniques"},
  "cited_by": 4,
  "cites_by_year": {"2026": 4},
  "fwci": 1.8,
  "citation_percentile": 0.91,
  "funders": [{"name": "National Institutes of Health", "awards": ["R01GM…"]}],
  "support": ["computational"],
  "tier": 1,
  "evidence": [
    {"type": "identifier_structured", "label": "Award ID in publisher metadata",
     "excerpt": "UWPR95794", "source": "OpenAlex", "url": "https://…"}
  ],
  "on_official_list": false,
  "versions": [{"kind": "preprint", "doi": "10.1101/2025.07.25.666826", "year": 2025}],
  "retracted": false
}
```

- The entry describes the **canonical record** of the family; other versions are listed in `versions`.
- `authors` is capped (first 20 + last); `author_count` holds the true number.
- `evidence` is capped at the 3 strongest rows, excerpts ≤ 300 characters, each with a
  plain-language `label` the app can show as "Why is this paper here?".

## 4. Metric definitions

Unless stated, metrics are over families with `tier == 1` (the app's default view); the toggle
adds tier 2. Retracted works are listed with a flag but excluded from every count.

| Metric | Definition |
|---|---|
| Publications | Number of work families. A preprint and its article count once. |
| Year of a work | Publication year of the canonical record (the article if one exists). |
| Citations of a work | OpenAlex `cited_by_count` of the **canonical record only**. Preprint citations are not added (they are kept in the store; a combined figure may be added later and would be labelled separately). |
| Total citations | Sum over works. |
| Citations per year | Sum of `cites_by_year` — citations *received* in each calendar year. OpenAlex supplies roughly the last ten years; earlier years are shown only as a total. |
| h-index of the corpus | Largest h such that h works have ≥ h citations each. |
| Highly cited | Works with `citation_percentile ≥ 0.90` (OpenAlex field- and year-normalised). Reported as a count and share. |
| Mean FWCI | Mean field-weighted citation impact over works that have one; median also reported because the mean is skew-sensitive. Works < 1 year old excluded. |
| Open access share | Works with `oa` ∈ {gold, hybrid, green, bronze, diamond} ÷ all works. |
| Distinct journals | Distinct venue, by ISSN-L where available. |
| Collaborating institutions | Distinct ROR IDs across all authorships, excluding the University of Washington itself. Countries likewise. |
| Research areas | OpenAlex primary topic → subfield → field → domain. |
| Supporting grants | Distinct (funder, award ID) pairs acknowledged by the works, excluding UWPR's own identifier. Shown as "research programmes that relied on the resource", never as money. |
| Support type | Share of works by `support` value; works with `unspecified` shown as such. |
| Staff co-authorship | Share of works with ≥ 1 `staff_authors`. |
| Labs / PIs served | Distinct last/corresponding authors with a UW affiliation. **Indicative only** — flagged as an estimate in the app. |

## 5. `summary` block

Pre-computed headline values for tier 1 and for tier 1+2: publications, total citations, h-index,
highly cited count, median FWCI, OA share, distinct journals, institutions, countries, first and
last year. Used for the cross-check in §1.3, for link previews, and for plain-text reporting.

## 6. `coverage` block (transparency)

```json
{
  "official_list_size": 306,
  "found_beyond_official_list": 0,
  "by_evidence_type": {"official_list": 0, "identifier_structured": 0, "identifier_fulltext": 0,
                       "resource_named": 0, "staff_affiliation": 0, "staff_ack_with_context": 0,
                       "decision_include": 0},
  "with_identifier_in_metadata_share": 0.0,
  "preprint_article_pairs": 0,
  "fulltext_unavailable": 0
}
```

This supports a short "How this was assembled" section in the app, and quantifies how many
supported papers fail to carry the acknowledgement identifier — useful to UWPR in its own right.

## 7. Versioning and validation

- JSON Schema kept at `schemas/uwpr_publications.schema.json`; `export` validates before writing.
- Additive changes bump the minor version; renames/removals bump the major version.
- A small hand-made `sample/uwpr_publications.sample.json` (≈ 15 works covering every field and
  edge case: preprint pair, retraction, missing DOI, tier 2, no topics) is the fixture for app
  development and tests.

## 8. Open questions

1. Show tier 2 publicly? (D7) Default: exported, hidden until toggled.
2. Include evidence excerpts in a public file? Default: yes — they are what makes the numbers
   defensible — limited to short quotations.
3. Is "supporting grants" wanted? It is a strong argument for a core facility but depends on
   funder metadata quality; needs a look at real data first.
4. Any metrics UWPR specifically needs for reporting (e.g. for a renewal or annual report) —
   trainee authorship, UW departments served, industry collaborators?
5. Should dollar values of acknowledged grants (NIH RePORTER) ever be shown? Default: no for v1.

## 9. Exit criteria

- [ ] Field list and metric definitions agreed.
- [ ] JSON Schema and sample file written.
- [ ] D7 answered.
