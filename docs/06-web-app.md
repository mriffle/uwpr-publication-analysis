# Phase 6 — Web App Specification

**Status:** Agreed · 2026-09-20 · the input to implementation. Changes from here are made
deliberately, dated, and noted in this header.

**Changes since agreement:**
- *2026-09-20, §8, a series colour is a mark colour, not a text colour.* The palette is validated
  at the 3:1 §9 asks of a graphical element, and nothing said that a label reusing a series colour
  becomes text held to 4.5:1. Badge labels shipped at 3.87:1 and 3.42:1 on the light background
  because of it — found the first time axe ran against the built page, which is also the first
  time §9's "in both themes" was actually checked.
- *2026-09-20, §5, a rejection reads the same on both routes.* Neither §5 nor §7 said the
  `/publication/<identifier>` permalink owes what [05](05-metrics-and-data-contract.md) §8 requires
  of the lookup, so the likelier route carried the thinner answer. One component now serves both.
- *2026-09-20, §12.2, what "every route" means:* every rendered *state*, in both themes. `/lookup`
  has six and `/publication/<id>` three, so the phrase was hiding a large difference in what the
  gate covers.
- *2026-09-20, §4 and §7.13's chart:* the criteria chart moved from the overview to `/method`,
  where [05](05-metrics-and-data-contract.md) §7.13 always said it belonged — §4's section list
  never included it, and it is the one chart about the *method* rather than about the science. Its
  bars are static rather than click-to-filter, with a line of links beneath opening the overview
  under each criterion: a mark that navigates away is not the control a pressable bar advertises.
- *2026-09-20, §3, what `/method` and `/lookup` do with the reader's filter:* §3 settled it only
  for the detail view. Both carry a clean URL, since they describe the whole corpus rather than a
  selection, and both push a history entry so the way back restores the exact filtered overview. A
  definition link carrying a fragment is a plain anchor, so it is shareable, and it does lose the
  filter — the right trade for a link someone pastes into a document.
- *2026-09-20, §10, when `/lookup` fetches the index:* "on demand, not on first paint" settled the
  overview but not this route. It fetches **on mount** — arriving is the demand, it gives a real
  loading state, and the first answer is then no slower than the rest.
- *2026-09-20, §6, a lookup query stays out of the URL.* It is neither a filter nor a sort, and
  `/publication/<identifier>` already permalinks a rejection. A shareable URL asserting that a
  named paper is not included is a different artefact from a shareable filtered view.
- *2026-09-20, §3, "opens over the overview":* under-specified, and the literal reading is an
  accessibility hazard — an overview mounted behind a modal means two `h1`s or `inert` over a live
  region. The requirement is that the reader does not lose their filter, which the URL already
  guarantees, so §3 now states the requirement rather than a mechanism.
- *2026-09-20, §6, what belongs in the URL:* B5 says "filter and view state", which did not settle
  the explorer's sort or the per-chart toggles. The filters and the sort go in; per-chart view
  state stays out, or a shared link carries parameters nobody chose.
- *2026-09-20, §12.3, Playwright runs against the built app*, because the routing behaviours it
  covers do not exist in the dev server.
- *2026-09-20, §7, which alias map resolves a permalink:* "the export's alias map" was ambiguous,
  and the two maps have different reach. The export's `aliases` cover retired work IDs only; an
  external identifier resolves only through `lookup_index.json`, which §10 deliberately loads on
  demand. §7 now states the order and requires the on-demand fetch before a not-found, so a DOI
  permalink works from cold. Found while building the contract layer.
- *2026-09-20, §11.2, visx 4:* 3.x will not install beside React 19.
- *2026-09-20, §7 and §4.1, the staleness notice:* the app must state its own staleness when the
  data is more than 14 days old — two missed weekly runs — where the reader will see it, rather
  than presenting old figures as current. Added by [07](07-operations.md) O3, which needed a layer
  that catches the schedule silently stopping: the run's own alerting cannot report a run that
  never happened. It also follows from §1's register, since a page arguing that its numbers are
  checkable should not misrepresent how current they are. The threshold comes from the export's
  `generated_at`.
