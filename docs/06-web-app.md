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
- *2026-09-26, §5, the stored defects it names are fixed* ([05](05-metrics-and-data-contract.md)
  §3.2). The rule stands: the app shows what the store holds and cleans nothing up. Only the
  "currently" was stale.
- *2026-09-26, §7, how a CSV cell is written, now that the writer exists.* §7 asked for CSV
  downloads without saying how a cell is written, and what goes in one — titles, author names,
  grant numbers — is third-party metadata. A spreadsheet runs a cell beginning `=`, `+`, `-` or
  `@` as a formula (OWASP's "CSV injection"), so a string cell starting with one of those, or
  with a tab or a CR, gets a leading `'`. Numbers are written as numbers and never guarded, and an
  unknown value is an empty cell, never 0. Built for the grants table the funding work needs;
  nothing on the page uses it yet. The publications CSV, BibTeX, and the SVG and PNG chart
  downloads remain unbuilt, as before.
- *2026-09-26, §11.3, a `download/` directory.* It builds files and saves them in the page — a
  Blob and an object URL, so no request leaves it (B10). Like `aggregate/` and `filter/` it
  imports no React, enforced by a lint rule, so what a spreadsheet receives is unit-tested as
  strings.
- *2026-09-26, §3, the Funding impact routes, and where the way back is kept*
  ([09](09-funding-impact.md)). §3 gains `/funding`, `/funding/agency/<key>` and
  `/funding/grant/<key>`, and a switch between Publications and Funding impact that carries the
  query string both ways. They are built behind a `VITE_FUNDING` flag, which CI turns on and the
  production build leaves off until release. The way back moves into `history.state`. An in-app
  open records the page it left, and a page offers "Back to …" only when its entry has one,
  naming that page. The in-memory flag it replaces had two faults. A publication opened from
  `/lookup` said "Back to the publications" and then went back to the lookup. And a reload lost
  the flag. Both were found while designing the chain funding → agency → grant → publication,
  which one flag cannot unwind.
- *2026-09-26, §9, the view switch is navigation, not tabs.* "Real buttons and links" did not say
  how to mark the view being read. The switch is a `<nav>` of two links, and the view being read
  has `aria-current="page"`. Each view is a page with its own address and its own history entry.
  ARIA tabs would promise panels on one page and arrow keys between them, and neither is true.
- *2026-09-26, §10 and §12.3, the data budget is 500 KiB at gzip level 9, and it is enforced*
  ([09](09-funding-impact.md) F14, §11.9). The row said 400 KB, and nothing checked it: only the
  JavaScript budget had a script. It rises for the funding block, and it now means exactly what
  the JavaScript budget means — gzip level 9, in KiB of 1,024 bytes — so 500 KiB is 512,000 bytes.
  What it measures is `uwpr_publications.json` alone, since that is the one data file first load
  fetches; `lookup_index.json` loads on demand (§10), so it is shown and not counted.
  `npm run check:data-budget` (`web/scripts/check-data-budget.mjs`) fails the web job above it, on
  `export/` and `samples/export/`. That cannot see the weekly run's export, whose bot commit starts
  no workflow ([07](07-operations.md) §6), so stage 11 measures the same file the same way and
  alerts above it ([09](09-funding-impact.md) §9.5); a Python test keeps the two constants equal.
  Measured 2026-09-26: 310,628 bytes (303.3 KiB) for `export/`, 15,188 (14.8 KiB) for the sample,
  and 64,736 bytes (63.2 KiB) for the lookup index; Node and Python agree to the byte.
- *2026-09-26, §11.3 and §12.1, one accessor for funding, and test builders held to the schema*
  ([09](09-funding-impact.md) §11, §12.10). `contract/` now reads contract 1.1's funding, and
  only through `fundingOf(doc)`. The generated types call the block required, but the loader
  accepts any 1.x export, so a 1.0 export after a rollback ([07](07-operations.md) O2) has none.
  `fundingOf` returns null for that, for a block whose `version` is null, and for one missing
  its grants or agencies; a work's listings are read through `listingsOf`, never off the work.
  Otherwise it returns an index, built once per document by `buildFundingIndex`: grants by key,
  agencies by code, each agency's children and its chain root first, and Miscellaneous found by
  its `group`, never by a code. A cycle among parents, or a parent that is missing, shortens a
  chain and never hangs or throws; the pipeline's validator refuses both, but a page must not
  hang on a file it did not check. A grant whose key or number contains `resource.identifier`,
  compared as the validator compares it, is dropped, so no figure can count the resource as its
  own funder. On valid data that is a no-op, and a test holds it to one. §12.1's schema check
  gains a second fixture: the funding builders (`test/support/funding.ts`) are validated by Ajv
  against their own definitions in the schema, so a hand-built grant cannot be one the pipeline
  could never write. Nothing on the page changes.
- *2026-09-26, §6, the funding dimensions, the scope rule, and the institution-wide position in
  the URL* ([09](09-funding-impact.md) §12.4, F4, F15). §6's dimensions gain **funding agency and
  grant**, and both views honour them, so the switch keeps one filter meaning one thing. A work
  matches an agency when any of its listings' agency chains contains it, so NIH selects every
  institute's grants, and a grant when it lists it. The predicate cannot tell from the rows
  which listings the export vouches for, so it takes the funding index as an argument. Without
  funding data, as in a 1.0 export, such a selection matches nothing, and the page shows the
  designed empty state naming it. **The scope rule** decides which grants a filtered funding
  view shows. It lives once, in `filter/funding.ts`, so the figures, charts, table and sentence
  cannot read it differently. §6 now states it, with the two readings §12.4 left open. **The
  institution-wide position goes in the URL** as `institution_wide=exclude`, written only when
  the reader excludes those awards. §6's boundary put the filters and the sort in the URL and
  per-chart state out, which did not settle a toggle that governs the whole view. It goes in by
  the sort's argument: it changes the headline people cite. Like the sort, it is view state
  rather than a filter. It narrows no publication, so clearing the filter keeps it, and it
  travels with the query string across the switch. Every existing URL and every existing
  sentence is unchanged, since the new parameters appear only when set.
- *2026-09-26, §11.3 and §12.1, the funding aggregates, and a second cross-check*
  ([09](09-funding-impact.md) §11.6, §11.7, §12.5–12.7). `aggregate/` gains `funding.ts`: every
  figure, series and page fact the Funding impact view, the agency page and the grant page will
  show, as pure functions over the filtered works, the funding index and the selection, all
  starting from the scope rule in `filter/funding.ts` rather than restating it. A generic
  `stack.ts` draws "the five largest, one pinned series, then Other", which the funding charts
  need twice; `areas.ts` keeps its own copy, unchanged. Every dollar figure carries its unknown
  count beside it, and a view reads it through one function that gives null, never 0, when no
  amount is known. **§12.1 gains the funding cross-check.** `summarizeFunding` must equal the
  export's `funding.summary` field for field, and each grant's first year, recomputed from the
  works, must equal its exported `first_year`. The summary cross-check is only worth what it
  covers, and a second summary computed apart from the views would check itself. So
  `summarizeFunding` is built from the same functions the views draw, and a definition that
  drifts on the page fails the check. It runs on the sample export, whose funding is synthetic,
  because the test builders' summaries are zeros. With no funding data it returns the summary
  of none. Nothing on the page changes.
- *2026-09-26, §7, §9 and §12.2, the funding components, the grants CSV, and the accessibility
  they owe* ([09](09-funding-impact.md) §12.5, §12.8, §12.11, §12.12). Four components are
  built, each tested on its own and none yet placed, so nothing on the page changes.
  `FundingFigures` draws the headline figures and the institution-wide switch. `GrantsTable` and
  `AgencyTable` are the two funding tables, and each view passes them its own scope, so the
  agency page reuses them. `FundingSection` is the publication's "Funding listed in this
  publication". Grant and agency links are real links that the app takes over only on a plain
  left click, as elsewhere.
  **§7's first CSV is the grants table's, and it holds exactly the visible rows.** It is built
  from the array the table renders, searched and sorted, so a reader never downloads rows they
  did not see, and a test compares the file with the table. It starts with a byte-order mark,
  because Excel otherwise garbles accented names, and an unknown total is an empty cell. The
  table's sort and search are its own state and stay out of the URL, by §6's boundary; the search
  narrows the table and never the publications, and says so beside the box. An unknown amount
  sorts last in both directions: a comparator that flips its sign would put "not known" first
  the moment the reader reverses the order. **§9 in these components:** every table has a
  caption, `th scope` and a row header, and `aria-sort` sits on the sorted header only
  (`SortHeader`). The search box has a label and a description. The switch is a labelled group of
  two `aria-pressed` buttons, described by the sentence stating the position. The funder's page is
  named for its grant ("NIH RePORTER project page for R01GM086688"), since one publication can
  list several grants. Tags are words, never colour alone, and a wide table scrolls inside itself
  on a phone. Nothing here is a live region. Each component passes axe in every state its tests
  render. The contrast half of that check stays with Playwright, once W7 and W8 place them.
- *2026-09-26, §3 and §4.2, the method page's funding section* ([09](09-funding-impact.md)
  §12.9, §12.11, §13.3). `/method` gains **`#funding`**, "How the funding figures are assembled",
  after the publication definitions and before "How current this is". Like the view, it is built
  only with `VITE_FUNDING`, so the public page is unchanged until the view is released. It ends
  with the funding definitions, in a list of their own, at the anchors the Funding impact view's
  figures link to, so §4.2's "every figure links to its definition" holds for them too. A
  fragment link to one focuses it, as for the overview's figures, and the publication
  definitions point down to them. The page has no contents list to link the section from.
  **Every count on it is the export's:** the `method` block for what became of the numbers the
  publications give as funding, and, for the grants, the same unfiltered scope the view draws,
  held to `funding.summary` by a test. **Two sources' terms are met on the page, not only in
  `NOTICE`.** NLM's "Courtesy of the U.S. National Library of Medicine" is shown with the date the
  PubMed data was read and the statement that it may not be current. The currency paragraph says
  the published rates are inverted to US dollars per unit, as the OECD's CC BY asks. The funding
  sources are a list, not a table: a row header "OpenAlex" would repeat one in the evidence
  sources' table, and a by-name lookup of that table would find two. With no funding data the
  section is one sentence. A test holds it to §12.11 rule 1, with no wording of credit or cause.
