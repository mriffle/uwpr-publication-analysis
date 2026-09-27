# Phase 9 — Funding Impact Specification

**Status:** Agreed · 2026-09-26 · the input to implementation. Changes from here are made
deliberately, dated, and noted in this header.
**Purpose:** show the funding behind the publications UWPR supports — the grants those papers list,
what the grants are worth, which agencies award them, and how that total accumulates over time —
with every grant traceable to the paper that lists it and every amount to the funder's own record.
**Depends on:** [01](01-discovery-strategy.md), [02](02-data-model.md) and
[03](03-retrieval-pipeline.md) (frozen); [05](05-metrics-and-data-contract.md),
[06](06-web-app.md) and [07](07-operations.md) (agreed). It changes each of them, and §15 lists
every dated note those changes need.
**Supersedes:** [05](05-metrics-and-data-contract.md) A7, §3.1 and §14 item 2, which left funders
and grants out of v1 and said reopening them was a Phase 2 schema change plus a Phase 3 fetch
change. It is less than that: funding lives beside the work files, not in them (§8).

**Every figure in this document was measured on 2026-09-26** against the committed store (338
works, rule version `2026-09-26.1`), by research scripts that were not kept — they lived in a
session scratchpad, as [08](08-implementation.md)'s own spec-phase scripts did. **This document is
therefore the only durable record of that research.** Its appendices transcribe the case tables
and the per-grant measurements; no later milestone may depend on the scratch files. Where two of
the research's own files disagreed, the section says so rather than choosing silently. Figures
that are estimates, not measurements, say so and name the milestone that measures them. **Before
landing, the figures were checked again against the research's saved files** and corrected where
they differed; B6's live measurements of the same day are folded into §5 and §17.

The milestones named here — M0, B1–B10, W1–W10 and R — are those of the approved implementation
plan. [08](08-implementation.md) records them as they are built.

**Changes since agreement:**
- *2026-09-26, §13.2, B10 confirmed the smoke controls live, and they never block.* F16 says a
  funding failure never blocks the publication update; the smoke step comes before the run, so it
  holds there too. A funding check is shown and classified like any other, and `smoke` exits 0
  whatever it shows. The measured answers are in §13.2.
- *2026-09-26, §13.3, the terms as B10 re-read them.* Three differ from the table as first written:
  USAspending's CC0 is the licence of its API's source code, and no licence is stated for its data;
  NLM's terms require an exact phrase, clearly shown, and a statement that the data may not be
  current; and the OECD's licence is CC BY 4.0, which asks for changes to be indicated. The table
  and §13.3's note say what was found and where.
- *2026-09-26, §3.5 and §11.9, the export's size by the budget's own measure* is 310,628 bytes,
  not 310,651. The larger figure was `gzip -9`, whose header carries the file's name (23 bytes);
  the budget, like the JavaScript one, gzips the bytes alone. Node's `gzipSync` and Python's
  `gzip.compress` agree to the byte. The default-level figure moves the same way, to 334,481.
- *2026-09-26, §17, the `workflow_dispatch` run with funding enabled moves from B10 to B9*:
  funding cannot be enabled before the seed. *§15, `RUNBOOK.md`'s funding sections (§13.4) move
  from B10 to B7*, whose report section, `--funding full` and alerts they describe; B10 updates
  the schedule and the smoke checks there.
- *2026-09-26, B4 — the store's line shapes, where §8.3 was silent.* §8.3 now states every field's
  type and vocabulary as the schemas hold them. Two are additions, not choices between readings:
  **an NIH link carries the key it lists** (`grant`), because a VA grant's key is `VA:…` and a
  contract's `NIH-contract:…`, so the key cannot be derived from RePORTER's core; and a string's
  `method` is **null** for a resource code, a facility contract, or a not-grant no override named,
  which no listed method describes. Invariant F1 also requires one line per work, grant, probe
  and agency (§8.6), and §6.6's warning is skipped, with one warning, in a store with no
  `funding/` yet.
- *2026-09-26, B3 — the resolver, the amounts and the rates as built, where §6-§8 were silent or
  the research's own outcomes needed a rule to reach.* Appendix A passes whole under these, and
  they are the choices B7 and B5 build on:
  - **A string is pooled per work by the override match key** (§6.6: case, spaces, dashes, and
    droppable parentheses and trailing punctuation), and shown as its most frequent written form,
    so `NRF-2016R1A5A1010764` in one source and the same with a Unicode hyphen in another are one
    string, named by both sources' funders. The other forms are kept for `cited_as` (§11.2).
  - **§6.1's separators gain a spaced dash between two numbers** (`RTG 2467 - 391498659`), which
    A9.19 and A9.20's "not merged" needs; a comma inside parentheses splits nothing.
  - **A fragment lists the longest number it is part of** (§6.10): `ANR-10` beside both
    `ANR-10-IAHU-0001` and `ANR-10-IAHU- 01` lists the first, as A9.17 says. The rule merges a
    fourth pair Appendix F left apart, NKFIH's `2018-1.2-1-NKP` into `2018-1.2.1-NKP-2018-00005`
    on W-000396, and keys SNSF's `181503` as `SNSF:P2ZHP3181503`, beside `P2ZHP3_181503`.
  - **An agency's `number_pattern`, when set, is what its numbers must fit.** Among several
    agencies named, one the number does not fit is out, and one whose pattern fits beats one with
    none: KHIDI over NRF Korea, Gates over NWO (whose numbers are digits), the Swedish Foundation
    for Strategic Research over the Research Council. NOAA's pattern makes Washington Sea Grant's
    `R/SFA-8` Miscellaneous, as A6.43 says, where "the number stands" alone would key it
    `USA:NOAA:RSFA8`.
  - **Whose a declined string is:** a full NIH-format number is NIH's, whatever else is named; a
    configured agency named beats NIH, HHS or PHS; either beats one unconfigured OpenAlex funder
    (`F<digits>:`); several unconfigured funders, or none, give Miscellaneous.
  - **Attribution is by funder ID and PubMed's agency alone, for every agency,** as §6.4 says for
    NIH: a Crossref funder entry with no registry DOI names nothing. Under the sources' own
    attribution, 15 of Appendix F's 270 rows gain a Miscellaneous key on some work that way
    (`tests/test_funding_appendix_f.py` lists them, each with its reason); the report lists every
    one, for an override. The registry's other "NSF"s, the National Sleep Foundation and Norway's
    nurses' union, which publishers chose for NSF's own numbers, are configured under NSF, whose
    API still decides. *Amended by B3a, below: for agencies other than NIH, HHS and PHS, a whole
    name given without an ID now names the agency, and 4 of the 15 rows remain.*
  - **A Miscellaneous key** keeps an NIH-format string's written number without type or suffix
    (`MISC:R01GM122864`), and otherwise the letters and digits left once labels are stripped; every
    key segment is folded to ASCII (`ÚNKP-21-3` is `NKFIH:UNKP213`).
  - **Contracts:** `N01…` numbers parse as NIH numbers and are keyed as contracts; a task order
    whose IDIQ neither RePORTER nor the work names is keyed alone, `NIH-contract:<task order>`.
  - **Amounts:** every amount from OpenAlex is flagged `amount_from_openalex`, as B4's sample
    has it; a stated OpenAlex amount of 0 is no amount; of a grant's several OpenAlex awards, the
    lowest ID decides; an end date that is a year alone counts as its 31 December. NSF's
    categories use the API's award type ("Fellowship Award"), which §8.3's NSF facts do not keep,
    so the category is decided when the facts are fetched.
  - **Configuration:** `funding.yaml` carries `schema: 1`; an agency may give `short_name`,
    `parent` (BBSRC's is UKRI) and `categories` (NSF's, §11.4); `facility_contracts` and
    `not_grants` mix numbers or strings with patterns, each with a reason; NSF programmes are
    `{name, pattern, reason}`. The institute codes are NIH's list, RePORTER's, the historical RR,
    RM, CM and HV, the VA's BX, CX, HX and RX, and AHRQ's HS; not CDC's.
  - **Rates:** G.5A's Venezuelan bolívar is left out, because one series spans four currencies
    (VEB, VEF, VES, VED); the other 22 of G.5A's 23 have 1999-2025 (§5.10, Appendix D).
- *2026-09-26, B3a — a whole funder name, where its source gives no ID, names a non-NIH agency.*
  B3's ID-only attribution sent 15 of Appendix F's 270 rows to Miscellaneous on some work, 11 of
  them because the only source naming their funder is a Crossref funder entry with no registry
  DOI: Washington Sea Grant's `NA14OAR4170078` and the EU consortia `823839` and `115760`, all on
  Appendix B, NSF's `OCE 1633939`, and grants of funders not configured at all. **An agency may
  now carry `funder_names`** (§8.4): patterns matched against the whole of a funder's name — NFKC,
  casefolded, whitespace collapsed, the punctuation around it trimmed — never a part of it, and
  only for a sighting that carries no funder ID; a name given beside an ID is ignored, and the ID
  decides. An agency named so counts exactly as one named by ID, in planning and in resolving,
  and §6.4's several-funders rule applies unchanged. **NIH, HHS and PHS never have them**, and the
  schema and the rules both refuse them: a name pattern is what once swept USDA numbers into NIH
  (§6.4), and an NIH-format number is NIH's whatever is named. Names are configured for NSF, NOAA
  (Washington Sea Grant), the EU (the Commission's H2020 programme, EPIC-XS and IMI's ZAPI) and
  UW's Royalty Research Fund, and four agencies are configured by name alone, amounts from
  OpenAlex: the Chinese University of Hong Kong, Hong Kong's Research Grants Council (with the
  UGC's Area of Excellence scheme, the research's "RGC/UGC"), the Hawaii State Department of
  Health and DLR. Every pattern is tested against look-alikes — the Swiss National Science
  Foundation, the National Natural Science Foundation of China, CUHK-Shenzhen, DLR's
  Projektträger, India's University Grants Commission — and against every other configured
  agency's name. Under the sources' own attribution, **the rows that differ from their agency's
  keys fall from 15 to 4**: CIHR's `PJT-206152` (Crossref gives CIHR's ROR alone, with no name),
  IMI's `115766` (OpenAlex names only Genome Canada, Ontario Genomics and EFPIA), NSF's
  `IOS-1922541` (PubMed's agency is an investigator's name) and `1097737` (Wellcome and CIHR both
  named, neither pattern deciding). Nothing else moves: resolved with the names taken out, every
  string on every work is as B3 left it, and exactly 11 strings move, one for each of the 11
  rows, each from a Miscellaneous key to its agency's one key. Appendix A's 187 cases pass as
  before, and Appendix F's rows still come to 267 keys; `funding_version` is `2026-09-26.2`.
- *2026-09-26, B5 — the export as built (§11), where it was silent.* The contract's shape is
  §11's exactly; these are the readings W3 and B7 build on:
  - **What counts is a projection.** Only exported works' citations lines count, only the grants
    they list cross, and only those grants' agencies, with every parent. There is **no funding
    data** exactly when no exported work has a line, whatever `enabled` says: the export reads no
    configuration but the rate sources and the store's own `overrides.yaml`, so turning funding
    off after the seed leaves the committed data showing until `funding/` is removed. `version` is
    the newest `funding_version` among those lines.
  - **`as_of`** is the newest manifest whose `funding.mode` is `full`. No manifest records a mode
    until B7, so until then it is the latest `checked` of any exported grant; `export` prints the
    date it used.
  - **`sources[]`** lists a source when an exported grant's facts, or an exported work's strings,
    NIH links or JATS checks, come from it, dated by the latest of those dates; in §11.3's order.
    The four amount sources keep the names `amount_source` gives them (`NSF Award API`,
    `USAspending`); JATS is `pmc`, "PubMed Central". Only RePORTER reports by fiscal year, so only
    it has a `partial_year`. **`exchange_rates[]`** is every configured rate source whenever
    there is funding data, its currencies sorted and `through_year` its last year.
  - **`fiscal_years`** keeps a null year (§8.3), and the check is that the years with amounts sum
    to `amount_usd`, or, with no amount, that every year is null. It is exported for every grant
    with RePORTER facts, contracts and task orders included (their years are their rows), while
    the amount is RePORTER's or there is none; beside an amount from OpenAlex it would not sum,
    and is null. **`start_year`** and `end_year` are the first four digits of `start` and `end`,
    except an NIH grant's `start_year`, the first fiscal year RePORTER holds.
  - **`amount_original`** leaves the stored decimal through `Decimal`: an integer when whole, a
    float only when its shortest form is the same decimal, and otherwise refused.
  - **Links:** RePORTER's project page for any grant with RePORTER facts (NIH grants, contracts
    and task orders), NSF's award page (`https://www.nsf.gov/awardsearch/show-award/?AWD_ID=<id>`)
    for an NSF grant, USAspending's award page for a `us_federal` one with its facts; null
    otherwise. One real page of each form was fetched on 2026-09-26 and answered 200. **NSF's
    older `showAward?AWD_ID=` form now answers with two redirects to `show-award/?AWD_ID=`**, so
    the export writes the form NSF serves directly (changed at merge).
  - **`override`** comes from the `grant` entry that decided one of the work's override strings
    for that grant (the first in sorted order, if several), matched through the aliases. The
    `export` command now reads the overrides beside the store, as `validate` does, not the
    project's: the sample's work IDs are not the real store's. An override string no entry
    attributes is a validation error, not a listing without its attribution.
  - **`method.resolution`** counts every pair by its method, so an override saying "not a grant"
    counts under `override`; `works_without_funding_metadata` is exported works with no line or
    no strings.
  - **The validator** also refuses a `schema_version` other than the contract's, a `url` without
    its `url_name`, and fiscal years with an amount beside a null `amount_usd`; given the store's
    citations lines (the pipeline passes them) it checks each listing's `how`, `cited_as` and
    `override` against the strings and links exactly. `grants[].agencies` and `cited_as` have at
    least one item, so the generated TypeScript types them as non-empty tuples.
  - `lookup_index.json` shares the one `schema_version`, so it reads 1.1 too; its shape is
    unchanged.
  - **§11.8 gains one synthetic case**, a corrected form beside an exact one (`cited_as` with
    `how: listed`), which is the shape §11.2 exists for and the one the real data shows. The
    synthetic funding sits in `samples/export_cases.json` beside two more SAMPLE works (2019 and
    2021), so that a grant can be listed in two years; its grant override is there too, since
    `samples/overrides.yaml` must name only the sample store's works.
- *2026-09-26, W4 — the filter and the scope rule (§12.4) as built, where they were silent or
  read literally would mislead.* These are the readings W5–W7 build on:
  - **A selected Miscellaneous grant is in scope.** Read literally, "Miscellaneous grants are kept
    only when no grant is selected" drops a Miscellaneous number the reader selected. The view of
    the publications listing it would then show no grant at all. The clause keeps unmatched
    numbers out of a view narrowed to *other* grants, which the grant restriction already does, so
    a selected one is kept, as an explicit grant selection overrides the institution-wide toggle.
    Miscellaneous is still found by `group`, and otherwise kept only when no grant is selected
    and any agency selection includes it.
  - **The agency and grant restrictions combine with AND**, as dimensions do: `agency=NSF` with
    an NIH grant selected selects the publications listing both and shows the grants that are
    both, which is none. The agency restriction reads each listing's `agencies` chain, the test
    the publication predicate applies. So every grant kept comes from a listing that made its
    publication match.
  - **With no funding data** (§12.10) a work lists no grant, so an `agency` or `grant` selection
    matches no publication, and the publications view shows its designed empty state naming it.
  - **The institution-wide position is view state, not a filter.** It narrows no publication, so
    clearing the filter keeps it; it rides in the query string, so the switch carries it (§12.2).
    Any value of `institution_wide` but `exclude` reads as the default.
  - **The funding sentence** states an exclusion as a second sentence, "Institution-wide awards
    are excluded.", so it cannot be read as a chip. It says nothing while a grant is selected,
    since the toggle then does not apply. With nothing selected it reads "…, no filter applied.",
    as the publications sentence does.
  - **Chips** read "Funding agency: *name*" and "Grant: *agency short name, else its name*
    *number*" ("Grant: NIGMS R01GM086688"); a code or key the export lacks shows raw.
- *2026-09-26, B7a — the stage (§9) as built, where §9 was silent or the build differs.* Stage 8b is
  `stages/funding.py`, called as `Pipeline.funding(works)` between stages 8 and 9; with
  `enabled: false` it carries the stored funding forward and asks nothing, and every earlier
  pipeline test passes unchanged. These are its readings:
  - **A string is decided afresh only when every source that has shown it was read in this run.**
    Otherwise it keeps its stored decision, unless the new one needs no funder — an override, a
    not-grant, the resource code, a facility contract, or an NIH grant or contract RePORTER
    resolves — or the override that made it has been lifted. PubMed and Crossref are read only for
    new records and at a full refresh, and JATS once (F16), so without this a string OpenAlex and
    PubMed both write would be decided from both at a full refresh and from OpenAlex alone the
    week after, and could move between agencies every month. A string no source showed this run
    stands for itself in its work's company (a bare serial, a fragment, a task order), keeps its
    sources, funders and dates, and is never removed (§9.4). **Its stored `raw` stays its display
    form**; the most frequent form (B3) names only a new string. PubMed's `Agency` is shown among
    its `funders`, as §8.3's example has it, and still decides only as PubMed's agency.
  - **A new record** is one of a work that had no citations line after the last run; its PubMed and
    Crossref are read then, and a record whose first read failed waits for the next full refresh.
    A PMC record whose XML cannot be fetched is not marked in `jats_checked`, so it is asked again;
    `jats_checked` keeps only the work's current records.
  - **Which failures keep a work's stored line.** A sighting source down (PubMed, Crossref)
    degrades, and the work is decided from the sources that answered. An answer source down or
    deferred — RePORTER's links or probes, NSF, USAspending, OpenAlex's awards — keeps the stored
    line of any work that needed an answer neither this run nor the store gives (a held grant's
    facts, or any lookup), and a new work gets no line yet. A fact refresh that fails keeps the
    stored facts. A reply of a changed shape is a failure like an outage, including a RePORTER row
    without an application ID or fiscal year, or an amount that is not a number.
  - **The memo.** `lookups.jsonl` holds each miss, and each institute-and-serial probe whatever it
    found (the bare-serial rule needs the answer again); a probe now answered positively is
    dropped, since the grant's facts remember it. A probe asked again gets `recheck_after` today +
    90 days, and its `checked` moves under P11 while the answer is the same, to today when it
    changes. An incremental refresh never asks a miss again before its date, or its line would move
    every week. The questions are written `core:<CORE>`, `split:<IC>:<SERIAL>` and
    `contract:<NUMBER>` (RePORTER), `award:<ID>` (NSF), `award:<AGENCY>:<NUMBER>` (USAspending) and
    `award:<G…>` (OpenAlex). USAspending is asked for the number as keyed, its letters and digits;
    whether that misses a number USAspending writes with a dash is B9's to see.
  - **When a full refresh is due:** there is no manifest with `funding.mode: full`, 28 days have
    passed since the newest one started, or that one's `version` is not the current
    `funding_version` — so a bump whose refresh was deferred stays due. **The window** is a Saturday
    or Sunday in New York, or the configured hours there; a naive time is UTC. **The cap** is
    checked before each RePORTER question, counting every RePORTER request of the run, links
    included, so one question's pages are never split. **Active within 365 days** is an end (a
    date, or a year's last day) or a RePORTER fiscal year on or after that date; a grant with no
    facts is asked as a new key would be, the memo applying.
  - **A link to a contract** names RePORTER's truncated core (`27220170005`), which `resolve_work`
    cannot key: the stage asks for rows under that core as a prefix, takes the one whose application
    is the link's, and keys the contract from its project number, restoring `HHSN`, and a task
    order's letter as F (FAR 4.1603). The stored link keys it thereafter. Not yet seen live.
  - **A grant's record** comes from its latest parent row (title, investigators by `profile_id`,
    organisation), with the earliest start and latest end of its rows; an NIH grant's agency is
    that row's `agency_ic_admin` abbreviation, under NIH, and another RePORTER agency's grant (VA)
    is that agency's. NSF gives `pdPIName` and `awardeeName`, USAspending the recipient, and an
    OpenAlex-valued grant its lowest-numbered award *(one with a record, B9a)*. `number`'s written
    form (§11.4) counts the strings whose letters and digits contain the key's number, so a
    fragment is not its display form. `checked` moves under P11 when the grant's facts were
    fetched in this run. **A grant's OpenAlex awards** are those its strings carried this run and
    those it already had.
  - **Agency lines:** a configured agency's from the config; an institute learned from RePORTER
    (`origin: reporter`, parent NIH, `us_federal`, `US`); an unconfigured OpenAlex funder from its
    funder record, fetched when new and at a full refresh (a US country makes it `us_nonfederal`,
    any other `non_us`), else named as its sighting names it; and one fixed `MISC` line.
  - **NSF's award type is stored** (`facts.nsf.type`, §8.3), where B3 above read it as decided when
    the facts are fetched: the category is recomputed every run from stored facts (§7.3), so the
    type must be kept. Optional in `grant.schema.json`, so B4's fixture validates unchanged.
  - **The manifest** (§9.6): with funding disabled the block holds only `version` and
    `fingerprint`, as before; a skipped run, or one that carried its funding forward after an
    error, records `mode: skipped`; `requests` counts requests sent, not cache hits, by source —
    `reporter`, `nsf`, `usaspending`, `openalex`, `crossref`, `pubmed` and `pmc` (PMC's JATS, which
    stage 4 has usually fetched already); `amount_usd` is every known US-dollar amount, never below
    zero, which the run schema refuses.
  - **The self-check** (§9.4) writes the four files to a scratch directory and runs invariants
    F1–F7 on them, then builds the export stage 11 would; an export problem that the same export
    without funding also has is not funding's, and is left for stage 11. On the test fixture a
    first run asks RePORTER 5 times (links, one batch of cores, three institute-and-serial
    probes), NSF, PubMed and Crossref once each, USAspending twice and OpenAlex twice.
  - **Stage 11** exports the stage's funding with the run's aliases, and `as_of` is the run's date
    when it made a full refresh — what a rebuild from the store reads back from its manifest.
- *2026-09-26, W5 — the funding figures and series (§12.5–12.7) as computed, where they were
  silent.* `web/src/aggregate/funding.ts` holds them, and W6–W8 draw them:
  - **Miscellaneous is counted apart from every grant figure but two.** An unmatched number is
    not known to be a grant of any agency, kind or value. So "grants listed", the count with no
    known amount beside the total, the agencies, investigators and organisations, the grant
    types and the value over time are all over the grants not in Miscellaneous, and the
    unmatched numbers are stated beside them. Only two figures count them. The funding
    sentence's "*N* grants listed on *K* of …" counts every grant in scope and every publication
    listing one, as W4 built it. And new grants by agency draws them as their pinned series. The
    grant-types chart leaves them out of "other", although §11.4 writes their category as
    `other`. On valid data this changes no sum, since a Miscellaneous grant has no amount (§11.7).
  - **No series is drawn at $0.** Value by agency stacks known amounts only. An agency whose every
    amount is unknown, and Miscellaneous, have nothing to stack and get no series. The unknown
    count is stated beside the chart, as §12.11 rule 3 asks. It defaults to single years, the
    Total view's frame, and new grants by agency to three-year buckets.
  - **The agency ranking** keeps Miscellaneous out of the ranked list, as its own row. Agencies
    tie-break on the other measure, then the label. The bars rank root agencies, which the
    agency filter takes. The table's "parent" column reads each grant's own agency, so it ranks
    at that level (NIGMS, with parent NIH).
  - **Coverage follows the scope,** so it adds up with *K* of *N*. "Publications with none" means
    none in scope, not "no funding metadata". The contract carries that only as the method
    page's corpus-wide `works_without_funding_metadata`, so there is no fourth, "not available"
    segment. "How many amounts start at FY1985" counts grants flagged `starts_before_fy1985`.
  - **The institution-wide position** counts as *included* while the toggle is on, or while a
    grant is selected, since the selection overrides it. When they are excluded, the awards "left
    out" are what the include position would add under the same filter.
  - **The agency page** shows an "assigned to no institute" remainder only for an agency with
    children, and only when some grant is its own. It lists children by value, and its
    publications newest first, as the explorer does. **The grant page** takes its partial fiscal
    year from RePORTER's source, since `fiscal_years` is RePORTER's alone. It shows the fiscal
    years the export holds, a null year as "no amount reported", and invents no year. It finds its
    source by the name `amount_source` gives.
  - **The summary is recomputed from the view's own functions.** `summarizeFunding` uses the
    scope, figures, coverage, agency ranking and first-year increments the views use, so the
    cross-check tests what the page shows. The app finds Miscellaneous by `group`, and the
    summary counts `status`. So the check also holds the two equal, as the schema says they are.
    `amount_usd_nih` and `nih_grants` read the root agency coded `NIH`, the pipeline's own
    constant.
  - **Names are keyed as the pipeline keys them.** JavaScript has no `casefold`, so `toLowerCase`
    is followed by the full foldings a name plausibly carries: ß and ẞ become "ss", and final
    sigma becomes σ. Whitespace is split as Python's `str.split()` splits it, not as `\s`. A test
    holds the result to Python's output for each case.
- *2026-09-26, B8 — the sample's real funding, and the stage's first live run.*
  `samples/build_sample_store.py` now runs stage 8b over the sample it has just built, as a full
  refresh, and commits `samples/store/funding/`. Funding stays `enabled: false`; the build passes
  the stage's `even_if_disabled`, which the pipeline never does. It runs only inside RePORTER's
  window, and stops on any degradation.
  - **What the live run confirmed.** 13 works, 57 grants, $452,773,861 known: 29 NIH grants from
    RePORTER's parent rows (P30DK017047 at **$52,843,525**, §5.1's figure to the dollar), 6 NSF, 2
    NASA from USAspending, 9 OpenAlex amounts (SEK, EUR, USD), and 11 without an amount; 5
    institution-wide, 2 Miscellaneous. Requests: RePORTER 3 (the links, then two batches of
    cores), NSF 6 (one per award), USAspending 3 (a search, two details), OpenAlex 2 award pages
    ($0.0002), Crossref 1, PubMed 1, PMC 10; 15 s. Every field the stage reads came back in the
    shape B7a read it: RePORTER's link and project rows, NSF's `transType`, USAspending's
    flattened detail (NNX14AJ87G's null `end_date` is USAspending's own), OpenAlex's
    `institution_awarded` list. Nothing degraded, so the stage needed no fix. A same-day rebuild is
    byte-identical, `funding/` and the export included; it sent no PMC request, the XML being
    cached.
  - **What it could not see.** No sample paper links a contract, so B7a's contract-link
    restoration is still unseen live, as is `DE-SC0010566` at USAspending: both are B9's. The
    R37 probes of the R01s (12 cores) and USAspending's O-for-0 and I-for-1 readings of the NASA
    numbers (3) were all misses, remembered for 90 days.
  - **What it showed that the rules leave to B9.** Crossref's newer deposits name a funder by ROR
    (`id: [{id-type: ROR}]`), not by a registry DOI, or by a name alone. On W-000014 two
    Crossref-only strings fall to Miscellaneous for it. `DGE-2140004` is under "National Science
    Foundation Graduate Research Fellowship Program", which NSF's name patterns do not match
    whole. `FWO G087625N` is under "Research Foundation – Flanders" (ROR 03qtxy027): FWO has no
    name pattern, and no rule reads ROR IDs, as B3a noted for CIHR. The same work lists
    NSF:2140004 from OpenAlex's `2140004`, so its Miscellaneous key is the twin of a resolved grant.
    A name pattern or a ROR rule in `funding.yaml` is B9's call. *B3b, below, reads both names.*
  - **The sample cases, verified (§11.8; §16 item 12 closed).** Every planned work ID holds but
    one: the grant known only by an NIH link is R35GM150919 on W-000009, since PubMed, Crossref
    and JATS also write W-000011's. T32GM007750 on W-000001 starts before FY1985 (the grant in
    1979, RePORTER's amounts in 1985). Institution-wide adds EPIC-XS (W-000009) and VR's
    infrastructure grant (W-000004) to the planned three. Nine real cases are
    `REAL_FUNDING_CASES`, which read only the real works' listings, so a synthetic case cannot
    stand in for a real one. Four are facts the export does not carry: `3p30dk017047-45s2` keyed
    to P30DK017047, the AHA named for W-000007's `P30 DK017047`, the resource code on W-000001,
    W-000006 and W-000007, and the gepris amounts refused on DFG:461264291 and DFG:497694394.
    `tests/test_sample_funding.py` holds them against the store. None was dropped.
  - **A later day differs** in `metrics/`; in `funding/`, whose active grants gain fiscal years and
    whose dates are the build's; and, it turned out, in `works/`. Six days after the last build,
    OpenAlex had revised author names, ORCIDs or affiliations in 12 of the 13 work files, and one
    PMC article's XML had changed. The sample export is 26,989 bytes (§11.9).
- *2026-09-26, B7b — the report's Funding section, the total-drop alert and `explain` (§9.5, §9.6),
  where they were silent.* `uwpr_pubs.funding.report` writes the section from the stage's result
  beside the store the run started from, and it changes no decision, amount or file. §13.4's
  additions are `RUNBOOK.md` §15. These are its readings:
  - **A review list names an entry once**, in the run that first finds it, and counts it after:
    OpenAlex disagreeing by more than 1%, untagged awards of $20M or more, and grants seen only
    beside another. They stay true for as long as nobody acts, and repeating them weekly would
    bury what is new. A week with nothing new says so in one line. **A first run counts its grants
    by agency** rather than list hundreds as new, which on the seed is the useful view.
  - **The nearest RePORTER candidates** are cores the stage already knows. They come from
    RePORTER's answer to an institute-and-serial probe (`split:` in `lookups.jsonl`), the work's
    NIH links and the store's held grants. A core counts if it has the string's institute and
    either its serial or one a single edit away (§6.5). Nothing is asked to list them, and
    `explain` shows the same for an unresolved string or `MISC:` key.
  - **"Seen only beside another" (§6.10)** reads as: two grants of one agency valued by OpenAlex
    alone (a configured agency or an OpenAlex funder), where every work listing the one lists the
    other. NIH's, NSF's and USAspending's numbers are confirmed by the agency's own records, so two
    of them are two grants. A pair always seen together is named once.
  - **"Outside NIH's centre mechanisms" (§6.15)** means that a RePORTER grant of category `center`
    is left out. NIH contracts and every other agency's awards are listed, if project-scoped and
    of $20M or more.
  - **An override not applied** is a grant override whose string is not on its work's line, a
    merge followed, or whose work has no line. It is the validator's not-seen warning, in the
    report.
  - **A run that decides no funding says so in one line in the Store section**, not a Funding
    section. It is disabled, skipped (`--funding skip`, or any `--channels` run), or carried
    forward after the stage failed. So a disabled run's report differs from the one before B7 by
    that line alone. The stage's notes move into the section, beside its figures. The manifest's
    `note` keeps them, prefixed `funding:`. Writing the section cannot fail the run (F16).
  - **The total-drop alert** compares `amount_usd` with the last manifest that records a funding
    `mode`, a skipped run's included, in exact decimal arithmetic. It fires above
    `total_drop_alert`, never at it. §9.5's "no funding degradation" is read as the stage's own
    (`stage:funding`) or a source the stage asked (its causes begin `funding:`); a source that
    failed for discovery alone does not silence it, because the next run compares with this
    run's total and a real fall would then never be reported *(narrowed at merge from any
    `source:*`)*. A source that is down never removes a grant (§9.4). A work that leaves can fire
    it: excluding one paper takes 11.5% of the stage test's small total.
  - **`explain <grant key>`** takes any key in any case, trying an identifier as a work first. On
    a store without `funding/` it says so, and a key exits 1. The CLI reads NIH's institute codes
    from `config/funding.yaml`, so an unresolved string can show its nearest cores. If the config
    does not load, only those lines are lost.
- *2026-09-26, B3b — OpenAlex is compared only with a lifetime total, and two more funder names
  are read (§7.1, §6.4).* Two fixes found in review of B8's sample, which was then rebuilt with
  them.
  - **`amounts_disagree` compared unlike figures for NIH.** §7.1 flagged any grant whose agency
    and OpenAlex amounts differ by more than 1%. For an NIH grant that set RePORTER's lifetime sum
    of parent rows beside an OpenAlex amount of provenance `nih_exporter`, which is one fiscal
    year's award, so it flagged grants that agree: B8's sample flagged P30DK017047, $52,843,525
    against $89,000. §3.3's "101 of 102 agree" compared only NSF's and USAspending's figures,
    which are lifetime totals as OpenAlex's is. **OpenAlex is now compared with the agency's
    figure only where its basis is `nsf_obligated`, `nsf_estimated` or
    `usaspending_obligation`**, never a RePORTER basis (`COMPARED_WITH_OPENALEX` in
    `funding/amounts.py`), and §7.1 says so. NSF 2245300, stale in OpenAlex, is still flagged.
  - **Two funders Crossref names by ROR, with no registry DOI.** B8 left W-000014's `DGE-2140004`
    ("National Science Foundation Graduate Research Fellowship Program") and `FWO G087625N`
    ("Research Foundation – Flanders") in Miscellaneous. B3a's rule is unchanged: whole names,
    casefolded, only for a sighting with no funder ID. NSF gains patterns for its GRFP, only
    where the name says it is NSF's ("NSF Graduate Research Fellowship Program (GRFP)", "NSF
    GRFP"). FWO, configured by ID already, gains its English and Dutch names: "Research
    Foundation – Flanders" with any dash or none, "Fonds (voor) Wetenschappelijk Onderzoek –
    Vlaanderen", "Flemish Research Foundation", "FWO" and "FWO-Vlaanderen". The look-alikes are
    tested: "Graduate Research Fellowship Program", which does not say whose; the NDSEG
    fellowship; the SNSF; the F.R.S.-FNRS; Austria's FWF; VIB and VLAIO; and sentences that name
    the GRFP or FWO among other things. Appendix A's 187 cases pass, and Appendix F's rows still
    come to 267 keys: the names move no Appendix F string, whose one FWO name without an ID sits
    beside FWO's ID. `funding_version` is `2026-09-26.3`. No rule reads a ROR ID, so a sighting
    that gives a ROR and no name, as CIHR's `PJT-206152` does (B3a), is still Miscellaneous; B9
    will see how many the seed has.
  - **The sample, rebuilt live** inside RePORTER's window, on Saturday evening in New York, which
    is 2026-09-27 UTC, the date its funding lines now record. The stage sent B8's 26 requests
    (OpenAlex $0.0002), and a second build, sending 16, PMC's being cached, was byte-identical.
    P30DK017047 lost `amounts_disagree`, leaving NSF 2245300 the sample's only disagreement.
    W-000014's `DGE-2140004` is now `NSF:2140004` and `FWO G087625N` is `FWO:G087625N`, grants
    W-000006 already lists, so the sample holds 55 grants, not 57, with $452,773,861 known as
    before, and no Miscellaneous grant or agency line. Beyond that only dates moved; `works/` and
    `metrics/` are unchanged. The sample export is 26,927 bytes (§11.9).
    `tests/test_sample_funding.py` holds both fixes against the store.