**Purpose:** specify the single-page app that presents the publications supported by the UW
Proteomics Resource — what it shows, how it behaves, how it is built, and how it is tested.
**Depends on:** [05](05-metrics-and-data-contract.md) (agreed), which is the app's *only* input.
The app has no knowledge of UWPR beyond what that file tells it
([00](00-project-phases.md), principle 5).
**Constrained by:** Phase 7, which owns hosting. This spec assumes only that two static JSON files
are served alongside static app files (§13).
**Replaces:** the unreviewed draft of 2026-09-19, which assumed evidence tiers, a separate
knowledge base, funder data and a world map — none of which exist — and which specified a
no-toolchain build that §11.1 revisits explicitly.

---

## 1. Audience and purpose

Public, aimed at UW leadership, funders and prospective users (D6). Three readers want three
different things, and the page serves them in this order:

1. **Someone assessing the resource** wants the scale and character of the output, in about ten
   seconds, without reading anything.
2. **Someone considering using the resource** wants to know what kind of science it supports —
   fields, journals, groups, recency.
3. **Someone checking the claim** wants to know how each number was produced and how a given paper
   came to be counted. This reader is the reason the project exists in the form it does, and the
   evidence trail must be reachable from any publication in one click.

**What the page asserts:** that these publications record use of the resource, that each one can
show why it is counted, and that the method's limits are stated. It does not assert that the
resource caused the citations ([05](05-metrics-and-data-contract.md) §5.1).

**Register.** [05](05-metrics-and-data-contract.md) §11 governs every string the app displays: no
promotional language, no superlatives, no causal claims, every figure carrying its definition and
date, every proxy labelled as one. The page reports; it does not promote.

## 2. Decisions

Agreed 2026-09-20.

| # | Decision | Why |
|---|---|---|
| B1 | **React with TypeScript in strict mode, built by Vite.** Not Next.js. | A static page doing client-side filtering needs no server or rendering model. Vite produces plain static output. |
| B2 | **Charts built on visx and `d3-scale`, over one shared chart kit.** | §11.2. The alternative was considered and the trade-off is recorded there. |
| B3 | **TypeScript types are generated from the JSON Schemas**, not hand-written. | Makes the data contract the compile-time interface: a pipeline schema change that the app does not handle fails the build rather than the page. |
| B4 | **All aggregation is pure functions in a layer of its own,** with no React in it. | Mirrors the pipeline's pure-core/thin-shell split ([03](03-retrieval-pipeline.md) §3). Every metric definition gets exhaustive unit tests without rendering anything. |
| B5 | **Filter and view state live in the URL.** | A filtered view is the unit people cite in reports. It must be linkable and reproducible. |
| B6 | **Data is fetched at runtime, not bundled at build time.** | The data changes weekly; the app does not. The weekly data commit must never need a site rebuild. §11.1 gives the second, larger reason. |
| B7 | **Vitest, React Testing Library and Playwright,** with a coverage floor of 80% to match the Python side. | §12. |
| B8 | **ESLint and Prettier**, not Biome. | `eslint-plugin-jsx-a11y`. A public page that is mostly charts needs the accessibility rules more than it needs a faster linter. |
| B9 | **No UW branding** (D8). Visually neutral, clean, modern, light and dark. | The repository is Apache-2.0 and public; official use of UW marks needs approval, and a neutral page avoids implying an official UW communications product. |
| B10 | **No cookies, no analytics, no third-party requests at runtime.** | Nothing about a page of published bibliographic facts requires tracking its readers. It also keeps the page servable from anywhere without a privacy review. |
| B11 | **The app lives in `web/` in this repository,** with its own CI job. | The contract and its only consumer stay together, so a change to one shows up against the other in the same commit. |

## 3. Information architecture

Four views. The overview is the page; the rest are routes reachable from it.

| Route | View | What it is for |
|---|---|---|
| `/` | **Overview** | The figures, the charts and the publication explorer, all under one filter state |
| `/publication/<work id>` | **Publication detail** | One publication: what it is, who wrote it, and why it is counted |
| `/method` | **How this was assembled** | The method, its coverage and its limits, in numbers |
| `/lookup` | **Why is a paper not here?** | Identifier lookup against the full candidate set |

