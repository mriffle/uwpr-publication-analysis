# Phase 6 — Web App Specification

> **Starting point only.** Drafted ahead of discussion; nothing here has been reviewed or agreed.
> Expect it to be reworked when we reach this phase.

**Status:** Unreviewed starting point · 2026-09-19
**Purpose:** specify the single-page app that displays and substantiates UWPR's impact. One
template; the only thing that changes between updates is `uwpr_publications.json` (Phase 5).

## 1. Audience and message (assumed — see D6)

University leadership, funders and review panels, and prospective users. The page must let a
reader grasp the scale of UWPR's contribution in ten seconds, explore it for ten minutes, and
**check any number** by drilling down to the individual papers and the evidence for each.

## 2. Page structure

One scrolling page with a sticky filter bar. Top to bottom:

1. **Header** — resource name, one-sentence statement, "data as of" date.
2. **Headline figures** — publications · total citations · h-index · highly cited papers ·
   collaborating institutions · countries · years of activity. Each figure responds to filters.
3. **Output over time** — publications per year (bars) with cumulative line; toggle to citations
   received per year.
4. **Influence** — citation distribution; share of works in the top 10% of their field;
   most-cited works (ranked list linking into the table).
5. **Reach** — collaborating institutions on a world map plus ranked list; UW vs external share.
6. **Research areas** — field → subfield → topic breakdown; how areas shift over time.
7. **Where the work appears** — top journals; open-access share.
8. **How UWPR contributed** — support type (instrument / computational / consultation /
   staff co-author); staff co-authorship over time.
9. **Research programmes supported** — funders and count of distinct grants that relied on the
   resource (if retained, 05 §8.3).
10. **Publication explorer** — searchable, sortable, filterable table of every work; expanding
    a row shows authors, links (DOI, PubMed, PMC), versions, and **"Why is this paper here?"**
    with evidence labels and excerpts.
11. **How this was assembled** — short plain-language method, the `coverage` figures, data
    sources and caveats, how to acknowledge UWPR, and contact for corrections.

## 3. Interaction

- **Global filters:** year range, evidence tier (confirmed / + probable), support type, research
  field, staff co-authored. Every figure and the table respond together.
- **Cross-filtering:** clicking a bar, journal, institution or topic applies it as a filter;
  active filters are shown as removable chips.
- **Deep links:** filter state and selected work encoded in the URL hash, so a specific view can
  be cited in a report.
- **Downloads:** current table selection as CSV and BibTeX; each chart as SVG/PNG.
- **Print / PDF:** a print stylesheet yielding a clean static report of the current view.
- **Tooltips** give exact values; every chart has a "view as table" alternative.

## 4. Data loading — how data gets into the app

The template contains a single placeholder:

```html
<script id="uwpr-data" type="application/json">/*__UWPR_DATA__*/</script>
```

`uwpr-pubs build-app` replaces the placeholder with the validated JSON and writes
`dist/index.html` — **one self-contained file** that works from a web server, a file share, or
an email attachment, with no cross-origin or `file://` fetch problems.

Fallback for development: if the placeholder is empty, the app fetches
`./uwpr_publications.json` (or the path in `?data=`). On load the app checks `schema_version`;
on a mismatch or malformed file it shows a clear error rather than a partial page.

## 5. Technology

- **No framework and no build toolchain.** Plain HTML, CSS and ES modules concatenated into the
  template by the same build step. The page must remain maintainable by UWPR staff years from
  now without a Node ecosystem.
- **Charts:** D3 (or Observable Plot on top of it), vendored and inlined — no CDN at runtime, so
  the file is self-contained and unaffected by third-party outages. World map from a bundled,
  simplified TopoJSON.
- **Table:** custom lightweight implementation; at ~500 rows no virtualisation is needed.
- **Budget:** total file ≤ 3 MB including data; interactive in under 2 s on a typical laptop.

## 6. Design

- UW brand-compatible palette and typography (D8), with a colour-blind-safe categorical palette
  for charts; light and dark themes following system preference.
- Responsive from phone to wall display; charts reflow rather than shrink.
- Accessibility to WCAG 2.1 AA: keyboard operable, focus visible, text alternatives and data
  tables for every chart, no information carried by colour alone, respects reduced-motion.
- Numbers are stated honestly: citation source and date beside the figures; estimates (e.g. labs
  served) labelled as estimates; tier 2 visibly distinguished when shown.
- Detailed visual design is done at implementation time against the sample JSON, with charts
  following the project's data-visualisation guidelines.

## 7. Embedding and hosting constraints

- Must work as a static file under a sub-path of the existing UWPR site.
- An `?embed=1` mode hides header/footer for use inside an iframe on a UWPR page.
- No cookies, analytics or external requests by default.

## 8. Testing

- Aggregation unit tests: app-computed unfiltered totals equal the file's `summary` block.
- Rendering tests against the sample JSON, including edge cases: empty filter result, a single
  year, works with no topics / no DOI / retracted, very long titles and author lists.
- Schema-mismatch and malformed-data error paths.
- Accessibility audit (automated + keyboard walkthrough); print output check.
- Cross-browser: current Chrome, Firefox, Safari, Edge.

## 9. Open questions

0. **Requirement added 2026-09-19:** each publication opens its knowledge-base entry (Phase 4) —
   summary, subject tags, category, authors, affiliations and UWPR evidence. §2 item 10's
   expandable row is the first sketch of this; to be redesigned when Phase 4 is specified.
0. **Requirement added 2026-09-19:** preprint-only works are visibly labelled as preprints
   everywhere they appear (table, lists, knowledge-base page), and can be filtered.

1. Audience and public/private (D6); tier-2 visibility (D7); branding and host (D8).
2. Is a co-authorship / collaboration network view wanted? Visually striking, but costly and
   often less informative than the map and ranked lists. Default: not in v1.
3. Should individual staff members be featured (their tools, their co-authored work)?
4. Is a "featured papers" strip wanted, curated by UWPR (would add a small curated list to the
   JSON)?
5. Should the page also link to UWPR-developed software and their citation counts as a separate
   impact strand? This is outside "supported publications" and would need its own data.

## 10. Exit criteria

- [ ] Section list and filters agreed.
- [ ] Data-loading mechanism agreed.
- [ ] D6–D8 answered.
- [ ] Wireframe reviewed against the sample JSON.