- *2026-09-26, §6, §8 and §9, the Funding impact view, a legend's non-filters, and where focus
  goes after the switch* ([09](09-funding-impact.md) §12.5). `/funding` is now the view, in
  §12.5's order, behind the flag still. It filters the publications as the overview does and
  computes the scope once, so every figure, chart, table and the live-region sentence read the
  same grants. An agency's bar and an agency's segment apply the agency filter, as §6 asks of a
  mark. The year bars and the grant types are static, and say so. Agency and grant links keep the
  query string and record the page left, as a publication's do. Playwright now runs axe on the
  placed components in both themes, excluded, by agency and as tables. It found nothing, and
  §9's contrast check is closed for them.
  **§8, "one legend": an entry that is not a filter value is plain text.** The legend drew every
  entry as a button whenever the chart could filter. So research areas' "Other" was a button
  announcing "Activate to filter by it" that did nothing; W2 kept it to leave that chart as it
  was. `ChartLegend` now draws such an entry as the static legend draws every entry, and the
  segments keep saying why in their names. This changes the research-areas legend deliberately,
  and its test says so.
  **§9, focus after the switch.** The funding view focused its `h1` on opening; the publications
  view did not. So switching back from Funding impact left focus on the document, the link the
  reader pressed having gone with its page. The publications view now focuses its `h1` when the
  switch opened it, and only then. A cold load, a filter change and a return from a publication
  leave focus as before: on a return, focus on the heading would move the reader away from the
  list they came back to. The Router records which view the switch opened, and any other step
  it takes clears that. The browser's own back and forward do not clear it, so going forward
  over a switch focuses the heading again, as the switch did.
  **§8, the chart kit gains three small options**, each tested and none changing a chart
  already drawn. `YearSeriesChart` gives `describeValue` the point and takes tooltip rows, so a
  year of grants with no known amount says so rather than reading as $0. `HorizontalBarChart` and
  `RankedBarCard` take `markFormat`, rounded dollars on the axis and beside the bar, with the
  tooltip, table and accessible name exact. The frames take a margin, and `WIDE_MARGIN` keeps a
  "$120M" tick off the rotated axis title, which `DEFAULT_MARGIN`'s counts had room for and
  dollars did not. The JavaScript is 130.2 KB gzipped, from 119.3.