**The detail view must not cost the reader the filter they spent a minute building.** That is the
requirement; a visual overlay is not. Keeping the overview mounted behind a modal means either two
`h1`s or `inert` over a live region, which is an accessibility cost for no gain — **the URL already
carries the filter**, so the detail route preserves the query string and returning restores the
exact filtered view.

So the detail renders in place of the overview, the query survives, and the way back differs by how
the reader arrived: back to the filtered publications when they came from the overview, or to all
publications when they arrived cold on a link. Either way the URL is the same and is linkable.

**Routing** uses the History API with a build-time base path, and ships a `404.html` copy of
`index.html` so a deep link resolves on static hosts that have no rewrite rules (GitHub Pages
among them). A build flag switches to hash routing if the host Phase 7 settles on cannot serve
that fallback.

## 4. The overview

Top to bottom. A sticky bar carries the active filters and the resulting publication count.

### 4.1 Header

Resource name, one descriptive sentence, the date the data was generated, a link to the resource's
own site, and links to the method page and the lookup. Nothing else.

### 4.2 Headline figures

Five, from [05](05-metrics-and-data-contract.md) §5, each responding to the active filter:
**publications · years covered · citations · research groups · journals.**

Below them, one sentence carrying the quality claim: the median field-weighted citation impact,
stated in words — that the median publication is cited about *n* times as often as the average
paper in its field and year — with the figure, its source and its date.

Every figure links to its definition on the method page. "Research groups" and "institutions"
carry their proxy and floor labels inline, not in a footnote
([05](05-metrics-and-data-contract.md) §11.4).

**No h-index and no citation percentile here.** Both are available and both are on the detail
view or the method page; §2.2 of the contract gives the reasoning.

### 4.3 Output over time

Publications per year as bars, with cumulative publications as a line on a second axis. A toggle
switches the same frame to citations received per year with cumulative citations.

This is the section that most needs the honesty constraints, and they are requirements:

- **The current year is partial** and is drawn distinctly — hatched or muted, never as a
  full bar — with a label saying so. Without it the page shows a decline that is an artifact of
  the calendar.
- **The citation series cannot start before 2012**, four years after the publications start, and
  the citations outside that window are stated as a figure rather than left as an unexplained
  discrepancy between two charts.
- **Nothing is recorded before 2008.** The axis starts there, or the two empty years are labelled.

### 4.4 Research areas

Two charts. **Areas over time**: a stacked area or stacked bar, grouped to the five largest fields
plus "Other", with years bucketed in threes by default and single years available. **Areas
overall**: a treemap or horizontal bar at the subfield level.

The over-time chart's axis is labelled **topic assignments**, not publications, because a work
contributes to each of its topics and the total therefore exceeds the number of publications.
[05](05-metrics-and-data-contract.md) §7.5 has the measurements that forced this shape.

### 4.5 Who the work involves

**Researchers appearing most often**, as a horizontal bar, defaulting to non-staff researchers
with a toggle to include staff, who are marked distinctly wherever they appear. A staff member on
many papers and an external investigator on many papers are different facts and the chart must not
merge them.

**Institutions**, as a horizontal bar, excluding the University of Washington — which appears on
316 of 339 works and would otherwise flatten the chart to one bar and a fringe. The top 15, with
a statement of how many are not shown.

**Countries**, as a single sentence and a short bar of the most frequent non-US countries. No
choropleth ([05](05-metrics-and-data-contract.md) §7.14).

### 4.6 Where the work appears

**Journals**, as a horizontal bar of the most frequent, with the total distinct count. Preprint
servers appear here, labelled as such, because leaving them out would misstate the corpus.

**Open access over time**, as a share with counts shown alongside — the early years have six to
fifteen publications each, so a bare percentage there moves by one paper.

### 4.7 Citation profile

**Distribution**, as a histogram on a logarithmic citation axis, with works that have no citations
yet in their own explicit bucket, since a log axis has no zero.

**Most cited publications**, as a ranked list of ten to twenty, each row linking to its detail.

### 4.8 Publication explorer

Every publication under the current filter, as a list. At 339 rows — growing 30–50 a year — no
virtualisation is needed; a plain list is simpler, prints properly and is accessible by default.

Each row: title, authors abbreviated with the full count, venue, year, citation count, and marks
for preprint-only, open access and retraction. Sortable by year, citations and title. A free-text
search box filters on title, author and venue.

