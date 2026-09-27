# Sample store (Phase 2)

A small, real store in the layout of [`docs/02-data-model.md`](../docs/02-data-model.md). It is
used to check the file formats, and as test input for later phases (knowledge-base pages, app
export).

- **Real content:** papers, metadata and evidence excerpts are real. Metadata is fetched live;
  the excerpts were measured on 2026-09-19 and are checked against each paper's text at build
  time.
- **Real funding:** `store/funding/` ([`docs/09-funding-impact.md`](../docs/09-funding-impact.md)
  §8) is what the funding stage decides for the thirteen included papers, fetched live by the
  build (below).
- **Synthetic content:** scenarios marked **SAMPLE** in `sample_works.yaml` (a removed list
  entry, an include override) are made up to exercise the format, not real decisions.

## Contents

**Included works (13):**

| Work | Scenario |
|---|---|
| W-000001 | Listed paper with several independent reasons; early era, incl. the South Lake Union facility name |
| W-000002 | Listed paper with no other evidence |
| W-000003 | SAMPLE: listed paper later removed from the site; stays included |
| W-000004 | Listed article merged with its preprint by override; retired ID W-000005 |
| W-000006 | Preprint + article linked automatically; award code in metadata |
| W-000007 | Award code in metadata and in the text |
| W-000008 | Resource named as where the work was done (criterion 4) |
| W-000009 | Resource named with a staff member (criterion 3) |
| W-000010 | Evidence only in OpenAlex's full-text index |
| W-000011 | Author affiliation is the resource; preprint only |
| W-000012 | Staff member thanked for data-analysis help (R7) |
| W-000013 | Evidence only in a PRIDE dataset description |
| W-000014 | SAMPLE: include override |

**Works not included (7, in `store/candidates.jsonl`):**

| Work | Scenario |
|---|---|
| W-000015 | Dropped when a rule was refined; keeps its former evidence |
| W-000016 | UWPR appears only in a list of software tools |
| W-000017 | Staff thanked for advice on another group's software |
| W-000018 | Staff co-author only |
| W-000019 | Credits only the Diabetes Research Center core |
| W-000020 | Peer-review report carrying the award code |
| W-000021 | Dissertation carrying the award code |

**Funding (`store/funding/`, built 2026-09-26):** a citations line for each of the 13 included
works, 57 grants and $452.8M of known amounts: 29 NIH grants valued by RePORTER from parent rows,
6 NSF by the NSF Award API, 2 NASA by USAspending, and 9 in SEK, EUR or USD by OpenAlex; 11 have no
amount, among them two DFG grants whose GEPRIS amounts the rules refuse. Five are
institution-wide: two GRFP institutional awards (2140004 and 1762114), C-DEBI, the EPIC-XS
consortium, and a Swedish Research Council national-infrastructure grant. Two strings are Miscellaneous, both on W-000014 and both written only in
Crossref, under funder names no rule reads. docs/09 §11.8 lists the cases the app is tested on:
`uwpr_pubs.sample.FUNDING_CASES` holds them against the export, and `tests/test_sample_funding.py`
holds the four the export does not carry against the store. `export_cases.json` adds the
synthetic funding beside the synthetic works.

## Rebuild and validate

From the repository root:

```
uv sync --locked --all-groups   # once
uv run python samples/build_sample_store.py
uv run uwpr-pubs validate samples/store
```

- The build needs `OPEN_ALEX_API_KEY` in `.env`. Its metadata comes from free lookups.
- **It then runs the funding stage** over the store it has just built, as a full refresh, and
  writes `store/funding/`. Funding is `enabled: false` in `config/funding.yaml` until the seed;
  the build passes the stage's `even_if_disabled`, which nothing else does. RePORTER goes through
  the stage's own adapter, one request a second, so the build **runs only inside RePORTER's
  window** (weekends, or 21:00-05:00 New York time) and stops otherwise. It also stops if any
  source degrades, rather than build the sample from partial answers. On 2026-09-26 the stage
  sent 27 requests (RePORTER 3, NSF 6, USAspending 3, OpenAlex 2, Crossref 1, PubMed 1, PMC 10),
  took 15 s and cost $0.0002 in OpenAlex award pages.
- Then rebuild the export: `uv run uwpr-pubs export --store samples/store --out samples/export
  --cases samples/export_cases.json`.
- A second build the same day is byte-identical, `store/funding/` included. **A rebuild on a
  later day differs:**
  - `store/metrics/`, as citation counts change;
  - `store/funding/`, as active grants gain fiscal years, the dates it records (`checked`,
    `first_seen`, `jats_checked`, a probe's `recheck_after`) are the build's, and the export's
    funding `as_of` moves with them;
  - and `store/works/`, wherever OpenAlex has revised its metadata. The rebuild of 2026-09-26, six
    days after the last, changed author names, ORCIDs or affiliations in 12 of the 13 work files,
    and one PMC article's XML.