- *2026-09-26, §3, §5, §8 and §9, the agency and grant pages, and the publication's funding*
  ([09](09-funding-impact.md) §12.3, §12.6–12.8). `/funding/agency/<code>` and
  `/funding/grant/<key>` are now the pages, behind the flag still, and W1's placeholder stays as
  their not-found state. Both are whole-corpus facts, like a publication, and say so; the query
  string is kept only for their ways out. **§5 gains a section:** the publication detail places
  "Funding listed in this publication" after "Why this is a UWPR publication" and before "Other
  versions". The app gives the detail the funding only in a build with the view, so the public
  page is unchanged until release, and the section is omitted with no funding data. **§3, the
  chain holds.** Every agency, grant and publication link on these pages, and in the section,
  opens through the one set of links the funding view uses, so funding → agency → grant →
  publication goes back three times, each back naming its page. A cold arrival links to the
  funding view with the reader's query. An agency page's two links into a view add the agency to
  the reader's filter. They are the switch's own step, so the publications heading takes focus
  after one, as §9 has it after the switch. **§3, Escape** still closes a page only when it was
  opened in the app, and now never from a text field: on an agency page, Escape in the grants
  search clears the box, as a search box does, and pressing it there to leave the page would be a
  surprise. **§8, the year chart gains four small options**, each tested, with defaults that change
  no chart already drawn: an axis title and a partial-period noun ("Fiscal year (October to
  September)", "fiscal year"), no running total, and a tooltip value in words. A long series thins
  its year labels by the room each needs, which never thins the publications' nineteen years more
  than the widths already did. The over-time chart's tooltip now says "not known" or a dash, as its
  table does, where it said "$0". Playwright runs axe on an agency page, a grant page (as a chart
  and as a table), Miscellaneous and a publication's Funding section in both themes. It found
  nothing. The JavaScript is 141.7 KB gzipped, from 136.0.