Clicking a row opens the publication detail.

### 4.9 Footer

Data source and generation date, the run identifier, a link to the repository, the licence, and a
contact for corrections. An override exists precisely so a reported mistake can be fixed
([02](02-data-model.md) §9), so the page should say where to report one.

## 5. Publication detail

Renders [05](05-metrics-and-data-contract.md) §6 in that order: identity; links; authors with
affiliations and staff markers; research areas at all four levels; citations; **why this is a UWPR
publication**; other versions; retraction if flagged.

The evidence section is the one that must not be templated carelessly. Three cases each need their
own wording, and a generic template produces something false in all three:

| Case | Requirement |
|---|---|
| The site listing | Says it was listed, with the page and the dates first and last seen. **There is no excerpt**, and the app must not render an empty quotation. 91 of 339 works have this as their only evidence. |
| A full-text index match | Says the phrase was found in OpenAlex's full-text index, with the phrase and the query date. **There is no excerpt**, because the text could not be read directly. 49 works carry one. |
| An override | Shows the recorded reason, attributed to the person who decided it and dated. It is a judgement, not a measurement, and must read as one. |

**A publication that was considered and not included has the same answer on both routes.** The
`/publication/<identifier>` permalink is the likelier way a reader reaches a rejection — it is the
URL in a colleague's email — so it owes what [05](05-metrics-and-data-contract.md) §8 requires of
the lookup: the reason, what it does not mean, the near misses with why each is deliberately not
evidence, and the correction path. One component serves both, differing only in heading level and
in how the reader arrived. Nothing in this spec forbade the barer version, which is exactly how
the two drifted apart.

Evidence found on a different version than the one displayed says so — evidence on a preprint
applies to the whole work (Phase 1 §8), and a reader looking at the article should not have to
guess why the quotation is not in it.

**Excerpts are rendered as published, not cleaned up.** Where the pipeline has stored a defect —
currently one work with an undecoded XML entity ([05](05-metrics-and-data-contract.md) §3.2) — it
is visible. Decoding entities in the app would mask future extraction bugs and risks
double-decoding text that legitimately contains an escaped character. The fix belongs in
extraction; the app's job is to show what the store holds.

The same applies to the one work whose stored title is a filename. It renders as stored.

## 6. Filtering

One filter state drives every figure, every chart and the explorer. The dimensions are
[05](05-metrics-and-data-contract.md) §9's: year, research area at four levels, journal,
institution, country, author, open access, kind, how the publication is known, and whether it is
on the resource's own list.

**Rules:**

- **Clicking a chart mark applies it** — a year's bar, an area's band, an institution's row.
  This is the main reason the contract carries every dimension on every row.
- **Active filters are always visible** as removable chips in the sticky bar, with the resulting
  publication count beside them, and a control that clears them all.
- **The active filter is stated in words.** A filtered figure that looks like a total is the
  easiest way for an accurate page to mislead.
- **Filters are combined with AND across dimensions and OR within one** — two selected journals
  mean either, a journal and a year mean both.
- **An empty result is a designed state**, naming the filters responsible and offering to clear
  the last one. It is reachable in a few clicks and will be reached.
- **State is in the URL** and survives reload, back and forward, and sharing. **The boundary:** the
  filter dimensions and the explorer's sort go in the URL, because they are what someone means by
  "this view". Per-chart view state — which series a frame is showing, the bucket size, whether
  staff are included — does not, because a shared link would then carry half a dozen parameters
  nobody set deliberately.
- **Closing a detail pops its history entry** rather than pushing another. Otherwise opening and
  closing five publications leaves ten entries to press Back through.

## 7. Cross-cutting behaviour

**Every chart has a table.** A control on each chart shows the same data as a table of numbers.
This serves screen readers, satisfies the reader who wants the exact value, and costs little
because the aggregation layer already produced the rows.

**Tooltips give exact values,** including the denominator for anything shown as a share.

**Downloads.** The publications under the current filter as CSV and as BibTeX, and each chart as
SVG and PNG. This audience writes reports and grant renewals; a page they cannot get numbers out
of will be retyped by hand, with errors.

**Print.** A stylesheet that renders the current filtered view as a clean static document: figures,
charts and the publication list, with the filter stated and the data date on the page.