- *2026-09-26, W6 — the funding components (§12.5 items 2, 4 and 6; §12.8), where §12 was
  silent.* `FundingFigures`, `GrantsTable`, `AgencyTable` and `FundingSection` are built, and the
  funding definitions, but none is placed yet (W7–W9). These are the readings W7–W9 build on:
  - **"Publications listing a grant, *K* of *N*"** counts the publications that list a grant
    that is not in Miscellaneous (`withGrants`, the summary's `works_with_grants`). Beside it, the
    figure says how many more list only unmatched numbers, as "grants listed" states the
    unmatched numbers beside it. The funding sentence keeps W4's count, which includes them.
  - **The total, empty or unknown:** with no grant listed it shows a dash and says there is no
    total; with grants but no known amount it shows "Not known", with the count. Neither ever
    shows $0. **The institution-wide position** is one sentence beside the total. It names the
    count and the value of the awards included, or of those left out. An unknown value is never
    given a figure, as in "Including 2 institution-wide awards, none with a known amount". A
    grant selection that holds an exclusion off is said in words, so the switch is not read as
    broken. Without a handler, the switch is not drawn and the position is still stated. That is
    the agency page's case (§12.6), whose figures include every award.
  - **The grants table lists unmatched numbers as rows**, tagged "unmatched number", under
    Miscellaneous, with no amount. They are in scope, and a reader searching for a number the
    paper wrote should find it. With no amount, they sort among the unknowns. The tags are
    words, in a fixed order: unmatched number, institution-wide, active, amounts from FY1985,
    amounts from FY2008 and not converted. Each one changes how a total reads.
  - **The search** matches every word the reader types against a grant's number and key, its
    title, every agency on its chain (so "NIH" finds an institute's grants), its investigators
    and its organisation. A number with other spacing or dashes still matches its number or key.
  - **The CSV's columns** are the key, number, title, agency (label, code, top-level), principal
    investigators, organisation, start and end years, type, tags, total in US dollars, original
    amount, currency and rate year, the amount's source and date, first listed, publications
    and the link. The first-listed year and the publication count are the view's, under the filter.
  - **The agency table's parent** links to the parent's page, and **Miscellaneous is its last
    row**, outside the sort, tagged "unmatched numbers".
  - **The publication's section with funding data but no listing** still appears, and says that
    no grant is listed in the funding statements read, which is not a finding that the work had
    no funding. Only with no funding data at all is it omitted. **An NIH link and a corrected
    listing each say how the grant was reached.** An NIH link reads "the funder's own publication
    records link this grant … the funding statements read here do not name it", because §12.8
    gives such a grant nothing else to say. A corrected listing reads "matched … by correcting the
    number as the paper wrote it". Either stands beside "also written in the paper as …" wherever
    `cited_as` is present. A converted total shows its original and the rate year; an unknown one
    says why ("no source read here reports an amount for it"). **Unmatched numbers are quoted
    as text, without links**: a link would lead to a page with nothing to add. Their grant pages
    still exist.
  - **The definition anchors** are `funding-total`, `funding-grants`, `funding-agencies`,
    `funding-investigators`, `funding-organizations`, `funding-publications` and
    `funding-institution-wide`. `fundingDefinitions` adds `funding-unmatched` and
    `funding-first-year`. Each carries its corpus value from the view's own functions, and a test
    holds the values to `funding.summary`. With no funding data every definition stands and none
    has a value. They stay out of `metricDefinitions` until W9 places them, so the method page
    does not change before then.
- *2026-09-26, W9 — the method page's `#funding` section (§12.9) as built, where it was silent.*
  `web/src/views/MethodFunding.tsx` renders it and `web/src/method/funding.ts` counts what it
  states. These are the readings R builds on:
  - **Where, and when.** After the publication definitions and before "How current this is",
    and only in a build with `VITE_FUNDING`. With no funding data it is one sentence, and **the
    funding definitions are not shown.** `fundingDefinitions` can state them without values, but
    under "no funding data" they would define figures the site does not show.
  - **The method block's counts are stated as they are, with no remainder.** `resolution` counts
    four of a string's methods, and its `override` includes overrides that decided "not a
    grant", so the four do not sum to `strings.grant`. The other matched strings are other
    agencies' numbers standing as written (`agency_number`, `openalex_award`), which the block
    does not count. The page gives the outcomes, then the four methods, then says that other
    agencies' numbers stand as written, with no count it does not have. The total of `strings`
    is "the numbers the publications give as funding, each counted once for each publication".
  - **What a total means is stated source by source, with each one's grant count** by
    `amount_source.basis` over the grants listed. A grant whose amount is in a currency no rate
    covers counts under its source, and a source no grant takes an amount from is not described.
    The first fiscal years (FY1985, FY2008) and the fiscal year in progress are read from
    `sources[]`, never written into the app.
  - **NLM's phrase** (§13.3) is on the method page whenever `sources[]` has `pubmed`, dated by
    that source's `as_of`. Beside it: "may not reflect the most current data available from the
    National Library of Medicine", and that NLM does not endorse the site. The Funding impact
    view does not carry it. Whether the footer should when the view ships is still R's call, as
    §13.3 left it.
  - **The inversion is indicated without naming a licence**, since the app hard-codes no
    source's terms. Of every rate source, the currency paragraph says that most currencies are
    published per US dollar and that the rates used are inverted and rounded to ten significant
    digits, "a change made here to the data as published". That covers every OECD rate, and all
    but four of G.5A's.
  - **The total's definition** now says "not money spent on this work", §12.11 rule 2's words and
    the view's, where W6 wrote "not money spent on the work that lists them".
- *2026-09-26, W7 — the Funding impact view (§12.5) as placed, where §12.5 was silent.* The view
  is §12.5's in its order, and these are the readings it settles:
  - **The value-by-agency segments apply the agency filter**, as new grants by agency's do.
    Item 3 makes the year bars static because their year is a first year. A segment's series is
    an agency, whatever its year, so it is a mark like any other agency mark. "Other" is never a
    filter, in the plot or in the legend.
  - **Ranked by value, an agency with no known amount is not drawn**, since its bar would stand at
    $0. The note counts such agencies and says to rank by grants to see them. Miscellaneous is
    never ranked, and it has no value, so by value the note names it. By grants it is its own
    last bar, tagged "unmatched numbers" and selectable, since §12.4 makes it a filter value. The
    chart draws fifteen agencies and counts the rest, as the overview's ranked charts do.
  - **Grant types are one card with a By value / By grants switch.** They are static in both.
    A type with no grant is not drawn. By value, a type whose grants all lack an amount is left
    out and counted, as the agencies are.
  - **Nothing known is a dash, never $0.** In the year table, a year with no grant entering is a
    dash. A year whose grants all lack an amount reads "not known", and the grants entering and
    those with no known amount have columns beside it. A year's accessible name says both counts.
    In the value-by-agency table, a cell with no known amount is a dash, and the caption says it
    is not $0.
  - **The empty states replace §12.5 items 3–7 with one block.** The headline figures stay above
    it. With no publication matching it is the overview's chart-empty state, once. With
    publications matching but none listing a grant in scope, it says so, and that this is not a
    finding that the work had no funding. When every grant in view is an excluded
    institution-wide award, it says so instead, pointing at the switch. Each offers to remove the
    last filter.
  - **The Miscellaneous sentence** links to the view with the agency selection set to
    Miscellaneous alone, the rest of the query kept ("Show only the unmatched numbers"). It is
    left out when that is the view already. Coverage always states the FY1985 and active counts,
    and states the unconverted count only when there is one.
  - **Agency and grant links keep the query string**, like a publication's, and the in-app open
    records the page left. W6's note that a grant's link carries "nothing of the filter" is
    superseded. The entity pages already read the query for their way out, and a new tab now
    lands on the same address as the in-app open.
  - **The grants CSV is named `<short name>-grants-<export date>.csv`**, as
    `uwpr-grants-2026-09-26.csv`.
- *2026-09-26, W8 — the agency and grant pages and the publication's Funding section (§12.3,
  §12.6–12.8) as built, where they were silent.* These are the readings R builds on:
  - **Both of the agency page's links carry the reader's filter plus the agency**, the rest of
    the query kept. §12.6 said so of the first only. The switch keeps one filter meaning one
    thing, so "See funding impact for this agency" is the same selection in the other view. An
    agency already selected is not added twice. The links sit under the facts, where a reader
    deciding where to go next finds them, rather than after the publications. Each is the
    switch's own step, and pushes no way back.
  - **The agency's figures are W6's, over every exported work**, with the agency selected and
    institution-wide awards included, and no switch. Two differ from the view's. "Funding
    agencies" is left out, since it is one agency by construction. *K* of *N* reads "of every
    publication here, whatever the filter", not "of the publications shown". The facts add the
    agency's kind (`group`).
  - **The breakdown** is a table of the agencies within it that have a grant, largest known
    total first, each linking to its page. The remainder is its last row, "Assigned to no
    institute", which is not a link: it is the page's own agency. With no amount known at all,
    the page draws no value over time and says why, rather than bars at $0.
  - **Miscellaneous's page** has no facts, total or value over time. A Miscellaneous number is
    not known to be any agency's grant, or to have any value (§4). It counts the unmatched
    numbers and the publications giving one, lists the numbers in the grants table as written,
    and words its two links for the numbers ("Filter the publications to those giving an
    unmatched number"), not for "this agency", which the page says it is not.
  - **The per-fiscal-year chart draws no running total.** Before the first reported amount a
    running total is "$0 so far", which reads as a figure. The facts state the lifetime total, and
    the note says the years with an amount add up to it. A grant whose every fiscal year reports
    no amount, as the VA's may, gets the table alone and a sentence saying there is nothing to
    draw. A grant with no fiscal years says which source gave its total instead, or that none
    gives an amount. An unmatched number's page has no amount section at all.
  - **The facts say what the total adds up**, by `amount_source.basis`, in a clause that
    summarises the method page's account of that source, with the date it was read. They give the year the source's amounts
    begin from `sources[].amounts_from`, as W9 reads it, and add the first-listed year. The
    identity line links the agency and its parent.
  - **A publication on the grant page carries `ListingNotes`**, the Funding section's own words
    for a listing: "Also written in the paper as …" wherever `cited_as` is present, how an NIH
    link or a correction reached the grant, and an override's reason, by whom and when. The two
    places cannot word a listing differently.
  - **The Funding section is given only in a build with `VITE_FUNDING`**, and is omitted with no
    funding data (§12.10). With data, a work listing nothing keeps the section and its sentence,
    as W6 built it.
  - **Escape never closes a page from a text field.** On an agency page it clears the grants
    search, as a search box does. The pages are keyed by code or key, so moving from one agency
    to another starts afresh, and the grants table's search and sort with it.
  - **W7's over-time tooltip** now says "not known" or a dash for a year with nothing known, as
    its table does, where it said "$0" (§12.11 rule 3).
- *2026-09-26, B9a — five faults the seed's rehearsal found.* The seed was rehearsed as a full
  live run on a scratch copy of the committed store, with funding enabled at `2026-09-27.1` and
  the overrides it will commit, then run again the same day and a week on; B9b records the seed
  itself. The rerun is what found three of the five: a first run cannot show that a second one
  changes it.
  - **A component's number after an NIH serial left the string unread** (§6.2). PubMed and
    Crossref write a centre's component after the serial (`P30 ES007033-6364`,
    `P42 ES004696-5897`, `P50 NS062684-6221`), and one JATS award ID writes the support year and
    then the component (`S10 RR023044-010001`). The parser took the dash and two digits for a
    support year, found more digits running on, and gave the number up, so 15 strings on seven
    works became 8 Miscellaneous keys, each beside the core its work already lists; the research
    had resolved all of them. A dash and four digits, or a year and four digits, after a whole
    six-digit serial are now a suffix, and §6.2's table gains the row. After fewer digits the dash
    may split the serial (`R01-HL1-26028`), so nothing there changes. Appendix A's 187 cases and
    Appendix F's 267 keys pass unchanged.
  - **The test suite read the committed `enabled`.** Switching funding on failed 31 tests: every
    pipeline test loading the project's configuration asked NIH RePORTER, which the fake sources
    do not answer, and ended degraded. Tests now run with a copy of `config/` that differs only in
    `enabled: false`, as they already run without the project's `overrides.yaml`; a test that
    wants funding enables it on its own copy, and only the test pinning the committed files
    reads `config/` itself.
  - **A fragment lost its whole on an incremental run** (§6.10). OpenAlex, read every run, writes
    AEI's `100576` and `PID2023` and SNSF's `181503` and `194379`; the numbers they are fragments
    of come only from PubMed, Crossref or JATS. A stored string no source showed stands in its
    work's company without its funder, so it named no agency, and the rerun keyed each fragment
    alone, as four new grants the next full refresh would have taken back. `resolve_work` now
    takes those strings' stored keys (`standing`) into the fragment rule's company.
  - **A string's method moved with the forms read.** A string written several ways is named by
    its most frequent form, and its method read from that form, so with PubMed and JATS unread
    eight NIH strings moved between `exact` and `normalised` (`R01HL126028` beside
    `R01-HL1-26028`), and a decision that needs no funder always replaced the stored one. It now
    does so only when it lists something else or is an override's; a full refresh decides every
    string afresh as before.
  - **An override's OpenAlex awards were read a run late, and cost grants their record.**
    Planning skipped a string an override decides, so its awards were read only when the grant
    next came up for a refresh. Asked for with the rest, they then showed that *a grant's record*
    (B7a's "its lowest-numbered award") could be a bare award: OpenAlex mints one per funder and
    string, most with no title, investigator or organisation, and 19 grants had lost theirs to
    one. The record now comes from the lowest-numbered award that has one, and is chosen again
    only when every award read before was read again (a full refresh, or a grant due a refresh);
    otherwise the stored record stands.
  - **Seen live for the first time.** USAspending's FAIN for a DOE Office of Science grant is
    written without its dash (`DESC0010566`), so asking by letters and digits finds it (B7a's
    question). The contract-link restoration is still unseen: RePORTER links no paper to an
    `HHSN` contract, and the one linked contract, `N01HV028179`, keeps its core.
  - **§17's B9 figures** are B9b's to record, from the seed itself; the rehearsal proposed the
    overrides the seed commits beyond Appendix E's nine, each with its evidence in its `reason`.
- *2026-09-26, W10 — the audit of the app against §11.8, §12.11 and §14, where they were
  silent.* Every §14 "App" item and every §11.8 case is held by a passing test, and
  `web/test/funding-coverage.test.tsx` maps each to its test. These are the readings it settles:
  - **A running total with nothing known in it is not a figure.** Rule 3 says unknown is never
    $0, and W8 applied it to the over-time chart's yearly value; the running total still read
    "$0 cumulative" in the name of each year before the first known amount, and "$0" in its
    tooltip. Until a year in which a known amount enters, the running total now reads "no known
    amount yet in the running total", and the tooltip and the table give a dash. From that year
    on, it is the sum, as any running total is.
  - **"Every sample case renders" is a test of the map, not only of the cases.** The map names
    each case as `uwpr_pubs.sample.FUNDING_CASES` does, and a test reads `sample.py` and fails if
    a case has no row. Each case is found by the app's own reading of it, not a copy of the
    Python predicate, and shown on the page where a reader would meet it.
  - **"Accessibility in both themes" is every state of every funding route**, §12.5's three empty
    states and §12.10's no funding data included. CI serves only the sample, which has funding
    data, so the no-data state is checked by serving the export changed to the shape the
    pipeline writes without funding, today's real export's; the check also fails on any uncaught
    page error, which is §12.10's "nothing throws".
  - **Left to R:** the funding unit tests read the sample's funding and are not all marked
    sample-only. Pointed at today's real export (`UWPR_EXPORT_DIR`), which has none, 69 tests in
    12 files fail; the Playwright specs, which skip what the served export lacks, pass. R runs the
    unit suite against the seeded export and marks sample-only what depends on a synthetic case.
- *2026-09-27, B9 — the seed, and two targets the rehearsal redefined.* Run
  `2026-09-27T02-15-live` seeded the real store: a full live refresh at `funding_version`
  `2026-09-27.1`, started on a Saturday evening in New York, inside RePORTER's window. It took 286 s
  on a warm cache, stage 8b about two minutes of it, and OpenAlex $0.0130. It ended ALERT only
  because bioRxiv's `details` failed for the third run in a row, which is a discovery source.
  - **The maintainer's decisions** (2026-09-26):
    - Appendix E's nine overrides and all 14 the rehearsal proposed are committed, dated
      2026-09-27, the seed's UTC day.
    - `S10OD032290` stays Miscellaneous (§16 item 1).
    - **CIHR's `178013_1` on W-000102 is overridden to `MISC:1780131`.** OpenAlex matches it to an
      unrelated hepatitis C grant ($674,480), which does not fit a 2013 paper on PARP-1. The
      probable mismatch is kept out of the total and shown as unmatched.
    - A grant override may name a `MISC:` key for exactly this. `178013_1` must be quoted: YAML
      1.1 reads it as the integer 1780131.
  - **§17's figures, from the seed:**
    - 310 works list a grant that is not Miscellaneous (≥ 309).
    - 479 RePORTER cores: 478 NIH and `VA:I01BX000531` (≥ 473).
    - The 454 linked cores come to $6,217,332,093, exactly the target.
    - The three contracts and the task order are exactly their targets: $24,791,405, $10,781,559,
      $18,117,838 and $1,471,125.
    - The NIH-format strings left in Miscellaneous are exactly `S10OD032290`, `R01GM122864` (two
      works) and `P01 HL0996`. None is new.
    - No M&O contract and no `UWPR95794` is a grant: 26 facility-contract strings and 132
      resource-code strings are excluded.
    - All 23 Appendix B keys are listed and tagged.
    - The 11 CLP grants are converted at OECD's rate for their start year.
    - The export is 440,753 bytes gzipped at level 9 (430.4 KiB).
    - Funding adds 2.1 minutes to a full run: 286 s, against the rehearsal's 160 s without
      funding. It adds about 20 s to an incremental one: stage 8b of a same-day rerun, which took
      105 s in all.
    - A same-day rerun on a copy changed only `runs/` and the export's `generated_at` and
      `run_id`. The +7-day replay is the rehearsal's (B9a).
  - **Two targets the rehearsal redefined:**
    - *Works with any funding string* is **319**, not ≥ 329. §3.1's 329 counts works with funding
      *information*, and 10 of them name a funder with no number in any source: OpenAlex
      `funders` without `awards` (W-000046, -053, -062, -092, -111, -125, -128, -548, -566), and
      PubMed's HHMI with a null `GrantID` (W-000037). With §3.1's 9 works that have nothing,
      19 works have no string, and nothing is missing.
    - *OpenAlex agrees with the agency* on **62 of 63** comparable grants (98.4%, not ≥ 99%). The
      one is `NSF:2245300`: $1,199,760 from NSF, against OpenAlex's stale $905,320 (§3.3). The
      research's 101 of 102 also compared sources v1 does not read (§5.9). Under v1's bases, one
      known-stale grant is 1.6%, and no rule changes for it.
  - **Against the rehearsal**, every figure is the same but for the CIHR override:
    - 755 grants, 748 resolved and 7 Miscellaneous (the rehearsal had 749 and 6);
    - 617 with an amount (618);
    - $7,888,899,029, which is the rehearsal's $7,889,573,509 less $674,480;
    - 472 investigators (473);
    - 213 grants seen only beside another (214, one of them the CIHR pair);
    - 8 unresolved strings, the rehearsal's seven and `178013_1`;
    - 24 strings decided by override (23).

    The requests were the rehearsal's exactly: RePORTER 58, NSF 56, USAspending 26, OpenAlex 30,
    Crossref 9, PubMed 2.
  - **What else the seed changed:**
    - Every work file's dates, once. The last committed manifest had no `overrides_fingerprint`,
      so all 377 records were read again.
    - W-000392 gained R2 from Crossref's award metadata. The deposit changed after the last
      committed run, and the rehearsal saw it too.
    - Six cache pointers name the local cache's copies of PMC texts, which differ from CI's
      ([08](08-implementation.md) §5).
  - **Three tests assumed the real store held no funding**, and failed on the seeded one:
    - The real export's test now asserts what any export obeys.
    - The no-funding validator cases build their own document.
    - The real-store export test builds as `export` does, with the store's own overrides. Without
      them, a listing a grant override decided has no attribution (§11.2).
  - The `workflow_dispatch` run with funding enabled follows the merge.
- *2026-09-27, B9c — the sample rebuilt with B9a's fixes.* The committed sample was B3b's, built at
  `funding_version` `2026-09-26.3`, before B9a's fixes and the seed's version, so it no longer
  matched a fresh build, which §17's B8 box promises. It was rebuilt live inside RePORTER's window,
  on Saturday evening in New York, which is 2026-09-27 UTC, B3b's own UTC day, so no date it
  records moved.
  - **What moved.** Every citations line's `funding_version`, to `2026-09-27.1`. And two Swedish
    Research Council grants gained their record (B9a, *a grant's record*). Each lists a bare
    `crossref_work_funders` award, with no title, investigator or years, numbered below the award
    that carries its amount, and B8 had taken the record from the bare one. `VR:201900217` is now
    "National Microscopy Infrastructure", Hjalmar Brismar, 2020–2024, and `VR:202003380` is
    "Crosstalk between phosphorylation and ubiquitination at the level of short linear motifs",
    Ylva Ivarsson, 2021–2024. Their amounts already came from the other award and are unchanged,
    so the export's investigators rise from 36 to 38.
  - **What did not.** 55 grants, 46 with an amount, $452,773,861 known; no Miscellaneous grant or
    agency line; the same five institution-wide; `NSF:2245300` still the only disagreement.
    `works/`, `metrics/`, `candidates.jsonl` and the lookup index are byte-identical. B9a's suffix
    rule moves no sample string, and its rerun fixes act only on an incremental run, which the
    build never makes. Every `FUNDING_CASES` predicate and `tests/test_sample_funding.py` hold, and
    no test pinned a value that moved; that file now holds the record fix against the store too.
  - **Requests.** B8's 26 (RePORTER 3, NSF 6, USAspending 3, OpenAlex 2, Crossref 1, PubMed 1,
    PMC 10) on an empty cache, in 13 s, for $0.0002 in OpenAlex award pages. A second build the
    same day sent 16, PMC's being cached, and its store and export were byte-identical. The sample
    export is 27,004 bytes, 26.4 KiB (§11.9).
  - The build's docstrings said funding is disabled in `funding.yaml`; it has been enabled since
    the seed. They now say so, and that the build still passes `even_if_disabled`, so the sample's
    funding does not depend on the switch.
- *2026-09-27, R1a — the app against the real, seeded export.* W10 left the funding unit tests
  reading the sample's funding; the seeded `export/` (755 grants, $7,888,899,029 known) was their
  first real data. Run against it (`UWPR_EXPORT_DIR`), the suite failed 8 tests in 4 files, and
  the e2e specs, which read their keys from the served export, all passed.
  - **What failed, and why.** Every failure named a sample value, not a real fault. Five
    `describe` tests and one `FundingFilter` test named the sample's synthetic grants
    (`NIH:R01GM999001`, `ANID:1599A0999`), which the real export does not have, so their chips read
    the raw key. `Funding.test` used `NIH:R01GM086688` as a key no export has, and the real one
    lists it on 34 works. `FundingFlagOff`'s sweep of every publication timed out at 5 s: the
    real export's 338 pages take 3.7 s alone in jsdom and 8.9 s beside the rest of the suite.
  - **Rewritten to hold for any export (8).** The tests name grants both exports list
    (`NIH:P30DK017047`, `CANCERFONDEN:222380PJ`, `NSF:1908587`), or a key asserted absent first,
    and the sweep has the page sweeps' 30 s. The sample's synthetic grant, task order, funder and
    unmatched number keep their assertions, in two new sample-only cases.
  - **Sample-only until now, and holding for any export (10).** They asserted invariants, and were
    marked sample-only while the real export had no funding: the honesty rules on every funding
    page (rules 1, 2, 6, 7 and 10), the funding definitions' corpus values, the method page's
    partial year, and the Funding section over every listing. Rule 1 read the export's own words
    as the app's: real grants are titled "Cancer Center Support Grant" and "…to enable novel
    analysis approaches". It now leaves out the titles, names and organisations the page quotes.
    Two sweeps are added for any export: **rule 3** on the view and every agency page, as charts
    and as tables, in the words and in each mark's name (39 real agency pages have years before
    any known amount, each named "no known amount yet in the running total", never "$0"), and
    **rule 4**, the headline's institution-wide position both ways. The funding cross-check's
    "reads an export with funding data" no longer skips a real export without any.
  - **Made sample-only (2), for time.** The two whole-view axe tests of `/funding`: on the real
    export, whose grants table has 755 rows, axe takes 6.5 s alone in jsdom and 14 s under the
    suite's load. Axe on the real `/funding` is the e2e step's, in both themes. The 97 tests the
    real export skips are the sample's own cases — docs/05 §13's, the synthetic funding cases, and
    the pages and chain built on the sample's grants and works — and these two.
  - **The cross-checks hold on the real export.** The summary cross-check, the funding cross-check
    (every field of `funding.summary`, investigators and organisations with the same keys, and
    every year of `by_first_year`) and the first-year check run and pass on both exports. Neither
    side was wrong.
  - **One defect the real data revealed.** W-000102 lists `MISC:1780131`, the string B9's
    maintainer decision keeps unmatched. The Funding section quoted an unmatched number and dropped
    its listing, so the override's reason, author and date, which §12.8 asks of every override,
    were shown nowhere on the publication; and the grant page's listing notes called the decision
    "Matched by a recorded decision". The sample has no override to a `MISC:` key, which B9 was the
    first to write. The section now gives an unmatched number its listing notes, less the form it
    already quotes, and both places say "Kept unmatched by a recorded decision, not by a rule".
    Found by running the listings test on the real export; tests on built documents hold both.
  - **NLM's attribution where funding data is shown** (§13.3). `NlmAttribution` is W9's wording, now
    the one component: shown when `sources[]` has `pubmed`, dated by its `as_of`, with the
    statement that the data may not be current and that NLM does not endorse the site. It is on
    the method page, at the foot of `/funding` (above the footer), an agency page and a grant page,
    and as one short line ending a publication's Funding section. It is absent without `pubmed`,
    and with no funding data. Axe is clean on it in jsdom, and in both themes in the browser on
    every page that carries it, on the real export.
  - **CI.** `check.yml`'s web job runs the unit suite against `export/` after the coverage run.
    The weekly bot's commits start no workflow, so every push holds the app's figures to the
    committed real data. It takes 23–31 s locally, against the job's 15 minutes. The e2e step
    still serves the sample.
  - **The gate.** On the real export: 1,516 unit tests pass and 97 skip; build, both budgets and
    the 80 e2e specs with the flag pass, axe included on `/funding`, NIH's page, a grant page, a
    publication's Funding section and `/method#funding`, in both themes. On the sample: 1,613 pass
    at 98.6% line and 91.9% branch coverage, and e2e passes with and without the flag. The
    JavaScript is 142.2 KB gzipped, from 141.9; the real export 440,730 bytes (430.4 KiB).
- *2026-09-27, R1b — the funding views on the real data.* R1a made the tests hold on the seeded
  export; R1b read every funding page on it as a reader would, light and dark, at 1,280 and 390
  pixels. The sample has 55 grants and a handful of agencies. The real export has 755 grants, 71
  root agencies (98 in all, 53 with no known amount), 208 grants typed `other`, a publication
  listing 25 grants and an unmatched number a decision kept apart, and none of these had been
  seen on a page. Nothing here changes a grant's scope or amount: NASA's `NCC958` ($583,518,208)
  and the $1,214,918,218 of institution-wide awards are data, and the headline's
  institution-wide sentence already states them.
  - **The grants table draws the first 50 rows** (§12.5 item 6), in the order chosen, with "Show
    all *N* grants" beneath it. Drawn at once, the real export's 755 made `/funding` 58,024
    pixels tall at 1,280 wide, with the coverage section at 57,010, and axe took about 10 s on
    the page. It is now 13,721 pixels, coverage at 12,682; the NIH page 19,939, from 62,817. The
    count and the caption say how many are shown of how many ("the first 50 of 755, in the order
    chosen"). **"A CSV of exactly the visible rows" now reads as every row the search matches**,
    in the order shown, those beyond the first 50 included: the search decides which rows the
    reader asked for, and the cut only how many are drawn. The button names the count it holds
    ("Download these 755 grants as CSV"). The two whole-view axe tests R1a made sample-only for
    time run on either export again.
  - **The tables fit a desktop page.** The grants table was 1,705 pixels wide in a 1,056-pixel
    column, so its totals were beyond the right-hand edge at 1,280; the agency table 1,249, its
    caption cut off. Headers and row headers were held on one line, so one long name (the UCSF
    tobacco centre's) or written number (`ANID/BASAL/FB210008 (M.V.G.)`) set its column's width
    for every row. Headers now wrap; a title, agency, investigator or organisation may break a
    long word, with a minimum width; a number may break after "/" or ":" (by `<wbr>`, so its text
    is unchanged) and, when longer than NIH's eleven characters, anywhere; an original amount
    may break after its currency code; and the grants table is set a little smaller. Both fit
    at 1,280 with every row drawn. *(Changed after merge: an institution now breaks only between
    words, since "anywhere" let the column shrink until RePORTER's capitals broke inside a word,
    "NORTHWESTE / RN"; and the least widths leave the grants table about 40 pixels inside its
    column on macOS's fonts, since CI's Linux fonts, 2–3% wider, drew it 8 pixels too wide and
    failed R1b's own check. The e2e check now also holds the table in its column with every row
    drawn, and no institution broken inside a word.)*
  - **No page scrolls sideways on a phone** (docs/06 §9). At 390 pixels a chart's table
    alternative (value by agency's, 905 pixels wide) and a publication's topic table scrolled the
    whole page, as did a funding excerpt that runs award numbers together with no space. Both
    tables now scroll in their own container; evidence and funding cards break such a run. A
    caption in a scrolling container stays within the width that shows, where it ran off with
    the columns.
  - **An agency known by an acronym is named in full.** Most of the 98 are acronyms (VR, SSF,
    OD, NCRR, DOI). The table of every agency and an agency's breakdown give the full name
    beneath the short one, and the ranked chart's accessible name, tooltip and table give both
    ("VR (Vetenskapsrådet)"); the axis keeps the short name.
  - **The ranked agencies' note adds up to the headline.** It said "the 15 largest of 21
    agencies" beside a headline of 71, and only then that 50 have no known amount. It now says
    "the 15 largest of the 21 agencies with a known amount are drawn; the other 6 are in the
    table of every agency below", then the 50.
  - **"Other" is said not to be a kind of award.** All 208 of the real export's `other` grants
    are from agencies other than NIH and NSF, whose grants alone are typed (§11.4); it is the
    second type by count and the third by value. The grant-types card says so, counted by
    `otherKind`. An unmatched number's type reads "not known", not "Other", in the table and the
    CSV, as the chart already counted it under none, and Miscellaneous's page calls its rows
    unmatched numbers, not grants.
  - **An unmatched number a decision kept apart says so.** `MISC:1780131`'s page said "No
    funder's record matched this number"; OpenAlex matched it, and B9's decision set the match
    aside. The page now says a recorded decision kept it unmatched and gives the reason with the
    publication; it is headed "Publications giving this number", and no longer says "also written
    in the paper as" the number its heading shows. The Funding section, the coverage sentence,
    Miscellaneous's page and the method's definition of an unmatched number tell the two kinds
    apart (`keptUnmatched`).
  - **Judged acceptable as they are.** The NIH page's 271 publications, a compact list of links,
    are most of its height, but they are its last section and bury nothing but NLM's line. The
    25 cards of W-000277's Funding section are one publication's grants, each with its own total,
    and a reader who opens it wants them. NIH's bar dwarfs the rest of the ranked chart
    ($6.56 billion to NASA's $736 million), which a value label beside every bar reads; a log
    scale would be a redesign. The over-time chart spans the export's years, 2008–2026, not
    forty; the forty-one years are `NIH:P30DK017047`'s fiscal years, which read well.
  - **Speed was never the problem.** Measured in Chromium with Playwright on the development
    machine, from navigation to the grants table drawn: 96–154 ms before, 48–100 ms after; from
    clicking an agency bar to the next frame: 24–61 ms before, 31–35 ms after; a keystroke in the
    grants search, 13–61 ms before, 15–28 ms after. Each scope is computed once and memoised, and
    the search is deferred; the cut makes the page lighter, not the arithmetic faster.
  - **The gate.** On the sample: 1,644 unit tests pass at 98.7% statement and 92.3% branch
    coverage; build, both budgets, and e2e with the flag (82 pass) and without it (43) pass. On
    the real export: 1,549 pass and 95 skip, and the 82 e2e specs pass with the flag, two new:
    no funding page, nor the publication with the most grants, scrolls sideways at 390 pixels
    with every table open, and the grants table draws 50, fits its column and downloads every
    grant. The JavaScript is 143.3 KB gzipped, from 142.2.
- *2026-09-27, R2 — the flag removed.* §12.12's `VITE_FUNDING` kept the view out of `pages.yml`'s
  production build while it was built on `main` in slices. Every slice is in, R1a and R1b read it
  on the real export, and its data has been on `gh-pages` since the seed, so removing the flag is
  the release: the push that deploys it puts the view on the public page. Nothing a reader of a
  funding page sees changes, only whether the pages exist.
  - **Where it lived.** `fundingEnabled()` in `contract/config.ts`, and the variable's type in
    `vite-env.d.ts`, which is back to its form before W1; `App.tsx`, which gave the view switch,
    the three funding routes and the publication's Funding section only with it; `parseRoute`'s
    `funding` option, without which the routes were no route; `Method.tsx`'s gate on `#funding`,
    whose own one-sentence no-data state stays; Vitest's `env` in `vite.config.ts`; `check.yml`'s
    env on the build and e2e steps; and `pages.yml`'s comment saying it was deliberately unset.
    All are gone. The doc comments that said a page was "built behind" the flag, or existed "only
    in a build with the view", now say what is true of the released app. The components keep
    their optional props, which the app now always passes.
  - **What was deleted, and why.** The tests of the flag itself, since a flag that no longer
    exists has nothing to test: `FundingFlagOff.test.tsx` (7 tests), and one flag-off test each
    in the method page's funding tests, the funding routes, the header and the publication's
    Funding section — 11 unit tests in all. In e2e, the `FUNDING` constant and the skips it drove,
    so every funding spec runs in every build, and the two flag-off describes (3 specs). **Every
    test of the no-funding-data state (§12.10) stays:** that is the data, not the flag, and a
    rolled-back export still needs it.
  - **The gate.** e2e is one run, with no flag-off build beside it: 82 pass and none skip, where
    the flag-on run passed the same 82 and skipped the 3 flag-off specs. All 42 funding specs run,
    38 in `funding.spec.ts` and 4 in `method-funding.spec.ts`. On the sample, 1,633 unit tests
    pass (1,644 less the 11) at 98.7% statement and 92.2% branch coverage; on the real export,
    1,538 pass and 95 skip, and the 82 e2e specs pass. A plain `npm run build`, which is what
    `pages.yml` runs, carries the view's headings, and `/funding` from cold renders the view
    behind `vite preview`. The JavaScript is 143.2 KB gzipped, from 143.3.

---

## 1. What this phase decides, and what it does not

**This phase decides:** which strings on a publication are grants; how each resolves to one grant,
one agency and one amount; how that is stored, refreshed and exported; what the app shows and how
it words it.

**It does not decide inclusion.** Funding is a property of publications already included. No
grant, amount or agency ever includes or excludes a work, and rule R2 (the `UWPR95794` code in
funding metadata) is unchanged. A paper that lists no grant is as much a UWPR publication as one
that lists ten.

**It does not claim causation.** The defensible statement is: *the publications that record use
of the resource list grants whose lifetime award totals, as of the data date, come to $X.* It is
not money spent on this work, not money UWPR brought in, and not money the resource caused
anyone to receive. [05](05-metrics-and-data-contract.md) §5.1 and §11.2 apply with more force here
than anywhere else, because a dollar figure invites exactly the causal reading a publication count
does not.

**It does not assess UWPR's own funding.** UWPR's own award is the code `UWPR95794`, which is
evidence of use (R2), never a grant in this phase's totals. No other grant is assumed to be a UWPR
instrument grant, however likely it looks.

### 1.1 Principles

1. **Funding never touches inclusion** (above).
2. **Stored, not looked up.** The committed store holds every fact and every decision the export
   needs, so `export --store store` still needs no network and CI's export diff keeps working.
   Sources are asked on a schedule (§9), not on every run.
3. **Conservative resolution.** A written number becomes a grant automatically only where the
   research measured that the rule is safe. Everything else is reported, and a person decides by
   override (§6).
4. **Unknown is not zero.** A grant with no known amount is counted as a grant and never as $0;
   the figure beside the total says how many have no amount.
5. **Provenance on every amount:** the source, the date it was read, and what the figure means
   (its basis), because each source defines "amount" differently (§7).
6. **Rows, not totals,** as in [05](05-metrics-and-data-contract.md) §1.1: the export carries
   every grant and every listing, the app aggregates, and an independent summary cross-checks it.

## 2. Decisions

Agreed 2026-09-26. Decisions marked *(maintainer)* were made by UWPR's maintainer on 2026-09-26;
the rest were recommended in planning and adopted. Each is recorded with the measurement that
informed it.

| # | Decision | Why |
|---|---|---|
| F1 | **Scope.** The grants listed on included publications. UWPR's own funding is the code `UWPR95794` only, and it is never a grant. **No grant is assumed to be a UWPR instrument grant.** *(maintainer)* | 131 works name `UWPR95794` among their awards (§3.1). Counting it would put the resource's own award in a figure about its users' funding. |
| F2 | **The headline figure is "Total value of grants listed":** *the lifetime award totals, as of the data date, of the distinct grants listed on these publications — not money spent on this work.* Each grant counts once, at its full lifetime value, however many papers list it. The view is named **Funding impact**. *(maintainer)* | A figure about grants, worded so it cannot be read as spending or as caused by UWPR (§1). |
| F3 | **Cumulative rule:** a grant's full lifetime total enters the cumulative series in the publication year of the first included paper that lists it. Grant counts by agency, and over time, are shown too. *(maintainer)* | Measured: lifetime totals of the 454 NIH-linked grants come to $6,217M; the dollars awarded up to each grant's first-paper year only, $4,307M (§3.2). The lifetime rule was chosen because the headline is lifetime, and the two must agree. |
| F4 | **Institution-wide awards count in full, tagged** `scope: institution-wide`, and are **included by default.** The view can exclude them, and states which it is doing. *(maintainer)* | 23 grants (Appendix B). They dominate the non-NIH US-federal total: **$993.5M with them, $71.5M without** (§3.3). |
| F5 | **v1 amount sources:** NIH RePORTER for NIH grants, contracts and task orders; the NSF Award API for NSF; USAspending for other US federal agencies; **OpenAlex award amounts for everyone else.** DOE national-laboratory operating (M&O) contracts are **excluded**: they are cited for facility use and are not grants. *(maintainer)* | Coverage measured per source (§3); the four M&O contracts are $8.6–30.9B each (Appendix C). |
| F6 | **NIH amounts are sums of parent rows only**, one row per fiscal year's award action, supplements included; sub-project rows are never added. Contracts are keyed by contract number and task orders by task order. | Summing every row inflates a multi-project grant 50–100% (P30DK017047: $52.8M against $86.0M, §5.1). |
| F7 | **Currency:** a non-USD amount is converted at the award start year's annual average rate, and the original amount is kept. Rates come from the **Federal Reserve G.5A** table; **OECD** annual averages cover currencies G.5A lacks (CLP). An amount neither covers is shown in its own currency, flagged, and left out of USD totals. *(maintainer: the start-year rule; the sources were recommended)* | 56 of the 147 non-NIH amounts the research found are not in USD; 13 are Chilean pesos, which G.5A does not publish (Appendix D). |
| F8 | **Conservative resolution.** Automatic only for exact matches, parse fixes, and near-misses **NIH links to the same paper**. **Whether a number is NIH's is decided by RePORTER, not by the funder a source names.** *(maintainer)* | Of 17 NIH grants unresolved after parsing, 11 were confirmed by NIH's own link to the same paper (Appendix A.4). IC plus serial alone produced 5 matches with the wrong activity code (A.3). About 125 strings name a non-NIH funder for a real NIH grant (§6.4). |
| F9 | **Not-grants are excluded and reported; Miscellaneous holds unmatched grant numbers.** Strings that are positively not grants (antibody names, RRIDs, programme names, funder DOIs) are listed in the run report and counted nowhere. A grant number nothing resolves is kept, under a **Miscellaneous** agency, with no amount. | A Miscellaneous bucket that also held "PGT121" and "H2020" would mix real unmatched grants with noise (Appendix A.6). |
| F10 | **Grant overrides.** A `grant` override in `overrides.yaml` maps a (work, string as written) to a grant, or to "not a grant". **Nine are seeded** (Appendix E). `S10OD032290` stays Miscellaneous until a person confirms it. **New unresolved strings are listed in every run report.** *(maintainer)* | The nine have independent support but no NIH link to the paper, so F8 does not reach them: five NIH grants (Appendix A.4–A.5) and four non-NIH typos (A.8). |
| F11 | **Storage in `store/funding/`, never in work files**, like `metrics/`. **Grant keys are this project's own grammar** (§8.2), not OpenAlex award IDs. | No work file is rewritten and `work.schema.json` does not change. OpenAlex mints one award ID per funder-and-string pair: one grant can have several (§5.4). |
| F12 | **Results are stored, and sources are asked on a schedule:** an incremental refresh every run, a full refresh every 28 days. **The weekly run moves to Saturday 07:17 UTC** (`17 7 * * 6`), inside RePORTER's window for large jobs (weekends, or 9 PM–5 AM Eastern) at no more than one request a second. *(maintainer)* | RePORTER asks for both (§5.1). Monday 13:17 UTC ([03](03-retrieval-pipeline.md) C4) is 8:17 or 9:17 AM Eastern, a weekday morning. |
| F13 | **PI names are exported and shown** where the funder's public award record gives them. [07](07-operations.md) §15 gets a dated note. *(maintainer)* | They are part of the public award record, and a grant without its investigators is hard to recognise. |
| F14 | **Funding is part of the main export**, `schema_version` **1.1** (additive): `works[].grants[]` and a top-level `funding` block. The top-level `summary` is untouched. **The data budget rises from 400 to 500 KiB gzipped, enforced twice:** a web CI script, and a stage-11 alert. It is measured as `web/scripts/check-bundle-budget.mjs` measures JavaScript: gzip level 9, in KiB of 1,024 bytes. *(maintainer: main export, 500 KB; recommended: the double enforcement and the measure)* | The export is 303 KiB gzipped today, and about 420–450 KiB with funding (an estimate, §3.5). The bot's weekly commit starts no workflow ([07](07-operations.md) §6), so a CI check alone would never see weekly growth. |
| F15 | **The app** gains a Publications \| Funding impact switch, agency and grant pages, a grants table with CSV download, and a Funding section on each publication. **Agency and grant selections narrow the grants shown, not only the publications.** It ships behind a build flag, **`VITE_FUNDING`**, on in CI and e2e and off in the production build until release. *(maintainer: the views; recommended: the scope rule and the flag)* | As a pure publication filter, `agency=NSF` would show NIH dollars from papers that list both. The flag lets commits go straight to `main` without deploying a half-built view ([07](07-operations.md) §4). |
| F16 | **Versioning and failure.** `funding_version` (`YYYY-MM-DD.N`) with a stage-0 fingerprint guard like the rules'. **A source outage never removes a grant, a listing or an amount**; an unexpected error in the funding stage carries the stored funding forward and alerts, and never blocks the publication update. JATS full text is harvested **once per record**. | Mirrors [03](03-retrieval-pipeline.md) P4 and P6. Full text adds 5 NIH work–grant pairs on 5 works (§3.1): worth reading once, not weekly. |

## 3. Measurements

All measured 2026-09-26 over the 338 included works (377 records).

### 3.1 Coverage by source

Works with any funding information, by source (a work's records pooled):

| Source | Works with funding information | Works with an NIH grant | Grant entries |
|---|---:|---:|---:|
| OpenAlex (`awards`, `funders`) | **320** | 264 | 2,860 |
| Europe PMC (`grantsList`) | 290 | 258 | 2,505 |
| PubMed (`GrantList`) | **276** | 261 | 1,611 |
| NIH RePORTER (publication links) | **260** | 260 | 1,208 |
| JATS full text, funding statement and acknowledgements | 198 | 198 | — |
| Crossref (`funder[].award[]`) | 190 | 145 | 1,045 |
| JATS `<award-group>` | 103 | 85 | 354 |
| **Union of the metadata sources** | **329** | 271 | — |
| **Union including full text** | **329** | 272 | — |

The NIH column counts works with an NIH-*like* IC + serial before resolution, which includes
strings that turn out to be other agencies' or typos; after resolution, **269 works list an NIH
grant** (§3.2).

- **9 works have no funding information anywhere:** W-000036, W-000051, W-000056, W-000061,
  W-000107, W-000308, W-000619, W-000738, W-000845. None is preprint-only, three have no PMID, and
  none has a readable PMC body. By five-year band: 1 of 12 (2005–09), 4 of 84 (2010–14), 3 of 115
  (2015–19), 0 of 88 (2020–24), 1 of 39 (2025–).
- **Full text adds little.** Of 233 works with a readable PMC body, 5 have an NIH grant in the text
  that no metadata source has (5 work–grant pairs, 1,247 → 1,252). None has a body and no metadata
  funding. **Only one of the five adds a grant:** `P01HL12803` (an override, Appendix E), which
  exists **only** in JATS text. `3U01AI42001-02S1` (a correction) is also only in the text, but
  its core, U01AI142001, is already on W-000244 through OpenAlex, PubMed and NIH's link. Hence F16:
  read once, not weekly.
- **What each source alone adds**, in NIH work–grant pairs (IC + serial) no other source has:
  RePORTER 13, OpenAlex 9, JATS text 5, Crossref 2, Europe PMC 0, PubMed 0, JATS award groups 0.
  **Europe PMC adds nothing**, so v1 does not read it for funding (§5.7).
- **OpenAlex:** 294 distinct funder IDs (293 distinct names); 253 works name at least one non-NIH
  funder. The works name **1,534 award entities**; 182 carry an amount, one of them 0 (181
  non-zero), 193 a start year, 171 a lead investigator, 11 an awarded institution. Reading them
  all takes 31 filter pages of 50 (about $0.003).
- **Crossref:** 195 of 377 records carry funder metadata. Of its funder entries, 903 were asserted
  by the publisher, 57 by Crossref, 128 by neither.
- **UWPR's own code:** 131 works' award lists name `UWPR95794` (F1).

| Band | OpenAlex | Crossref | Europe PMC | PubMed | RePORTER | Union / works |
|---|---:|---:|---:|---:|---:|---:|
| 2005–09 | 11 | 2 | 10 | 10 | 9 | 11 / 12 |
| 2010–14 | 79 | 12 | 70 | 68 | 67 | 80 / 84 |
| 2015–19 | 110 | 72 | 104 | 95 | 93 | 112 / 115 |
| 2020–24 | 86 | 71 | 76 | 71 | 63 | 88 / 88 |
| 2025– | 34 | 33 | 30 | 32 | 28 | 38 / 39 |

### 3.2 NIH

**RePORTER's publication links:** 268 PMIDs linked (1,230 link rows), which is **260 works** and
**454 distinct core projects**, every one found in RePORTER's project search. B6 measured the
links and rows again live, through its adapters, and found the same figures (§5.1).

**Their award rows** (parent rows only, `exclude_subprojects`, sorted):

| Measure | Value |
|---|---:|
| Parent rows (one per award action per fiscal year) | **5,437** |
| Rows with an `award_amount` | 5,432 |
| **Lifetime total, FY1985–2026** | **$6,217,332,093** ($6,217.3M) |
| FY2026 rows (partial: the fiscal year ends 2026-09-30) | 87, $151.4M |
| Rows by application type: 5 non-competing continuation / 3 supplement / 2 competing renewal / 1 new / 4, 6–9 other changes / contract | 3,255 / 980 / 570 / 475 / 156 / 1 |
| Grants with a competing renewal | 186 |
| Funded years per grant | median 5, maximum 42 |
| Grants whose first row is FY1985 with a support year above 1 (they began earlier; lifetime understated) | 27 |
| Rows co-funded by several ICs; rows where `award_amount` equals the sum of the IC fundings | 108; 108 |
| Rows with no amount | 5: four VA rows (`I01BX000531`, FY2009–2013) and contract `N01HV028179` (FY2002) |
| Principal investigators; organisations; grants held at UW, counted on each grant's latest row | 365; 86; 212 |
| Principal investigators; organisations, counted across all rows | 522; 100 |
| **Cumulative by first-paper year:** lifetime totals / only the dollars awarded up to that year | $6,217M / $4,307M |

Most frequent activity codes among the 454 (first row): R01 172, T32 32, P30 28, P01 25, U01 18,
R21 15, S10 14, U24 10, U54 10, R35 9, ZIA 8, P50 7, U19 7, P41 6, R37 6, UL1 6; 42 other codes
with 1–5 each, 58 in all. One is a VA project (`I01BX000531`), which RePORTER also holds, and one
an NIH contract (`N01HV028179`).

**Grant strings.** Six sources gave **7,400 NIH-like strings** — OpenAlex 2,203, Europe PMC 2,020,
PubMed 1,526, JATS text 745, Crossref 593, JATS award groups 313 — which are **1,272 distinct
strings on 269 works.** A string was treated as possibly NIH's when a source named NIH, HHS or PHS
as its funder (6,362), the text around it said NIH (634), or it was a full NIH-format number
(404). Resolved with the tolerant parser (§6.2):

| Outcome | Strings | Distinct |
|---|---:|---|
| Matched a core RePORTER links to some paper | 7,238 | — |
| Matched by an IC + serial lookup with an agreeing activity code | 90 | **19 cores no paper link names** (Appendix A.2) |
| Unresolved | 72 | **17 grants** (Appendix A.4) |
| IC + serial matched, activity code disagreed, refused | 19 | 5 strings (Appendix A.3) |

The 19 refused strings are a subset of the 72 unresolved — refused on IC and serial, they stayed
unresolved — so the rows sum to 7,419, not 7,400.

Parse fixes used: O or I for 0 or 1 in 53 strings (39 in the activity code, 14 in the serial); a
serial run into its support year in 21 (7, 8 or 9 digits: 7, 11 and 3); digits split by a space,
comma or dash in 9.

**NIH contracts cited** (by string; RePORTER links no paper to them):

| Contract | Works | Lifetime |
|---|---|---:|
| `HHSN272201700059C` | W-000181, W-000189, W-000197, W-000203 | $24.79M |
| `HHSN268201000033C` | W-000117 | $10.78M |
| `HHSN272201800004C` | W-000226 | $18.12M |
| `HHSN272201700036I`, task order `75N93020F00001` | W-000244 | $1.47M (of the IDIQ's $10.14M) |

**Works with an NIH grant, all routes: 269.** RePORTER links 260 of them; the strings add 9.

### 3.3 Other funders

The research collected every non-NIH award entry (397), merged duplicates, and classified them:

| Class | Entries → grants |
|---|---|
| Real grants | **270** (of which 4 are M&O facility contracts, 2 rows are one NASA grant — §6.9 — and three pairs of rows are one grant each — §6.10, Appendix F) |
| NIH grants the NIH pass had missed | 5 (Appendix A.7) |
| Junk | 32 (Appendix A.6) |

**74 agencies.** By group: US federal 84 rows (80 without the M&O contracts), US non-federal 38,
non-US 148. Where an amount came from, and how many were found:

| Agency | Grants | Works | Best source | Found | Notes |
|---|---:|---:|---|---|---|
| NSF | 57 | 54 | NSF Award API | 56 of 57 | USAspending 52 of 57 (misses 4 pre-FY2008 awards); OpenAlex 52 of 57 |
| NASA | 15 | 4 | USAspending | 15 of 15 | 12 are on one paper (W-000208, the NASA Twins Study) |
| DOE | 5 | 8 | USAspending | 1 real grant ($2.10M) | the other 4 are M&O contracts: excluded (F5) |
| DoD (IARPA via Army; DTRA) | 2 | 8 | USAspending | 2 of 2 | $9.38M, $2.91M; not in OpenAlex |
| NOAA | 2 | 6 | USAspending | 2 of 2 | one is the Washington Sea Grant omnibus award |
| DOI (BOEM), USDA, VA | 1 each | — | USAspending | 1 of 3 | VA merit awards are intramural; the USDA number (`2019-07916`) could not be parsed |
| AHA | 16 | 18 | OpenAlex only | 9 of 16 | only 2015-on grants; AHA's portal refused scripts (read, not measured) |
| Gates Foundation | 7 | 8 | committed-grants CSV (41,387 rows) | 2 of 7 | five OPP numbers are not in the file |
| Moore Foundation | 2 | 2 | moore.org grant pages | 2 of 2 | |
| BBSRC / EPSRC (UKRI) | 13 | 4 | Gateway to Research | 10 of 13 | 12 of 13 with OpenAlex |
| EU (CORDIS) | 10 | 8 | CORDIS | 9 of 10 | 8 are consortium-wide totals |
| Swedish Research Council | 7 | 2 | Swecris | 7 of 7 | |
| ANID (Chile) | 18 | 2 | ANID's GitHub CSV | 13 of 18 | |
| Wellcome | 6 | 8 | 360Giving GrantNav | 6 of 6 | |
| DFG | 7 | 4 | none | 0 reliable | §5.4 |
| MOST (China), FWO, Korean funders (15 rows, 14 distinct grants), NKFIH, EMBO, NWO, JST, AEI, CRUK and others | about 50 | — | none found | 0 | NWO's API found 1 of 3, with no amount |
| SNSF, NSFC, JSPS, CIHR, CPRIT, SSF, ANR | 11 | — | OpenAlex only | 10 of 11 | ANR's two are institute-level awards; CIHR's `PJT-206152` has no amount |

**Amounts found:** **147 of 266** (55%) — the 270 less the 4 M&O contracts (80 + 38 + 148): 126
from the agency's own source, 21 from OpenAlex only. By group: **US federal 77 of 80**, US
non-federal 14 of 38, non-US 56 of 148. By source: NSF API 56, USAspending 21, OpenAlex only 21,
ANID CSV 13, Gateway to Research 10, CORDIS 9, Swecris 7, GrantNav 6, Gates CSV 2, moore.org 2.
The research counted the two NASA TRISH rows separately; as one grant (§6.9) it is 76 of 79
US-federal grants.

**What v1 will find** (F5 uses OpenAlex, not the agencies' own sources, outside US federal):
derived from the same table, OpenAlex carries an amount for **48 of the 148 non-US grants** and
**12 of the 38 US non-federal** ones, against 56 and 14 from the agencies' own sources. The eight
non-US amounts v1 will lack are two ANID grants, five EU consortium totals (all institution-wide)
and one Wellcome grant; the two US non-federal are a Gates and a Moore grant. B9 measures it.

**The US-federal total is $993.5M with institution-wide awards and $71.5M without** (TRISH counted
once). The difference, $922.0M, is eight awards of five kinds: the NASA space-biomedicine
institute NSBRI ($583.5M), its successor TRISH ($139.6M), four NSF GRFP awards to UW ($138.0M
together), the NSF centre C-DEBI ($47.5M) and Washington Sea Grant ($13.4M).

**Works:** 147 have a non-NIH entry; 141 a real non-NIH grant; **136** one that is not an M&O
contract; 92 a non-NIH grant with a known total (81 without institution-wide awards); 64 a known
US-federal total. **Works with at least one grant that is not Miscellaneous: 269 NIH ∪ 136
non-NIH = 309.**

**Agreement between sources:**
- **OpenAlex against the agency's own figure: 101 of 102** comparable grants agree to the dollar.
  The exception, NSF 2245300, is stale in OpenAlex ($905,320 against $1,199,760 now).
- **USAspending against the NSF API: 49 of 52** agree. Two GRFP awards differ by $1 of rounding;
  1558916 differs by $17,657.
- **USAspending against RePORTER**, on three NIH grants (its award number is the core project
  number, one record across all years): R01AI104384 exact, R01GM086688 off by $1,150, P41GM103533
  by 0.4%. USAspending covers FY2008 on only, so it is a cross-check, not a source.

**Currencies of the 147 amounts:** USD 91; to convert, **56**: GBP 18, CLP 13, EUR 11, SEK 8,
CHF 2, CNY 2, CAD 1, JPY 1 (Appendix D).

### 3.4 What the grants come to, before this phase's own rules

The research's figures are the acceptance targets for B6 and B9 (§17). **They are not the
headline**, which the seed will measure under §6 and §7: the NIH total above is only the 454
linked grants, before the 19 found from strings, the contracts, corrections and overrides.

### 3.5 Sizes

The committed export is **310,628 bytes gzipped at level 9 (303.3 KiB)**, the measure the budget
uses (§11.9), and 334,481 bytes (327 KiB) at gzip's default level; both measured on the committed
export on 2026-09-26. *(Corrected by B10 the same day: `gzip -9` reports 23 bytes more, the file's
name in its header, which the budget does not count.)* **With funding added it is estimated at
roughly 420–450 KiB at level 9** — an estimate, to be measured in B5 (the sample) and B9 (the real
export). Planning's "427 KB" is not comparable: it mixed decimal kilobytes and compression levels.
Against the 500 KiB budget (512,000 bytes, F14), the estimate leaves about **two years' headroom**
at the export's growth of about 35 KiB a year (an estimate from planning).

**Measured by B5** (2026-09-26, `stages/export.data_size`, the budget's measure). Contract 1.1 with
no funding data — the empty block and an empty `grants` on each of 338 works — takes the real
export from 310,628 to **311,014 bytes (303.7 KiB)**. The sample export goes from 15,188 to
**18,099 bytes (17.7 KiB)**: two more SAMPLE works and the nine synthetic grants of §11.8, whose
`funding` block alone is about 2,500 bytes gzipped. Nine grants say little about 480, so the
estimate above stands until B9 measures the real export with funding.

## 4. Definitions

- **Grant.** An award identified by a number its funder issues, resolved to one key (§8.2). For
  NIH, a **core project** — activity code, IC and serial, such as `R01GM086688` — with all its
  fiscal years, renewals and supplements. The phases of a phased award (`K99`/`R00`, `UH2`/`UH3`)
  are separate cores and separate grants. A contract is a grant keyed by its contract number, and
  a task order under an IDIQ contract is a grant of its own. "Grant" is used for all of these.
- **Listing.** A work's statement that a grant supported it: a string a source attributes to the
  work, or a RePORTER publication link. How a listing was reached is its `how`: `listed`,
  `nih_link`, `corrected` or `override` (§11.2).
- **Agency.** The funder that issued a grant. NIH grants belong to their administering **IC**
  (institute or centre), whose parent is NIH. Other agencies are configured, or learned from
  OpenAlex's funder records. The **root** agency is the top of the chain (NIH, not NIGMS).
- **A grant's amount** (its *total value*): its lifetime award total as of the data date, by the
  basis of its source (§7). An active grant's total still grows.
- **Total value of grants listed** (F2): the sum of the amounts of the distinct grants in view
  whose amount is known in US dollars. Grants with no known amount are counted beside it, never in
  it as zero.
- **First year.** The publication year ([05](05-metrics-and-data-contract.md) A2) of the earliest
  included work that lists the grant. Under a filter in the app, the earliest *filtered* work.
- **Cumulative rule** (F3). The cumulative series adds each grant's full amount in its first year.
  It is a publication year, not an award year, and says so.
- **Institution-wide award.** An award made to an institution or consortium to run a programme for
  many unrelated projects — a fellowship programme, a national institute, a consortium-wide total,
  a centre of excellence — whose value bears no relation to one research project. Tagged from an
  explicit list (Appendix B) plus NSF programme patterns, never inferred from size. **NIH centre
  grants (P30, P41, UL1 and the like) are not institution-wide:** they are categorised `center`
  (§11.4) and counted as project-scope. Whether they should be is an open policy question (§16).
- **Miscellaneous.** The agency of a grant number that nothing resolves (`MISC:` keys). It has no
  amount, is never a root agency in the "agencies" count, and is pinned as its own series in
  charts.
- **Not a grant.** A string that is positively not a grant number: an antibody or reagent name,
  an RRID, a programme or mechanism name with no number, a funder DOI, a fragment. Reported and
  excluded (F9).
- **Resource code.** `UWPR95794`, read from `rules.r2.code`. Never a grant (F1).
- **Facility contract.** A DOE M&O contract cited for facility use (Appendix C). Excluded (F5).
- **Fiscal year.** NIH's and the US government's: 1 October to 30 September, named by the year it
  ends. On the data date, the fiscal year in progress is **partial**.

## 5. Sources and their pitfalls

### 5.1 NIH RePORTER

**The API.** `POST https://api.reporter.nih.gov/v2/projects/search` and `/v2/publications/search`,
JSON bodies. **At most one request a second; large jobs on weekends or between 9 PM and 5 AM
Eastern** — RePORTER's own terms, and the reason for F12. An address that ignores them can be
blocked, which is the main operational risk of this phase (§13.7).

**Always send `sort_field`.** Without it, paged results repeat and drop rows. Measured: P30CA015704
fetched unsorted gave 1,105 rows of which 1,097 were distinct, and **a $4.94M renewal year was
lost**. Every body sends a `sort_field`, `sort_order: "asc"` and `limit` ≤ 500:
- **Project searches sort by `appl_id`**, which is unique.
- **Publication searches sort by `coreproject`.** `publications/search` answers HTTP 500 to
  `sort_field: "appl_id"`, and to anything but `coreproject` or `pmid` (B6). `coreproject` orders
  rows totally only within one paper, so a batch of papers that needs more than one page is split
  in half and asked again, and only a single paper is paged.
- **Offsets are capped:** 14,999 for projects and 9,999 for publications, as RePORTER's API page
  gives them (read, not measured). Paging that would pass the cap raises rather than truncating.

**Send `exclude_subprojects: true`** and an explicit `include_fields` **without `AbstractText` and
`PhrText`** (P10: no abstracts in the repository, including recordings).

**`award_amount`** is the total cost — direct plus indirect — awarded in one fiscal year, all ICs
together (measured: 108 of 108 co-funded rows equal the sum of their `agency_ic_fundings`).

**Parent rows, sub-projects and supplements** (F6). A multi-project grant (P01, P30, P41, P50,
U54…) has one parent row per award action and one row per sub-project. RePORTER's data dictionary:
"For multi-project grants, Total_Cost includes funding for all the constituent subprojects. This
data element will have total cost of each subproject if the project is a subproject." Its FAQ says
the italicised sub-project costs should be excluded "to avoid double-counting". Measured:

- **P30CA015704, FY2024.** The base award `5P30CA015704-49` is **$10,090,142**, and the
  sub-project rows of that year sum to exactly **$10,090,142**. Seven supplements (`3P30CA015704-49S1`
  to `-49S7`, $21,867 to $499,999) are further parent rows, never split into sub-projects, and bring
  the year to $11,330,768. *The research's notes say 28 sub-projects; the saved rows hold 27. The
  saved file came from the unsorted fetch that lost rows, so the count is re-measured in B6; the
  sum is what B3 tests.*
- **P30DK017047:** 54 parent rows total **$52,843,525**; all 233 rows, sub-projects included,
  total **$86,010,763**. Six sub-project rows carry no amount (older years list sub-projects
  without amounts).
- Also in the saved rows, all rows against parent rows only: P01HL092969 $46.7M against $23.5M,
  P41GM103533 $31.4M against $20.7M, P41RR011823 $51.2M against $29.2M. **Summing every row
  inflates a grant by 50–100%.** *These three came from fetches the research did not sort, so they
  are indicative; P30DK017047's parent total agrees with a sorted lookup to the dollar.*

A parent row's application type is the first character of its project number: 1 new, 2 competing
renewal, 3 supplement, 4 and 5 continuations, 6–9 transfers and changes. All count.

**History starts in FY1985** (RePORTER's FAQ; measured: no row earlier). A grant already running
then is understated, and flagged `starts_before_fy1985` (27 of the 454).

**Direct and indirect costs.** The data dictionary says they exist "only for NIH awards funded in
FY 2012 onward"; the saved rows carry `direct_cost_amt` on 2,565 of the 2,584 parent rows before
FY2012. The documentation and the data disagree; this phase uses neither split, so it is recorded
and not resolved.

**Intramural projects** (`Z` activity codes; 8 `ZIA` cores among the 454) have amounts only from
FY2007, per the data dictionary.

**Contracts.** RePORTER drops the `HHSN` prefix (`272201700059C-0-0-1`) and truncates the core
number to 11 characters (`27220170005`). **A contract is keyed by its contract number, never by
RePORTER's core,** and the prefix is restored when RePORTER shows 12 digits and a letter. Contracts
are found with `project_nums: ["272201700059C*"]` and read by full project number. Newer `75N`
contracts keep their prefix, but their core is truncated the same way (`75N93019D00` for
`75N93019D00003-0-759301900131-1`). The older `N01` contracts keep their core (`N01HV028179`,
which RePORTER reports with no amount). **A contract's rows are line items**, several in a fiscal
year: 56 for `HHSN272201700059C` (B6). All count.

**Task orders.** An IDIQ contract's task orders are separate rows: `272201700036I-0-759302000001-1`
is task order `75N93020F00001` with its letters removed, and an amendment to it appears as
`…-P00004-759302000001-1`. The cited task order is **$1.47M of the IDIQ's $10.14M**, so a paper
citing the task order lists the task order only.

**VA projects** (`I01BX…`) appear in RePORTER, with `agency_code` VA, and **no amounts**.

**Publication links** come from the grant numbers PubMed annotates (SPIRES). A link names the
**latest application** of the grant, not the year that funded the paper: it says *that* a paper
lists a grant, never *when* the grant supported it.

**IC + serial lookups** use `project_num_split: {ic_code, serial_num}`.

**Measured live by B6** (2026-09-26, through its adapters, FY ≤ 2026): **260 works** linked, **454
cores**, **5,437 parent rows**, none a sub-project, totalling **$6,217,332,093** — the research's
figures exactly. Contracts: `HHSN272201700059C` $24,791,405, `HHSN268201000033C` $10,781,559,
`HHSN272201800004C` $18,117,838, and task order `75N93020F00001` $1,471,125.

**Terms.** RePORTER's data is US government information. No explicit licence was found on the API
pages, which point to a data access policy; §13.3 says how it is attributed and whom to ask
(RePORT@mail.nih.gov).

### 5.2 NSF Award API

`GET https://api.nsf.gov/services/v1/awards.json?id=<7 digits>`, one award per request. It covers
every era, and gives both amounts, the dates, the division (`divAbbr`), the programme and the PI
(`pdPIName`, a name only).

**What B6 found live** (2026-09-26): an award NSF does not know is answered with **HTTP 200 and an
empty list**, not an error. `printFields` does not narrow the reply, which carries the award's
abstract and the PI's and programme officer's e-mail addresses and telephone numbers, so **the
adapter keeps named fields only**. 56 of the 57 were found; `0659680` is the one NSF does not know
(A8.5).

**Estimated against obligated.** `estimatedTotalAmt` is the plan at award time and is never
updated; `fundsObligatedAmt` is what has actually been awarded so far, supplements included. They
differ on **11 of 56** grants, and obligated is higher every time (supplements, graduate
fellowships, cooperative agreements; one fellowship has an estimate of 0). **The total is the
obligated amount for an expired grant, and the larger of the two for an active one,** which still
has years to be paid (§7). OpenAlex copies the obligated figure (51 of 52). On 3 of 56 grants NSF's
own total disagrees with the sum of its per-year list; USAspending follows the per-year list.

**Collaborative awards.** 21 of the 56 are "Collaborative Research", where each institution holds
its own award number. Summing them is correct; a paper that cites one number lists only that
institution's share.

**NSF's registry is complete**, so an NSF number the API does not know is not an NSF number (§6.8).

### 5.3 USAspending

`POST https://api.usaspending.gov/api/v2/search/spending_by_award/` with `award_ids` batched and
**award types 02–05** (block, formula and project grants, and cooperative agreements); then
`GET /api/v2/awards/<id>/` for **`total_obligation`**, which is the amount used. The search
**reaches only awards with activity since 2007-10-01 (FY2008)**, and says so in its reply.

**What it finds.** With award types 02–05, USAspending finds **20 grants**: 21 of the research's
27 non-NSF US-federal rows, TRISH's two rows being one grant. B6 measured the same 21 of 27 live.
Of the other six, the four DOE M&O contracts are reachable only with contract types A–D, which v1
does not ask for — they are excluded anyway (F5) — and the USDA and VA numbers are not found
(§3.3).

- **Not `total_funding`**, which adds non-federal matching money: Washington Sea Grant is $20.8M
  there against $13.4M obligated. Outlay figures are incomplete.
- **Sub-award suffixes** (`NNX16AO69A:0061`, `:0107`) name parts of one award: dropped from the
  key, so TRISH counts once.
- **The request** (B6): `award_ids` match exactly, not as substrings; one request may name award
  types of one group only (grants, or contracts), and mixing groups is refused with HTTP 422; the
  search's end date is fixed at 2100-09-30, so the request, and its cache key, stay the same from
  week to week.
- **TLS.** The research's urllib client failed to verify USAspending's certificate and fell back to
  curl. **httpx with its default verification succeeds** (B2, 2026-09-26, recorded in
  [03](03-retrieval-pipeline.md) §7), so `truststore` is not added. **Never `verify=False`.**
- Public domain (US government work); the API's data is offered under CC0 (§13.3).

### 5.4 OpenAlex awards

The stage-3 work payload already carries `awards[]` (`funder_award_id`, `funder_display_name`, the
award ID) and `funders[]`, so listings cost nothing extra. Award entities are read by
`/awards?filter=id:G…|G…` at a filter page's price ($0.0001), **with full-URL IDs**
(`https://openalex.org/G…`). Funders are read by `/funders?filter=openalex:F…|F…` with short
IDs: `/funders` has no `id:` filter and answers one with HTTP 400 (B6).

- **Not keys.** OpenAlex mints one award ID per funder and raw string. The research found the same
  award under two funders (VR/Umeå, VR/SSF), and 397 non-NIH entries collapsing to 275 grants. IDs
  this new are also too young to trust as permanent. They are kept on the grant line for amount
  lookup only (F11).
- **Amounts agree with the funders' own figures 101 of 102 times** (§3.3). Provenance of the 1,534
  entities: `crossref_work_funders` 873, `europepmc_work_funders` 378, `nih_exporter` 59,
  `nsf_award_search` 52, `datacite_work_funders` 44, `crossref_work.grants` 32,
  `gateway_to_research` 13, `anid_github` 11, `usaspending` 10, `gtr_legacy` 10,
  `aha_report_builder` 9, `swedish_research_council` 7, `wellcome_trust` 5, `gepris` 4, `fwo_fris`
  4, `cordis` 3, and 1–3 each for 15 more. The 181 non-zero amounts by funder, largest first: NIH
  54, NSF 52, ANID 11, BBSRC 11, NASA 10, AHA 9, Swedish Research Council 7, Wellcome 5. (The 182nd
  amount is NIHR's `NF-SI-0512-10105`, stated as 0.)
- **DFG's `gepris` amounts are excluded.** GEPRIS is now a JavaScript-only site, and OpenAlex's
  amounts from it look invented: two unrelated grants carry the identical €109,941.6654.
- **ANID's amounts are multiplied by 1,000.** ANID's CSV states its currency as "Miles de pesos
  (M$)"; OpenAlex labels the same numbers CLP, which makes them 1,000 times too small.
- **EU amounts from CORDIS are the EU contribution,** not `totalCost` (for one IMI project, €21.2M
  against €50.3M). Measured: OpenAlex's three CORDIS amounts equal the EU contribution.

### 5.5 PubMed

`efetch db=pubmed` XML, `<GrantList>`: `GrantID`, `Acronym`, `Agency`, `Country`. 276 works. The
same XML carries abstracts, so recordings strip `<Abstract>…</Abstract>` (P10). Read for new
records every run and for all records at a full refresh.

### 5.6 Crossref

`funder[]` with `name`, `DOI` (a Crossref funder-registry ID) and `award[]`. 190 works. Read in
batches of 50 (`filter=doi:…,doi:…&select=DOI,funder`). **B6 verified the batch live:** it
answered 376 of the 377 DOIs in 8 requests. The one missing, `10.21220/s2-jfyf-3r27`, is a
DataCite DOI Crossref does not hold; any DOI a batch misses is asked alone.

### 5.7 Europe PMC

Its `grantsList` was measured (290 works) and **adds no NIH pair no other source has** (§3.1). v1
does not read it for funding.

### 5.8 JATS full text

`<award-group>/<award-id>` with `<funding-source>`, plus **full-format** NIH, `HHSN` and `75N`
numbers found in `<funding-statement>`, `<ack>` and funding footnotes. Parsed with `defusedxml`
(P14). Read **once per record**, the date stored, never re-read (F16).

**From prose, only full-format numbers are taken:** an NIH activity code, IC and serial, or an
`HHSN` or `75N` contract. An IC and serial alone (`GM086688`) is dropped by design, because in
running text a pattern cannot tell it from a catalogue number. Measured by B6 over the 237 cached
PMC XMLs: 341 award IDs in `<award-group>`s of 74 records, and from prose 726 full-format NIH
numbers and 11 contract numbers. All 110 prose keys the research's looser pattern found that
these miss are IC and serial only; no full-format number is missed.

### 5.9 Agencies' own sources — measured, not v1 sources

The research reached Gateway to Research (`gtr.ukri.org`, project → fund → `valuePounds`), CORDIS
(`?format=json`), Swecris (a token), GrantNav (its search returned 429; grant pages work), ANID's
GitHub CSV, the Gates committed-grants CSV, moore.org grant pages and NWOpen (1 of 3, no amount
field). AHA's portal refused scripts (403), and GEPRIS needs JavaScript. F5 uses OpenAlex instead
for all of these, at the cost measured in §3.3. Adding any one later is a `funding_version` bump.

### 5.10 Exchange rates

- **Federal Reserve G.5A** (annual averages of daily noon buying rates in New York), released each
  January for the year before. The release of 2026-01-05, read from the Federal Reserve's page on
  2026-09-26 while writing this spec, lists 23 currencies for 2022–2025, and historical releases
  go back further (the euro from 1999). **Four are quoted in US dollars per unit — AUD, EUR, NZD,
  GBP — and the rest in units per US dollar;** the table stores every rate as US dollars per unit,
  inverting the latter. *B3 read every January release from 2000-01-03 to 2026-01-05 (retrieved
  2026-09-26), each year from the latest release that reports it, since releases revise the years
  before: every currency has 1999–2025, the euro included. The inverted rates are computed in
  decimal and rounded to ten significant digits, halves to even. The bolívar is left out
  (Appendix D).*
- **OECD annual average exchange rates** (national currency per US dollar), for currencies G.5A
  lacks. The only one seen is CLP. *B3 fixed the dataset: `OECD.SDD.NAD:DSD_NAMAIN10@DF_TABLE4`
  (2.0), transaction `EXC_A`, 1999–2025, read on 2026-09-26 from
  `https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN10@DF_TABLE4,/A....EXC_A.......`.
  It supplies 26 currencies G.5A lacks, CLP among them; its euro-area series are in euros.*

## 6. Resolution

### 6.1 Order

For each work, the stage gathers **sightings** — a string, its source, and the funder the source
names — from OpenAlex, Crossref, PubMed and JATS (from JATS prose, full-format numbers only,
§5.8), plus the work's **RePORTER links**. Lists are split first (on commas, semicolons,
" and " and a spaced dash between two numbers, keeping `K99/R00` and `P30 DK 089,507` whole);
Unicode dashes and no-break spaces are normalised, and trailing punctuation and parenthetical
initials or years are dropped. *A string written two ways on one work is one string (B3, header).* Then each string is resolved in this
order, and the first step that decides wins:

1. **Resource code** — the string contains `rules.r2.code` → `resource_code`. Never a grant (F1).
2. **Not a grant** (§6.12) → `not_a_grant`.
3. **Facility contract** (§6.14) → `facility_contract`.
4. **Grant override** for (work, string) (§6.6) → the override's grant, or `not_a_grant`.
5. **NIH contract or task order** (`HHSN…`, `75N…`, `N01…`), whatever funder is named (§6.7).
6. **NIH**, whatever funder is named (§6.2–6.5): exact, parse fix, phase pair or bare serial; else
   a near-miss the paper's own NIH links confirm; else, if the string is NIH's (§6.4),
   Miscellaneous.
7. **NSF** (§6.8): seven digits the NSF API knows, else Miscellaneous.
8. **Other US federal** (§6.9): the number stands, keyed `USA:<AGENCY>:<NUMBER>`.
9. **Other configured agencies** (§6.10): the number stands, keyed `<AGENCY>:<NUMBER>`.
10. **An OpenAlex funder that is not configured** → `F<digits>:<NUMBER>`.
11. **Otherwise Miscellaneous** (§6.11).

**A RePORTER publication link is itself a listing** (`how: nih_link`), whether or not any string
names the grant.

### 6.2 The tolerant NIH parser

A string yields zero or more parsed candidates `(type, activity, IC, serial candidates, suffix)`.
The IC must be one of NIH's two-letter codes (config); the activity code is three characters,
letter first. It handles, each measured (Appendix A.1 has every example):

| Case | Example | Becomes |
|---|---|---|
| O or I read as 0 or 1 in the activity code or serial | `RO1 CA189986`, `PO1DE02195`, `R21ESO34337`, `AGO5131` | R01, P01, `034337`, `005131` |
| A leading application type, and suffixes `-NN`, `A1`, `S1` | `3p30dk017047-45s2`, `1k08ar082939-01a1`, `3t32gm008268-21a1s1` | P30DK017047, K08AR082939, T32GM008268 |
| A component's number after a whole serial, alone or after the support year *(B9a, header)* | `P30 ES007033-6364`, `S10 RR023044-010001` | P30ES007033, S10RR023044 |
| Activity codes with a letter second | `DP3DK108209`, `5DP5OD03615502`, `KL2 TR000421`, `TL1TR002318`, `UL1 RR 024156` | as written |
| A serial of 7–9 digits: the support year run on, or a stray leading zero; head and tail both tried | `1R01-HL14477801`, `5DP5OD03615502`, `P41 RR0011823`, `1S10RR-449017262` | R01HL144778, DP5OD036155, P41RR011823, S10RR017262 |
| Digits split by a space, comma or dash after the IC | `R01CA10720 9`, `P30 DK 089,507`, `R01-HL1-26028`, `UL1-TR-000,040` | R01CA107209, P30DK089507, R01HL126028, UL1TR000040 |
| …but not a mechanism pair followed by a number | `K99/R00 1K99HL103768-01` | K99HL103768 (and its phase, §6.3) |
| A serial shorter than six digits, zero-filled | `P30AG31679`, `T32-EB1650` | P30AG031679, T32EB001650 |
| Separators, labels and hash signs | `P01- AG017242`, `R01-AG-037603`, `NIH 5T32HG002760`, `#P30 CA091842` | as expected |

**Zero-filling is where false matches come from** (§6.3), which is why a zero-filled serial is
never accepted on IC and serial alone.

### 6.3 Accepting a parsed candidate

- **With an activity code:** accepted only if RePORTER holds that exact core — the same activity
  code, IC and serial — **or its phase partner** (configured pairs: `K99/R00`, `R21/R33`,
  `R61/R33`, `UH2/UH3`, `UG3/UH3`, `R01/R37`). **A string naming either phase lists every phase
  RePORTER holds under that IC and serial** — the phases are one award funded in stages — each as
  its own grant: `UH3 AG064706` lists UH2AG064706 and UH3AG064706; `K99/R00 1K99HL103768-01` and
  `5R00HL103768-04` list K99HL103768 and R00HL103768.
- **IC and serial alone are never enough** when the activity code disagrees. Measured: the five
  such matches (Appendix A.3) include a Z01 intramural project twice, a K04 and an R24, all wrong;
  the fifth, `P41GM103551` → R01GM103551, is right only because NIH links that paper to
  R01GM103551, which the near-miss rule (§6.5) reaches on its own terms.
- **Without an activity code** (`CA282268`, `GM111097`, `DK59637`): the string lists the cores
  with that IC and serial **that the same work already lists** by an NIH link or another string.
  Failing that, it is accepted when the serial is written with all six digits and RePORTER holds
  exactly one core under it. Measured: 262 distinct (work, bare string) pairs; 261 match a core
  their own work already lists; one, `CA282268` on W-000332, is accepted by uniqueness (K22CA282268). The research
  listed every core under a bare serial; this rule lists only those the work already lists, which
  differs on one work (W-000112, `HL091055`: R00HL091055 only, where the research also listed
  K99HL091055, which W-000122 lists anyway).
- **Among serial candidates** (head and tail, §6.2), the one that is accepted wins; if two are, the
  string lists both only if both are phases of one award, and otherwise neither, and is reported.

### 6.4 NIH-ness is decided by RePORTER, not by the funder named

**Funder names in the metadata are unreliable; numbers are not.** About 125 strings name AHA, NSF,
the Gates Foundation, EMBO, UW, Argonne, a university centre or a review panel as the funder of a
real NIH grant (for example `P30 DK017047` attributed to the American Heart Association, `P41
GM103533` to NSF, `1S10OD018111` to EMBO). So step 6 tries every string as NIH's, whatever funder
is named, and a string RePORTER resolves is NIH's.

A string RePORTER does **not** resolve is treated as NIH's — and goes to Miscellaneous if nothing
corrects it — only when a source names NIH, HHS or PHS as its funder, or it is a full NIH-format
number (activity code, IC and serial). Otherwise it continues to step 7 under the agency its
sources name. Match NIH attribution on **funder IDs** (OpenAlex funder, Crossref funder DOI) and
PubMed's `Agency`, not on a name pattern: the research's name pattern "national institute(s) of"
also caught the National Institute of Food and Agriculture, and two USDA numbers (`1008590`,
`80622200002120`) went into the NIH pass by mistake. *Another agency may also be named by a funder
name its source gives without an ID, when the whole name matches one of the agency's
`funder_names` patterns; NIH, HHS and PHS have none (B3a, header).*

**When a string's sources name several funders** and NIH has declined it, the non-NIH agency
named decides. If more than one configured agency is named, the one whose configured number
pattern fits wins; if still more than one, or none, the string is Miscellaneous and reported. The
research's other-agency numbers attributed to NIH each carried their real agency on another
sighting (Appendix A.6).

### 6.5 Near-misses NIH confirms

An NIH-format string that nothing above resolves is compared with the cores **RePORTER links to
the same work** that share its IC. A linked core is a match when:

1. it has the same activity code (or phase partner), and its serial equals the written digits
   **with one digit inserted, deleted or substituted, two digits exchanged (any two positions), or
   more digits added at the end** — each variant zero-filled to six; or
2. it has the **same zero-filled serial under a different activity code.**

**Exactly one match is accepted** (method `corrected`, the written string kept in the listing's
`cited_as`, §11.2); none or several leave the string unresolved. Measured on all 17 unresolved
NIH grants (Appendix A.4): **11 are corrected** — 10 by clause 1, among them `F32 GM801262` by a
deletion then zero-fill (a dropped leading zero and a stray final digit), and `P41GM103551` by
clause 2 — and none of the other 6 is matched. **`P01 HL0996` is refused** although its paper's
only linked P01 is P01HL092969 (no single edit of `0996` reaches `092969`), and stays
Miscellaneous, as it should. Because only unresolved strings reach this rule, those 17 are its
whole measured behaviour.

**A correction never adds a grant outside the NIH-linked set:** the corrected core is, by
construction, one NIH links to the paper.

### 6.6 Grant overrides

A `grant` override (§8.5) names a work, the string as written (matched after normalisation: case,
spaces, dashes) and a grant key, or `null` for "not a grant". Applied every run as a pure step,
at step 4, so it needs no `funding_version` bump. The validator warns when an override's string is
not seen on its work (like a merge not yet applied), and the stage alerts when RePORTER does not
know an override's NIH grant. The nine seeded overrides — five NIH grants and four non-NIH
typos — are in Appendix E.

The match key is `unicodedata.normalize("NFKC", raw).upper()` with every whitespace character
and every dash (U+002D, U+2010–U+2015, U+2212) removed — `uwpr_pubs.funding.overrides`, which the
validator and the stage share. An override on a work a merge has since retired follows it to the
survivor. In a store with no `funding/` yet there are no strings to look in, so the check is
skipped and one warning says how many overrides went unchecked. Two overrides that answer one
string on one work differently are an error, since the stage could honour only one.

### 6.7 NIH contracts and task orders

`HHSN` followed by 12 digits and a letter, `75N` numbers, and `N01…` are NIH contracts, whatever
funder is named (`HHSN272201700059C` on W-000197 is attributed to "University of Washington
Proteomics Resource"). Keyed `NIH-contract:<contract>`. **An IDIQ number and a task-order number on
the same work pair up** to `NIH-contract:<IDIQ>:<task order>`, which lists the task order alone.
A task order found alone is keyed the same way from the IDIQ its RePORTER row names; an IDIQ
found alone lists the whole contract.

### 6.8 NSF

A string whose agency (§6.4) is NSF is an NSF number when, with its separators and its division
prefix (`OCE`, `DGE`, `IOS`, `DBI`, `MCB`, `CHE`, `OPP` and the like) removed, it is **seven digits
the NSF API knows** (`NSF OCE‐0939564`, `DBI-193331.1`, `DGE-214-0004` all normalise). The
prefix never decides the agency: `OPP1156262` is a Gates Foundation number (Appendix A.6). **An
NSF number the API does not know goes to Miscellaneous**, because NSF's registry is complete. The
four such strings the research found, and the corrections it proposed for three of them, are in
Appendix A.8. None is automatic under F8; the three corrections are seeded as grant overrides
(Appendix E).

### 6.9 Other US federal agencies

Configured agencies whose amounts come from USAspending (NASA, DOE, DoD, NOAA, DOI, USDA, VA and
others). **The number stands without verification**, keyed `USA:<AGENCY>:<NUMBER>`: USAspending
covers only FY2008 on, so a miss there is not proof of a typo. Two exceptions:

- **Sub-award suffixes are dropped** (`NNX16AO69A:0061` and `:0107` are one grant, TRISH).
- **O and 0, I and 1:** a number USAspending does not know, whose single O/0 or I/1 swap it does
  know under the same agency, is that number (a parse fix): `NA140AR4170078` is
  `NA14OAR4170078`, Washington Sea Grant.

### 6.10 Other agencies

**The number stands**, keyed `<AGENCY>:<NUMBER>`, where the number is the uppercase letters and
digits left after the agency's configured prefixes are stripped (`VR-RFI 2019-00217` →
`VR:201900217`; `FKZ 031 A 534A` → `BMBF:031A534A`). **On one work, a number that is a proper
prefix or suffix, of at least three characters, of another number of the same agency is a
fragment of it** and lists the longest number it is part of: `HDTRA1` and `HDTRA1-18` beside `HDTRA1‐18‐1‐0001`;
`PID2023` beside `PID2023-153058OB-I00`; `100576` beside `PRE2021-100576`.

**The same number written differently is one grant.** Three pairs the research left apart merge
under these rules (Appendix F, ‡):
- **Whitespace and dashes:** EMBO's `ALTF933-2015`, `ALTF 933-2015` and `ALTF 933–2015` are one
  number, `ALTF9332015`.
- **One funder under two names:** `2016R1A5A1010764` and `NRF-2016R1A5A1010764`, which the
  research filed under `NRF` and `NRFK`, are both the National Research Foundation of Korea. The
  agency is decided by funder ID (§6.4), not by the name written, and the configured prefix `NRF`
  is stripped.
- **A year prefix:** FAPESP's process numbers begin with the year, written with two digits or four
  (`16/00696-3`, `FAPESP 2016/00696-3`). An agency configured with `year_prefix` has a two-digit
  year expanded to four — `20YY`, or `19YY` when `20YY` would be after the data year — so both
  are `FAPESP:2016006963`.

What no rule reaches: the same grant under a second identifier (a DFG training-group number
beside its project ID, a project acronym beside its number, a zero-padding difference). Each
stands as its own grant — without an amount, so it adds to the grant count, never to the total —
and the report lists grants of one agency that appear only beside another of the same agency on
the same work, so a person can merge them with a grant override. The research's cases are in
Appendix A.9.

### 6.11 Miscellaneous

A grant number nothing resolves is kept as `MISC:<NUMBER>` (uppercase letters and digits), agency
Miscellaneous, `status: unresolved`, no amount. **Every new one is listed in the run report**, with
its work, the string as written, its source, the funder named, and the nearest RePORTER
candidates for an NIH-format string. Expected after the seed: exactly `S10OD032290`,
`R01GM122864` and `P01 HL0996` among NIH-format strings, plus the non-NIH numbers of §6.8–6.10.

### 6.12 Not grants

`config/funding.yaml` holds `not_grants`: patterns and explicit strings, each with a reason.
Patterns: a string with no digit (a programme name: `CAREER`, `LEAPS`); a Crossref funder ID or a
fragment of one (`10.13039/501100011033`, `AEI/10`); an RRID (`SCR_022606`); a year or a year
range (`2018-`, `2015-2018`); `N/A`. Explicit: antibody names (`PGT121`, `PGT145`, `PGDM1400`,
`35O22`), mechanism names without a number (`NIH-R01`, `K99/R00` and its dash variants), programme
names with a digit (`H2020`), and the fragments the research found (`-0001`, `Z/17/Z`,
`Project 3`). **Patterns and explicit strings match the whole string after list splitting,** never
a part of it: `K99/R00 1K99HL103768-01` is an NIH number, not a mechanism name. Appendix A.6 lists
every one with its reason. They are reported, and counted nowhere.

### 6.13 The resource code

`UWPR95794` — however written, inside a list or alone — is `resource_code`: never a grant, never
Miscellaneous, and never shown as funding (F1). A test and invariant F7 hold it there.

### 6.14 Facility contracts

`config/funding.yaml` lists DOE M&O contracts by number, with the distinctive tails they are
written with (`05CH11231`, `06CH11357`, `76RL01830`, `SC0012704`), plus the pattern `DE-AC` — O
for 0 and any separators tolerated — for any other. A bare fragment (`DE-AC02`, `DE-AC05`) matches
the pattern too. Excluded, and counted in the method block. Appendix C.

### 6.15 Institution-wide tagging

From `institution_wide` in the config: explicit keys with reasons (Appendix B), and NSF programme
patterns — the Graduate Research Fellowship Program and Science and Technology Centers — matched
on the NSF API's programme name. (A "Fellowship Award" to an individual, such as a postdoctoral
fellowship, is not institution-wide.) The report lists **untagged grants of $20M or more** outside
NIH's centre mechanisms, for review.

## 7. Amounts

### 7.1 By source

| Family | Amount | `basis` |
|---|---|---|
| NIH grant | Σ `award_amount` over **parent rows** (no `subproject_id`) for every fiscal year. Parent-only is enforced again in code, behind `exclude_subprojects`. The per-year sums are kept as `fiscal_years`. | `reporter_fiscal_years` |
| NIH contract | Σ `award_amount` over the contract's rows | `reporter_contract` |
| NIH task order | Σ `award_amount` over that task order's rows only | `reporter_task_order` |
| NSF | Expired: `fundsObligatedAmt`. Active: the larger of `estimatedTotalAmt` and `fundsObligatedAmt` | `nsf_obligated` or `nsf_estimated` (whichever was used) |
| Other US federal | USAspending `total_obligation` from the award record | `usaspending_obligation` |
| Everyone else | The OpenAlex award's `amount` in its `currency`; `gepris` excluded; `anid_github` × 1,000 | `openalex_amount` |

**An agency source outranks OpenAlex.** Where both exist, the agency's is used. Where the agency's
figure is a lifetime total, as OpenAlex's is — `nsf_obligated`, `nsf_estimated` or
`usaspending_obligation` — and the two differ by more than 1%, the grant is flagged
`amounts_disagree`, and the report lists it. RePORTER's bases are never compared: OpenAlex's NIH
amount (provenance `nih_exporter`) is one fiscal year's award, not the lifetime sum of parent rows
*(B3b, header)*.

**A grant is active** when its end date is after the data date, or (NIH) it has a row in the
fiscal year in progress. Its total still grows, and it is flagged `active`.

### 7.2 Currency conversion (F7)

- `config/exchange_rates.yaml` holds US dollars per unit, by currency and year: G.5A for
  1999–2025 for every currency it lists, OECD for CLP. It is updated each January (§13.4).
- **The rate is the annual average of the award's start year.** A start year outside the table
  uses the nearest year the table has, and records it as `rate_year`. A source that gives no start
  year uses the grant's first year, flagged `rate_year_estimated`.
- **A currency in neither table** leaves `amount_usd` null: the grant is flagged
  `unconverted_currency`, shown in its own currency, and left out of every USD total.
- **`usd` is an integer:** `round(original × rate)` to the nearest dollar, halves to even,
  computed in decimal arithmetic from the stored strings of both numbers. Integer sums make every
  cross-check exact.

### 7.3 Recomputed, not stored

A grant's amount is **recomputed every run** as a pure function of its stored facts, the config,
the rates and the date. Changing a rate or an amount rule needs no network, and changing a rate
needs no version bump (the rates file is outside the funding fingerprint).

## 8. Store

### 8.1 Files

| Path | Written | Lines | Holds |
|---|---|---|---|
| `store/funding/citations.jsonl` | every run (identical bytes if nothing changed) | one per **included** work | its strings with outcomes, its NIH links, its JATS check dates, and the grants they list |
| `store/funding/grants.jsonl` | every run | one per grant listed by at least one included work | the source facts, and the amount derived from them |
| `store/funding/lookups.jsonl` | every run | one per negative or ambiguous probe | a memo, so a miss is not asked again weekly |
| `store/funding/agencies.jsonl` | every run | one per agency any grant names, plus parents | the agency tree |
| `config/funding.yaml` | by hand | — | `funding_version`, `enabled`, and the resolver's configuration (§8.4) |
| `config/exchange_rates.yaml` | by hand, each January | — | rates, US dollars per unit |

There is no state file. The date of the last full refresh comes from the newest run manifest whose
`funding.mode` is `full`. **Dates follow P11:** `first_seen` is exact; `last_seen` and `checked`
move through `evidence.advance_last_seen(stored, today, 28)`; `recheck_after` changes only when a
probe is repeated. A work that leaves `works/` loses its citations line; a grant no remaining work
lists is dropped; a retired work ID's line is mapped through the `work:` aliases and merged into
the surviving work, taking the union of its strings. A store without `store/funding/` is valid.

### 8.2 Grant keys

`common.schema.json` gains `$defs/grantKey` and `$defs/agencyCode`. A key is a family prefix and
colon-separated segments of **uppercase letters and digits only** — no dot, slash, space, `%`, `?`
or `#` — so it is safe in a path once URL-encoded, and never ends like a file name.

| Family | Key | Notes |
|---|---|---|
| RePORTER grants | `NIH:R01GM086688`, `VA:I01BX000531` | The prefix is RePORTER's `agency_code`; the rest is `core_project_num` |
| NIH contracts | `NIH-contract:HHSN272201700059C`, `NIH-contract:N01HV028179` | Never keyed on RePORTER's truncated core |
| NIH task orders | `NIH-contract:HHSN272201700036I:75N93020F00001` | |
| NSF | `NSF:1443474` | Always seven digits |
| Other US federal | `USA:NASA:NNX14AJ87G`, `USA:DOD:W911NF2220059` | Sub-award suffixes dropped |
| Other configured agencies | `WT:092809Z10Z`, `VR:201900217`, `EU:115766` | After the agency's configured prefixes are stripped |
| OpenAlex funders not configured | `F<digits>:<NUMBER>` | `F` and the digits of the OpenAlex funder ID |
| Miscellaneous | `MISC:S10OD032290`, `MISC:P01HL0996` | The written number, uppercase letters and digits |

Agency codes are uppercase letters, digits and dashes (`NIH`, `NIGMS`, `NSF`, `NASA`, `WT`,
`F<digits>`, `MISC`).

### 8.3 Line schemas

New schemas `funding-citation`, `grant`, `funding-lookup` and `agency`, registered like the others.

**`citations.jsonl`:**
```json
{"schema": 1, "work": "W-000147", "funding_version": "2026-10-03.1",
 "strings": [{"raw": "P01 HL09296", "funders": ["NHLBI NIH HHS", "National Heart, Lung, and Blood Institute"],
              "sources": ["jats", "openalex", "pubmed"], "first_seen": "2026-10-03", "last_seen": "2026-10-03",
              "outcome": "grant", "grants": ["NIH:P01HL092969"], "method": "corrected",
              "note": "one digit dropped at the end; NIH links this paper to P01HL092969"},
             …],
 "nih_links": [{"core": "P01HL092969", "grant": "NIH:P01HL092969", "first_seen": "2026-10-03",
                "last_seen": "2026-10-03"}, …],
 "jats_checked": {"R-000147": "2026-10-03"},
 "grants": ["AHA:13SDG16940064", "MISC:P01HL0996", "NIH:P01HL092969", "NIH:P30DK017047",
            "NIH:R01HL108897", "NIH:R01HL112625"]}
```
(Illustrative: W-000147's real strings, links and grants as the research found them; the dates are
placeholders.) Sources are `openalex`, `crossref`, `pubmed` and `jats`.
- `outcome`: `grant`, `unresolved` (its grant is a `MISC:` key), `not_a_grant`, `resource_code`,
  `facility_contract`.
- `method`: `exact` (after case, spacing, separators, labels, lists, the application type and
  suffixes are normalised), `normalised` (a parse fix: O or I for 0 or 1, split digits, a long
  serial, zero-fill, a bare serial), `corrected`, `override`, `agency_number`, `openalex_award`,
  `miscellaneous`.
- `grants` (top level) is derived: the union of the strings' grants and the NIH links' keys.
- *(B4)* A string's `method` is null for `resource_code`, `facility_contract`, and a `not_a_grant`
  no override named; `override` for one an override named. `grant` needs a method other than
  `miscellaneous` and at least one key, none `MISC:`; `unresolved` exactly one `MISC:` key, by
  `miscellaneous` or `override`. `funders` may be empty (JATS prose names none); `sources` may
  not. `note` is a string or null.
- *(B4)* **An NIH link carries its `grant` key.** RePORTER's `core` alone cannot give it: a VA
  project is `VA:…` and a contract `NIH-contract:…`. `core` is RePORTER's `core_project_num` as
  given, uppercase letters and digits.
- *(B4)* `jats_checked` maps record IDs to dates; every array is sorted, and so are the lines (by
  work).

**`grants.jsonl`:**
```json
{"schema": 1, "key": "NIH:P30DK017047", "agency": "NIDDK", "family": "reporter", "number": "P30DK017047",
 "activity": "P30", "category": "center", "status": "resolved", "scope": "project", "scope_reason": null,
 "title": "…", "pis": [{"name": "…", "id": "…"}], "organization": "UNIVERSITY OF WASHINGTON",
 "start": "…", "end": "…",
 "facts": {"reporter": {"fiscal_years": {"1986": "…", "2026": "…"}, "latest_appl_id": "…"}},
 "amount": {"usd": 52843525, "original": "52843525", "currency": "USD", "rate": "1", "rate_year": null,
            "basis": "reporter_fiscal_years", "source": "NIH RePORTER"},
 "flags": ["active"], "openalex_awards": [], "first_seen": "…", "checked": "…"}
```
- `facts` holds the raw source numbers, one shape per family: `reporter`
  (`fiscal_years`, rows' application types, latest `appl_id`); `nsf` (`estimated`, `obligated`,
  `exp_date`, `program`); `usaspending` (`total_obligation`, `type`, `pop_start`, `pop_end`,
  `generated_id`); `openalex` (`[{id, amount, currency, provenance, start_year}]`).
- `amount` is recomputed every run (§7.3). `original` and `rate` are decimal strings.
- **The export's `amount_source` is derived, not stored twice** (§11.4): its `url` is the
  exported grant's `url`, and its `as_of` is this line's `checked` date.
- *(B4) The types, as the schemas hold them:*
  - `family` says where facts and amount come from: `reporter` (NIH's and other RePORTER
    agencies' grants), `nih_contract`, `nih_task_order`, `nsf`, `us_federal` (USAspending),
    `agency` (another configured agency), `openalex_funder` (`F<digits>`) or `miscellaneous`.
  - `activity` is an NIH activity code or null; `category`, `scope`, `status` and `flags` take the
    values of §11.4. `scope_reason` is a string exactly when `scope` is `institution-wide`, else
    null. A `MISC:` key has `status: unresolved`, family `miscellaneous` and a null amount, and
    only a `MISC:` key is unresolved.
  - `pis[].id` is a string (RePORTER's `profile_id`) or null; `pis` is sorted by name.
    `organization` and `title` may be null. `start` and `end` are a date, a year alone (OpenAlex
    gives only years), or null.
  - `facts.reporter`: `fiscal_years` `{"YYYY": whole dollars, or null for a year whose rows
    report no amount}` (parent rows only; for a contract or task order, its rows),
    `application_types` (sorted codes), `first_support_year` (the earliest row's support year, or
    null) and `latest_appl_id` (an integer, for the project link). `facts.nsf`: `estimated`,
    `obligated` (decimal strings or null), `exp_date`, `program`, and *(B7)* `type`, the API's
    award type ("Fellowship Award"), which decides the category (§11.4); optional, a string or
    null. `facts.usaspending`:
    `total_obligation` (a decimal string or null), `type`, `pop_start`, `pop_end`,
    `generated_id`. `facts.openalex`: `[{id: "G…", amount, currency, provenance, start_year}]`,
    sorted by id. Every key of `facts` is optional; a `MISC:` grant's is `{}`.
  - `amount` is null when there is no amount. Inside it, `usd` is whole dollars and is null only
    for a currency no rate table covers, exactly when `rate` is; `rate_year` is null for US
    dollars. `basis` is one of §7.1's; `source` is `NIH RePORTER`, `NSF Award API`,
    `USAspending` or `OpenAlex`. `openalex_awards` holds OpenAlex's `G…` ids, sorted.

**`lookups.jsonl`:**
```json
{"schema": 1, "source": "reporter", "query": "near_miss:P01:HL:000996", "found": [], "checked": "…", "recheck_after": "…"}
```
*(B4)* `source` is `reporter`, `nsf`, `usaspending` or `openalex`; `query` is the stage's own
notation, one line per (source, query); `found` is what the source answered, none or more than
one, sorted; `recheck_after` is a date, or null for an answer that will not change.

**`agencies.jsonl`:**
```json
{"schema": 1, "code": "NIGMS", "name": "National Institute of General Medical Sciences", "short_name": "NIGMS",
 "parent": "NIH", "group": "us_federal", "country": "US", "origin": "reporter"}
```
IC names are learned from RePORTER's `agency_ic_admin`; the config holds only the two-letter IC
codes the parser needs. `origin` is `reporter`, `config` or `openalex`.

### 8.4 Configuration

**`config/funding.yaml`** joins `CONFIG_FILES`, with `schemas/config/funding.schema.json`:

```yaml
funding_version: 2026-10-03.1       # YYYY-MM-DD.N
enabled: false                      # true only at the seed (B9)
refresh: {full_every_days: 28, active_within_days: 365, recheck_unresolved_days: 90}
reporter:
  window: {tz: America/New_York, weekend: true, weekday_hours: [21, 5]}
  weekday_request_cap: 60
nih:
  ics: [AA, AG, AI, AR, AT, CA, …]
  phase_pairs: [[K99, R00], [R21, R33], [R61, R33], [UH2, UH3], [UG3, UH3], [R01, R37]]
  categories: {…}                   # activity code → category (§11.4)
agencies:                           # {code, name, group, country, openalex_funders, crossref_funder_dois,
  - …                               #  pubmed_agency_patterns, funder_names, number_prefixes,
                                    #  number_pattern, year_prefix, amount_source}
facility_contracts: [{number, tails, reason}, …]   # plus the DE-AC pattern
institution_wide: {keys: [{key, reason}, …], nsf_programmes: [GRFP, STC]}
not_grants: [{pattern | string, reason}, …]
openalex_amounts: {exclude_provenance: [gepris], corrections: [{provenance: anid_github, multiply: 1000, reason}]}
large_award_review_usd: 20000000
total_drop_alert: 0.05
```
`UWPR95794` is read from `rules.r2.code`, never duplicated here.

**`config/exchange_rates.yaml`:** `{sources: [{name, url, dataset, retrieved, years, currencies}],
rates: {GBP: {"1999": "1.6172", …}, …}}`, US dollars per unit, as decimal strings, the years
quoted so YAML keeps them strings.

**Fingerprint.** `Config.funding_fingerprint` covers `funding.yaml` without its version, and not
the rates file. Every run records it and the version in its manifest (§9.6), and a stage-0
guard fails the run when the fingerprint changed without a `funding_version` bump, exactly like
the rules guard; a manifest without the block is not compared. **A version bump schedules a full refresh.**
Grant overrides are not in this fingerprint (§6.6).

### 8.5 The `grant` override

`overrides.schema.json` adds `grant` to the action enum, with an `if/then` requiring `raw` and
`grant` (a `grantKey` or `null`) and a work-ID target; neither field is allowed on any other action
(B4). A `raw` of digits alone must be quoted, or YAML reads it as a number, which the schema
rejects:

```yaml
- target: W-000222
  action: grant
  raw: U19AG02312
  grant: NIH:U19AG023122
  reason: >-
    …
  by: mriffle
  date: 2026-10-03
```

Existing invariant 7 (the target resolves) covers it; the not-seen warning is §6.6's. **A change
to grant overrides must not re-read text:** that needs B1's `overrides_fingerprint`, which covers
only include, exclude, merge and split ([08](08-implementation.md) §8 item 9), and is why B1
comes first.

### 8.6 Invariants

Checked by `validate_store` and numbered F1–F7. **They are always cited as "invariant F1" and so
on, to keep them apart from decisions F1–F16.** Each error the validator reports names the
invariant it breaks ("invariant F4: …"), and a store without `funding/` is checked as before.

- **Invariant F1.** Every funding file validates against its schema. *(B4: and holds one line
  per work, grant, probe (source and query) and agency, since the stage looks each up by that.)*
- **Invariant F2.** Every citations line names an included work. A retired ID is an error.
- **Invariant F3.** A line's `grants` equals the union of its strings' grants and its NIH links.
- **Invariant F4.** Every listed key is in `grants.jsonl`, and every grant there is listed.
- **Invariant F5.** Every grant's agency, and every parent, is in `agencies.jsonl`; no cycles.
- **Invariant F6.** Internal amount consistency: `usd == round(original × rate)` (§7.2), and
  `usd == Σ fiscal_years` for `reporter_fiscal_years`. It uses no config, so editing the rates
  cannot turn committed data red.
- **Invariant F7.** No `resource_code`, `facility_contract` or `not_a_grant` string lists a grant,
  and no grant's key or number contains the resource code.

A work with no citations line is allowed: a new work in a degraded run has none yet.

## 9. The stage and its refresh policy

### 9.1 Where it runs

**Stage 8b, `Pipeline.funding(works)`**, after `decide_status` (stage 7), so work IDs are final
after merges, and before recall is measured and the gate, so its degradations count towards the
three-runs-in-a-row alert:

```
decide_status → funding(works) → measure_recall → assess_run_quality
  → stage_and_validate(works, candidates, metrics, funding, staging) → export(…, funding, …)
```

`RunOptions.funding` is `auto`, `full` or `skip` (`run --funding`). **`--channels` implies
`skip`**, because a partial run must change nothing, and **`enabled: false` means `skip`**, which
is how the stage lands before the seed. `skip` carries the stored lines forward and drops only the
lines of works that left.

The pure core lives in `src/uwpr_pubs/funding/` — `numbers.py` (the parser), `classify.py`,
`resolve.py` (in two passes: `plan_lookups` lists what the shell must ask; `resolve_work` decides),
`amounts.py`, `currency.py`, `jats.py`, `summary.py` — with no IO and no clock. The shell adds
`sources/reporter.py`, `sources/nsf.py`, `sources/usaspending.py`, `Ncbi.pubmed_grants`,
`OpenAlex.awards_by_ids` and `funders_by_ids`, and `Crossref.funders_by_dois`.

### 9.2 Incremental and full

**Every run (incremental):** OpenAlex listings from the stage-3 payloads (free); RePORTER links for
every PMID (about 4 requests, 100 PMIDs each); PubMed, Crossref and JATS for **new records only**;
lookups for new strings and new keys; facts for **active** grants (an end date or last fiscal year
within 365 days); probes for unresolved strings whose `recheck_after` has passed (90 days).
*Estimate: 10–20 RePORTER requests and under a minute; B9 measures it.*

**Full refresh:** PubMed and Crossref re-read for every record, every grant's facts and every
OpenAlex award re-fetched, everything unresolved re-probed. **Due** when 28 days have passed since
the last full refresh, `funding_version` changed, or `--funding full` is given. *Estimate: 100–150
RePORTER requests, about 3 minutes at one a second, about $0.004 of OpenAlex; B9 measures it.*

**This is scheduled, not a sweep.** [03](03-retrieval-pipeline.md) P1's "search everything every
run" governs discovery, where a missed week is a missed paper. Funding facts are refreshed on a
schedule, as unreadable text is rechecked under P9: a grant's lifetime total moves slowly, and
RePORTER asks for restraint.

### 9.3 The RePORTER window, in code

A due full refresh runs only when the run's start time, in America/New_York, falls on a weekend or
between 21:00 and 05:00, or when it is forced. Otherwise it is deferred with a note. Outside the
window, incremental RePORTER requests are capped at `weekday_request_cap` (60) and any remainder
deferred. With the Saturday schedule (§13.1) every scheduled run is inside the window; the guard
protects hand-started runs.

### 9.4 Degradation

- **Each source degrades on its own** — `source:reporter`, `source:nsf`, `source:usaspending`,
  `source:pubmed`, `source:crossref`, `source:openalex` — with the existing `_unreachable`
  short-circuit.
- **A failed fetch keeps the stored line,** facts and all. **A sighting is never removed** because a
  source stops showing it: its `last_seen` stops advancing, as evidence does (Phase 2 §13).
- **An unexpected exception in the stage** degrades `stage:funding`, raises an alert, and carries
  the stored funding forward; the publication data still publishes.
- **The stage validates its own output** against the schemas and invariants F2–F7 before handing
  it on. If that fails, it carries forward and alerts. **A funding bug cannot block the weekly
  publication update at the gate.**

### 9.5 Alerts

- RePORTER answers **HTTP 403**: "possible IP block — RUNBOOK".
- The **total drops by more than 5%** in a run with no funding degradation.
- An override's NIH grant is unknown to RePORTER.
- The stage carried forward after an error or a failed self-validation.
- The export exceeds **500 KiB gzipped** at level 9 (stage 11; it alerts, never fails, on size).

### 9.6 Report, manifest and `explain`

**The report's Funding section:** the mode (incremental, full, deferred or skipped); grants, total
and the change since the last run; new grants (up to 50); **every new unresolved string** (§6.11);
overrides not applied; OpenAlex–agency disagreements over 1%; untagged awards of $20M or more;
grants of one agency seen only beside another on the same work (§6.10); counts excluded as
not-grants, resource code and facility contracts.

**The manifest** gains an optional `funding: {version, fingerprint, mode, grants, amount_usd,
requests}` and B1's `overrides_fingerprint`, both additive to `run.schema.json`. Every run writes
`version` and `fingerprint`, which stage 0's guard compares (§8.4; added by B3); the funding stage
adds the rest.

**`uwpr-pubs explain W-…`** gains a Funding section, and `explain NIH:R01…` (any grant key) lists
the grant's works, listings and facts.

## 10. HTTP: POST, backward compatible

- **Cache key.** `request_key(url, params, method="GET", body=None)`. A GET with no body keeps
  today's key exactly, so every existing cache entry stays valid; anything else hashes
  `"{method}\n{safe_url}\n{query}\n{sha256(body)}"`.
- **Client.** A private `_send(method, url, params, body, …)` holds today's retry, budget and
  limiter loop; `get()` delegates to it unchanged; **`post_json(url, payload, …)`** sends a
  canonical body — `json.dumps(payload, sort_keys=True, separators=(",", ":"))` — with
  `Content-Type: application/json`. POST is retried and spaced like GET.
- **Transport** gains `body: bytes | None = None`; `HttpxTransport` posts `content=body`. Every
  test fake gains the parameter (mypy's strict mode covers `tests/`).
- **Cache format.** `Fetched` gains `method="GET"` and `body=b""`; `CacheRecord` gains
  `method="GET"` and `body_sha256=None`, **serialised only when they differ from those defaults**,
  so GET index lines stay byte-identical. The loader keeps only known fields. `update.yml` moves the
  cache key from `dlcache-v1-` to `dlcache-v2-`, so rolled-back code never reads POST lines, at the
  cost of one cold run.
- **Rate limits:** `reporter: 1`, `nsf: 2`, `usaspending: 2` requests a second, each required by
  `settings.schema.json`.
- **Recordings (P10):** `abstract_text` and `phr_text` join the stripped keys; `<Abstract>…
  </Abstract>` is stripped from XML; the violations check flags `<AbstractText`.
- **TLS:** §5.3.

## 11. The export contract, `schema_version` 1.1

This is the one contract, reconciling the backend and web designs: where they differed, the
plan's shape wins, with the additions this section marks.

### 11.1 Versioning

Additive, so a minor bump ([05](05-metrics-and-data-contract.md) §12): the app refuses only an
unknown major version, so a 1.1 export loads in today's app. **The top-level `summary` is
untouched**, so the existing summary cross-check is unaffected. **Funding with no data** — `enabled:
false`, or a store without `funding/` — exports `funding.version: null`, empty lists, zero counts
and null years, and every `works[].grants` empty. The app also meets **1.0 exports with no
`funding` block at all** (after a rollback, [07](07-operations.md) O2) and must treat both as "no
funding data" (§12.10). Everything is sorted: `grants` by key, `agencies` by code, each work's
`grants` by grant.

### 11.2 `works[].grants[]` (required, possibly empty)

```json
[{"grant": "NIH:P01HL092969", "how": "listed", "cited_as": ["P01 HL09296"], "agencies": ["NIH", "NHLBI"]},
 {"grant": "NIH:U19AG023122", "how": "override", "cited_as": ["U19AG02312"],
  "override": {"reason": "…", "by": "mriffle", "date": "2026-10-03"}, "agencies": ["NIH", "NIA"]},
 {"grant": "MISC:S10OD032290", "how": "listed", "agencies": ["MISC"]}]
```

| Field | Meaning |
|---|---|
| `grant` | A key in `funding.grants`. **Never null**: an unresolved number is a `MISC:` grant. |
| `how` | `listed` (a string names it, exactly or after a parse fix), `nih_link` (only a RePORTER link names it), `corrected` (§6.5), `override` (§6.6). When several apply, the first of `listed`, `corrected`, `override`, `nih_link` — the strongest evidence that the paper itself names the grant. |
| `cited_as` | **The written forms on that work that resolved to this grant only by correction (§6.5) or override (§6.6)**, whitespace collapsed, sorted. **Present exactly when that list is non-empty, whatever `how` is**, so the app can say "also written in the paper as …". |
| `override` | `{reason, by, date}`, **present exactly when an override applied to any of that work's strings for this grant** — the same attribution rule as override evidence ([05](05-metrics-and-data-contract.md) §6). |
| `agencies` | The grant's agency chain, **root first** (`["NIH", "NHLBI"]`). Denormalised so a filter predicate needs nothing but the row ([05](05-metrics-and-data-contract.md) §1.1). |

**`cited_as` does not depend on `how`.** On the real data every corrected core is also written
exactly by another source of the same work, so under the precedence rule `how` is never
`corrected` there; were `cited_as` tied to `how`, the app would never show what a paper wrote.
On W-000147, P01HL092969 is `how: listed` — PubMed and OpenAlex write it exactly, and NIH links
it — with `cited_as: ["P01 HL09296"]`, the form in its JATS text, PubMed and OpenAlex that only
§6.5's correction resolves. U19AG023122 on W-000222 is written only as `U19AG02312`, so there
`how` is `override` and `cited_as` holds that one string.

### 11.3 The top-level `funding` block (required)

```json
"funding": {
  "version": "2026-10-03.1",
  "as_of": "2026-10-03",
  "sources": [{"id": "reporter", "name": "NIH RePORTER", "url": "https://reporter.nih.gov/",
               "as_of": "2026-10-03", "amounts_from": 1985, "partial_year": 2026}],
  "exchange_rates": [{"name": "Federal Reserve G.5A", "url": "https://www.federalreserve.gov/releases/g5a/",
                      "currencies": ["CAD", "CHF", "…"], "through_year": 2025}],
  "method": {},
  "summary": {},
  "agencies": [],
  "grants": []
}
```

- **`version`:** `funding_version`, or null with no funding data.
- **`as_of`:** the date of the **last full refresh** — every amount was read then or later. Each
  grant's own `amount_source.as_of` says when its facts were last confirmed.
- **`sources[]`:** one per source used — `reporter`, `nsf`, `usaspending`, `openalex`, `pubmed`,
  `crossref`, `pmc` — each `{id, name, url, as_of, amounts_from, partial_year}`. `amounts_from` is
  the first year a source's amounts cover (RePORTER 1985, USAspending 2008), else null;
  `partial_year` is the fiscal year in progress on `as_of` for a source reported by fiscal year,
  else null. The app hard-codes neither.
- **`exchange_rates[]`:** `{name, url, currencies, through_year}` per rate source. *(A list, where
  the plan sketched one object, because F7 names two sources.)*
- **`method`:** `{strings: {grant, unresolved, not_a_grant, resource_code, facility_contract},
  resolution: {exact, normalised, corrected, override}, works_without_funding_metadata}`, over the
  exported works. `strings` counts distinct (work, string) pairs by `outcome`, and `resolution`
  the same pairs by `method` (§8.3), for the four methods the method page states — pairs, not
  work–grant listings, because a listing's `how` hides its corrections (§11.2). For the method
  page only. (The date of the last full refresh is `as_of`, so the method block does not repeat
  it.)

### 11.4 A grant

| Field | Type | Meaning |
|---|---|---|
| `key` | grantKey | §8.2 |
| `agency` | agencyCode | The most specific agency (an NIH grant's administering IC) |
| `number` | string | The display form: RePORTER's core, the contract or task-order number, NSF's seven digits, else the most frequent written form (ties broken alphabetically) |
| `category` | enum | `research`, `center`, `training`, `instrument`, `contract`, `other` (below) |
| `scope` | enum | `project` or `institution-wide` |
| `scope_reason` | string\|null | Why it is institution-wide ("NSF GRFP institutional award"). *(Added to the plan's list, so the page can say why.)* |
| `status` | enum | `resolved`, or `unresolved` for a `MISC:` grant |
| `title` | string\|null | As the source gives it (RePORTER titles are often capitals; not re-cased) |
| `pis` | array | `[{name, id}]` as the funder's public record gives them (F13): RePORTER's latest row's names with the `profile_id` as `id`; NSF's `pdPIName` and OpenAlex's lead investigator with `id: null`; empty where the source has none (USAspending) |
| `organization` | string\|null | The awardee as the source names it (RePORTER's latest row, NSF `awardeeName`, USAspending recipient, OpenAlex institution) |
| `start_year`, `end_year` | int\|null | The award's years as the source gives them; for NIH, the first fiscal year RePORTER holds and the year of the latest project end date |
| `first_year` | int\|null | §4; null only for a grant no exported work lists, which cannot occur |
| `amount_usd` | int\|null | §7; null when unknown or unconverted |
| `amount_original` | number\|null | In `currency` |
| `currency` | string\|null | ISO 4217 |
| `rate_year` | int\|null | The rate's year, when converted |
| `amount_source` | object\|null | `{name, url, as_of, basis}`: the source's name, a page a reader can open to check the figure, the date its facts were last confirmed (under the 28-day rule, so up to 27 days behind the latest read), and the basis of §7.1. **Derived, not stored twice:** `url` is the grant's `url`, and `as_of` the store line's `checked` date (§8.3). Null when there is no amount. *(`basis` added to the plan's list: NSF's rule makes one source mean two things.)* |
| `fiscal_years` | object\|null | `{"YYYY": int}` parent-row sums, RePORTER grants only; they sum to `amount_usd` |
| `url` | string\|null | An outbound link built by the pipeline, so the app holds no source URL pattern: RePORTER's project page (`https://reporter.nih.gov/project-details/<appl_id>`, latest application), NSF's award page (`https://www.nsf.gov/awardsearch/show-award/?AWD_ID=<id>`; the older `showAward?AWD_ID=` redirects there), USAspending's award page (`https://www.usaspending.gov/award/<generated_id>`); each form fetched and answering 200 on 2026-09-26 (B5) |
| `url_name` | string\|null | The link's label, naming the page it opens ("NIH RePORTER project page", "NSF award page", "USAspending award page"); null exactly when `url` is null. So the link can be labelled without `amount_source`, which is null for a grant with no amount (VA, `N01HV028179`) |
| `flags` | array | From: `active`, `starts_before_fy1985`, `starts_before_fy2008`, `no_amount_reported`, `amount_not_found`, `amount_from_openalex`, `amount_corrected`, `amounts_disagree`, `unconverted_currency`, `rate_year_estimated` |

**Flags:** `starts_before_fy1985` — NIH amounts begin FY1985, earlier years missing;
`starts_before_fy2008` — a USAspending award begun before FY2008, whose earlier obligations may be
missing (not measured); `no_amount_reported` — the source holds the grant and reports no amount
(VA, `N01HV028179`); `amount_not_found` — no v1 source has an amount; `amount_corrected` — ANID's
×1,000; the rest as named.

**Categories.** `center` covers centres, program projects and resource grants; the rest are as
named. NIH, by activity code (the table is configuration; this is its starting point):
`instrument` S10, G20; `training` T\*, F\*, K\*, KL2, TL1, R25, D43; `center` P\*, M01, U54, U19,
U24, U2C, U41, U42, UL1, R24; `contract` N\*, `HHSN`, `75N`; `research` R\* (other than R24 and
R25, and including the SBIR/STTR R4x codes), RM1, DP\*, U01, UH2, UH3, UG3, UM1, RF1, SC\*, Z\*
(intramural), I01 (VA); `other` anything else. Each of the 58 codes among the 454 linked grants
(§3.2) falls in one of the first five. NSF: `training` for the Graduate Research Fellowship
Program and "Fellowship Award"s, `center` for Science and Technology Centers, else `research`.
Other agencies: `other`, unless the agency's config gives patterns. Miscellaneous: `other`.

### 11.5 An agency

`{code, name, short_name, parent, group, country}` — `short_name` and `parent` nullable; `group`
one of `us_federal`, `us_nonfederal`, `non_us`, `miscellaneous`; `country` ISO 3166 alpha-2 or null.
**The app finds Miscellaneous by `group`, never by a hard-coded key.** Every agency any grant names
is present, with every parent.

### 11.6 `funding.summary`

Computed by the pipeline **independently** of the rows, over the unfiltered export, **with
institution-wide awards included** (the default view), and carrying the institution-wide halves so
the excluded view is checkable too:

| Field | Definition |
|---|---|
| `grants` | Grants in `funding.grants`, any status |
| `grants_resolved` | … with `status: resolved` |
| `grants_with_amount` | … with `amount_usd` not null |
| `grants_unconverted` | … flagged `unconverted_currency` |
| `grants_institution_wide` | … with `scope: institution-wide` |
| `agencies` | Distinct **root** agencies of resolved grants (Miscellaneous is not one) |
| `investigators` | Distinct principal investigators over the `pis` of resolved grants, each keyed by its `id` when present, else by its name normalised: NFKC, casefolded, whitespace collapsed |
| `organizations` | Distinct `organization`s of resolved grants, keyed by the name normalised the same way; a null organisation counts for nothing |
| `amount_usd` | Σ `amount_usd` over all grants — **the headline, unfiltered** |
| `amount_usd_institution_wide` | Σ `amount_usd` over institution-wide grants |
| `amount_usd_nih` | Σ `amount_usd` over grants whose root agency is NIH |
| `nih_grants` | Resolved grants whose root agency is NIH |
| `works_with_grants` | Exported works listing at least one resolved grant |
| `works_with_listings` | Exported works listing at least one grant, Miscellaneous included |
| `first_year`, `last_year` | Min and max `first_year` over resolved grants; null if none |
| `by_first_year` | `{"YYYY": {grants, grants_institution_wide, amount_usd, amount_usd_institution_wide}}` over resolved grants, keyed by `first_year` — the cumulative rule's increments (F3) |

**Investigators and organisations are keyed partly on names.** RePORTER gives a person
identifier and the other sources do not, so one person under two spellings, or once with an `id`
and once without, counts twice; the method page says so. For the 454 NIH-linked grants alone the
counts on each grant's latest row are 365 and 86 (§3.2).

### 11.7 Validator cross-checks (`validate_export`)

- Every `works[].grants[].grant` is a key in `funding.grants`, and every grant is listed by at
  least one exported work.
- Every grant's agency, and every parent, is in `funding.agencies`; no cycles; each listing's
  `agencies` equals its grant's chain, root first.
- `funding.summary` equals a recomputation from the rows.
- Each grant's `first_year` equals the minimum `year` of the exported works listing it.
- `Σ fiscal_years == amount_usd` wherever `fiscal_years` is present.
- `cited_as` present, and non-empty, exactly when a string of that work resolved to the grant by
  `corrected` or `override`; `override` present exactly when an override applied to one of them;
  `how` the first of `listed`, `corrected`, `override`, `nih_link` that applies (§11.2).
- A `MISC:` grant has `status: unresolved`, group `miscellaneous` and no amount.
- **The resource code appears nowhere** — not as a key, a number, or in `cited_as`.
- Every key matches the grant-key grammar.
- With `version` null, every list is empty and every count zero.

**The app's cross-check:** `summarizeFunding(works, funding)` equals `funding.summary` field for
field — `investigators` and `organizations` included, with the same keys — and each grant's
unfiltered first year equals its `first_year`.

### 11.8 Sample cases

`uwpr_pubs.sample` gains `FUNDING_CASES`, predicates over the whole export, extending
`missing_cases`. **Real, from `samples/store/`:** a parent-rows-only multi-project total (P30DK017047
on W-000002 and W-000007); a type-3 supplement string (`3p30dk017047-45s2` on W-000007); NSF
(W-000003, W-000010); USAspending, NASA (W-000013); OpenAlex amounts in SEK and EUR (W-000004,
W-000009); institution-wide (GRFP 2140004 on W-000006, 1762114 on W-000010, C-DEBI on W-000013,
and also EPIC-XS on W-000009 and VR's infrastructure grant on W-000004); a grant starting before
FY1985 (T32GM007750 on W-000001); a grant known only by an NIH link (R35GM150919 on W-000009); a
funder misattributed to AHA (W-000007); the resource code excluded (W-000001, W-000006, W-000007); a
DFG gepris amount excluded (W-000004, W-000006); an NIH IC with its parent. *Verified against
`samples/store/` in B8, which moved the NIH-link case from W-000011, whose grant three sources also
write. Four of these — the supplement, the AHA attribution, the resource code and the gepris
amount — are facts of the store the export does not carry, so `tests/test_sample_funding.py` holds
them against the store; the other nine are `REAL_FUNDING_CASES`, which read the real works'
listings alone.* **Synthetic, in `samples/export_cases.json`**
(SAMPLE titles, `10.0000` DOIs): a contract; a task order; an unresolved NIH-format string in
Miscellaneous; an override with attribution; a corrected near-miss; a CLP amount converted by the
OECD rate; an amount in a currency neither rate table covers, left unconverted; a work with no
grants; **one grant listed by two works in different years** (first year and
de-duplication); a grant with a null amount; a sub-agency with a parent.

### 11.9 Size

The budget rises to **500 KiB gzipped: 512,000 bytes (500 × 1,024) at gzip level 9**, the measure
`web/scripts/check-bundle-budget.mjs` already uses for JavaScript, so both budgets mean the same
thing. Today's export is 303 KiB by it, and the export with funding is estimated at 420–450 KiB,
to be measured in B9 (§3.5), which leaves about two years' headroom. *(B5 measured contract 1.1
without funding data: 311,014 bytes, 303.7 KiB, for the real export, and 18,099 bytes for the
sample with its synthetic funding; §3.5. The sample with its real funding beside the synthetic, as
B9c rebuilt it, is 27,004 bytes, 26.4 KiB.)*
[06](06-web-app.md) §10's row changes, `web/scripts/check-data-budget.mjs` enforces it in the web
CI job against `export/` and `samples/export/`, a Python test asserts the script's constant
equals `stages/export.DATA_BUDGET_BYTES`, and stage 11 alerts above it (§9.5), measuring the same
way.

## 12. The app

### 12.1 Routes

| Route | View | What it is for |
|---|---|---|
| `/funding` | **Funding impact** | The figures, charts and grants, under the same filter as the publications |
| `/funding/agency/<code>` | **Agency** | One agency across the whole corpus |
| `/funding/grant/<key>` | **Grant** | One grant: its facts, its amount and where it came from, and the papers that list it |

Keys and codes are URL-encoded (`encodeURIComponent`); agency and grant prefixes are matched before
the exact `funding`; an empty key is unknown. `404.html` and the preview fallback already serve any
path. A pure `shellTitle(route)` gives the loading shell its `h1` ("Funding impact" for `/funding`)
before the data arrives.

### 12.2 The view switch

A shared `SiteHeader`, extracted from the overview, carries a `<nav aria-label="Views">` with two
**links** — Publications and Funding impact — the current one marked `aria-current="page"`. Links,
not ARIA tabs: each is a page with its own URL. **Switching carries the whole query string**, so
the filter survives both ways; method and lookup still clear it, as agreed in
[06](06-web-app.md) §3. A plain left click pushes a peer history entry with no back state, and a
middle click opens a new tab.

### 12.3 Going back

Each in-app open pushes **`history.state = {back: <kind of the route left>}`**. A page shows a back
control, which calls `history.back()`, if and only if `state.back` is set, labelled from a map:
"Back to the publications", "Back to funding impact", "Back to the agency", "Back to the grant",
"Back to the publication", "Back to the lookup". Arriving cold, it shows a link to its parent
instead ("See all publications", "See funding impact"), carrying the query. This replaces the
single `openedInApp` flag, which cannot follow funding → agency → grant → publication → back three
times, and fixes an existing mislabel: a publication opened from `/lookup` said "Back to the
publications".

### 12.4 Filtering

- **Two new dimensions, `agency` and `grant`,** repeatable in the URL, OR within a dimension and
  AND across, like every other ([05](05-metrics-and-data-contract.md) §9). A work matches agency
  *A* when any of its listings' `agencies` chains contains *A* (so `agency=NIH` matches every IC,
  and Miscellaneous is selectable); grant *G* when it lists *G*. **The publications view honours
  them too**, so the switch keeps one filter meaning one thing. (`kind` is already the publication
  kind; a grant-category filter would be `grant_kind`, and is not in v1.)
- **Scope rule (F15):** the grants shown are those listed on the filtered publications, further
  restricted to the selected agencies and grants when any are selected. An explicit grant selection
  overrides the institution-wide toggle. Miscellaneous grants are kept only when no grant is
  selected and the agency selection, if any, includes Miscellaneous.
- **Institution-wide toggle:** in the URL as **`institution_wide=exclude`**, written only when the
  reader excludes them (the default is included, F4). It is one deliberate choice that changes the
  headline people cite, so it is shareable, like the explorer's sort.
- **Out of the URL** ([06](06-web-app.md) §6's boundary): the by-agency stack, bucket size,
  ranking by value or by count, and the grants table's sort and search. The table's search never
  narrows the publications.
- The live-region sentence gains a funding form: "41 grants listed on 88 of 338 publications
  matching Year: 2020."

### 12.5 The Funding impact view

In order:

1. **Header** (`SiteHeader`), the staleness notice, and the filter bar with the funding sentence.
2. **Headline figures:** *Total value of grants listed*, with its as-of date and definition link
   (F2), and beneath it how many grants have no known amount and are not in it; grants listed (and
   how many more are unmatched numbers, in Miscellaneous); agencies; principal investigators and
   organisations (`funding.summary`'s `investigators` and `organizations`, so the cross-check
   covers them); publications listing a grant, *K* of *N*. **The institution-wide switch sits
   here**, and the figure always states its position: "including *M* institution-wide awards
   worth $*Y*", or what was left out.
3. **Grant funding over time:** bars for the value entering each year and a cumulative line, a
   Total / By agency switch to a stacked view, and the note: "each grant's full lifetime total
   enters in the year of the first publication shown that lists it; this is a publication year, not
   an award year; *N* grants with no known amount are not in this chart." **The year bars are
   static** (`role="img"`): their year is a grant's first year, and clicking it would apply a
   publication-year filter that changes the very first years being drawn.
4. **Agencies:** a ranked bar chart (by value or by grants; a per-chart switch) whose bars **apply
   the agency filter**; "new grants by agency over time" (counts by first year, three-year buckets by
   default; top five, Miscellaneous pinned and never merged into Other, then Other), whose segments
   apply the filter; and a table — agency (linking to its page), parent, country, grants, known
   total, without an amount, publications.
5. **Grant types:** static bars by value and by count per category, noted as not filters.
6. **All grants:** a table — number (linking to the grant page), title, agency (linking), PIs,
   institution, years, type and tags, total or "not known", first listed, publications — sorted by
   total, descending, with unknown amounts last in both directions; a local search; and **a CSV
   download of exactly the visible rows** (RFC 4180, CRLF, formula-injection guard, nulls as empty
   cells, never 0).
7. **Coverage:** publications with an identified grant, with only unmatched numbers, with none;
   grants with and without a known amount; the Miscellaneous sentence, linking to
   `?agency=<misc>`; the institution-wide position; how many amounts start at FY1985; how many
   grants are still active.
8. **Footer.**

Empty states: no publication matches (the existing chart-empty state); publications match but none
lists a grant (its own sentence); no funding data (§12.10).

### 12.6 The agency page

Its facts (parent, country); its figures over the whole corpus, stated as "not affected by the
filter"; a breakdown by child agency, each linking to its page, with an "assigned to no institute"
remainder; grants over time (static); its grants (the grants table); its publications, as a compact
list of links; and two links: "Filter the publications by this agency" (the current filter plus
the agency) and "See funding impact for this agency". A designed not-found state for an unknown
code.

### 12.7 The grant page

The `h1` is the title, or the number when there is none; an identity line gives agency and number.
A facts list: the lifetime total with its source, basis and as-of date; the original currency and
conversion year; the FY1985 caveat; "active — the total still grows"; PIs; organisation; years;
scope and its reason. A per-fiscal-year chart and table, static, labelled "Fiscal year (October to
September)", with the partial fiscal year marked. The publications listing it, each with "also
written in the paper as …" wherever its listing carries `cited_as`. The outbound `url`, labelled
with `url_name` (§11.4), whether or not the grant has an amount. Not-found, and Escape closing only
when opened in-app.

### 12.8 The publication's Funding section

An `h2` "Funding listed in this publication", after "Why this is a UWPR publication" and before
"Other versions". Each grant: agency (in-app link), number (in-app link, plus the outbound link),
title, PIs, years, total or "amount not known", and a tag for institution-wide awards. **Whenever
a listing carries `cited_as`, it says "also written in the paper as 'P01 HL09296'"**, whatever its
`how` — a corrected core is usually also written exactly by another source (§11.2); an override
gives its reason, by whom and when. Unmatched numbers appear quoted under an `h3` "Miscellaneous
(not matched to a grant record)". When the work has R2 evidence, a sentence says the resource's
own award is shown above as evidence and is not a grant. The section is omitted when there is no
funding data.

### 12.9 The method page

A section `#funding`: the sources with their as-of dates; the resolution rules with the counts from
`funding.method` (exact, normalised, corrected and override from `resolution`; unresolved and
not-grants from `strings`); that investigators and organisations are counted partly by name
(§11.6); how sub-projects and supplements are handled; what a total means per source; currency
conversion; that `UWPR95794` is evidence and never a grant; the FY1985 start; partial fiscal and
publication years; active grants; the first-year definition; institution-wide awards;
Miscellaneous. The definitions list gains
entries for the funding figures, each with its corpus value.

### 12.10 No funding data

The funding block is absent (a 1.0 export) or its `version` is null: `/funding` renders a plain
notice that this export carries no funding data; agency and grant pages render not-found; the
publication detail omits its Funding section; nothing throws. **All funding reads go through one
accessor** (`fundingOf(doc)`), which returns null in both cases.

### 12.11 Honesty rules

These extend [05](05-metrics-and-data-contract.md) §11 to every funding string:

1. **No causal or credit-taking wording.** Never "funding generated, attracted, enabled or
   supported by UWPR". The figure is about grants listed on papers that used the resource.
2. **The headline always carries its definition, its as-of date and "not money spent on this
   work".**
3. **Unknown is never $0,** and the count of grants without an amount stands beside every total.
4. **The institution-wide position is stated** wherever the total appears.
5. **A converted amount shows its original** and the rate year.
6. **Partial fiscal years and active grants are marked.**
7. **A grant is counted once,** however many papers list it, and the page says so.
8. **A reference resolved by correction or override shows what the paper wrote** ("also written
   in the paper as …", from `cited_as`), whatever the listing's `how`.
9. **PI names as the funder publishes them,** with no link to any profile of a person.
10. **The resource's own code is never shown as a grant.**

### 12.12 Build flag, budgets, accessibility

**`VITE_FUNDING`**, on in CI builds and e2e and off in `pages.yml`'s production build, kept every
funding entry point off the public page while the view was built. **It was removed at release
(R2, 2026-09-27):** every build has the view. The JavaScript budget stays at **250 KiB gzipped**
(level 9), and no dependency is added: currency formatting uses `Intl`, CSV is written by hand.
One `h1` per route; `nav` with `aria-current`; every table with a caption, `th scope` and
`aria-sort` on sortable headers; a labelled search box; only the filter bar is a live region;
every static mark `role="img"`.

## 13. Operations and legal

### 13.1 Schedule

**`update.yml`'s cron becomes `17 7 * * 6`: Saturday 07:17 UTC**, which is 03:17 Eastern in
summer and 02:17 in winter — Saturday both ways, so inside RePORTER's window all year (F12). This
changes the frozen C4 decision ([03](03-retrieval-pipeline.md)) and [07](07-operations.md) §1.
**Do not try to express "the first Saturday" in cron:** when both day-of-month and day-of-week are
set, cron runs when *either* matches.

### 13.2 Smoke checks

`uwpr-pubs smoke` gains a control per source, classified like the existing ones (an outage is
DOWN, a changed shape FAIL). These controls come from the research and planning; B10 confirms each
one live before relying on it: RePORTER — `P41GM103533` has rows with amounts, and PMID 19070509
links `S10RR017262`; NSF — award 1908587 has `fundsObligatedAmt`; USAspending — `NNX14AJ87G` is
about $796k; PubMed — a `GrantList` for PMID 19070509; OpenAlex — `/awards` for a known award has
`amount`; Crossref — the funder batch works.

**Confirmed live by B10** (2026-09-26, a Saturday, inside the window; eight requests, $0.0001 of
OpenAlex):
- RePORTER: **13 parent rows** for `P41GM103533`, FY2012–2021, every one with an `award_amount`,
  $20,699,505 in all, none a sub-project. The grant has ended, so the count is stable; the floor
  is 12. PMID 19070509 links `S10RR017262` and `T32GM007750`.
- NSF: award 1908587's `fundsObligatedAmt` is `"900000"`, as is its `estimatedTotalAmt`.
- USAspending: one grant numbered `NNX14AJ87G`, with `total_obligation` **$796,089.19**; the check
  allows 1%.
- PubMed: four grants in 19070509's `GrantList` (`CompleteYN="Y"`), `S10 RR017262` among them.
- OpenAlex: award **`G3111500291`** — NSF 1908587 — has `amount` 900000.0 USD, from
  `nsf_award_search`. The awards OpenAlex mints for the NIH grants above have no amount, so the
  control is an NSF one.
- Crossref: one batch answered both `10.1002/pmic.200900216` and `10.1002/pmic.201000616`, each
  naming `UWPR95794`. The check counts the requests, because the adapter asks any DOI a batch
  misses on its own, which would otherwise hide a batch filter that had stopped working.

**None of them ever blocks the run** (F16). Each is shown `PASS`, `DOWN` or `FAIL` and classified
as every check is, but `smoke` exits 0 whatever they show; the verdict names them apart ("the
funding stage will degrade; the publication update proceeds"), and an exception of any kind in one
is caught. A funding `FAIL` still needs a person, after the run rather than before it: a 403 from
RePORTER may be the block §13.7 fears.

### 13.3 Attribution and terms

`NOTICE` and `README.md` add the funding sources, each under its own terms:

| Source | Terms, as found (re-read 2026-09-26 by B10) |
|---|---|
| NIH RePORTER | US government information. **No explicit licence was found** on the API pages, which point to a data access policy, a privacy statement and a disclaimer. Attributed as NIH RePORTER; questions to **RePORT@mail.nih.gov**. *Re-read: unchanged. Its window is written "weekends or weekdays between 9:00 PM and 5:00 AM EST"; §9.3 reads that as New York time, and Saturday runs are inside it either way* |
| USAspending.gov | US government information. *Re-read: the CC0 is the licence of the API's **source code** (the `usaspending-api` repository's LICENSE), not a stated licence for the data. No licence is stated for the data on usaspending.gov, api.usaspending.gov or its data.gov entry, whose access level is "public"* |
| NSF Award API | NSF open data, attributed as the NSF Award Search. *Re-read: NSF says its open data "are made available under an open license that places no restrictions on their use", and its web policy lets its text be copied freely, crediting "Courtesy: U.S. National Science Foundation" at the user's discretion. The API's own page states no terms* |
| PubMed / MEDLINE | NLM's terms. *Re-read, and more specific than first recorded:* **the phrase "Courtesy of the U.S. National Library of Medicine", "in a clear and conspicuous manner"**; no indication or implication that NLM endorses the product; and a republisher must keep the data current, **or say clearly that it may not reflect the most current data** from NLM. NCBI's E-utilities guideline also asks for any series of more than 100 requests to run at weekends or 9 PM–5 AM Eastern |
| OpenAlex | CC0 (already in `NOTICE`) |
| Crossref | Metadata used through its public API (already in `NOTICE`) |
| Federal Reserve G.5A | Federal Reserve Board statistical release, attributed. *Re-read: "Unless otherwise indicated, information on Board's website is in the public domain", and the Board asks to be cited as the source. The current release is 2026-01-05's* |
| OECD | OECD exchange-rate data, attributed as OECD requires. *Re-read: **CC BY 4.0**, the OECD's default licence for what it publishes from 1 July 2024, which asks for attribution and for changes to be indicated. The terms page refused automated reads (HTTP 403) on 2026-09-26, so this is from its indexed text and the OECD's announcement of July 2024* |

**What the re-reading changed** (B10, 2026-09-26). `NOTICE` and `README.md` say what each source's
terms ask, and three things follow beyond them:
- **NLM's phrase belongs where a reader of the page sees funding data**, not only in `NOTICE`.
  The method page's funding section (W9) and, since R1a, the foot of the Funding impact view, of
  an agency page and of a grant page, and the end of a publication's Funding section carry
  "Courtesy of the U.S. National Library of Medicine" and the data's date, which is the statement
  of currency NLM asks for, with the statement that NLM does not endorse the site. One component
  (`NlmAttribution`) words all five, whenever PubMed is among the export's funding sources.
- **The stored OECD rates are inverted** to US dollars per unit (§5.10), which CC BY counts as a
  change; `NOTICE` says so, and so should the method page's note on currency.
- **USAspending's data carries no stated licence.** It is US government information, attributed;
  the table no longer claims CC0 for it.

The G.5A page also announces the eventual retirement of the Federal Reserve's Data Download
Program. The release page itself carries the annual table, so the January update (§13.4) does not
depend on it.

**PI names** (F13) are published award records; [07](07-operations.md) §15's "no personal data
beyond published authorship" gets a dated note extending it to published award records. The
contact sent to every API is **mriffle@uw.edu**, and no other personal address.

### 13.4 `RUNBOOK.md`

Additions: reading the report's Funding section; triaging a new unresolved string and adding a
`grant` override; a full refresh by hand (`--funding full`, inside the window); what to do about a
RePORTER 403; the January exchange-rate update (G.5A is released in early January); bumping
`funding_version`.

### 13.5 Budgets

- **Data: 500 KiB gzipped** at level 9 (512,000 bytes), enforced by the web script in CI and by
  the stage-11 alert (§11.9). About two years' headroom, estimated (§3.5).
- **RePORTER:** at most one request a second always; at most 60 on a weekday outside the window.
- **JavaScript:** unchanged, 250 KiB gzipped at level 9.

### 13.6 Cost

OpenAlex is the only paid source: award entities at filter-page prices, **about $0.004 for a full
refresh** against a $1/day allowance (B6 read all 1,534 award entities for $0.0043); the rest is
free. [07](07-operations.md) §14's "under a dollar a year" still holds. B9 measures run time:
*incremental ≤ +1 minute and full ≤ +5 minutes are the acceptance limits.*

### 13.7 Risks

| Risk | Mitigation |
|---|---|
| **RePORTER blocks the address** | One request a second, the window guard, the weekday cap, an alert on 403 and a RUNBOOK entry |
| USAspending's TLS under httpx | Verified in B2 with httpx's default verification, so no `truststore`; never `verify=False` |
| OpenAlex amounts wrong for some funders | Provenance rules (gepris, ANID), agency sources first, the disagreement report |
| FY2027 rows appear from 2026-10-01 | Acceptance compares FY ≤ 2026 on the same cores |
| The export outgrows its budget | Two checks (§11.9); about two years' headroom, estimated (§3.5) |
| Merges and removals reach funding lines | Mapped through aliases; stage tests (§14) |
| A funding bug stops the weekly publication update | Carry-forward and self-validation (§9.4) |

## 14. Testing

- **Appendix A is a parametrised test** (`tests/test_funding_numbers.py`), every row passing, with
  each row's context (the paper's NIH links, RePORTER's answer) given as fixtures.
- **Amounts:** P30CA015704 FY2024 — the sub-project rows sum to $10,090,142, the parent's base
  award, and are never added; P30DK017047 — $52.8M from parent rows, not the $86.0M of all rows; the
  NSF expired and active rules; ANID ×1,000; gepris excluded; G.5A's quote direction; CLP converted
  by OECD; a currency in neither table unconverted; the rounding rule.
- **Store:** a funding store round-trips byte-identically; seven mutation stores each fail the
  intended invariant; a store with no `funding/` validates; the seeded override shape validates;
  the guard fails stage 0 when `funding.yaml` changes without a bump. `funding/` branch coverage
  ≥ 95%.
- **HTTP:** GET keys pinned against a real `cache/index.jsonl` line; POST keys depend on method and
  canonical body, not key order; POST retried, spaced, recorded and replayed; old cache lines
  load; abstracts stripped from recordings.
- **Adapters:** every RePORTER request sorted; projects exclude sub-projects; the offset cap raises;
  USAspending batches its IDs.
- **Stage** (`tests/test_funding_stage.py`): same-day and week-later reruns rewrite no funding file;
  an outage keeps every grant and degrades; a merge moves the line; an excluded work takes its line
  with it; a near-miss is accepted only with an NIH link; an override resolves a typo; the resource
  code is never a grant; facility contracts are excluded; a full refresh waits for the window; a
  partial run leaves funding alone; an unexpected error carries forward and alerts; the report lists
  new unresolved strings.
- **Export:** the summary equals the rows; an unlisted grant and an unknown listed grant are errors;
  every funding sample case present; the size recorded.
- **App:** unit tests for routes, the back-label map, filter state and predicate, the scope rule,
  every function of `aggregate/funding.ts` (de-duplication, first year under a filter, unknown
  never $0, Miscellaneous pinned, top five plus Other, cumulative ending at the total, partial
  year), the CSV writer and the currency formatters; builders validated against the schema by Ajv;
  the funding cross-check and first-year check on the sample; view tests with axe for every state;
  e2e — the switch keeps the filter, an agency bar filters, funding → agency → grant → publication
  → back three times, cold deep links, a corrected reference on the publication, CSV rows equal to
  the table; accessibility in both themes.

## 15. Changes to other specs

Each lands, dated, with the milestone that makes it true.

| Document | Note | Milestone |
|---|---|---|
| [00](00-project-phases.md) | Phase 9 row, why it was added, glossary entries | M0 |
| [README](README.md) | Manifest row and reading order | M0 |
| [05](05-metrics-and-data-contract.md) | A7, §3.1 and §14 item 2 superseded | M0 |
| 05 | §4.1 and §4.4 (the funding block and size); §12 (1.1 and the new cross-checks); §13 (the funding cases) | B5 |
| [02](02-data-model.md) (frozen) | §3 `store/funding/`; §9 the `grant` action; §11 the optional manifest fields; §14 invariants F1–F7; §15 funding lines change only when their data changes | B4 (B1 for `overrides_fingerprint`) |
| [03](03-retrieval-pipeline.md) (frozen) | §6.1 and §10.4 the re-read trigger | B1 |
| 03 | §7 POST, the new hosts and rate limits, USAspending's TLS verified (no `truststore`); §11.3 cache v2 | B2 |
| 03 | §10 the new config files | B3 |
| 03 | §5 stage 8b; §8 `--funding`; §9 failure rows; P1 read against the scheduled refresh | B7 |
| 03 | C4 and §11.3 the Saturday schedule; §8 smoke | B10 |
| 03 | §13 time and cost | B9 |
| [06](06-web-app.md) (agreed) | Header ("Replaces" said funder data does not exist); §3 routes, the switch, history-state back; the funding view and its honesty rules; §5 the Funding section; §6 the new dimensions, the scope rule, `institution_wide`; §7 CSV, the no-data state; §9 `nav` and `aria-current`; §10 500 KiB at gzip level 9; §11.3 `download/` and `VITE_FUNDING`; §12 the new checks | W1–W10, R |
| [07](07-operations.md) (agreed) | §1 and C4 the schedule; §3 a normal week (`store/funding/`); §11 January rates; §12 the RePORTER risk; §14 cost; §15 PI names and attribution | B10 |
| [08](08-implementation.md) | The Phase 9 record; §8 item 9 closed | B1, R |
| `CLAUDE.md` | Phases table, commands, gotchas (`sort_field`, `exclude_subprojects`, HHSN, task orders, VA without amounts, USAspending `total_obligation` and TLS, the NSF amount rule, gepris, ANID ×1,000, the G.5A currency list, PubMed abstracts in recordings, cron's day-of-month/day-of-week OR) | R |
| `NOTICE`, `README.md` | §13.3; and the schedule wherever it is named | B10 |
| `RUNBOOK.md` | The schedule and the funding smoke checks | B10 |
| `RUNBOOK.md` | §13.4: it describes B7's report section, `--funding full` and its alerts | B7 |

## 16. Open items

1. **Decided (B9, 2026-09-26): `S10OD032290`** (W-000264) **stays Miscellaneous** (F10), with no
   override. It is possibly S10OD030237, the UW Mass Spectrometry Center's Orbitrap Eclipse
   (FY2022), which the paper thanks. But three digits differ, and no source says which.
2. **`R01GM122864`** (W-000183, W-000224) and **`P01 HL0996`** (W-000147) are unmatchable
   (Appendix A.4), and stay Miscellaneous. The seed's report lists them with no RePORTER core
   nearby for `R01GM122864`. For `P01 HL0996` it lists `Z01HL000996`, which is refused because
   its activity code disagrees.
3. **Closed (B9): the override candidates.** The seed commits 24 grant overrides:
   - Appendix E's nine;
   - the rehearsal's 14: `DOE-SC10010566` and `SC10010566` → `USA:DOE:DESC0010566`, which
     USAspending holds, five of Appendix A.9's hand merges, and six unresolved strings with
     independent support;
   - CIHR's `178013_1` → `MISC:1780131`, which keeps a probably wrong amount out of the total.

   Each `reason` in `overrides.yaml` carries its evidence. Not overridden:
   - `DBI 659680`: NSF does not know 0659680 (A8.5).
   - `R/SFA-8`: Washington Sea Grant's internal project number (A6.43).
   - `5300-155`: the California Citrus Research Board's, which no configured agency covers.
   - Moore's `6000`: already one key.
4. **Should NIH centre grants be institution-wide?** P30, P41, UL1 and similar grants fund an
   institution's shared cores, and some are large. They are categorised `center` and counted as
   project-scope (§4); the category chart shows them apart. A policy call for the maintainer.
5. **Closed:** USAspending's TLS is verified under httpx with its default verification (B2,
   2026-09-26; no `truststore`), and Crossref's batch filter works (B6, 2026-09-26; 376 of 377
   DOIs, §5.6).
6. **RePORTER's licence:** none found; ask RePORT@mail.nih.gov if the attribution is ever
   questioned.
7. **Documented against measured:** RePORTER's direct/indirect split (documented from FY2012,
   present earlier), and P30CA015704's FY2024 sub-project count (28 recorded, 27 saved). Neither
   changes a rule.
8. **Sources v1 leaves out** (§5.9): adding an agency's own source raises coverage outside US
   federal — measured, 56 non-US amounts against OpenAlex's 48.
9. **USAspending totals for awards begun before FY2008** (NSBRI began 1999) may omit earlier
   obligations; not measured, flagged `starts_before_fy2008`.
10. **PI and organisation counts are headline figures, keyed partly on names** (§11.6): three of
    the four amount sources have no person identifier, so one person under two spellings counts
    twice. The count is still worth showing, cross-checked like every other figure; the method
    page states the caveat.
11. **Closed (B3):** the OECD dataset is `DSD_NAMAIN10@DF_TABLE4`, transaction `EXC_A`, and every
    G.5A currency has 1999–2025 (§5.10).
12. **Closed (B8):** the sample cases' work IDs (§11.8) are verified against the live-built
    sample; one moved (the NIH-link case is W-000009's R35GM150919).

## 17. Exit criteria

**M0 — this document**
- [x] docs/09 written; the research transcribed (Appendices A–F); every later brief can cite this
      document alone.
- [x] docs/00, docs/README and docs/05 carry their notes.

**B1** — editing `channels.yaml` re-reads no text; an exclude-override change re-reads its work; a
manifest without `overrides_fingerprint` falls back.
- [x] Accepted 2026-09-26 (3c3cae8, 3771504).

**B2** — GET keys unchanged (pinned); POST keys depend on method and canonical body; POST retried,
spaced, recorded, replayed; old cache lines load; abstracts stripped; USAspending TLS measured and
recorded; `dlcache-v2-`.
- [x] Accepted 2026-09-26 (c3b3684, eecae09): USAspending verifies under httpx's default
      verification, so no `truststore`.

**B3** — Appendix A passes 100% as a parametrised test; P30CA015704 FY2024 = $10,090,142 from
sub-projects, never added; P30DK017047 $52.8M not $86.0M; NSF, ANID, gepris, quote direction and
unconverted-currency rules tested; `funding/` branch coverage ≥ 95%; the guard fails stage 0.
- [x] Accepted 2026-09-26 (421aa37): Appendix A's 187 cases pass; Appendix F's 270 rows come to 267
      keys; the two parent-row totals as stated; `funding/` branch coverage 99%.

**B4** — byte-identical round trip; seven mutation stores fail for the intended reason; stores
without `funding/` validate.
- [x] Accepted 2026-09-26 (cc929ec): a synthetic fixture over the sample's works round-trips
      byte-identically; eight mutation stores each fail for their own invariant alone; both
      committed stores validate unchanged and the export is byte-identical.

**B5** — the funding summary matches the rows; references resolve; types fresh; export diff green;
sample size recorded.
- [x] Accepted 2026-09-26 (29ef435): contract 1.1 with every §11.7 check its own error; the sample
      exhibits all 12 synthetic `FUNDING_CASES` and its summary equals the rows; B4's fixture
      store exports and validates; `export/` is the no-data shape, its top-level `summary`
      unchanged; sample 18,099 bytes, real export 311,014 (§3.5).

**B6** (live, in the window; compare FY ≤ 2026) — **260 ± 2** works linked; **454** cores; **5,437 ±
1%** parent rows; **$6,217.3M ± 0.1%**; NSF ≥ 56 of 57; USAspending **21 of 27** rows (20 grants)
with award types 02–05 (§5.3); PubMed `GrantList` on ≥ 276 works; **1,534** OpenAlex award
entities; every RePORTER request sorted and excluding sub-projects; Crossref batching verified.
- [x] Accepted 2026-09-26 (59536c7): 260 works, 454 cores, 5,437 rows, $6,217,332,093; NSF 56 of
      57; USAspending 21 of 27; PubMed on 276 works; 1,534 of 1,534 award entities; Crossref 376
      of 377 DOIs (§5).

**B7** — every stage test of §14 passes; `enabled: false` leaves the weekly run unchanged.
- [x] Accepted 2026-09-26 (b8e35bb, f3f2830). Stage 8b (B7a), and its report section, total-drop alert and
      `explain` (B7b): 1,438 Python tests; a disabled run changes nothing but one report line.

**B8** — every `FUNDING_CASES` predicate holds; the committed sample matches a fresh build; the
sample rebuilds byte-identically except `metrics/` and `funding/` (documented).
- [x] Accepted 2026-09-26 (02c9ef4): the first live run of the stage built the sample's funding (13
      works, 57 grants, $452.8M known) from 27 requests in 15 s for $0.0002; all 12 synthetic
      and 9 real `FUNDING_CASES` hold; a same-day rebuild is byte-identical; sample 26,989 bytes.

**B9** (live, in the window) — works with ≥ 1 grant that is not Miscellaneous **≥ 309**; works with
any funding string **≥ 329**; RePORTER cores **≥ 473** (454 linked + 19 from strings; corrections add
none, §6.5; overrides add at most two), exact figure recorded; the 454 linked cores **$6,217.3M ±
0.1%**; `HHSN272201700059C` **$24.79M**, `HHSN268201000033C` **$10.78M**, `HHSN272201800004C`
**$18.12M**, task order `75N93020F00001` **$1.47M** (± 1%); NIH-format strings left in Miscellaneous
exactly `S10OD032290`, `R01GM122864`, `P01 HL0996` plus any new ones the report names; no M&O
contract and no `UWPR95794` as a grant; every Appendix B key listed is tagged; OpenAlex agrees with
the agency source in ≥ 99% of comparable grants; CLP converted by OECD; export ≤ 500 KiB gzipped
at level 9 (estimated 420–450 KiB; the figure recorded); a same-day rerun changes nothing and
a +7-day replay rewrites no file; an incremental run adds ≤ 1 minute and a full run ≤ 5; one
`workflow_dispatch` run of `update.yml` succeeds with funding enabled (moved from B10).
- [x] Accepted 2026-09-27 (d91c784). Every figure is met but two, which the rehearsal redefined:
      319 works with a string, and OpenAlex agreeing on 62 of 63 (the B9 entry in this document's
      header). The `workflow_dispatch` run with funding enabled (run 36289188785,
      `2026-09-27T02-40-live`, data commit d0c566b): funding incremental, 755 grants, total
      $7,888,899,029 unchanged, 0 new and 0 no longer listed, no funding degradation, 31 funding
      requests; the export published to `gh-pages`. The job ended red only at its alert step, for
      bioRxiv's `details` endpoint failing a third run in a row — a discovery source, not funding.

**B10** — `smoke` shows PASS for every new source and DOWN on a simulated 503;
`check:data-budget` passes and fails on a planted file of 501 KiB gzipped; one `workflow_dispatch`
run succeeds with funding enabled.
- [x] Accepted 2026-09-26 (92326ae): all seven funding checks PASS live, inside the window (§13.2);
      offline, DOWN on a simulated 503 and FAIL on a changed shape, and neither blocks.
      `check:data-budget` passes on `export/` (310,628 bytes, 303.3 KiB) and `samples/export/`
      (15,188 bytes), fails on a planted file of 513,024 bytes (501.0 KiB) and passes one of
      exactly 512,000; stage 11 alerts above the budget and still writes. *The `workflow_dispatch`
      run with funding enabled moved to B9: funding cannot be enabled before the seed.*

**W1–W10** — as §12 and §14 specify; the existing router, overview, method and e2e tests pass
unchanged; the flag hides every funding entry point; JavaScript ≤ 250 KiB.
- [ ] Accepted. *W1 (c281d39, 475373c) and W2 (d9a3271, e8cb8da) landed 2026-09-26; the box is
      ticked when all ten are accepted. W10 (575ddcb), the audit, is done: every §14 "App" item
      and §11.8 case is held by a passing test (`web/test/funding-coverage.test.tsx` maps them),
      axe is clean on every funding route and state in both themes, and against the real export,
      which has no funding data yet, every funding page shows its no-data state and nothing
      throws. The box itself is ticked at release.*

**R** — the web gate green against the real export; the flag removed; data published before the
app; the live `/funding`, an agency page, a grant page and a publication's Funding section checked
by hand; docs/08's Phase 9 record written and these boxes ticked.
- [ ] Accepted.

---

## Appendix A — Every resolution case

Each row is a test case. **Context** is what the rule needs beyond the string: the paper's NIH
links (from RePORTER), or other listings on the same work. **Outcome** is `grant` (with its keys),
`unresolved` (a `MISC:` key), `not_a_grant`, `facility_contract` or `resource_code`. Work IDs are
those of 2026-09-26. A row marked † is one where §6's rules give a different outcome from the
research's, and says how.

### A.1 Exact matches and parse fixes (automatic)

| # | Written | Work | Context | Outcome | Method: note |
|---|---|---|---|---|---|
| A1.01 | `RO1 CA189986` | W-000168 | — | NIH:R01CA189986 | normalised: O for 0 in the activity code |
| A1.02 | `1RO1GM086394` | W-000207 | — | NIH:R01GM086394 | normalised: type prefix; O for 0 |
| A1.03 | `PO1 DE021954` | W-000168 | — | NIH:P01DE021954 | normalised: O for 0 |
| A1.04 | `UO1HL099993` | W-000143, -204, -205, -262 | — | NIH:U01HL099993 | normalised: O for 0 |
| A1.05 | `RO1AG037603` | W-000191 | — | NIH:R01AG037603 | normalised: O for 0 |
| A1.06 | `RO1ES019319` | W-000143 | — | NIH:R01ES019319 | normalised: O for 0 |
| A1.07 | `RO1 GM080148` | W-000089 | — | NIH:R01GM080148 | normalised: O for 0 |
| A1.08 | `R21ESO34337` | W-000315 | — | NIH:R21ES034337 | normalised: O for 0 in the serial (misfiled, A.7) |
| A1.09 | `AGO5131` | W-000113 | work links P50AG005131 | NIH:P50AG005131 | normalised: O for 0; no activity code, so §6.3's bare rule (misfiled, A.7) |
| A1.10 | `PM50 GMO76547` | W-000044 | work links P50GM076547 | NIH:P50GM076547 | normalised: garbled activity code ignored, O for 0, bare rule (misfiled, A.7) |
| A1.11 | `R01CA10720 9` | W-000110 | — | NIH:R01CA107209 | normalised: split digits joined |
| A1.12 | `R21CA14977 2` | W-000110 | — | NIH:R21CA149772 | normalised: split digits joined |
| A1.13 | `P30 DK 089,507` | W-000142, W-000209 | — | NIH:P30DK089507 | normalised: comma inside the serial |
| A1.14 | `P40OD010 440` | W-000172 | — | NIH:P40OD010440 | normalised: space inside the serial |
| A1.15 | `R01-HL1-26028` | W-000215 | — | NIH:R01HL126028 | normalised: dash inside the serial |
| A1.16 | `UL1-TR-000,040` | W-000146 | — | NIH:UL1TR000040 | normalised: letter-second activity code; comma |
| A1.17 | `K99/R00 1K99HL103768-01` | W-000108 | — | NIH:K99HL103768, NIH:R00HL103768 | normalised: mechanism pair not joined to the number; phase pair lists both |
| A1.18 | `5R00HL103768-04` | W-000154 | — | NIH:K99HL103768, NIH:R00HL103768 | exact: phase pair lists both |
| A1.19 | `UH3 AG064706` | W-000279, -280, -302 | — | NIH:UH2AG064706, NIH:UH3AG064706 | exact: phase pair lists both (both found from strings, A.2) |
| A1.20 | `1R01-HL14477801` | W-000224 | — | NIH:R01HL144778 | normalised: support year run on (8 digits, head) |
| A1.21 | `1R01-HL14477801A1` | W-000224 | — | NIH:R01HL144778 | normalised: as above, with `A1` |
| A1.22 | `1S10RR-449017262` | W-000110 | — | NIH:S10RR017262 | normalised: 9 digits, tail |
| A1.23 | `5DP5OD03615502` | W-000325 | — | NIH:DP5OD036155 | normalised: letter-second code; 8 digits, head |
| A1.24 | `5dp5od036155-02` | W-000325 | — | NIH:DP5OD036155 | exact: lower case, suffix |
| A1.25 | `P41 RR0011823` | W-000052 | — | NIH:P41RR011823 | normalised: 7 digits, stray leading zero |
| A1.26 | `U24 CA0126477` | W-000072 | — | NIH:U24CA126477 | normalised: 7 digits, stray leading zero |
| A1.27 | `DP3DK108209` | W-000146 and 8 more | — | NIH:DP3DK108209 | exact: letter-second code |
| A1.28 | `KL2 TR000421` | W-000154 | — | NIH:KL2TR000421 | exact |
| A1.29 | `TL1TR002318` | W-000327 | — | NIH:TL1TR002318 | exact (found from strings, A.2) |
| A1.30 | `UL1 RR 024156` | W-000146 | — | NIH:UL1RR024156 | exact: spaces |
| A1.31 | `3p30dk017047-45s2` | W-000121 and 4 more | — | NIH:P30DK017047 | exact: type 3 (a supplement), `-45S2` suffix |
| A1.32 | `3t32gm008268-21a1s1` | W-000157 | — | NIH:T32GM008268 | exact: type, `-21A1S1` |
| A1.33 | `1k08ar082939-01a1` | W-000322, W-000689 | — | NIH:K08AR082939 | exact: type, `-01A1` |
| A1.34 | `NIH 5T32HG002760` | W-000057 | — | NIH:T32HG002760 | exact: label |
| A1.35 | `#P30 CA091842` | W-000297 | — | NIH:P30CA091842 | exact: hash sign (found from strings, A.2) |
| A1.36 | `P30AG31679` | W-000273 | — | NIH:P30AG031679 | normalised: 5 digits zero-filled |
| A1.37 | `T32-EB1650` | W-000262 | — | NIH:T32EB001650 | normalised: 4 digits zero-filled |
| A1.38 | `P50 AG05131` | W-000152, W-000166 | — | NIH:P50AG005131 | normalised: zero-filled |
| A1.39 | `R01 DK61516` | W-000227 | — | NIH:R01DK061516 | normalised: zero-filled (found from strings, A.2) |
| A1.40 | `P01- AG017242` | W-000230 | — | NIH:P01AG017242 | exact: separators |
| A1.41 | `R01-AG-037603` | W-000191 | — | NIH:R01AG037603 | exact: separators |
| A1.42 | `U01 NS091272‐01A1` | W-000169 | — | NIH:U01NS091272 | exact: U+2010 hyphen |
| A1.43 | `R01HL126028,DP3DK108209,R01HL127694,P30DK017047,P01HL092969` | W-000215 | — | the five cores | exact: a list, split |
| A1.44 | `R01 AR074939, R01 AR081654, R01 AI186337, R21 AR077266, T32 AR007108, K08 AR082939` | W-000689 | — | the six cores | exact: a list, split |
| A1.45 | `CA282268` | W-000332 | no NIH link; no other listing | NIH:K22CA282268 | normalised: bare serial, unique in RePORTER |
| A1.46 | `GM111097` | W-000328 | work also lists `R01 GM111097` | NIH:R01GM111097 | normalised: bare serial, already listed |
| A1.47 | `AT007177` | W-000271 | work also lists `K01 AT007177` | NIH:K01AT007177 | normalised: bare serial, already listed |
| A1.48 | `DK59637` | W-000256, -263, -312 | each links U24DK059637 and U2CDK059637 | both | normalised: bare serial, both already listed |
| A1.49 | `HL091055` | W-000112 | links R00HL091055 only | NIH:R00HL091055 | normalised: bare serial † (the research also listed K99HL091055) |
| A1.50 | `DK‐035816` | W-000188 | work links P30DK035816 | NIH:P30DK035816 | normalised: U+2010, bare rule (misfiled, A.7) |

**The funder named does not matter** (§6.4). A sample of the about 125:

| # | Written | Work(s) | Funder the source names | Outcome |
|---|---|---|---|---|
| A1.51 | `P30 DK017047` | W-000121, -130, -192, -258, -416 | American Heart Association (OpenAlex) | NIH:P30DK017047 |
| A1.52 | `P41 GM103533` | W-000160, W-000310 | National Science Foundation (OpenAlex) | NIH:P41GM103533 |
| A1.53 | `1S10OD018111` | W-000189 | European Molecular Biology Organization | NIH:S10OD018111 |
| A1.54 | `R01GM120553` | W-000197 | University of Washington Proteomics Resource (Crossref) | NIH:R01GM120553 |
| A1.55 | `R01AI124348` | W-000292 | Bill and Melinda Gates Foundation (OpenAlex) | NIH:R01AI124348 |
| A1.56 | `P41 GM103403` | W-000178 | Argonne National Laboratory (OpenAlex) | NIH:P41GM103403 |
| A1.57 | `P01HL128203` | W-000263 | University of Cincinnati | NIH:P01HL128203 |

### A.2 The 19 cores found from strings, not linked by NIH to any paper

Accepted with an agreeing activity code (or by A1.45's uniqueness). Lifetime totals are the
research's lookups (parent rows, all fiscal years to 2026-09-26); B6 re-measures them.

| Core | Lifetime | Core | Lifetime |
|---|---:|---|---:|
| R01MH117406 | $3,311,487 | R01GM111097 | $6,747,731 |
| DP3DK094352 | $5,950,661 | R35GM131889 | $3,010,633 |
| P41GM103484 | $8,679,844 | K22CA282268 | $635,754 |
| R01DK061516 | $1,641,893 | R35GM152061 | $1,259,550 |
| K01AT007177 | $648,945 | F31HL147462 | $118,269 |
| UH2AG064706 | $1,375,399 | R01HL153253 | $1,634,062 |
| UH3AG064706 | $3,259,121 | R01AI119675 | $2,930,467 |
| P30CA091842 | $122,016,565 | R01AI171570 | $3,473,210 |
| UL1TR002345 | $97,784,066 | DP5OD036155 | $1,936,040 |
| TL1TR002318 | $8,423,007 | **Total** | **$274,836,704** |

### A.3 The five IC + serial matches with the wrong activity code (all refused)

| # | Written | Work | IC + serial found | Why refused | Final outcome |
|---|---|---|---|---|---|
| A3.1 | `P01 HL0996` | W-000147 | Z01HL000996 (intramural) | activity code disagrees | unresolved `MISC:P01HL0996` (A4.13) |
| A3.2 | `P01HL1282` | W-000242 | Z01HL001282 (intramural) | activity code disagrees | corrected to P01HL128203 (A4.14) |
| A3.3 | `P30 DK01047` | W-000312 | K04DK001047 | activity code disagrees | corrected to P30DK017047 (A4.6) |
| A3.4 | `P41GM103551` | W-000103 | R01GM103551 | activity code disagrees | corrected to R01GM103551 by §6.5 clause 2, because NIH links W-000103 to it (A4.8) |
| A3.5 | `S10RR02510` | W-000100 | R24RR002510 | activity code disagrees | override to S10RR025107 (A4.17, E.3) |

*The research's summary called all five "wrong matches"; four are. The fifth names the right core,
and is refused on IC + serial and then reached by the near-miss rule.*

### A.4 The 17 NIH grants unresolved after parsing

"Links" are the cores RePORTER links to the same work that share the IC. Candidates give the
RePORTER facts the decision rests on: fiscal years, PI, organisation, lifetime total, and how many
corpus papers NIH links to the candidate.

| # | Written (sources) | Work, year | Links (same IC) | Candidate and facts | Outcome |
|---|---|---|---|---|---|
| A4.1 | `P50 AG003156-30` (Crossref, Europe PMC, JATS, OpenAlex, PubMed) | W-000115 (2014), W-000123 (2015) | P50AG005131, P50AG005136, R01AG033398 | **P50AG005136**: FY1985–2019, George M. Martin, UW, $85.32M, 5 corpus papers | **corrected** → NIH:P50AG005136 (two digits exchanged) |
| A4.2 | `3U01AI42001-02S1` (JATS text only) | W-000244 (2020) | DP1AI158186, R01AI118803, T32AI106677, U01AI142001 | **U01AI142001**: FY2019–2023, Kappe and Pepper, Seattle Children's, $5.48M. (U01AI048001, Maryland, unlinked, rejected) | **corrected** → NIH:U01AI142001 (a digit dropped) |
| A4.3 | `U01 CA11273-04S1` | W-000034 (2008) | R21CA126216, U01CA111273 | **U01CA111273**: FY2005–2009, Martin McIntosh, Fred Hutchinson, $3.20M | **corrected** → NIH:U01CA111273 (a digit dropped) |
| A4.4 | `PO1DE02195` | W-000168 (2017) | P01DE021954 | **P01DE021954**: FY2011–2015, Barcy, Gantt, Lagunoff, Rose, Vieira, Seattle Children's, $7.70M | **corrected** → NIH:P01DE021954 (O for 0; last digit dropped) |
| A4.5 | `U19AG02312` | W-000222 (2019) | none | U19AG023122: FY2004–2026, Steven R. Cummings, California Pacific Medical Center Research Institute, $94.02M, 7 corpus papers; the only candidate one edit away | **unresolved** without override; **override** → NIH:U19AG023122 (E.1) |
| A4.6 | `P30 DK01047` | W-000312 (2025) | P30DK017047, P30DK020593, P30DK035816, P30DK058404, U24DK059637, U2CDK059637 | **P30DK017047**: FY1986–2026, Jerry P. Palmer, UW, $52.84M, 51 corpus papers | **corrected** → NIH:P30DK017047 (a digit dropped) |
| A4.7 | `5R01GM08668` | W-000190 (2018) | R01GM086688, R01GM097112 | **R01GM086688**: FY2009–2019, James E. Bruce, UW, $4.21M, 34 corpus papers. (Seven unlinked one-edit candidates rejected) | **corrected** → NIH:R01GM086688 (last digit dropped) |
| A4.8 | `P41GM103551` | W-000103 (2013) | P41GM103533, R01GM086394, R01GM103551 | **R01GM103551** (same serial, other activity code). (P41GM103521, Cornell, unlinked, rejected) | **corrected** → NIH:R01GM103551 (§6.5 clause 2) |
| A4.9 | `1R01-GM122864` (Crossref, Europe PMC, JATS, OpenAlex) | W-000183 (2017), W-000224 (2019) | R01GM086688, R01GM097112 | Twelve one-edit candidates, none linked, none at UW; nothing in Bruce's or co-author Tian's portfolios; perhaps an unfunded application number | **unresolved** `MISC:R01GM122864` |
| A4.10 | `F32 GM801262` | W-000077 (2011) | F32GM080126, P41GM103533 | **F32GM080126** (NIH's link); the unlinked one-edit candidates are 1988–1990 fellowships | **corrected** → NIH:F32GM080126 (leading zero dropped, stray digit added) |
| A4.11 | `P01 HL09296` | W-000147 (2015) | P01HL092969, R01HL108897, R01HL112625 | **P01HL092969**: FY2008–2019, Alan Chait, UW, $23.47M, 24 corpus papers. (P01HL006296, UT Southwestern, unlinked, rejected) | **corrected** → NIH:P01HL092969 (last digit dropped) |
| A4.12 | `P01HL12803` (JATS text only: "Program Project Grant P01HL12803 (to J. P. S., W. S. D., and J. W. H.)") | W-000256 (2021) | P01HL151328, R01HL149685, R01HL155601 | P01HL128203: FY2016–2026, Jere P. Segrest (J. P. S.), Vanderbilt, $22.62M, 17 corpus papers; not linked to this paper | **unresolved** without override; **override** → NIH:P01HL128203 (E.2) |
| A4.13 | `P01 HL0996` (Crossref, Europe PMC, OpenAlex) | W-000147 (2015) | P01HL092969, R01HL108897, R01HL112625 | No candidate one edit away; a mangled copy — the paper's links already carry the P01 it most likely means | **unresolved** `MISC:P01HL0996` |
| A4.14 | `P01HL1282`, and inside `R01HL112625,R01HL108897,P01HL092969,DP3DK108209,R01HL149685,T32HL007828,P01HL076491,P01HL1282` | W-000242 (2020) | P01HL076491, P01HL092969, P01HL128203, R01HL108897, R01HL112625, R01HL149685, T32HL007828 | **P01HL128203**: Segrest, as above | **corrected** → NIH:P01HL128203 (two digits dropped at the end) |
| A4.15 | `P01HL123208` | W-000241 (2020) | P01HL092969, P01HL128203, R01HL149685, R21HL113405 | **P01HL128203** | **corrected** → NIH:P01HL128203 (two digits exchanged) |
| A4.16 | `S10OD032290`, `S10 OD032290` (JATS text, OpenAlex) | W-000264 (2021, 2022) | S10OD023476 | Eight one-edit candidates, none linked, none at UW. Possibly S10OD030237, the UW Mass Spectrometry Center's Orbitrap Eclipse (FY2022), which the paper thanks — three digits differ | **unresolved** `MISC:S10OD032290`; needs a person (§16) |
| A4.17 | `S10RR02510` | W-000100 (2013) | R01RR023334 | S10RR025107: FY2008, James E. Bruce (an author), UW, $0.99M, 21 corpus papers — the only corpus-linked candidate; twelve others are unlinked 1985–2009 instruments elsewhere | **unresolved** without override; **override** → NIH:S10RR025107 (E.3) |

**Tally:** corrected 11 (A4.1–4.4, 4.6–4.8, 4.10, 4.11, 4.14, 4.15); override 3 (A4.5, 4.12, 4.17);
needs a person 1 (A4.16); unmatchable 2 (A4.9, 4.13).

### A.5 NIH overrides outside the unresolved list

Neither parses as an NIH number, so neither reached A.4.

| # | Written (sources, funder) | Work | Evidence | Outcome |
|---|---|---|---|---|
| A5.1 | `R21AO129851` (Crossref, Europe PMC, OpenAlex; NIH) | W-000208 | `AO` is not an IC; R21AI129851 is at Cornell, the authors' institution; NIH does not link the paper | **unresolved** `MISC:R21AO129851` without override; **override** → NIH:R21AI129851 (E.4) |
| A5.2 | `094352` (Europe PMC, OpenAlex, PubMed; NIH, PHS) | W-000144 | A bare serial with no IC; RePORTER has DP3DK094352 and R01HL094352 under it. R01HL094352 is Alan Chait's, whose lab wrote the paper | **unresolved** `MISC:094352` without override; **override** → NIH:R01HL094352 (E.5). *The non-NIH research called it an unidentifiable PHS number; the NIH audit resolved it, and this spec follows the NIH audit.* |

### A.6 Not grants, and other agencies' numbers attributed to NIH

**Attributed to NIH, and not grants:**

| # | Written | Works | Reason | Outcome |
|---|---|---|---|---|
| A6.01 | `PGT121`, `PGT145` | W-000270 | HIV antibody names | not_a_grant |
| A6.02 | `PGDM1400` | W-000266 | HIV antibody name | not_a_grant |
| A6.03 | `35O22` | W-000270 | HIV antibody name | not_a_grant |
| A6.04 | `SCR_022606` | W-000301 | an RRID | not_a_grant |
| A6.05 | `Project 3` | W-000271 | a sub-project label | not_a_grant |
| A6.06 | `NIH-R01` | W-000237 | a mechanism name, no number | not_a_grant |
| A6.07 | `K99-R00`, `K99/R00`, `K99‐R00` | W-000108, W-000121 | a mechanism name, no number | not_a_grant |
| A6.08 | `H2020` | W-000277 | a programme name | not_a_grant |
| A6.09 | `-0001` | W-000244, W-000392 | a fragment (of the DTRA number on the same works) | not_a_grant |

**Other agencies' numbers attributed to NIH** (resolved by §6.4: another sighting names the real
agency, or the number is a facility contract):

| # | Written | Work | Real agency | Outcome |
|---|---|---|---|---|
| A6.10 | `10SDG3600027` | W-000192 | AHA | grant `AHA:10SDG3600027` |
| A6.11 | `20CDA35320109` | W-000258 | AHA | grant `AHA:20CDA35320109` |
| A6.12 | `DE-AC02-05CH11231` (and `DE-AC02–05CH11231`) | W-000219, W-000226 | DOE (LBNL) | facility_contract |
| A6.13 | `DE-AC02-06CH11357` (and `DE-AC02–06CH11357`) | W-000178 | DOE (Argonne) | facility_contract |
| A6.14 | `DE-AC05-76RL01830` | W-000303 | DOE (PNNL) | facility_contract |
| A6.15 | `DGE-1256082` | W-000588 | NSF | grant `NSF:1256082` (institution-wide, B) |
| A6.16 | `OPP1156262` | W-000244 | Gates Foundation | grant under the Gates agency |
| A6.17 | `1008590` | W-000170 | USDA / NIFA | grant `USA:USDA:1008590`; amount not measured |
| A6.18 | `80622200002120` | W-000145 | USDA / NIFA | grant `USA:USDA:80622200002120`; amount not measured |
| A6.19 | `W911NF2220059` | W-000318 | IARPA, via an Army Research Office instrument | grant `USA:DOD:W911NF2220059` ($9.38M) |

**The non-NIH junk list** (32 entries; the research proposed them all as Miscellaneous; §6 sorts
them):

| # | Written | Funder named | Works | Outcome |
|---|---|---|---|---|
| A6.20 | `DE-AC02`, `DE-AC02-` | Office of Science | W-000178, -219, -226 | facility_contract (the `DE-AC` pattern) |
| A6.21 | `DE-AC05` | Battelle | W-000049, W-000303 | facility_contract |
| A6.22 | `DE-AC05?` | DOE | W-000049, W-000303 | facility_contract |
| A6.23 | `CAREER` | NSF | W-000304, W-000515 | not_a_grant: programme name |
| A6.24 | `H2020`, `HORIZON2020` | European Commission | W-000277, W-000450 | not_a_grant: programme name |
| A6.25 | `K99/R00` | AHA | W-000121 | not_a_grant: NIH mechanism name |
| A6.26 | `N/A`, `NA` | Locke Trust; Broad Institute | W-000117, W-000241 | not_a_grant |
| A6.27 | `2015-2018` | NSF; European Commission | W-000277 | not_a_grant: a year range |
| A6.28 | `2018-` | Vetenskapsrådet | W-000329 | not_a_grant: fragment |
| A6.29 | `2019-` | Cancerfonden | W-000329 | not_a_grant: fragment |
| A6.30 | `Z/17/Z` | Wellcome | W-000210 | not_a_grant: fragment of a Wellcome number |
| A6.31 | `10.13039`, `13039`, `501100011033`, `AEI/10` | AEI / MCIU | W-000330 | not_a_grant: funder-DOI fragments |
| A6.32 | `10.13039/501100011033`, `10.13039.501100011033`, `.13039/501100011033`, `/ AEI10.13039/501100011033`, `AEI//10.13039/501100011033/`, `MCIU/AEI/10.13039/501100011033`, `MCIU/AEI/ 10.13039/501100011033` | AEI / MCIU | W-000330 | not_a_grant: funder DOIs |
| A6.33 | `Biomedical Scholars Award` | Pew | W-000198 | not_a_grant: programme, no number |
| A6.34 | `Developmental Career Award` | Leukemia & Lymphoma Society | W-000235 | not_a_grant: programme, no number |
| A6.35 | `Graduate Fellowship` | Stroum Endowment (UW) | W-000235 | not_a_grant: programme, no number |
| A6.36 | `Hanna H. Gray Fellows Program` | HHMI | W-000325 | not_a_grant: programme, no number |
| A6.37 | `Investigators in the Pathogenesis of Infectious Disease Award` | Burroughs Wellcome Fund | W-000198 | not_a_grant: programme, no number |
| A6.38 | `LEAPS` | Michael J. Fox Foundation | W-000169 | not_a_grant: programme, no number |
| A6.39 | `PSSCRA` | Pershing Square Foundation | W-000208 | not_a_grant: programme, no number |
| A6.40 | `Research Grant` | W. M. Keck Foundation | W-000235 | not_a_grant: programme, no number |
| A6.41 | `Research Program Grant`, `Research Program grant` | W. M. Keck Foundation | W-000253 | not_a_grant: programme, no number |
| A6.42 | `Royalty Research Fund Grant` | University of Washington | W-000245 | not_a_grant: programme, no number |
| A6.43 | `R/SFA-8` | NOAA | W-000236 | **unresolved**: a Washington Sea Grant internal project number, a real number that matches nothing |
| A6.44 | `094352` | PHS | W-000144 | override (A5.2) |

### A.7 NIH grants misfiled in the non-NIH list

The research's NIH pattern missed these (O for 0, a U+2010 hyphen, or a contract number); §6's
order sends each to the NIH steps.

| # | Written | Work | Funder named | Outcome |
|---|---|---|---|---|
| A7.1 | `PM50 GMO76547` | W-000044 | PHS | NIH:P50GM076547 (A1.10) |
| A7.2 | `AGO5131`, `AG-O5131` | W-000113 | NIA; PHS | NIH:P50AG005131 (A1.09) |
| A7.3 | `R21ESO34337` | W-000315 | HHS | NIH:R21ES034337 (A1.08) |
| A7.4 | `DK‐035816` | W-000188 | University of Washington | NIH:P30DK035816 (A1.50) |
| A7.5 | `HHSN272201700059C` | W-000197 | University of Washington Proteomics Resource | NIH-contract:HHSN272201700059C (§6.7) |

**NIH contracts, for completeness:** `HHSN272201700059C` (W-000181, -189, -203 as well),
`HHSN268201000033C` (W-000117) and `HHSN272201800004C` (W-000226) → `NIH-contract:<number>`;
`HHSN272201700036I` with `75N93020F00001` (W-000244) →
`NIH-contract:HHSN272201700036I:75N93020F00001`. `N01HV028179` is linked by RePORTER, with no
amount.

### A.8 Non-NIH typos the research resolved (not automatic under F8; seeded, Appendix E)

| # | Written | Work | Research's resolution and evidence | Outcome under §6 |
|---|---|---|---|---|
| A8.1 | `OPP 144374` | W-000287 | **NSF 1443474.** Six digits as written; the padded 1443740 does not exist (0144374 was not checked). 1443474 is in division OPP, matching the prefix: "Collaborative Research: Investigating Iron-binding Ligands in Southern Ocean…", University of Rhode Island, 2015–2020, $400,430. Another work cites 1443474 correctly | **unresolved** `MISC:OPP144374` without override; **override** → `NSF:1443474` (E.6) |
| A8.2 | `IOS‐1922781` | W-000233 | **NSF 1922871.** No award 1922781; adjacent digits exchanged; 1922871 is in IOS: "TRTech-PGR: A PeptideAtlas for Arabidopsis thaliana…", Cornell, $1,697,365 obligated. **The same work already lists 1922871** through another source | **unresolved** `MISC:IOS1922781` without override; **override** → `NSF:1922871` (E.7) |
| A8.3 | `DGE-071824` | W-000094 | **NSF 0718124.** Six digits; 0071824 does not exist. 0718124 is in DGE: the GRFP award to UW, 2007–2013, $17,862,240 obligated (institution-wide). Assumes one dropped "1" | **unresolved** `MISC:DGE071824` without override; **override** → `NSF:0718124` (E.8) |
| A8.4 | `NN13AJ12G` | W-000208 | **NASA NNX13AJ12G.** NASA numbers of this era are `NNX13…`; USAspending has NNX13AJ12G: UC San Diego, 2013–2022, $1,634,410, on body fluid distribution. W-000208 is the NASA Twins Study, listing 12 NASA grants, two described by USAspending as Twins Study consortium projects. *That the UCSD PI (Hargens) was a Twins Study investigator is the researcher's knowledge, not measured* | grant `USA:NASA:NN13AJ12G` without override (it stands, §6.9, with no amount found); **override** → `USA:NASA:NNX13AJ12G` (E.9) |
| A8.5 | `DBI 659680` | W-000199 | NSF 0659680 by zero-padding; **the NSF API does not know 0659680** — this is the one NSF grant of 57 not found | **unresolved** `MISC:DBI659680` |

### A.9 Other non-NIH normalisation cases

| # | Written | Work(s) | Outcome under §6 |
|---|---|---|---|
| A9.01 | `NSF-CDEBI OCE-0939564`, `NSF OCE‐0939564`, `OCE0939564`, `0939564` | W-000240, W-000254 | `NSF:0939564` (institution-wide) |
| A9.02 | `NSF OCE‐1558916, NSF OCE‐1360077` | W-000254 | `NSF:1558916` and `NSF:1360077` (a list) |
| A9.03 | `DBI-193331.1`, `DBI-1933311` | W-000233 and 4 more | `NSF:1933311` |
| A9.04 | `DGE-214-0004`, `DGE-2140004` | W-000318, W-000457 | `NSF:2140004` (institution-wide) |
| A9.05 | `CBET CBE 1803054` | W-000245 | `NSF:1803054` |
| A9.06 | `HDTRA1`, `HDTRA1-18`, `HDTRA1‐18‐1‐0001` | W-000244, W-000392 | one grant `USA:DOD:HDTRA11810001` (fragments, §6.10) |
| A9.07 | `NA14OAR4170078`, `#NA14OAR4170078` | W-000231, W-000236 | `USA:NOAA:NA14OAR4170078` (institution-wide) |
| A9.08 | `NA140AR4170078` | W-000243, -249, -274 | the same grant (O/0 swap, §6.9) |
| A9.09 | `NNX16AO69A:0061`, `NNX16AO69A:0107` | W-000208 | one grant `USA:NASA:NNX16AO69A` (TRISH, institution-wide) |
| A9.10 | `NCC 9-58`, `NCC958` | W-000208 | `USA:NASA:NCC958` (NSBRI, institution-wide) |
| A9.11 | `VR-RFI 2019-00217`, `2019-00217` | W-000329 | `VR:201900217` (institution-wide) |
| A9.12 | `2021-02468`, `2021–02468` | W-000329 | `VR:202102468` |
| A9.13 | `PID2023`, `PID2023-153058OB-I00` | W-000330 | one grant (fragment) |
| A9.14 | `100576`, `PRE2021-100576` | W-000330 | one grant (fragment, suffix) |
| A9.15 | `208391`, `208391/Z/17/Z`, and `08391/Z/17/Z` inside a list | W-000210, W-000314; `208391/Z/17/Z` also on W-000222 and W-000277 | one grant `WT:208391Z17Z` (fragments) |
| A9.16 | `FKZ 031`, `FKZ 031 A`, `A 534A`, `031 A 534A`, `FKZ 031 A 534A` | W-000210 | one grant `BMBF:031A534A` (prefix `FKZ` stripped; fragments) |
| A9.17 | `ANR-10`, `ANR-10-IAHU-0001` | W-000156 | one grant `ANR:ANR10IAHU0001` (institution-wide) |
| A9.18 | `10-IAHU-01`, `ANR-10-IAHU- 01` | W-000156 | **not merged** (zero-padding differs): stand without amounts; reported; override candidates → `ANR:ANR10IAHU0001` |
| A9.19 | `RTG 2467`, `RTG 2467 - 391498659`, `391498659` | W-000296 | **not merged** (a DFG training-group number beside the project ID); reported; override candidates → the project ID's key |
| A9.20 | `CRC 1423`, `CRC 1423 - 421152132`, `421152132` | W-000296 | as A9.19 |
| A9.21 | `INST 193/90-1 FUGG; project-ID: 497694394`, `497694394` | W-000329 | split on `;`: `INST 193/90-1 FUGG` stands; the project ID is the grant; reported |
| A9.22 | `HBM4EU`, `733032` | W-000581 | **not merged** (an acronym); `EU:733032` holds the amount; reported |
| A9.23 | `MO-178013`, `178013_1` | W-000102 | **not merged** (CIHR); reported |
| A9.24 | `#6000`, `6000` | W-000251 | the Moore agency's `6000` stands, no amount; the research thought it probably GBMF6000 (unconfirmed) |
| A9.25 | `DOE-SC10010566`, `DOE‐SC10010566`, `SC10010566` | W-000179 | `USA:DOE:SC10010566` stands, amount not found; the research's probable DE-SC0010566 ($2,095,749.24) is an override candidate (§16) |
| A9.26 | `Contract No: DESC0012704`, `No. DE-SC0012704`, `SC0012704` | W-000237 | facility_contract (BNL, by its tail) |
| A9.27 | `76RLO 1830`, `DE-AC05-76RLO-1830` | W-000049 | facility_contract (O for 0 tolerated) |
| A9.28 | `I01 BX000531` | W-000152 | `VA:I01BX000531` (RePORTER, no amount) |
| A9.29 | `UWPR95794`, and inside `…, 1R01-GM122864 and in part by the UW Proteome Resource UWPR95794` | 131 works | resource_code |

## Appendix B — Institution-wide awards

The research flagged 24 rows; TRISH's two sub-award rows are one grant, so **23 keys**. Amounts are
the research's, in the original currency (ANID's already ×1,000). Keys are formed by §8.2; B3
writes them into `config/funding.yaml`.

| Key | Research ID | Agency | Amount | Currency | Reason |
|---|---|---|---:|---|---|
| `ANID:15130011` | ANID:15130011 | ANID (Chile) | 4,500,000,000 | CLP | FONDAP centre |
| `ANID:1523A0008` | ANID:1523A0008 | ANID (Chile) | 2,247,000,000 | CLP | FONDAP centre |
| `ANID:FB210008` | ANID:FB210008 | ANID (Chile) | 8,967,750,000 | CLP | Basal centre |
| `ANR:ANR10IAHU0001` | ANR:ANR-10-IAHU-0001 | ANR | 83,443,137 | EUR | IHU institute |
| `ANR:ANR10LABX0062` | ANR:ANR-10-LABX-0062 | ANR | 45,786,154 | EUR | LabEx |
| `EU:101080544` | EU:101080544 | EU (CORDIS) | 9,458,801.25 | EUR | EU consortium total |
| `EU:101103253` | EU:101103253 | EU (CORDIS) | 5,185,037.50 | EUR | EU consortium total |
| `EU:101195186` | EU:101195186 | EU (CORDIS) | 1,378,272.50 | EUR | EU consortium total |
| `EU:115760` | EU:115760 (written `IMI115760`) | EU (CORDIS) | 9,538,688 | EUR | IMI consortium |
| `EU:115766` | EU:115766 | EU (CORDIS) | 21,200,000 | EUR | IMI consortium (EU contribution; total cost €50.3M) |
| `EU:722493` | EU:722493 | EU (CORDIS) | 3,976,833.96 | EUR | EU consortium total |
| `EU:733032` | EU:733032 | EU (CORDIS) | 49,933,776 | EUR | EU consortium total |
| `EU:823839` | EU:823839 | EU (CORDIS) | 9,986,185.75 | EUR | EU consortium total |
| `VR:201900217` | VR:2019-00217 | Swedish Research Council | 40,000,000 | SEK | national infrastructure |
| `WT:092809Z10Z` | WT:092809/Z/10/Z | Wellcome | 8,005,000 | GBP | SGC consortium |
| `USA:NASA:NCC958` | NASA:NCC958 | NASA | 583,518,208 | USD | NSBRI institute cooperative agreement (from 1999) |
| `USA:NASA:NNX16AO69A` | NASA:NNX16AO69A:0061 and :0107 | NASA | 139,591,379.50 | USD | TRISH institute agreement; the two suffixes are sub-awards |
| `USA:NOAA:NA14OAR4170078` | NOAA:NA14OAR4170078 | NOAA | 13,408,673 | USD | Washington Sea Grant omnibus award |
| `NSF:0718124` | NSF:0718124 | NSF | 17,862,240 | USD | NSF GRFP institutional award (listed only via A8.3's typo, through override E.8) |
| `NSF:0939564` | NSF:0939564 | NSF | 47,474,312 | USD | NSF Science and Technology Center (C-DEBI) |
| `NSF:1256082` | NSF:1256082 | NSF | 50,184,868 | USD | NSF GRFP institutional award |
| `NSF:1762114` | NSF:1762114 | NSF | 24,605,190 | USD | NSF GRFP institutional award |
| `NSF:2140004` | NSF:2140004 | NSF | 45,382,136 | USD | NSF GRFP institutional award |

Under v1's sources (F5), five of the eight EU amounts come from CORDIS alone and will be unknown
(§3.3); ANID's come from OpenAlex, ×1,000.

## Appendix C — Facility (M&O) contracts

Excluded by F5. Amounts are USAspending's lifetime obligations, recorded only to show why they
cannot be counted.

| Contract | Laboratory | Works | USAspending | Written as (examples) |
|---|---|---|---:|---|
| `DE-AC02-05CH11231` | Lawrence Berkeley (LBNL) | W-000189, W-000219, W-000226 | $19,926,468,209.50 | `DE-AC02-05CH11231.`, `DE AC02 05CH11231`, `AC02-05CH11231`, `05CH11231`, `DEAC02–05CH11231` |
| `DE-AC02-06CH11357` | Argonne | W-000178 | $17,507,033,619.58 | `Contract DE-AC02-06CH11357`, `DE- AC02-06-CH11357`, `AC02‐06CH11357`, `06CH11357` |
| `DE-AC05-76RL01830` | Pacific Northwest (PNNL) | W-000049, W-000303 | $30,912,550,571.06 | `DE-AC05-76RLO 1830`, `DE‐AC05‐76RLO1830`, `76RLO 1830`, `DEAC0576RL01830`, `76RL01830` |
| `DE-SC0012704` | Brookhaven (BNL) | W-000237 | $8,629,200,535.17 | `Contract No: DESC0012704`, `Contract No. DE-SC0012704`, `No. DE-SC0012704`, `SC0012704.` |

## Appendix D — Currencies

**Seen among the research's amounts** (§3.3), against the Federal Reserve G.5A release of
2026-01-05, which lists 23 currencies (read from the Federal Reserve's page on 2026-09-26, §5.10):

| Currency | Amounts | In G.5A | G.5A quotes | Converted by |
|---|---:|---|---|---|
| GBP | 18 | yes | US dollars per pound | G.5A |
| CLP | 13 | **no** | — | **OECD** |
| EUR | 11 | yes (from 1999) | US dollars per euro | G.5A |
| SEK | 8 | yes | kronor per US dollar | G.5A |
| CHF | 2 | yes | francs per US dollar | G.5A |
| CNY | 2 | yes | yuan per US dollar | G.5A |
| CAD | 1 | yes | Canadian dollars per US dollar | G.5A |
| JPY | 1 | yes | yen per US dollar | G.5A |

**Not seen, but in G.5A:** AUD and NZD (US dollars per unit), and the Brazilian real, Danish
krone, Hong Kong dollar, Indian rupee, South Korean won, Malaysian ringgit, Mexican peso,
Norwegian krone, Singapore dollar, South African rand, Sri Lankan rupee, Taiwan dollar, Thai baht
and Venezuelan bolívar (units per US dollar). Korean and Hungarian funders appear in the corpus
without amounts. **Not in G.5A, if they appear:** CLP is the only one seen; any other (HUF, PLN,
CZK and so on) uses OECD if OECD publishes it, and is otherwise left unconverted (F7). *Verified in
B3: OECD publishes 26 that G.5A lacks — ALL, ARS, CLP, COP, CRC, CVE, CZK, GEL, HUF, IDR, ILS, ISK,
KZT, MAD, MGA, MKD, PEN, PLN, RON, RSD, RUB, SAR, TRY, XAF, XOF, ZMW. The bolívar is left out of
the table: G.5A's one series spans the VEB, VEF, VES and VED, so no ISO code names it, and a
bolívar amount stays unconverted.*

## Appendix E — The nine seeded grant overrides

Added at the seed (B9), each `by: mriffle` and dated that day. Evidence in Appendix A. E.1–E.5
are NIH grants (A.4–A.5). E.6–E.9 are the non-NIH typos the research resolved (A.8): three NSF
numbers, each confirmed because the corrected award sits in the NSF division the written prefix
names, and one NASA number, confirmed by USAspending's recipient and description.

| # | Work | Written | Grant | Reason |
|---|---|---|---|---|
| E.1 | W-000222 | `U19AG02312` | `NIH:U19AG023122` | The only RePORTER core one edit away; seven corpus papers are NIH-linked to it (A4.5) |
| E.2 | W-000256 | `P01HL12803` | `NIH:P01HL128203` | The paper credits the grant "to J. P. S." — Jere P. Segrest, its PI. Found **only in the JATS text**, which is why JATS is harvested (A4.12) |
| E.3 | W-000100 | `S10RR02510` | `NIH:S10RR025107` | The only corpus-linked candidate; its PI, James Bruce, is an author (A4.17) |
| E.4 | W-000208 | `R21AO129851` | `NIH:R21AI129851` | `AO` for `AI`; the grant is at Cornell, the authors' institution (A5.1) |
| E.5 | W-000144 | `094352` | `NIH:R01HL094352` | Alan Chait's grant, whose lab wrote the paper (A5.2) |
| E.6 | W-000287 | `OPP 144374` | `NSF:1443474` | Six digits as written, and the padded 1443740 does not exist; 1443474 is in NSF's Office of Polar Programs, matching the `OPP` prefix, and another work (W-000808) cites it correctly (A8.1) |
| E.7 | W-000233 | `IOS‐1922781` | `NSF:1922871` | NSF has no award 1922781; two adjacent digits exchanged give 1922871, in IOS, matching the prefix, which the same work already lists through another source (A8.2) |
| E.8 | W-000094 | `DGE-071824` | `NSF:0718124` | Six digits, and 0071824 does not exist; 0718124 is in DGE, matching the prefix — UW's GRFP award, 2007–2013, institution-wide (Appendix B). Assumes one dropped "1" (A8.3) |
| E.9 | W-000208 | `NN13AJ12G` | `USA:NASA:NNX13AJ12G` | NASA numbers of this era are `NNX13…`; USAspending's recipient for NNX13AJ12G is UC San Diego (2013–2022, on body fluid distribution), and the paper is the NASA Twins Study, two of whose other NASA grants USAspending describes as Twins Study consortium projects (A8.4) |

## Appendix F — The non-NIH grants as measured

The research's table, one row per grant, transcribed so that B3's normaliser and B9's review have
an oracle. **The research IDs are not grant keys** — §8.2 forms those — and a `?` marks the
research's own doubt. Group: US federal, US non-federal, non-US. "Amount from" is the research's
best source, which for non-US-federal grants is often not a v1 source (§3.3). "OpenAlex" is the
award entity's amount before any correction (ANID's are ×1,000 short; DFG's `gepris` excluded).
"Written as" lists up to four distinct written forms, shortest first. 270 rows. **‡ marks three
pairs of rows that are one grant each**, which the research left unmerged and §6.10's
normalisation merges: EMBO's two `ALTF 933-2015` rows (spacing and dash), NRF Korea's
`2016R1A5A1010764` under `NRF` and `NRFK` (one funder, two names), and FAPESP's `16/00696-3` and
`2016/00696-3` (a two-digit year).

| Research ID | Agency | Group | Works | Amount | Cur. | Amount from | OpenAlex | Agrees | Flag | Written as |
|---|---|---|---:|---:|---|---|---:|---|---|---|
| `DOE:DE-AC02-05CH11231` | DOE | US fed. | 3 | 19,926,468,209.5 | USD | USAspending |  |  | LBNL M&O contract | `05CH11231`, `AC02-05CH11231`, `AC02–05CH11231`, `-AC02-05CH11231` +4 |
| `DOE:DE-AC02-06CH11357` | DOE | US fed. | 1 | 17,507,033,619.58 | USD | USAspending |  |  | Argonne M&O contract | `06CH11357`, `AC02‐06CH11357`, `AC02–06CH11357`, `DE-AC02-06CH11357` +3 |
| `DOE:DE-AC05-76RL01830` | DOE | US fed. | 2 | 30,912,550,571.06 | USD | USAspending |  |  | PNNL M&O contract | `76RL01830`, `76RLO 1830`, `AC05-76RL01830`, `DEAC0576RL01830` +6 |
| `DOE:DE-SC0010566?` | DOE | US fed. | 1 | 2,095,749.24 | USD | USAspending |  |  |  | `SC10010566`, `DOE-SC10010566`, `DOE‐SC10010566` |
| `DOE:DE-SC0012704` | DOE | US fed. | 1 | 8,629,200,535.17 | USD | USAspending |  |  | BNL M&O contract | `SC0012704`, `SC0012704.`, `DE‐SC0012704`, `DE- SC0012704` +3 |
| `DOI:M11AC00007` | DOI | US fed. | 1 | 5,596,885.29 | USD | USAspending |  |  |  | `M11AC00007` |
| `DOD:HDTRA11810001` | DoD | US fed. | 2 | 2,906,708 | USD | USAspending |  |  |  | `HDTRA1`, `HDTRA1-18`, `HDTRA1‐18‐1‐0001` |
| `DOD:W911NF2220059` | DoD | US fed. | 6 | 9,383,486 | USD | USAspending |  |  |  | `W911NF2220059` |
| `NASA:80NSSC18K1291` | NASA | US fed. | 1 | 1,072,453.81 | USD | USAspending |  |  |  | `80NSSC18K1291` |
| `NASA:NCC958` | NASA | US fed. | 1 | 583,518,208 | USD | USAspending | 583,518,208 | yes | NSBRI institute cooperative agreement (1999-) | `NCC958`, `NCC 9-58` |
| `NASA:NNA15BB03A` | NASA | US fed. | 1 | 7,414,441.28 | USD | USAspending |  |  |  | `NNA15BB03A` |
| `NASA:NNX13AJ12G?` | NASA | US fed. | 1 | 1,634,410 | USD | USAspending |  |  |  | `NN13AJ12G` |
| `NASA:NNX14AB02G` | NASA | US fed. | 1 | 829,705.92 | USD | USAspending | 829,705.92 | yes |  | `NNX14AB02G` |
| `NASA:NNX14AH26G` | NASA | US fed. | 1 | 201,742.87 | USD | USAspending | 201,742.87 | yes |  | `NNX14AH26G` |
| `NASA:NNX14AH27G` | NASA | US fed. | 1 | 166,995.5 | USD | USAspending | 166,995.5 | yes |  | `NNX14AH27G` |
| `NASA:NNX14AH50G` | NASA | US fed. | 1 | 257,945.97 | USD | USAspending | 257,945.97 | yes |  | `NNX14AH50G` |
| `NASA:NNX14AH51G` | NASA | US fed. | 1 | 198,248.75 | USD | USAspending | 198,248.75 | yes |  | `NNX14AH51G` |
| `NASA:NNX14AH52G` | NASA | US fed. | 1 | 332,145.08 | USD | USAspending | 332,145.08 | yes |  | `NNX14AH52G` |
| `NASA:NNX14AJ87G` | NASA | US fed. | 2 | 796,089.19 | USD | USAspending | 796,089.19 | yes |  | `NNX14AJ87G` |
| `NASA:NNX14AN75G` | NASA | US fed. | 1 | 27,566.61 | USD | USAspending | 27,566.61 | yes |  | `NNX14AN75G` |
| `NASA:NNX16AO69A:0061` | NASA | US fed. | 1 | 139,591,379.5 | USD | USAspending |  |  | TRISH institute agreement; :0061 is a sub-project | `NNX16AO69A:0061` |
| `NASA:NNX16AO69A:0107` | NASA | US fed. | 1 | 139,591,379.5 | USD | USAspending |  |  | TRISH institute agreement; :0107 is a sub-project | `NNX16AO69A:0107` |
| `NASA:NNX17AB26G` | NASA | US fed. | 1 | 100,000 | USD | USAspending | 100,000 | yes |  | `NNX17AB26G` |
| `NOAA:NA09NOS4780178` | NOAA | US fed. | 1 | 926,710 | USD | USAspending | 926,710 | yes |  | `NA09NOS4780178` |
| `NOAA:NA14OAR4170078` | NOAA | US fed. | 5 | 13,408,673 | USD | USAspending |  |  | Washington Sea Grant omnibus award | `NA140AR4170078`, `NA14OAR4170078`, `#NA14OAR4170078` |
| `NSF:0342956` | NSF | US fed. | 2 | 271,596 | USD | NSF Award API | 271,596 | yes |  | `0342956` |
| `NSF:0444148` | NSF | US fed. | 1 | 130,950 | USD | NSF Award API | 130,950 | yes |  | `0444148` |
| `NSF:0544757` | NSF | US fed. | 1 | 200,000 | USD | NSF Award API | 200,000 | yes |  | `0544757` |
| `NSF:0659680` | NSF | US fed. | 1 |  |  |  |  |  |  | `DBI 659680` |
| `NSF:0718124` | NSF | US fed. | 1 | 17,862,240 | USD | NSF Award API |  |  | NSF GRFP institutional award | `DGE-071824` |
| `NSF:0726522` | NSF | US fed. | 1 | 297,318 | USD | NSF Award API | 297,318 | yes |  | `0726522` |
| `NSF:0750048` | NSF | US fed. | 1 | 406,245 | USD | NSF Award API | 406,245 | yes |  | `0750048` |
| `NSF:0923536` | NSF | US fed. | 1 | 1,544,620 | USD | NSF Award API |  |  |  | `0923536` |
| `NSF:0926395` | NSF | US fed. | 1 | 592,116 | USD | NSF Award API | 592,116 | yes |  | `0926395` |
| `NSF:0939564` | NSF | US fed. | 2 | 47,474,312 | USD | NSF Award API | 47,474,312 | yes | NSF Science & Technology Center (C-DEBI) | `0939564`, `OCE0939564`, `NSF OCE‐0939564`, `NSF-OCE-0939564` +2 |
| `NSF:0962208` | NSF | US fed. | 1 | 700,000 | USD | NSF Award API | 700,000 | yes |  | `0962208` |
| `NSF:1029281` | NSF | US fed. | 1 | 491,254 | USD | NSF Award API | 491,254 | yes |  | `1029281` |
| `NSF:1046017` | NSF | US fed. | 1 | 2,419,273 | USD | NSF Award API | 2,419,273 | yes |  | `1046017` |
| `NSF:1055132` | NSF | US fed. | 1 | 500,866 | USD | NSF Award API | 500,866 | yes |  | `1055132`, `CHE-1055132` |
| `NSF:1060300` | NSF | US fed. | 2 | 545,870 | USD | NSF Award API | 545,870 | yes |  | `1060300` |
| `NSF:1138368` | NSF | US fed. | 1 | 299,383 | USD | NSF Award API | 299,383 | yes |  | `1138368` |
| `NSF:1153935` | NSF | US fed. | 1 | 674,549 | USD | NSF Award API | 674,549 | yes |  | `1153935` |
| `NSF:1155566` | NSF | US fed. | 1 | 149,992 | USD | NSF Award API | 149,992 | yes |  | `1155566` |
| `NSF:1230051` | NSF | US fed. | 1 | 25,000 | USD | NSF Award API | 25,000 | yes |  | `1230051` |
| `NSF:1233014` | NSF | US fed. | 6 | 350,000 | USD | NSF Award API | 350,000 | yes |  | `1233014` |
| `NSF:1233589` | NSF | US fed. | 3 | 349,000 | USD | NSF Award API | 349,000 | yes |  | `1233589`, `OCE 1233589` |
| `NSF:1256082` | NSF | US fed. | 2 | 50,184,868 | USD | NSF Award API | 50,184,867 | yes | NSF GRFP institutional award | `1256082`, `DGE-1256082` |
| `NSF:1258622` | NSF | US fed. | 1 | 6,002,177 | USD | NSF Award API | 6,002,177 | yes |  | `1258622` |
| `NSF:1338135` | NSF | US fed. | 3 | 488,105 | USD | NSF Award API | 488,105 | yes |  | `1338135`, `DBI-1338135` |
| `NSF:1354309` | NSF | US fed. | 2 | 800,000 | USD | NSF Award API | 800,000 | yes |  | `1354309` |
| `NSF:1360077` | NSF | US fed. | 1 | 150,000 | USD | NSF Award API |  |  |  | `NSF OCE‐1360077`, `NSF OCE‐1558916, NSF OCE‐1360077` |
| `NSF:1443474` | NSF | US fed. | 2 | 400,430 | USD | NSF Award API | 400,430 | yes |  | `1443474`, `OPP 144374` |
| `NSF:1542240` | NSF | US fed. | 2 | 1,999,857 | USD | NSF Award API | 1,999,857 | yes |  | `1542240` |
| `NSF:1558916` | NSF | US fed. | 1 | 605,523 | USD | NSF Award API | 605,523 | yes |  | `1558916`, `NSF OCE‐1558916`, `NSF OCE‐1558916, NSF OCE‐1360077` |
| `NSF:1633939` | NSF | US fed. | 7 | 410,284 | USD | NSF Award API | 410,284 | yes |  | `1633939`, `OCE1633939`, `OCE 1633939` |
| `NSF:1636045` | NSF | US fed. | 2 | 392,051 | USD | NSF Award API | 392,051 | yes |  | `1636045`, `OCE 1636045` |
| `NSF:1655682` | NSF | US fed. | 5 | 1,040,372 | USD | NSF Award API | 1,040,372 | yes |  | `1655682` |
| `NSF:1655888` | NSF | US fed. | 5 | 540,092 | USD | NSF Award API | 540,092 | yes |  | `1655888` |
| `NSF:1656201` | NSF | US fed. | 1 | 200,772 | USD | NSF Award API | 200,772 | yes |  | `1656201`, `CCF-1656201` |
| `NSF:1657808` | NSF | US fed. | 1 | 294,854 | USD | NSF Award API | 294,854 | yes |  | `1657808`, `OCE1657808` |
| `NSF:1736280` | NSF | US fed. | 1 | 639,828 | USD | NSF Award API | 639,828 | yes |  | `1736280`, `OCE1736280` |
| `NSF:1756816` | NSF | US fed. | 1 | 724,796 | USD | NSF Award API | 724,796 | yes |  | `1756816`, `OCE 1756816` |
| `NSF:1759980` | NSF | US fed. | 2 | 898,780 | USD | NSF Award API | 898,780 | yes |  | `1759980`, `ABI 1759980`, `ABI-1759980` |
| `NSF:1762114` | NSF | US fed. | 2 | 24,605,190 | USD | NSF Award API | 24,605,190 | yes | NSF GRFP institutional award | `1762114` |
| `NSF:1803054` | NSF | US fed. | 1 | 334,856 | USD | NSF Award API | 334,856 | yes |  | `1803054`, `CBET CBE 1803054` |
| `NSF:1807382` | NSF | US fed. | 1 | 412,000 | USD | NSF Award API |  |  |  | `CHE-1807382` |
| `NSF:1829318` | NSF | US fed. | 2 | 534,999 | USD | NSF Award API | 534,999 | yes |  | `1829318`, `OCE-1829318`, `OCE‐1829318` |
| `NSF:1829378` | NSF | US fed. | 1 | 226,979 | USD | NSF Award API | 226,979 | yes |  | `1829378`, `OCE-1829378`, `OCE‐1829378` |
| `NSF:1829761` | NSF | US fed. | 1 | 372,100 | USD | NSF Award API | 372,100 | yes |  | `1829761`, `OCE1829761` |
| `NSF:1908587` | NSF | US fed. | 1 | 900,000 | USD | NSF Award API | 900,000 | yes |  | `1908587`, `MCB-1908587` |
| `NSF:1920268` | NSF | US fed. | 2 | 769,979 | USD | NSF Award API | 769,979 | yes |  | `1920268` |
| `NSF:1921746` | NSF | US fed. | 1 | 724,407 | USD | NSF Award API | 724,407 | yes |  | `1921746`, `IOS-1921746`, `IOS‐1921746` |
| `NSF:1922541` | NSF | US fed. | 1 | 273,447 | USD | NSF Award API | 273,447 | yes |  | `1922541`, `IOS-1922541` |
| `NSF:1922871` | NSF | US fed. | 4 | 1,697,365 | USD | NSF Award API | 1,697,365 | yes |  | `1922871`, `IOS-1922871`, `IOS‐1922871`, `IOS‐1922781` |
| `NSF:1933311` | NSF | US fed. | 7 | 976,010 | USD | NSF Award API | 976,010 | yes |  | `1933311`, `DBI-1933311`, `DBI‐1933311`, `DBI-193331.1` |
| `NSF:2041497` | NSF | US fed. | 1 | 335,005 | USD | NSF Award API | 335,005 | yes |  | `2041497` |
| `NSF:2044840` | NSF | US fed. | 2 | 1,237,694 | USD | NSF Award API | 1,237,694 | yes |  | `2044840` |
| `NSF:2140004` | NSF | US fed. | 2 | 45,382,136 | USD | NSF Award API | 45,382,137 | yes | NSF GRFP institutional award | `2140004`, `DGE-2140004`, `DGE-214-0004` |
| `NSF:2245300` | NSF | US fed. | 2 | 1,199,760 | USD | NSF Award API | 905,320 | **no** |  | `2245300` |
| `NSF:2401644` | NSF | US fed. | 1 | 742,863 | USD | NSF Award API | 742,863 | yes |  | `2401644` |
| `NSF:2401645` | NSF | US fed. | 1 | 521,762 | USD | NSF Award API | 521,762 | yes |  | `2401645` |
| `NSF:2401646` | NSF | US fed. | 1 | 734,947 | USD | NSF Award API | 734,947 | yes |  | `2401646` |
| `USDA:2019-07916` | USDA | US fed. | 1 |  |  |  |  |  |  | `2019-07916` |
| `VA:I01BX000531` | VA | US fed. | 1 |  |  |  |  |  |  | `I01 BX000531` |
| `AHA:0830231N` | AHA | US non-fed. | 2 |  |  |  |  |  |  | `0830231N` |
| `AHA:10SDG3600027` | AHA | US non-fed. | 1 |  |  |  |  |  |  | `10SDG3600027` |
| `AHA:13BGIA17290026` | AHA | US non-fed. | 2 |  |  |  |  |  |  | `13BGIA17290026` |
| `AHA:13POST16200007` | AHA | US non-fed. | 1 |  |  |  |  |  |  | `13POST16200007` |
| `AHA:13SDG16940064` | AHA | US non-fed. | 1 |  |  |  |  |  |  | `13SDG16940064` |
| `AHA:14GRNT18410022` | AHA | US non-fed. | 1 |  |  |  |  |  |  | `14GRNT18410022` |
| `AHA:14POST18620020` | AHA | US non-fed. | 2 |  |  |  |  |  |  | `14POST18620020` |
| `AHA:15POST22700033` | AHA | US non-fed. | 3 | 90,000 | USD | OpenAlex only (aha_report_builder) | 90,000 |  |  | `15POST22700033` |
| `AHA:16GRNT30700006` | AHA | US non-fed. | 1 | 154,000 | USD | OpenAlex only (aha_report_builder) | 154,000 |  |  | `16GRNT30700006` |
| `AHA:18EIA33900041` | AHA | US non-fed. | 1 | 400,000 | USD | OpenAlex only (aha_report_builder) | 400,000 |  |  | `18EIA33900041` |
| `AHA:18POST33990352` | AHA | US non-fed. | 1 | 110,456 | USD | OpenAlex only (aha_report_builder) | 110,456 |  |  | `18POST33990352` |
| `AHA:19CDA34660311` | AHA | US non-fed. | 1 | 231,000 | USD | OpenAlex only (aha_report_builder) | 231,000 |  |  | `19CDA34660311` |
| `AHA:20CDA35320109` | AHA | US non-fed. | 1 | 231,000 | USD | OpenAlex only (aha_report_builder) | 231,000 |  |  | `20CDA35320109` |
| `AHA:20PRE35120126` | AHA | US non-fed. | 1 | 62,032 | USD | OpenAlex only (aha_report_builder) | 62,032 |  |  | `20PRE35120126` |
| `AHA:828090` | AHA | US non-fed. | 1 | 63,040 | USD | OpenAlex only (aha_report_builder) | 63,040 |  |  | `828090`, `#828090` |
| `AHA:930223` | AHA | US non-fed. | 1 | 231,000 | USD | OpenAlex only (aha_report_builder) | 231,000 |  |  | `930223` |
| `ALZHEIMER'S:2015-NIRG-342009` | Alzheimer's Association | US non-fed. | 1 |  |  |  |  |  |  | `2015-NIRG-342009`, `2015‐NIRG‐342009` |
| `ADA:9-18-CVD1-002` | American Diabetes Association | US non-fed. | 2 |  |  |  |  |  |  | `9-18-CVD1-002`, `#9-18-CVD1-002` |
| `AMERICAN:1-16-IBS-153` | American Diabetes Association | US non-fed. | 1 |  |  |  |  |  |  | `1-16-IBS-153` |
| `AMERICAN:1-16-PMF-008` | American Diabetes Association | US non-fed. | 1 |  |  |  |  |  |  | `1-16-PMF-008` |
| `CPRIT:RP210102` | CPRIT | US non-fed. | 1 | 250,000 | USD | OpenAlex only (cprit) | 250,000 |  |  | `RP210102` |
| `GATES:INV-002022` | Gates Foundation | US non-fed. | 1 | 4,794,736 | USD | Gates committed-grants CSV | 4,794,736 | yes |  | `INV-002022` |
| `GATES:OPP1033102` | Gates Foundation | US non-fed. | 1 | 7,699,399 | USD | Gates committed-grants CSV |  |  |  | `CAVD OPP1033102` |
| `GATES:OPP1115782` | Gates Foundation | US non-fed. | 1 |  |  |  |  |  |  | `OPP1115782` |
| `GATES:OPP1126258` | Gates Foundation | US non-fed. | 5 |  |  |  |  |  |  | `OPP1126258` |
| `GATES:OPP1151836` | Gates Foundation | US non-fed. | 1 |  |  |  |  |  |  | `OPP1151836` |
| `GATES:OPP1156262` | Gates Foundation | US non-fed. | 1 |  |  |  |  |  |  | `OPP1156262` |
| `GATES:OPP1159947` | Gates Foundation | US non-fed. | 1 |  |  |  |  |  |  | `OPP1159947` |
| `HHMI:027774` | HHMI | US non-fed. | 2 |  |  |  |  |  |  | `027774` |
| `HAWAII:MOA 13-502` | Hawaii Dept. of Health | US non-fed. | 1 |  |  |  |  |  |  | `MOA 13-502` |
| `MOORE:GBMF3302` | Moore Foundation | US non-fed. | 1 | 893,000 | USD | moore.org grant page | 893,000 | yes |  | `GBMF3302` |
| `MOORE:GBMF6000?` | Moore Foundation | US non-fed. | 1 | 1,741,433 | USD | moore.org grant page |  |  |  | `6000`, `#6000` |
| `NATIONAL:34413` | National Fish and Wildlife Foundation | US non-fed. | 1 |  |  |  |  |  |  | `34413` |
| `PARKINSON'S:PDF‐FBS‐1552` | Parkinson's Disease Foundation | US non-fed. | 1 |  |  |  |  |  |  | `PDF‐FBS‐1552` |
| `SIMONS:329108` | Simons Foundation | US non-fed. | 1 |  |  |  |  |  |  | `329108` |
| `STARR:I9-A9-071` | Starr Foundation | US non-fed. | 1 |  |  |  |  |  |  | `I9-A9-071` |
| `TRDRP:#18KT-0021` | TRDRP (California) | US non-fed. | 1 |  |  |  |  |  |  | `#18KT-0021` |
| `UNIVERSITY:A172539` | University of Washington | US non-fed. | 1 |  |  |  |  |  |  | `A172539` |
| `AEI:CEX2021-001189-S` | AEI (Spain) | non-US | 1 |  |  |  |  |  |  | `CEX2021-001189-S`, `CEX 2021-001189-S`, `CEX2021-001189 -S` |
| `AEI:PID2023-153058OB-I00` | AEI (Spain) | non-US | 1 |  |  |  |  |  |  | `PID2023`, `PID2023-153058OB-I00` |
| `AEI:PRE2021-100576` | AEI (Spain) | non-US | 1 |  |  |  |  |  |  | `100576`, `PRE2021-100576` |
| `ANID:1190928` | ANID (Chile) | non-US | 1 | 269,160,000 | CLP | ANID GitHub CSV (M$ x1000) |  |  |  | `1190928`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:1191928` | ANID (Chile) | non-US | 1 | 263,255,000 | CLP | ANID GitHub CSV (M$ x1000) | 263,255 | yes |  | `1191928`, `1191928, 1210644` |
| `ANID:1200836` | ANID (Chile) | non-US | 1 | 256,086,000 | CLP | ANID GitHub CSV (M$ x1000) | 256,086 | yes |  | `1200836`, `#1200836`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:1210644` | ANID (Chile) | non-US | 2 | 244,723,000 | CLP | ANID GitHub CSV (M$ x1000) | 244,723 | yes |  | `1210644`, `1191928, 1210644`, `FONDECYT grants 1210644`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:1211223` | ANID (Chile) | non-US | 1 | 206,018,000 | CLP | ANID GitHub CSV (M$ x1000) | 206,018 | yes |  | `1211223`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:1230983` | ANID (Chile) | non-US | 1 | 270,920,000 | CLP | ANID GitHub CSV (M$ x1000) | 270,920 | yes |  | `1230983` |
| `ANID:1240888` | ANID (Chile) | non-US | 1 | 186,107,000 | CLP | ANID GitHub CSV (M$ x1000) | 186,107 | yes |  | `1240888`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:15130011` | ANID (Chile) | non-US | 2 | 4,500,000,000 | CLP | ANID GitHub CSV (M$ x1000) | 4,500,000 | yes | FONDAP centre | `15130011`, `FONDAP#15130011`, `FONDAP grants 15130011 and 1523A0008 (A…`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:1523A0008` | ANID (Chile) | non-US | 1 | 2,247,000,000 | CLP | ANID GitHub CSV (M$ x1000) | 2,247,000 | yes | FONDAP centre | `1523A0008`, `FONDAP grants 15130011 and 1523A0008 (A…`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:21130102` | ANID (Chile) | non-US | 1 |  |  |  |  |  |  | `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:21161246` | ANID (Chile) | non-US | 1 |  |  |  |  |  |  | `21161246 (R.H.).`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:21170292` | ANID (Chile) | non-US | 1 |  |  |  |  |  |  | `21170292`, `21170292, 21200147` |
| `ANID:21200147` | ANID (Chile) | non-US | 1 |  |  |  |  |  |  | `21200147`, `21170292, 21200147` |
| `ANID:3170169` | ANID (Chile) | non-US | 1 | 77,988,000 | CLP | ANID GitHub CSV (M$ x1000) |  |  |  | `3170169`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANID:CIP2019015` | ANID (Chile) | non-US | 1 |  |  |  |  |  |  | `CIP2019015` |
| `ANID:EQM160157` | ANID (Chile) | non-US | 2 | 116,180,000 | CLP | ANID GitHub CSV (M$ x1000) | 116,180 | yes |  | `EQM160157` |
| `ANID:EQM170111` | ANID (Chile) | non-US | 1 | 122,122,000 | CLP | ANID GitHub CSV (M$ x1000) | 122,122 | yes |  | `EQM170111` |
| `ANID:FB210008` | ANID (Chile) | non-US | 1 | 8,967,750,000 | CLP | ANID GitHub CSV (M$ x1000) | 8,967,750 | yes | Basal centre | `FB210008`, `ANID/BASAL/FB210008`, `FONDECYT grants 1210644 (A.F.G.Q.), 120…` |
| `ANR:ANR-10-IAHU-0001` | ANR | non-US | 1 | 83,443,137 | EUR | OpenAlex only (anr_opendata) | 83,443,137 |  | IHU institute | `ANR-10`, `10-IAHU-01`, `ANR-10-IAHU- 01`, `ANR-10-IAHU-0001` |
| `ANR:ANR-10-LABX-0062` | ANR | non-US | 2 | 45,786,154 | EUR | OpenAlex only (anr_opendata) | 45,786,154 |  | LabEx | `ANR-10-LABX-0062` |
| `ARC:DP170102108; DP130100679` | ARC (Australia) | non-US | 1 |  |  |  |  |  |  | `DP170102108; DP130100679` |
| `ACADEMY:AMS-SGCL11-Briggs` | Academy of Medical Sciences (UK) | non-US | 1 |  |  |  |  |  |  | `AMS-SGCL11-Briggs` |
| `UKRI:BB/C511599/1` | BBSRC | non-US | 1 |  |  |  |  |  |  | `BB/C511599/1` |
| `UKRI:BB/K01997X/1` | BBSRC | non-US | 1 | 279,890 | GBP | UKRI GtR | 279,890 | yes |  | `BB/K01997X/1` |
| `UKRI:BB/L024225/1` | BBSRC | non-US | 1 | 481,807 | GBP | UKRI GtR | 481,807 | yes |  | `BB/L024225/1` |
| `UKRI:BB/N022432/1` | BBSRC | non-US | 1 | 30,612 | GBP | OpenAlex only (gateway_to_research) | 30,612 |  |  | `BB/N022432/1` |
| `UKRI:BB/N022440/1` | BBSRC | non-US | 2 | 30,488 | GBP | OpenAlex only (gateway_to_research) | 30,488 |  |  | `BB/N022440/1` |
| `UKRI:BB/P024599/1` | BBSRC | non-US | 1 | 444,779 | GBP | UKRI GtR | 444,779 | yes |  | `BB/P024599/1` |
| `UKRI:BB/S017054/1` | BBSRC | non-US | 1 | 310,483 | GBP | UKRI GtR | 310,483 | yes |  | `BB/S017054/1` |
| `UKRI:BB/S01781X/1` | BBSRC | non-US | 2 | 463,036 | GBP | UKRI GtR | 463,036 | yes |  | `BB/S01781X/1` |
| `UKRI:BB/T019670/1` | BBSRC | non-US | 2 | 671,803 | GBP | UKRI GtR | 671,803 | yes |  | `BB/T019670/1` |
| `UKRI:BB/V018779/1` | BBSRC | non-US | 1 | 701,510 | GBP | UKRI GtR | 701,510 | yes |  | `BB/V018779/1` |
| `UKRI:BB/X001911/1` | BBSRC | non-US | 1 | 493,010 | GBP | UKRI GtR | 493,010 | yes |  | `BB/X001911/1` |
| `UKRI:BB/Y513829/1` | BBSRC | non-US | 1 | 258,317 | GBP | UKRI GtR | 258,317 | yes |  | `BB/Y513829/1` |
| `BMBF:031A534A` | BMBF | non-US | 1 |  |  |  |  |  |  | `A 534A`, `FKZ 031`, `FKZ 031 A`, `031 A 534A` +2 |
| `BMBF:031L0168` | BMBF | non-US | 1 |  |  |  |  |  |  | `031L0168` |
| `BMWI:KK5096401SK0` | BMWi | non-US | 1 |  |  |  |  |  |  | `KK5096401SK0` |
| `CIHR:178013` | CIHR | non-US | 1 | 845,326 | CAD | OpenAlex only (cihr_opendata) | 845,326 |  |  | `178013_1`, `MO-178013` |
| `CIHR:PJT-206152` | CIHR | non-US | 1 |  |  |  |  |  |  | `PJT-206152` |
| `UNK:1097737` | CIHR? | non-US | 1 |  |  |  |  |  |  | `1097737` |
| `CUHK:4053242` | CUHK (internal) | non-US | 1 |  |  |  |  |  |  | `4053242` |
| `CUHK:4053364` | CUHK (internal) | non-US | 1 |  |  |  |  |  |  | `4053364` |
| `CANCER:C20724 / A26752` | Cancer Research UK | non-US | 1 |  |  |  |  |  |  | `C20724/A26752`, `C20724 / A26752` |
| `CANCER:C483 / A6354` | Cancer Research UK | non-US | 1 |  |  |  |  |  |  | `C483/A6354`, `C483 / A6354` |
| `CANCER:DRCRPG-May23 / 100002` | Cancer Research UK | non-US | 1 |  |  |  |  |  |  | `DRCRPG-May23/100002`, `DRCRPG-May23 / 100002` |
| `CHINA:2014-03250042` | China Scholarship Council | non-US | 1 |  |  |  |  |  |  | `2014-03250042` |
| `CHINA:202006320416` | China Scholarship Council | non-US | 1 |  |  |  |  |  |  | `202006320416` |
| `DFG:391498659` | DFG | non-US | 1 |  |  |  | 1,429,241.65 |  |  | `RTG 2467`, `391498659`, `RTG 2467 - 391498659` |
| `DFG:421152132` | DFG | non-US | 1 |  |  |  | 2,968,424.97 |  |  | `CRC 1423`, `421152132`, `CRC 1423 - 421152132` |
| `DFG:461264291` | DFG | non-US | 1 |  |  |  | 109,941.67 |  |  | `461264291` |
| `DFG:497694394` | DFG | non-US | 1 |  |  |  | 109,941.67 |  |  | `497694394`, `INST 193/90-1 FUGG; project-ID: 4976943…` |
| `DFG:INST 271/404-1 FUGG` | DFG | non-US | 1 |  |  |  |  |  |  | `INST 271/404-1 FUGG` |
| `DFG:INST 271/405-1 FUGG` | DFG | non-US | 1 |  |  |  |  |  |  | `INST 271/405-1 FUGG` |
| `DFG:SCHW 1881/1-1` | DFG | non-US | 1 |  |  |  |  |  |  | `SCHW 1881/1-1` |
| `DFG:16LW0243K` | DFG? (looks like a BMBF FKZ) | non-US | 1 |  |  |  |  |  |  | `16LW0243K` |
| `DLR:50WB1535` | DLR (Germany) | non-US | 1 |  |  |  |  |  |  | `50WB1535` |
| `EMBO:ALTF 481-2020` | EMBO | non-US | 2 |  |  |  |  |  |  | `ALTF481-2020`, `ALTF 481-2020` |
| `EMBO:ALTF 933-2015` ‡ | EMBO | non-US | 2 |  |  |  |  |  |  | `ALTF933-2015`, `ALTF 933-2015` |
| `EMBO:ALTF933-2015` ‡ | EMBO | non-US | 4 |  |  |  |  |  |  | `ALTF 933–2015` |
| `UKRI:EP/Y035984/1` | EPSRC | non-US | 1 | 131,896 | GBP | UKRI GtR | 131,896 | yes |  | `EP/Y035984/1` |
| `EU:101080544` | EU (CORDIS) | non-US | 1 | 9,458,801.25 | EUR | CORDIS (EU contribution) |  |  | EU consortium total | `101080544` |
| `EU:101103253` | EU (CORDIS) | non-US | 1 | 5,185,037.5 | EUR | CORDIS (EU contribution) |  |  | EU consortium total | `101103253` |
| `EU:10119173?` | EU (CORDIS) | non-US | 1 |  |  |  |  |  |  | `10119173` |
| `EU:101195186` | EU (CORDIS) | non-US | 1 | 1,378,272.5 | EUR | CORDIS (EU contribution) |  |  | EU consortium total | `101195186` |
| `EU:115760` | EU (CORDIS) | non-US | 1 | 9,538,688 | EUR | CORDIS (EU contribution) |  |  | IMI consortium | `IMI115760` |
| `EU:115766` | EU (CORDIS) | non-US | 1 | 21,200,000 | EUR | CORDIS (EU contribution) |  |  | IMI consortium | `115766` |
| `EU:309449` | EU (CORDIS) | non-US | 1 | 1,498,906 | EUR | CORDIS (EU contribution) | 1,498,906 | yes |  | `309449` |
| `EU:722493` | EU (CORDIS) | non-US | 1 | 3,976,833.96 | EUR | CORDIS (EU contribution) | 3,976,833.96 | yes | EU consortium total | `722493` |
| `EU:733032` | EU (CORDIS) | non-US | 1 | 49,933,776 | EUR | CORDIS (EU contribution) | 49,933,776 | yes | EU consortium total | `733032`, `HBM4EU` |
| `EU:823839` | EU (CORDIS) | non-US | 3 | 9,986,185.75 | EUR | CORDIS (EU contribution) | 9,986,185.75 | yes | EU consortium total | `823839` |
| `FAPESP:16/00696-3` ‡ | FAPESP (Brazil) | non-US | 1 |  |  |  |  |  |  | `16/00696-3` |
| `FAPESP:FAPESP 2016/00696-3` ‡ | FAPESP (Brazil) | non-US | 1 |  |  |  |  |  |  | `FAPESP 2016/00696-3` |
| `FNR:12341006` | FNR (Luxembourg) | non-US | 1 |  |  |  |  |  |  | `12341006`, `A18/BM/12341006` |
| `FNR:C19/BM/13684739` | FNR (Luxembourg) | non-US | 2 |  |  |  |  |  |  | `C19/BM/13684739` |
| `FWO:12A6L24N` | FWO | non-US | 1 |  |  |  |  |  |  | `12A6L24N` |
| `FWO:G010023N` | FWO | non-US | 1 |  |  |  |  |  |  | `G010023N` |
| `FWO:G028821N` | FWO | non-US | 1 |  |  |  |  |  |  | `G028821N` |
| `FWO:G087625N` | FWO | non-US | 1 |  |  |  |  |  |  | `G087625N`, `FWO G087625N` |
| `GHENT:BOF21/GOA/033` | Ghent University BOF | non-US | 1 |  |  |  |  |  |  | `BOF21/GOA/033` |
| `HFSP:RGP0034/2018` | HFSP | non-US | 3 |  |  |  |  |  |  | `RGP0034/2018` |
| `INDEPENDENT:0131-00031B` | Independent Research Fund Denmark | non-US | 2 |  |  |  |  |  |  | `0131-00031B` |
| `JSPS:20H03245` | JSPS | non-US | 1 | 17,680,000 | JPY | OpenAlex only (kaken) | 17,680,000 |  |  | `20H03245` |
| `JST:15650519` | JST | non-US | 2 |  |  |  |  |  |  | `15650519`, `15650519 (2015–2018)` |
| `JST:18063028` | JST | non-US | 3 |  |  |  |  |  |  | `18063028`, `18 063028`, `18063028 (2018–2023)` |
| `JST:JPMJND2304` | JST | non-US | 1 |  |  |  |  |  |  | `JPMJND2304` |
| `KAIST:G04220008` | KAIST | non-US | 1 |  |  |  |  |  |  | `G04220008` |
| `KBSI:C512120` | KBSI (Korea) | non-US | 1 |  |  |  |  |  |  | `C512120` |
| `KBSI:C513571` | KBSI (Korea) | non-US | 1 |  |  |  |  |  |  | `C513571` |
| `KBSI:C523200` | KBSI (Korea) | non-US | 1 |  |  |  |  |  |  | `C523200` |
| `KBSI:C539200` | KBSI (Korea) | non-US | 1 |  |  |  |  |  |  | `C539200` |
| `KHIDI:HI14C1277` | KHIDI (Korea) | non-US | 1 |  |  |  |  |  |  | `HI14C1277` |
| `KIMS:PNKA310` | KIMS (Korea) | non-US | 1 |  |  |  |  |  |  | `PNKA310` |
| `LUNDBECK:R223-2015-4222` | Lundbeck Foundation | non-US | 1 |  |  |  |  |  |  | `R223-2015-4222`, `R223‐2015‐4222` |
| `LUNDBECK:R248-2016-2518` | Lundbeck Foundation | non-US | 1 |  |  |  |  |  |  | `2016-2518`, `R248-2016-2518`, `R248‐2016‐2518` |
| `MOST:2015AA020108` | MOST (China) | non-US | 1 |  |  |  |  |  |  | `2015AA020108` |
| `MOST:2016YFB0201702` | MOST (China) | non-US | 1 |  |  |  |  |  |  | `2016YFB0201702` |
| `MOST:2016YFC0901701` | MOST (China) | non-US | 1 |  |  |  |  |  |  | `2016YFC0901701` |
| `MOST:2021YFA1301603` | MOST (China) | non-US | 2 |  |  |  |  |  |  | `2021YFA1301603` |
| `MOST:2024YFE0202700` | MOST (China) | non-US | 1 |  |  |  |  |  |  | `2024YFE0202700` |
| `MRC:MC_U105674181` | MRC | non-US | 1 |  |  |  |  |  |  | `MC_U105674181` |
| `MSIT:RS-2023-00222078` | MSIT (Korea) | non-US | 1 |  |  |  |  |  |  | `RS-2023-00222078` |
| `MSIT:RS-2024-00356469` | MSIT (Korea) | non-US | 1 |  |  |  |  |  |  | `RS-2024-00356469` |
| `MSIT:RS-2024-00440681` | MSIT (Korea) | non-US | 1 |  |  |  |  |  |  | `RS-2024-00440681` |
| `MSIT:RS-2024-00460425` | MSIT (Korea) | non-US | 1 |  |  |  |  |  |  | `RS-2024-00460425`, `RS‐2024‐00460425` |
| `MWK:W-de.NBI-022` | MWK Baden-Württemberg | non-US | 1 |  |  |  |  |  |  | `W-de.NBI-022` |
| `NERC:NBAF010004` | NERC | non-US | 1 |  |  |  |  |  |  | `NBAF010004` |
| `NERC:R8-H10-61` | NERC | non-US | 1 |  |  |  |  |  |  | `R8-H10-61` |
| `NIHR:NF-SI-0512-10105` | NIHR (UK) | non-US | 1 |  |  |  |  |  |  | `NF-SI-0512-10105` |
| `NKFIH:2018-1.2-1-NKP` | NKFIH (Hungary) | non-US | 1 |  |  |  |  |  |  | `2018-1.2-1-NKP` |
| `NKFIH:2018-1.2.1-NKP-2018-00005` | NKFIH (Hungary) | non-US | 1 |  |  |  |  |  |  | `2018-1.2.1-NKP-2018-00005`, `2018‐1.2.1‐NKP‐2018‐00005` |
| `NKFIH:FK 131603` | NKFIH (Hungary) | non-US | 1 |  |  |  |  |  |  | `FK131603`, `FK 131603` |
| `NKFIH:ÚNKP-21-3` | NKFIH (Hungary) | non-US | 1 |  |  |  |  |  |  | `ÚNKP-21-3` |
| `NRF:2016R1A5A1010764` ‡ | NRF Korea | non-US | 1 |  |  |  |  |  |  | `2016R1A5A1010764` |
| `NRF:NRF-2012M3A9B9036669` | NRF Korea | non-US | 1 |  |  |  |  |  |  | `NRF-2012M3A9B9036669` |
| `NRF:NRF-2015M3A9B6073840` | NRF Korea | non-US | 1 |  |  |  |  |  |  | `NRF-2015M3A9B6073840` |
| `NRFK:2016R1A5A1010764` ‡ | NRF Korea | non-US | 1 |  |  |  |  |  |  | `NRF-2016R1A5A1010764`, `NRF‐2016R1A5A1010764` |
| `NSFC:31200105` | NSFC (China) | non-US | 1 | 230,000 | CNY | OpenAlex only (nsfc_kd) | 230,000 |  |  | `31200105` |
| `NSFC:31470238` | NSFC (China) | non-US | 1 | 860,000 | CNY | OpenAlex only (nsfc_kd) | 860,000 |  |  | `31470238` |
| `NWO:019.2015.2.310.006` | NWO | non-US | 5 |  |  |  |  |  |  | `019.2015.2.310.006`, `Rubicon 019.2015.2.310.006` |
| `NWO:718.015.003` | NWO | non-US | 1 |  |  |  |  |  |  | `718.015.003`, `TOPPUNT 718.015.003` |
| `NWO:825.08.020` | NWO | non-US | 1 |  |  |  |  |  |  | `825.08.020` |
| `ONTARIO:OGI-055` | Ontario Genomics / Genome Canada | non-US | 1 |  |  |  |  |  |  | `OGI-055` |
| `OPEN:OTAR3091` | Open Targets | non-US | 1 |  |  |  |  |  |  | `OTAR3091` |
| `POLISH:3195/B/P01/2007/33` | Polish Ministry of Science | non-US | 1 |  |  |  |  |  |  | `3195/B/P01/2007/33` |
| `RGC/UGC:14102014` | RGC/UGC (Hong Kong) | non-US | 1 |  |  |  |  |  |  | `14102014` |
| `RGC/UGC:AoE/M-403/16` | RGC/UGC (Hong Kong) | non-US | 1 |  |  |  |  |  |  | `AoE/M-403/16` |
| `SNSF:181503` | SNSF | non-US | 1 | 77,400 | CHF | OpenAlex only (snsf) | 77,400 |  |  | `181503`, `P2ZHP3_181503` |
| `SNSF:194379` | SNSF | non-US | 1 | 76,500 | CHF | OpenAlex only (snsf) | 76,500 |  |  | `194379`, `P400PB_194379` |
| `SSF:SB16-0039` | SSF (Sweden) | non-US | 1 | 33,969,611 | SEK | OpenAlex only (ssf) | 33,969,611 |  |  | `SB16-0039` |
| `SWEDISH:22 2380 Pj` | Swedish Cancer Society | non-US | 1 |  |  |  |  |  |  | `22 2380 Pj` |
| `VR:2018-05851` | Swedish Research Council | non-US | 1 | 25,200,000 | SEK | Swecris | 25,200,000 | yes |  | `2018-05851` |
| `VR:2019-00217` | Swedish Research Council | non-US | 1 | 40,000,000 | SEK | Swecris | 40,000,000 | yes | national infrastructure | `2019-00217`, `VR-RFI 2019-00217` |
| `VR:2020-03380` | Swedish Research Council | non-US | 1 | 3,200,000 | SEK | Swecris | 3,200,000 | yes |  | `2020-03380` |
| `VR:2020-06224` | Swedish Research Council | non-US | 1 | 12,000,000 | SEK | Swecris | 12,000,000 | yes |  | `2020-06224` |
| `VR:2021-02468` | Swedish Research Council | non-US | 1 | 4,800,000 | SEK | Swecris | 4,800,000 | yes |  | `2021-02468`, `2021–02468` |
| `VR:2024-00390` | Swedish Research Council | non-US | 1 | 30,000,000 | SEK | Swecris | 30,000,000 | yes |  | `2024-00390` |
| `VR:2024-05887` | Swedish Research Council | non-US | 1 | 3,600,000 | SEK | Swecris | 3,600,000 | yes |  | `2024-05887` |
| `WALLENBERG:KAW 2021.0173` | Wallenberg Foundation | non-US | 1 |  |  |  |  |  |  | `KAW2021-0173`, `KAW 2021.0173` |
| `WALLENBERG:KAW2024-0039` | Wallenberg Foundation | non-US | 1 |  |  |  |  |  |  | `KAW2024-0039` |
| `WT:092809/Z/10/Z` | Wellcome | non-US | 1 | 8,005,000 | GBP | 360Giving GrantNav | 8,005,000 | yes | SGC consortium | `092809/Z/10/Z` |
| `WT:095598/Z/11/Z` | Wellcome | non-US | 1 | 2,887,699 | GBP | 360Giving GrantNav | 2,887,699 | yes |  | `095598/Z/11/Z` |
| `WT:101477/Z/13/Z?WT101477MA` | Wellcome | non-US | 2 | 1,041,887 | GBP | 360Giving GrantNav |  |  |  | `WT101477MA` |
| `WT:208391/Z/17/Z` | Wellcome | non-US | 4 | 1,526,916 | GBP | 360Giving GrantNav | 1,526,916 | yes |  | `208391`, `208391/Z/17/Z`, `08391/Z/17/Z, 223745/Z/21/Z` |
| `WT:218482/Z/19/Z` | Wellcome | non-US | 1 | 5,685,862 | GBP | 360Giving GrantNav | 5,685,862 | yes |  | `218482/Z/19/Z` |
| `WT:223745/Z/21/Z` | Wellcome | non-US | 3 | 1,544,774 | GBP | 360Giving GrantNav | 1,544,774 | yes |  | `223745/Z/21/Z`, `08391/Z/17/Z, 223745/Z/21/Z` |