- *2026-09-26, §8, §9 and §12, the funding views audited, and a running total that is not
  "$0"* ([09](09-funding-impact.md) §11.8, §12.11, §14). W10 audited the funding views as a whole
  against [09](09-funding-impact.md)'s tests and rewrote nothing that held. **§12.1's "every case
  renders" now has a funding half:** `web/test/funding-coverage.test.tsx` opens with a map of
  every item of [09](09-funding-impact.md) §14's "App" bullet and every case of §11.8 to the test
  that holds it, and a test holds the map to `uwpr_pubs.sample.FUNDING_CASES`, so a case added
  there without a row fails. The cases no view test showed on the sample are rendered there, on
  the page where a reader meets each: the contract and the task order, the converted CLP and EUR
  amounts, the unconverted currency, the grant two works list in different years, NASA's grant
  from USAspending, and the grant known only by an NIH link. The honesty rules no test held on
  the sample's pages are held there too; the wording of credit or cause found none. **§8 and
  §9, the running total:** on the funding-over-time chart, which the view and the agency page
  both draw, a year before any known amount was named "…, $0 cumulative", and its tooltip read
  "Cumulative $0". A running total with nothing known in it is not a figure, so those years
  now say "no known amount yet in the running total", and the tooltip gives the table's dash,
  whose caption now says what the dash means. The year chart gains `describeCumulative` and
  `tooltipCumulative` for it; their defaults change no other chart. **§12.2's "every rendered
  state, in both themes"** now holds for funding: Playwright runs axe on the view with
  institution-wide awards excluded, its three empty states, an agency not found, a
  publication's Funding section with each kind of listing, and no funding data at all — the
  view, an agency, a grant, a publication and `/method#funding`. That last is served in the
  shape of today's real export, since CI serves only the sample, and fails on any uncaught page
  error. It found nothing. Every whole-page axe test now takes 30 s, as CI's slower runner needs.
  The JavaScript is 141.9 KB gzipped, from 141.7.