**Loading and failure are designed states,** not blank screens:

| Condition | Behaviour |
|---|---|
| Data loading | A skeleton layout, not a spinner over an empty page |
| Data fails to load | A plain message naming the file, with a retry. No partial page pretending to be complete |
| `schema_version` is a major version the app does not know | A clear message naming the version found and the version expected, and no attempt to render. A wrong render is worse than none |
| A work referenced by URL does not exist | **Two maps, with different reach, and the order matters.** The export's own `aliases` resolve **retired work IDs** only — 37 works carry one — and are already loaded. An external identifier in a permalink (a DOI, PMID or OpenAlex ID) resolves only through `lookup_index.json`, which §10 loads on demand. So: try the export first; if the URL carries an identifier it cannot resolve, **fetch the lookup index before deciding**, and only then show a not-found state. A DOI permalink must work from cold, at the cost of one extra fetch in the case that needs it |
| **The data is more than 14 days old** | Say so, in place, near the "data as of" date and the headline figures. Two missed weekly runs means something is wrong, and a page that keeps presenting the figures as current is the failure mode [07](07-operations.md) §5 exists to prevent |

## 8. Design direction

Detailed visual design happens at implementation against the sample export. The constraints:

- **Neutral, clean, modern.** No UW marks, colours or typography (B9).
- **Light and dark**, following the system preference, with an explicit override.
- **Responsive from phone to desktop.** Charts reflow to fewer categories or a different
  orientation rather than shrinking into illegibility.
- **A series colour is validated as a mark colour, not as text.** The categorical palette is built
  to the 3:1 that §9 asks of a meaningful graphical element. **Text is held to 4.5:1**, so a label
  that reuses a series colour needs a darker text-weight token of that series, per theme, with the
  mark keeping the original. This is not hypothetical: badge labels shipped at 3.87:1 and 3.42:1
  against a light background because the palette passed its own 3:1 check and nothing said a
  chart colour becomes text when it labels something.
- **A colour-blind-safe categorical palette of at most six plus "Other"**, which is why §4.4 groups
  fields to five. Adjacent marks must be distinguishable by more than hue.
- **No information carried by colour alone** — a preprint mark, a retraction flag and a partial
  year all carry text or shape as well.
- **Charts read as one system.** One axis treatment, one tooltip, one legend, one number format,
  from the shared kit (§11.2), not per-chart decisions.
- **Reduced motion respected.** Transitions are an affordance, not decoration, and are dropped
  entirely when the system asks.

## 9. Accessibility

**WCAG 2.1 AA, treated as a requirement rather than an audit at the end.**

- Fully keyboard operable, including every chart's interactive marks and the filter chips, with a
  visible focus indicator throughout.
- Every chart has an accessible name, a short text description of what it shows, and the table
  alternative of §7.
- Filter changes announce the new result count in a live region; a silent update strands a screen
  reader user mid-page.
- Contrast meets AA for text and 3:1 for meaningful graphical elements, in both themes.
- Semantic structure: one `h1`, ordered headings, real landmarks, real buttons and links.
- Automated checks in CI (§12) plus a keyboard walkthrough before release. Automated checks catch
  perhaps half of what matters and are not sufficient on their own.

## 10. Performance

Measured inputs, re-measured 2026-09-20 from the export as actually built
([05](05-metrics-and-data-contract.md) §4.4): the data file is **3.48 MB as written, 0.31 MB
gzipped**, plus **0.36 MB (0.06 MB gzipped)** for the lookup index, growing about 0.03 MB gzipped
a year.

| Budget | Target |
|---|---|
| JavaScript, gzipped | ≤ 250 KB |
| Data transferred on first load, gzipped | ≤ 400 KB |
| First contentful paint, typical laptop broadband | < 1.5 s |
| Interactive with charts drawn | < 2.5 s |
| Filter change to redrawn charts | < 100 ms |

The compressed transfer is what the budget is about — about 0.56 MB for the app and its data
together, which is an ordinary page weight. The 3.48 MB uncompressed figure matters only for parse
time and memory, and at this size neither is a concern.

At 339 rows every aggregation is trivial; the risk is not throughput but redrawing everything on
every keystroke. Derived aggregates are memoised on the filter state, and the search box is
debounced. **The lookup index loads on demand,** not on first paint — it is more than half the
uncompressed weight of the data file and answers a question most readers never ask.

