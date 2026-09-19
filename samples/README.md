# Sample store (Phase 2)

A small, real store in the layout of [`docs/02-data-model.md`](../docs/02-data-model.md). It is
used to check the file formats, and as test input for later phases (knowledge-base pages, app
export).

- **Real content:** papers, metadata and evidence excerpts are real. Metadata is fetched live;
  the excerpts were measured on 2026-09-19 and are checked against each paper's text at build
  time.
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

## Rebuild and validate

From the repository root:

```
uv sync --locked --all-groups   # once
uv run python samples/build_sample_store.py
uv run uwpr-pubs validate samples/store
```

- The build needs `OPEN_ALEX_API_KEY` in `.env`. It uses only free lookups.
- Citation counts change over time, so a rebuild on a later day will differ in
  `store/metrics/`.