- *2026-09-27, §12.3 and §15, the suite against the real export, and NLM's attribution*
  ([09](09-funding-impact.md) R1a, §13.3). **§12.3 gains a step:** after the coverage run, the web
  job runs the unit and component tests again with `UWPR_EXPORT_DIR` pointing at the committed
  `export/`. The weekly bot's data commits start no workflow, so without it nothing checked the
  app against the data the site serves; now every push does, the summary and funding
  cross-checks above all. It takes about 30 s locally. The tests of the sample's own cases skip
  themselves there, as do the two whole-view axe tests of `/funding`, whose 755-row grants table
  takes axe 6.5 s alone in jsdom; the e2e step runs axe on the real data when pointed at it.
  **§15's last box is ticked.** The seeded export failed 8 tests on first contact, each naming a
  sample value, and revealed one defect: an unmatched number an override decided lost its
  override's reason on the publication (09's R1a entry). **§5 and the funding pages carry NLM's
  attribution** — "Courtesy of the U.S. National Library of Medicine", the date PubMed was read,
  that the data may not be current, and that NLM does not endorse the site — at the foot of the
  Funding impact view, an agency page and a grant page, and as one short line ending a
  publication's Funding section, whenever PubMed is a funding source. One component words it,
  on the method page too. The JavaScript is 142.2 KB gzipped, from 141.9.