`d3` is imported as individual submodules. Pulling the umbrella package in for two scale functions
is the single easiest way to miss the bundle budget.

## 11. Technology

### 11.1 Why a build toolchain, having previously decided against one

The superseded draft specified plain HTML, CSS and ES modules with no build step, so that the page
would stay maintainable "without a Node ecosystem". The concern is legitimate and the conclusion is
still wrong, for three reasons.

1. **What this app actually is.** Twelve interactive charts that cross-filter, a router, a
   searchable list, a detail view and full keyboard accessibility. Written without a framework
   that is a large amount of bespoke state-synchronisation code — *harder* to maintain than
   idiomatic React, and much harder to test.
2. **The build runs when the app changes, not when the data does** (B6). After v1 that is rare.
   The weekly data commit touches no build at all.
3. **The deployed app outlives its own toolchain.** Because the data is fetched at runtime, the
   built output is plain static files with no runtime dependency on anything that was used to
   build them. If the toolchain becomes unbuildable in 2032, the last build keeps working *and
   keeps showing current data*. That is a stronger guarantee than the no-build approach offered,
   and it is what makes the trade acceptable.

Mitigations, which are the part that matters: the Node version is pinned, the lockfile is
committed and CI installs from it exactly, dependencies are few and boring, and the app is built
and tested in CI on every push so decay is visible immediately rather than discovered years later.

### 11.2 Charts: visx, and what it is chosen over

**visx with `d3-scale` and `d3-array`, over one shared chart kit** built once and used by every
chart: responsive container, axes, grid, tooltip, legend, number formatting, palette, and the
empty and loading states.

Chosen over a higher-level charting library for two reasons:

1. **The specified charts fight high-level defaults.** A logarithmic axis needing a separate zero
   bucket; a partial period drawn differently from complete ones; an "Other" grouping; a stacked
   series over bucketed years; and click-to-filter on every mark of every chart.
2. **Testability.** Recharts' `ResponsiveContainer` measures the DOM and renders nothing under
   jsdom without mocked dimensions, which makes component tests awkward exactly where they are
   wanted. visx takes width and height as props, so tests pass fixed dimensions and assert
   deterministic SVG.

**Version note (measured 2026-09-20):** visx **4.x** is required. 3.x peer-declares React 16–18
and refuses to install beside B1's React 19; `@visx/*@4.0.0` declares `^18 || ^19`.

**The trade is recorded honestly:** visx costs more code up front than a higher-level library.
The shared kit is what keeps that cost one-time, and because all aggregation lives outside the
components (B4), swapping the rendering layer later would touch only the chart components.

### 11.3 Project layout

```
web/
  package.json, package-lock.json, tsconfig.json, vite.config.ts
  index.html
  src/
    main.tsx, App.tsx
    contract/        types generated from schemas/ (B3); the loader and version check
    aggregate/       pure functions: every metric in 05 §5, and every chart's series
    filter/          filter state, URL encoding, predicate building
    charts/          the shared kit, then one module per chart
    views/           overview, publication detail, method, lookup
    components/      figures, filter chips, publication list, evidence, tables
    format/          numbers, dates, names, author lists
  test/              unit and component tests
  e2e/               Playwright specs
```

The `aggregate/` and `filter/` layers import nothing from React. That boundary is what makes the
metric definitions testable as arithmetic, and it is enforced by a lint rule rather than by
intention.

## 12. Testing

Industry-standard tooling, plus three checks specific to this project that are worth more than any
of the generic ones.

### 12.1 The project-specific checks

| Check | What it catches |
|---|---|
| **The summary cross-check.** The app's unfiltered aggregates must equal the exported `summary` block, which the pipeline computes independently ([05](05-metrics-and-data-contract.md) §1.2). | A metric implemented to a different definition than the pipeline used. This is the single highest-value test in the suite: two independent computations of the same number. |
| **The sample export validates against its JSON Schema**, and the app's types are generated from that schema. | Contract drift. A pipeline change the app does not handle becomes a build failure, not a broken page. |
| **Every case in [05](05-metrics-and-data-contract.md) §13 renders.** Preprint-only; a merged pair; evidence with no excerpt, in both of its forms; an override with attribution; no open-access link; no field-weighted impact; retracted; one author; more than fifty; an unresolved affiliation; a retired identifier in the alias map. | The states that exist in the data but are rare enough that nobody meets them while developing. The retraction case in particular **has no instance in the real store**, so only the sample exercises it — and citation metadata refreshes weekly, so a real one can appear any week. |

### 12.2 The rest

- **Unit, Vitest.** Every function in `aggregate/` and `filter/`, exhaustively, against the
  definitions in [05](05-metrics-and-data-contract.md) §5. This is where correctness lives.
- **Component, Vitest and React Testing Library.** Charts at fixed dimensions asserting real SVG;
  the evidence block per case; the publication list; empty, loading and error states. Queried by
  role and accessible name, so the tests fail when the accessibility does.
- **"Every route" means every rendered state, in both themes.** `/lookup` alone has six — before a
  question, three answers, unparseable input, and a failed index fetch — and `/publication/<id>`
  has three. A gate that visits four routes once is a much weaker gate than one that visits every
  state twice, and the difference is not visible from the phrase.
- **End-to-end, Playwright**, in Chromium, Firefox and WebKit: load, filter, cross-filter from a
  chart, deep-link a filtered view, open a detail view and return with filters intact, resolve a
  retired identifier, use the lookup for all three outcomes, and complete a keyboard-only pass.
- **Accessibility:** `axe` assertions in component tests and on every route in end-to-end, plus
  `eslint-plugin-jsx-a11y` at lint time.
- **Visual regression:** Playwright screenshots of each chart at two widths and both themes.
  Charts are the one thing where a silent visual break passes every functional test.
- **Coverage floor 80%,** matching the Python side.

### 12.3 CI

A `web` job alongside the existing `check` job, on every push and pull request: pinned Node,
`npm ci` from the committed lockfile, then the generated-types freshness check, lint, format,
type-check, unit and component tests with coverage, build against the budget of §10, and
Playwright. The job fails on a budget overrun, so the bundle cannot grow unnoticed.

**Playwright runs against the built app behind `vite preview`, not the dev server.** The two
behaviours it exists to cover — the `404.html` fallback of §3 and the on-demand lookup fetch of §7
— do not exist in dev, so a component test cannot reach them and a dev-server run would pass
vacuously.

The Python gate and the web gate are independent and both must pass. Actions stay pinned to commit
SHAs, as the existing workflows are.

## 13. What Phase 6 assumes of Phase 7

Only this: **static files served over HTTP, with the two export files reachable at a configurable
path relative to the app.** No server, no build on request, no database.

The data path, the routing base path and the fallback strategy of §3 are build-time configuration,
so the same source serves a root deployment, a sub-path, or a different host, without a code
change.

Phase 7 settles where it is published and how publication relates to the weekly data commit. The
recommendation carried forward from B6: **publish the app when the app changes, and let the weekly
data commit change only the JSON it fetches.**

## 14. Open items

1. **A co-authorship network view** is supported by the data — 1,684 authors over 3,062 authorship
   slots — and is deferred ([05](05-metrics-and-data-contract.md) §7.15). A hairball is a poor
   first-paint object; revisit once the rest works.
2. **A self-contained single-file build**, inlining the data into one HTML file for offline or
   email use, was in the superseded draft and has real merit. It conflicts with B6, so it would be
   a *second* artifact rather than the primary one. Deferred; not v1.
3. **Embed mode** (`?embed=1`, chrome hidden, for an iframe on the resource's own site) is cheap
   and plausible, but nobody has asked for it. Deferred until someone does.
4. **The two pipeline defects** the app will display as stored (§5) are tracked in
   [08](08-implementation.md) §8 item 1.

## 15. Exit criteria

- [x] Audience, message and register agreed.
- [x] Views, sections and filter model agreed.
- [x] Technology, project layout and testing strategy agreed (B1–B11).
- [x] D6 and D8 answered.
- [ ] Sample export committed ([05](05-metrics-and-data-contract.md) §13) — the app cannot be
      built or tested before it exists.
- [ ] Chart kit built, with one chart end to end through it.
- [ ] Accessibility walkthrough passed on every route.
- [ ] The summary cross-check asserted against the real export.