- *2026-09-27, §5, §7, §8 and §9, the funding views read on the real export*
  ([09](09-funding-impact.md) R1b). **§7's tables:** the grants table draws its first 50 rows,
  in the order chosen, with a control to draw them all; its count and caption say how many are
  shown of how many, and its CSV holds every row the search matches. Drawn at once, the real
  export's 755 made the Funding impact view 58,024 pixels tall; it is 13,721. **Every chart's
  table alternative now scrolls in its own container**, as the funding tables did, and so does
  §5's topic table: at 390 pixels, value by agency's table and a publication's topics scrolled
  the whole page sideways, which **§9's phone layout** forbids. A caption in such a container
  stays within the width that shows. Evidence and funding cards break a run of characters with
  no space, which a funding excerpt can hold. **§8:** the funding tables' headers wrap and their
  free text may break, so the grants table's totals are on a desktop page (it was 1,705 pixels
  wide in a 1,056-pixel column), and an agency known by an acronym has its full name beside it
  in the tables and the ranked chart's accessible name, tooltip and table alternative, the axis
  keeping the short name (a bar's optional `name`). Playwright checks, on any export, that no
  funding page scrolls sideways at 390 pixels with every table open. The JavaScript is 143.3 KB
  gzipped, from 142.2.
- *2026-09-27, §3, §5 and §12, the Funding impact view released* ([09](09-funding-impact.md) R2).
  The `VITE_FUNDING` flag that kept the funding routes, the view switch, the publication's Funding
  section and the method page's `#funding` out of the production build is removed, so every
  build has them and the push that deploys it is the release. **§3's funding routes always
  exist**, and **§5's Funding section** is no longer qualified by the build. No funding page
  changes, only whether it exists. **§12:** CI builds and runs Playwright once, as `pages.yml`
  builds, with no flag in either; the tests of the flag itself are deleted (11 unit tests and the
  3 e2e specs of a build without the view), and the tests of an export with no funding data stay.
  e2e is 82 specs, all passing and none skipped. The JavaScript is 143.2 KB gzipped, from 143.3.
- *2026-09-27, §6 and §12.1, grant funding counted* ([09](09-funding-impact.md) F17, §7.4, §12).
  The funding totals stop adding lifetime totals and count each grant's funding from 2006 through
  the year of the latest publication listing it, in contract 1.2. **The app counts for itself
  under a filter**, since the ceiling is the latest publication *shown*: `aggregate/counting.ts` is
  the line-for-line twin of the pipeline's `funding/counting.py`, pure and in whole dollars,
  reading its constants from the export's `funding.counting` and the spread the pipeline exported,
  never deriving one. **§12.1's funding cross-check grows:** unfiltered, each grant's counted
  amount, rule and last listing year must equal the export's `counted_usd`, `counted_rule` and
  `last_listed_year`, and the counted series by award year must equal `counted_by_year` year for
  year and end at `counted_usd`. **A third no-data shape** (§6's funding dimensions; 09 §12.10): an
  export without `funding.counting` (1.1, as after a rollback of the data) reads as having no
  funding data, as a 1.0 export does, because no total could be shown truthfully without the
  rule. The views, the grants table's "Counted" and "Lifetime total" columns, the CSV's new
  columns and the method page's "How grant funding is counted" are 09 §12.5–12.9's. The unit
  suite is 1,918 tests on the sample and 1,791, with 127 skipped, on the real export; e2e is 89
  specs; the JavaScript is 148.5 KB gzipped, and Vite's own advisory warning for a chunk over
  500 kB minified now shows at 502.6 kB, within §10's budget (09 §16 item 16).
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

Four views, and Funding impact with its two entity pages. The overview is the page; the rest are
routes reachable from it.

| Route | View | What it is for |
|---|---|---|
| `/` | **Overview** | The figures, the charts and the publication explorer, all under one filter state |
| `/publication/<work id>` | **Publication detail** | One publication: what it is, who wrote it, and why it is counted |
| `/method` | **How this was assembled** | The method, its coverage and its limits, in numbers |
| `/lookup` | **Why is a paper not here?** | Identifier lookup against the full candidate set |
| `/funding` | **Funding impact** | The grants the publications list, under the same filter ([09](09-funding-impact.md)) |
| `/funding/agency/<key>` | **Agency** | One funding agency |
| `/funding/grant/<key>` | **Grant** | One grant |

**The overview and Funding impact are peers.** Their shared header has a switch between them, a
`<nav>` of two links, and each link carries the query string, so a filter survives the switch in
both directions. Every build has the funding routes: the `VITE_FUNDING` flag that kept them off
the public page while the view was built was removed at release (2026-09-27). An agency or grant
key is everything after its prefix, as a DOI is for a publication.

**The detail view must not cost the reader the filter they spent a minute building.** That is the
requirement; a visual overlay is not. Keeping the overview mounted behind a modal means either two
`h1`s or `inert` over a live region, which is an accessibility cost for no gain — **the URL already
carries the filter**, so the detail route preserves the query string and returning restores the
exact filtered view.

So the detail renders in place of the overview, the query survives, and the way back differs by how
the reader arrived: back to the filtered publications when they came from the overview, or to all
publications when they arrived cold on a link. Either way the URL is the same and is linkable.

**The way back is kept with the history entry.** An in-app open stores the page it left in
`history.state`. A page offers a back control only when its entry has one. The control pops the
entry, which restores that page exactly, and it names the page ("Back to the lookup"). Arriving
cold, the page links to its parent instead: all publications for a publication, the funding view
for an agency or a grant. The browser keeps the state with the entry, so the way back survives
reload, back and forward.

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
publication**; the funding the publication lists ([09](09-funding-impact.md) §12.8); other
versions; retraction if flagged.

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
as it did for one work's undecoded XML entity until 2026-09-26 ([05](05-metrics-and-data-contract.md)
§3.2) — it is visible. Decoding entities in the app would mask future extraction bugs and risks
double-decoding text that legitimately contains an escaped character. The fix belongs in
extraction; the app's job is to show what the store holds.

The same applies to a stored title that is a filename, as one was until 2026-09-26. It renders
as stored.

## 6. Filtering

One filter state drives every figure, every chart and the explorer. The dimensions are
[05](05-metrics-and-data-contract.md) §9's: year, research area at four levels, journal,
institution, country, author, open access, kind, how the publication is known, and whether it is
on the resource's own list. [09](09-funding-impact.md) §12.4 adds **funding agency and grant**,
which the publications view honours as well as the Funding impact view.

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
- **The funding dimensions** ([09](09-funding-impact.md) §12.4). A work matches agency *A* when
  any of its grant listings' agency chains contains *A*, root first, so `agency=NIH` matches
  every institute's grants and Miscellaneous is selectable. It matches grant *G* when it lists
  *G*. Codes and keys ride as they are, with the `:` percent-encoded. The predicate takes the
  funding index (`fundingOf(doc)`) as an argument and reads listings only through it. With no
  funding data, as in a 1.0 export (or, from contract 1.2, one without `funding.counting`), a work
  lists nothing, so an agency or grant selection matches nothing and the empty state names it.
  Chips read "Funding agency: *name*" and "Grant: *agency short name, else name* *number*"; a
  code or key the export lacks shows raw.
- **The scope rule** ([09](09-funding-impact.md) F15) decides which grants a filtered funding
  view shows. It applies to the distinct grants listed on the filtered publications:
  - restricted to the selected agencies, by the listing's chain, when any are selected;
  - restricted to the selected grants, when any are selected;
  - the two restrictions combine with AND, like dimensions, so `agency=NSF` with an NIH grant
    selected shows none;
  - a grant selection overrides the institution-wide toggle;
  - Miscellaneous, found by its group, is kept only when no grant is selected and the agency
    selection, if any, includes it, unless it is the grant selected.

  A selected institution-wide award is shown while they are excluded, and a selected
  Miscellaneous number likewise. The rule lives once, in `filter/funding.ts` (`grantsInScope`),
  and the aggregates build on it. The Funding impact view's live-region sentence says "41 grants
  listed on 88 of 338 publications matching Year: 2020." When the exclusion is in effect it adds
  "Institution-wide awards are excluded." It says nothing of the exclusion while a grant is
  selected, since the toggle then does not apply.
- **State is in the URL** and survives reload, back and forward, and sharing. **The boundary:** the
  filter dimensions and the explorer's sort go in the URL, because they are what someone means by
  "this view". Per-chart view state — which series a frame is showing, the bucket size, whether
  staff are included — does not, because a shared link would then carry half a dozen parameters
  nobody set deliberately. **The institution-wide position goes in**, by the sort's argument:
  one deliberate choice that changes the headline people cite. It is written as
  `institution_wide=exclude` only when the reader excludes them, since the default is included
  ([09](09-funding-impact.md) F4). Like the sort it is view state, not a filter. It narrows no
  publication, so clearing the filter keeps it, and the switch between the views carries it
  with the rest of the query. The Funding impact view's by-agency stack, its bucket size, its
  ranking by value or by count, and the grants table's sort and search stay out. The table's
  search never narrows the publications.
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

**Every CSV is written by one utility,** `download/csv.ts`: RFC 4180 quoting and CRLF line
ends; an unknown value is an empty cell, never 0; numeric columns carry unformatted numbers, so a
spreadsheet can sum them; and a string cell beginning `=`, `+`, `-`, `@`, a tab or a CR is
prefixed with `'`, because titles, names and grant numbers are third-party text a spreadsheet
would otherwise run as a formula. Files are built and saved in the page, with no request (B10).

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
  from the shared kit (§11.2), not per-chart decisions. A legend entry that is not a filter
  value, such as "Other", is text, never a control that does nothing.
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
- The switch between views is a `<nav>` of links, and the view being read has
  `aria-current="page"`. It is not ARIA tabs, because each view is a separate page with its own
  address. The funding view and the publication, agency and grant pages move focus to their `h1`
  when they open, so a reader who switched or opened one hears where they are. The publications
  view does so when the switch opened it, and not on a cold load or a return from a publication.
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
| Data transferred on first load, gzipped at level 9 | ≤ 500 KiB (512,000 bytes) |
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

**Both size budgets are enforced**, each by a script in the web job: `check:budget` for the
JavaScript and `check:data-budget` for the data, which measures `uwpr_publications.json`, the one
data file first load fetches. Stage 11 of the pipeline measures that file the same way and alerts
above the budget, because the weekly export is committed by a run that CI never sees
([09](09-funding-impact.md) §11.9; changed 2026-09-26).

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
    aggregate/       pure functions: every metric in 05 §5, every chart's series, 09's funding figures
    filter/          filter state, URL encoding, predicate building
    charts/          the shared kit, then one module per chart
    views/           overview, publication detail, method, lookup
    components/      figures, filter chips, publication list, evidence, tables
    format/          numbers, dates, names, author lists
    download/        CSV writing and the in-page save; no React
  test/              unit and component tests
  e2e/               Playwright specs
```

The `aggregate/` and `filter/` layers import nothing from React. That boundary is what makes the
metric definitions testable as arithmetic, and it is enforced by a lint rule rather than by
intention. `download/` is held to the same rule, so what a spreadsheet receives is tested as
strings.

## 12. Testing

Industry-standard tooling, plus three checks specific to this project that are worth more than any
of the generic ones.

### 12.1 The project-specific checks

| Check | What it catches |
|---|---|
| **The summary cross-check.** The app's unfiltered aggregates must equal the exported `summary` block, which the pipeline computes independently ([05](05-metrics-and-data-contract.md) §1.2). | A metric implemented to a different definition than the pipeline used. This is the single highest-value test in the suite: two independent computations of the same number. |
| **The funding cross-check.** The app's unfiltered funding figures (`summarizeFunding`) must equal the exported `funding.summary`, field for field, and every grant's first year, recomputed from the works, its `first_year` ([09](09-funding-impact.md) §11.6, §11.7). It is built from the functions the funding views draw. *(From 2026-09-27, contract 1.2:)* every grant's unfiltered counted amount, rule and last listing year must equal its `counted_usd`, `counted_rule` and `last_listed_year`, and the counted series by award year `counted_by_year`. | The same fault in the funding figures. A grant counted twice, an unknown amount summed as $0, an investigator keyed differently, or a first year read from the export instead of recomputed would each show here; so would the app's counting rule drifting from the pipeline's. |
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
type-check, unit and component tests with coverage, the same tests against the committed real
export (`UWPR_EXPORT_DIR`), build against the budgets of §10 (the JavaScript bundle, and the data
first load fetches, on `export/` and `samples/export/`), and Playwright. The job fails on a budget
overrun, so neither can grow unnoticed.

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
- [x] The summary cross-check asserted against the real export — 2026-09-27, in CI on every push
      ([09](09-funding-impact.md) R1a), with the funding cross-check and the first-year check.
