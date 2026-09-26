# Phase 1 — Discovery Strategy Specification

**Status:** **Frozen** · 2026-09-19 · the input to Phases 2–4. Changes from here are made
deliberately, dated, and noted in this header.

**Changes since freezing** (both found while building the Phase 2 sample store):
- *2026-09-19, §6.1:* text is split into sentences structurally. XML block elements
  (paragraphs, headings, affiliations, footnotes, table cells) always end a sentence, and
  `<label>` numbers are dropped from affiliations. Flattening first had glued headings onto
  sentences ("…−80°C. Mass spectrometry Mass spectrometry was carried out…") and produced
  unusable excerpts.
- *2026-09-19, §6.3:* `SEQUEST` and `search engine` were added to the software exclusions. A
  listed paper credited "Sequest HT search engine (The University of Washington's Proteomics
  Resource…)", which is a software credit (C6), not facility use. Effect: recall on the official
  list 202 → 201 of 246 (still 82%); new works unchanged.

**Changes made while implementing M3** (dates are UTC, matching the run manifests):
- *2026-09-20, §6.1, kept parts:* `<back>` is kept as well as the elements already named. Some
  papers write their acknowledgement as a plain `<back><sec><title>Acknowledgments</title>`,
  which `<ack>` does not reach, and a `<sec>` titled that way is treated as the acknowledgements
  section. Effect on list papers: R2 in text 137 → 141, R3 153 → 156.
- *2026-09-20, §6.1, kept parts with no block inside them:* a kept part that contains no block
  element yields its whole text as one block. `<funding-group>` states the award in
  `<award-id>`, which is not a block, so the code was being lost entirely. This is also where
  §6.1's "`<ack>` is searched as a whole, as a fallback" takes effect.
- *2026-09-20, §6.3:* R3 is not applied to affiliation blocks. An author's address naming the
  resource is R5's case, with its own criterion (3, staff in their UWPR role); letting R3 fire
  there as well recorded one fact twice and inflated R3 against §4.2. Nothing is lost: such a
  paper is still included, by R5.
- *2026-09-20, §6.6, the purpose phrase:* it stops at the next person's clause (", Martin Morgan
  for …", "and Phil Gafken for …") as well as at 160 characters. The 160 is a ceiling, and the
  purpose phrase exists precisely because the help-with-work wording may belong to somebody
  else; without the boundary a staff member thanked for mass-spectrometry help was disqualified
  by the discussion wording of the two people thanked after her.
- *2026-09-20, §6.6, the discussion disqualifier:* it no longer vetoes when the purpose phrase
  names a service outright (`technical assistance|support|help`, `data analysis`).
  "…for their discussions and technical assistance" names two things, one of which
  [01a](01a-discovery-calibration.md) C2 decides is UWPR support. Discussion on its own still
  disqualifies, so "for helpful discussions about running the instrument" does not fire.
  Effect of the two §6.6 changes together: R7 on list papers 12 → 16 of the 18 in §4.2.
- *2026-09-20, §6.3, exclusions:* `design` joins the hardware terms and `protocol` the tool
  terms. They are the same case as `plans` and `manufactured` — [01a](01a-discovery-calibration.md)
  C6, "the paper used something UWPR made publicly available" — worded as PRIDE submitters word
  it: "made in-house following the University of Washington Proteomics Resource (UWPR) design"
  and "alkylated as described by a protocol from University of Washington Proteomics Resource".
  Effect: R3 on list papers unchanged at 156; R3d on works off the list 4 → 1, which is the
  figure §4.3 gives.
**Change from the one-time calibration review** (2026-09-20, `rule_version` 2026-09-20.1). The
works found off the official list were reviewed as Phase 1 §2 allows, and 33 of 35 were
confirmed. The two that were not split into a rule change and an override:
- *§6.6 item 5, the deposition disqualifier:* it now also covers **assembling or sharing data**,
  not only the named repositories. [01a](01a-discovery-calibration.md) C4 decided that help
  getting data into a repository is not UWPR support; "technical support in assembling and
  sharing data" is that same act described without naming the repository. Measured effect: of
  the 23 R7 entries in the store it disqualifies exactly one, and that one is off the list, so
  **recall is unchanged at 208/253 (82%)** and R7 falls from 23 works to 21.
- *No rule change for the second:* a bare credit "for their excellent technical assistance" is
  word for word what listed papers say when they credit real UWPR work (compare "for expert
  technical assistance" and "provided technical assistance", both on the list), so narrowing R7
  to reach it would drop papers UWPR itself lists. That one work is excluded by `overrides.yaml`
  instead, which is what an override is for.

**Rule version 2026-09-26.1** (2026-09-26; [08](08-implementation.md) §3.7). Neither change is to a
rule. Both change what the rules read, so the version moves and every work is read again:
- *§6.1, text extraction:* a character reference left in the text after parsing is decoded, if it
  is a numeric one or a known name, and nothing else is. PMC's XML for one listed paper escapes an
  apostrophe twice (`&amp;apos;`), so its funding excerpt read "Washington&apos;s". OpenAlex's raw
  affiliation strings, which R5 reads, are decoded the same way. Effect: two excerpts on one
  listed paper; recall unchanged at 208/253.
- *§8, versions:* `.v1` is a revision suffix, like `-v2` and `/v2`. A revision DOI whose own
  Crossref record states no relation is also asked about without the revision. ChemRxiv's concept
  DOI named the article, and the `….v1` revision named nothing. OpenAlex knew only the revision,
  so one preprint had been included twice. Effect: works 339 → 338; recall unchanged. That
  duplicate was the one case behind "broken titles" below; the title repair it asks for is still
  not built.

**Purpose:** define, precisely enough to implement, how the pipeline finds publications supported
by the UW Proteomics Resource and decides which to include, **without human review**.
**Basis:** [`archive/00-original-handoff.md`](archive/00-original-handoff.md), plus live measurements made on 2026-09-19
against OpenAlex, Europe PMC, NCBI/PMC and Crossref (§4).

---

## 1. Target set

A publication is included if its work **materially used the resource**: instrument access,
computational analysis, or consultation with laboratory or computational staff (UWPR's own
definition, `/collab/`).

Not included:
- papers that only cite or use UWPR-developed software (Comet, Kojak, Limelight, …) or
  hardware designs;
- papers whose only link is a UWPR staff co-author (decision D2).

**Record types** (decided 2026-09-19):
- Included: journal articles, reviews, letters, data papers and book chapters.
- **Preprints are included when no journal version exists yet.** When the journal version
  appears, the two become one work, represented by the journal article. Preprint-only works must
  be labelled as preprints wherever they are displayed.
- Excluded: peer-review reports, recommendation records (e.g. Faculty Opinions), errata,
  paratext, datasets, conference abstracts, and abstract compilations (records whose title
  contains the word "Abstracts", e.g. "Poster Award Finalist Abstracts").
- **Dissertations are excluded.** If the same research also appears as a preprint or a journal
  article, that version is included on its own evidence.
- Repository copies of an article are treated as versions of that article.

## 2. Decision model

- **Fully automated.** Inclusion is decided by the evidence rules in §6. There is no review
  queue.
- **Some false positives are acceptable.** Each rule is chosen for good measured precision and
  documented, so the method can be defended in good faith.
- **Human judgement is used once, to calibrate.** The judgement calls are settled in advance by
  case type ([01a](01a-discovery-calibration.md)) and encoded as rules. They are revisited only
  when a rule's measured performance changes (§11).
- **Discovery and inclusion are separate.**
  - *Channels* (§5) nominate candidates; nomination alone never includes a paper.
  - *Rules* (§6) decide inclusion from evidence found in metadata or text.

### 2.1 The inclusion bar (agreed 2026-09-19)

A publication is included if any of the following is true. Each criterion maps onto rules in §6,
and the rule that fires is recorded as the reason for inclusion.

| # | Criterion | Rules |
|---|---|---|
| 1 | It is listed on UWPR's publications pages | R1 (always wins, §6.0) |
| 2 | The UWPR code is given as funding | R2 |
| 3 | UWPR personnel contributed **in their UWPR role**, and the paper makes that role evident | R3 (UWPR named with the person), R5 (affiliation is the resource), R7 (thanked for analysis or technical help) |
| 4 | UWPR facilities were used | R3 (resource named, including in public dataset descriptions), R4 (early-era name), R6 (OpenAlex full-text phrase) |

On criterion 3, a staff member's name alone does not show them acting in their UWPR role. This
covers co-authorship, advice on someone's software, and help depositing data. For three of the
five staff, only about half of such papers show any UWPR link (§4.7). Where the role *is*
evident, the rules above already catch the paper. So criterion 3 adds no rules beyond R3, R5
and R7.

## 3. Scope decisions (answered 2026-09-19)

| # | Decision |
|---|---|
| D1a | The Diabetes Research Center *Quantitative and Functional Proteomics Core* is **not** UWPR. |
| D1b | The Dept. of Medicine *Mass Spectrometry Resource* is **not** UWPR. It is a separate facility (in use since at least 1995) whose users often also use UWPR. Papers crediting only D1a/D1b cores are included **only** through the official list (R1), never on that credit alone, even though UWPR's list includes most such papers from 2013 on (§4.7). |
| D1c | "University of Washington **South Lake Union Mass Spec Facility**" **is** UWPR (early-era name). |
| D2 | UWPR staff co-authorship alone is **not** sufficient. |
| D3 | UWPR's internal user, billing and booking records will not be used. |
| D4 | Search window starts **2006**. The staff are only Jimmy K. Eng, Vagisha Sharma, Michael R. Hoopmann, Michael Riffle and Priska D. von Haller. **Staff signals count only within each person's UWPR tenure** (§5.1): Hoopmann joined in **2024**; the other four have been there since UWPR began (2006) and still are. |
| D5 | No human review in regular operation (see §2). |
| D6 | Using UWPR's online tools (e.g. the peptide fragmentation calculator) is **not** use of UWPR facilities. Listed papers that only used them stay in through R1. |

## 4. Measurements (2026-09-19)

### 4.1 Corpus examined

- **Official list:** 306 records. 298 have PMIDs; 8 do not.
- **Candidates:** 24 channel queries (§5) produced **1,075 unique candidates**: 298 on the
  official list and 777 not.
- **Full text:** 849 candidates are in PMC. PMC XML with a body was read for 694. 155 PMC
  records have no body text, and 226 candidates are not in PMC at all.
- **After calibration:** OpenAlex phrase searches (R6) added 6 more candidates that no other
  channel found. The figures in §4.2 and §4.3 are for the final calibrated rules.

### 4.2 How well the rules recover the official list

The official list is used as a set of known positives. Of the list papers that can be assessed
automatically (246: a readable body or award metadata), the final rules in §6 find evidence for
**201 (82%)**. R6 adds evidence for 2 of the 52 list papers we cannot read ourselves. In total,
204 of the 298 list papers with a PMID (68%) carry automatic evidence.

| Rule | Fires on list papers | Only rule that fires |
|---|---:|---:|
| R2 identifier in metadata | 111 | 12 |
| R2 identifier in text | 144 | 0 |
| R3 resource named | 159 | 11 |
| R5 staff affiliation is the resource | 28 | 12 |
| R6 OpenAlex full-text proxy | 18 | 1 |
| R7 staff thanked for analysis or technical help | 18 | 0 |
| R3 on dataset descriptions (channel J) | 0 | 0 |
| R4 South Lake Union facility | 1 | 0 |

The remaining **18%** have no automatic evidence. They are mostly HDL papers from one group, and
software papers co-authored by staff. They are on the list through UWPR's own knowledge. §10
covers what this means; an investigation of them is in progress (§14).

Two 2026 list papers mention UWPR only because they used its online peptide fragmentation tool
("…calculated using the University of Washington's Proteomics Resource peptide fragmentation
tool"). Decision C6 excludes that kind of mention, so similar papers not on the list are not
added. These two stay in through R1.

### 4.3 What the rules find beyond the official list

With the final rules, including the sentence-splitting fix and channel J, 74 records not on the
list carry automatic evidence:

| Group | Records |
|---|---:|
| Versions of listed papers, or list entries lacking a PMID | 24 |
| Excluded record types: peer reviews, recommendation records, conference abstracts, a repository copy | 9 |
| **New records** | **41** |

The 41 new records form **37 distinct works**, of which 12 exist only as preprints.

| Evidence behind the new works | Works |
|---|---:|
| More than one rule | 13 |
| R6 only (OpenAlex full-text phrase; text not readable by us) | 8 |
| R3 only (resource named) | 7 |
| R7 only (staff thanked for analysis or technical help) | 5 |
| R2 in metadata only | 2 |
| R5 only | 1 |
| R3 on a dataset description only | 1 |

Precision:
- **First-pass spot-check:** 24 works found, reviewed and approved. 2 false positives were
  removed by rule refinements; 1 remains uncertain (a funding list).
- **Since then:** the R7 purpose-phrase fix removed one further false positive. The
  sentence-splitting fix added one work (fixture H), and channel J added one (fixture J).
- **Not yet verified:** the 9 R6-only works cannot be checked from our own text, although R6
  measured 100% on papers we could check.
- **Probable duplicates:** at least 2 of the 35 are probably versions of listed papers under
  different titles (a galanthamine assay paper and a NUP153 preprint). Version linking by
  Crossref relations, rather than titles, should merge them.

**Estimate: about 32 genuinely new works.**

### 4.4 Channel performance

- "Pass" means the candidate is on the list or passes the rules.
- "Unique new" means new works found by that channel alone.

| Channel | Nominated | Pass | Unique new |
|---|---:|---:|---:|
| Europe PMC identifier full text | 185 | 100% | 0 |
| OpenAlex award metadata | 135 | 100% | 3 |
| OpenAlex identifier full text | 101 | 99% | 0 |
| Crossref award metadata | 63 | 100% | 1 |
| Europe PMC resource-name phrases | 138 | 91% | 0 |
| Europe PMC name variants (widened) | 262 | 81% | 2 |
| Europe PMC acknowledgement proximity | 87 | 98% | 0 |
| Staff affiliation (Europe PMC, OpenAlex) | 51 / 65 | 55% / 51% | 0 |
| Staff authorship (OpenAlex), per person | 17–125 | 17–100% | 0 |
| Staff named in acknowledgements, per person | 44–122 | 5–30% | 0 |

**OpenAlex full-text phrase search** can be used where we cannot read the text ourselves. Its
precision was checked against papers whose PMC text we could read:

| Query | Confirmed |
|---|---:|
| `"Washington's Proteomics Resource"` | 51/51 |
| `"Washington Proteomics Resource"` | 11/11 |
| `UWPR95794` | 57/57 |
| `"Proteomics Resource" "University of Washington"` (two separate phrases) | 51/55 (93%) |

These queries also surfaced 10–20 papers not found by any other channel; they have not yet been
examined.

### 4.5 Staff acknowledgements

**Measured:** 28 candidates off the list are linked only by a staff member being thanked. From
their text, most fall into one of these groups:
- advice on software or standards the staff member develops (Comet/SEQUEST, Kojak, mzML);
- help depositing data in Panorama Public;
- work done while the staff member was at another institution;
- unrelated people who share a staff member's name.

**Conclusion:** a staff acknowledgement alone is not sufficient, except when the staff member is
thanked for data-analysis or technical help (rule R7, decided 2026-09-19). That case is a handful
of papers.

### 4.6 Other observations

- No near-miss identifiers (e.g. `UWPR95749`) were found in about 850 full texts.
- Exact wording varies: "Proteome Resource", "Proteomics Resource at the University of
  Washington", "UW Proteomic Resource (UWPR)", the curly apostrophe in "Washington’s", and the
  mangled identifier `UWPR95794UWPR`.
- "UWPR" also appears in software URLs (`github.com/UWPR/Comet`), hardware names ("UWPR
  nanospray source") and figure labels.
- Fred Hutch has its own "Proteomics Resource" in Seattle.

### 4.7 The unexplained official-list papers

An investigation examined the 43 official-list papers that have readable text but no automatic
evidence. It asked whether any pattern in them could find unlisted UWPR papers precisely enough
to act as an inclusion rule on its own. **None could.**

**What the 43 are:**

| Group | Papers |
|---|---:|
| HDL/lipoprotein papers (Vaisar, Heinecke, Shao or Bornfeldt co-author). 9 credit only the D1a/D1b cores, 4 cite only the core's grant P30DK017047, and 12 credit no facility at all. The same labs credit UWPR explicitly in 18 other listed papers. | 25 |
| Cross-linking papers from the Bruce lab | 4 |
| Staff co-author, no acknowledgement (Crux, Panorama, PEFF, a data descriptor, a 2010 paper) | 5 |
| Staff thanked without UWPR named | 2 |
| Other UW mass-spectrometry papers with no signal | 7 |

**Patterns tested.**
- "Proxy precision" is the share of the extra papers a pattern would pull in that show any UWPR
  link (on the list or passing a rule), with the 43 themselves set aside.
- None reached a usable level:

| Pattern | Proxy precision | Papers added |
|---|---:|---:|
| Lab / PI clusters, even the best (any HDL PI + MS content, 2012 on) | 0.43 | 44 |
| Methods fingerprints (instruments, software stacks) | ≤ 0.50 | — |
| Grants, including P30DK017047 | ≤ 0.57 | — |
| UW departments | ≤ 0.17 | — |
| Co-author networks (≥ 5 shared authors) | 0.54 | ~76 |
| Dataset submitters | no pattern | — |

**Staff signals** (share of papers showing a UWPR link):

| Signal | Share | Papers added |
|---|---:|---:|
| Eng co-author, 2012 on | 39/39 | 12, mostly preprints of listed papers |
| von Haller co-author | 17/17, all already listed | 0 |
| von Haller thanked, any wording | 25/26 | 1 |
| Riffle co-author | ~0.51 | 48 |
| Sharma co-author | ~0.55 | 15 |
| Hoopmann co-author, 2024 on | ~0.55 | 14 |

Not adopted as rules, because the gain is small or the UWPR role is not evident (§2.1).

**The two excluded cores.**
- UWPR's list includes 15 of 19 papers crediting them from 2013 on, but only 1 of 10 before.
- Under D1a and D1b they are still not evidence.

**Findings adopted:**
- the sentence-splitting fix for staff initials (§6.1);
- the `von Hal+er` misspelling (§6.6);
- PRIDE dataset descriptions as an evidence source (§5, §7).

**Conclusion:** about 26 of the 43 are findable only through the official list. Similar
unlisted papers are not reachable automatically; accepted (§10).

Of the 52 unreadable list papers, OpenAlex full text found UWPR evidence in 2 more; 44 remain
unreadable through any open source.

## 5. Channels (nominators)

Every channel emits candidate records: DOI, PMID or PMCID, plus the channel ID. Channels run
from 2006 onward.

| ID | Channel | Query | Keep? |
|---|---|---|---|
| A | Official list | Scrape all year pages; parse `<li><b>title</b> authors <i>journal</i> date <a>PMID</a></li>` | Yes |
| B1 | OpenAlex award | `awards.funder_award_id:UWPR95794` | Yes — largest unique yield |
| B2 | Crossref award | `filter=award.number:UWPR95794` | Yes |
| C1 | Europe PMC identifier | `"UWPR95794" OR "UWPR 95794" OR UWPR*` | Yes |
| C2 | OpenAlex identifier full text | `fulltext.search:UWPR95794` | Yes |
| D1 | Europe PMC name | (`"Proteomics Resource"` OR `"Proteome Resource"` OR `"Proteomics Resource Center"` OR `"Proteomics Resource at"`) AND `"University of Washington"`; plus `ACK_FUND:"Proteomics Resource" AND ACK_FUND:"Washington"` | Yes |
| D2 | OpenAlex name full text | `"Washington's Proteomics Resource"`, `"Washington Proteomics Resource"`, `"Proteomics Resource" "University of Washington"` | Yes — also the text-evidence proxy (R6) |
| D3 | Early-era names | Europe PMC and OpenAlex full text: `"South Lake Union"` AND (`"mass spec"` OR `"proteomics"`) AND `"University of Washington"` | Yes — cheap, era-specific |
| F | Staff affiliation | Europe PMC `AFF:"Proteomics Resource" AND AFF:"University of Washington"`; OpenAlex `raw_affiliation_strings.search:"proteomics resource" washington` | Yes |
| G | Staff authorship | OpenAlex `author.id:` for the verified IDs in §5.1 | Yes — cheap; staff papers are the likeliest to carry evidence |
| E | Staff named in acknowledgements | Europe PMC `ACK_FUND:"<name variant>"` for each staff member | Yes — nominates candidates for R7 |
| J | Dataset descriptions | PRIDE / ProteomeXchange search for "Proteomics Resource" and "UWPR"; the dataset's protocol and description text, and its linked publications (PMID/DOI) | Yes — the text is checked with R3 (§6.3). Found one paper nothing else found (PXD011642 → PMID 32613749). |
| — | Dept. of Medicine MS Resource, DRC core | — | Dropped (D1a, D1b) |
| — | PI roster, instruments, dataset submitters, citation graph | — | Not used (§4.7 measured them). They nominate papers that the §6 rules would then have to confirm from text. Papers with no textual evidence are the gap, and no pattern reaches them precisely enough to include without text (§4.7). |

### 5.1 Staff author IDs (OpenAlex)

| Person | OpenAlex IDs | ORCID | At UWPR from |
|---|---|---|---|
| Jimmy K. Eng | A5011565192 | 0000-0001-6352-6737 | 2006 (current) |
| Michael Riffle | A5067746093, A5134114528 | 0000-0003-1633-8607 | 2006 (current) |
| Michael R. Hoopmann | A5018903678 | 0000-0001-7029-7792 | **2024** (current) |
| Vagisha Sharma | A5101918119 | 0000-0003-1922-439X | 2006 (current) |
| Priska D. von Haller | A5083225847, A5061349330 | — | 2006 (current) |

**Tenure rule.** A staff signal counts only when the paper's publication year is within that
person's tenure (start year through end year, if any). The signals are: R7 acknowledgements,
the staff-authorship channel G, and staff co-authorship used in any pattern. Without it,
Hoopmann's earlier work (e.g. at the Institute for Systems Biology) would be misread as UWPR
support. R5 (affiliation) needs no tenure check, because the affiliation itself names the
resource.

Same-name authors exist; for example, a second "Vagisha Sharma" (A5068604239) publishes in
medicine. The pipeline uses only the IDs above. It checks them each run against ORCID, and
flags new IDs that carry the same ORCID.

## 6. Inclusion rules (deciders)

A work is **included if any rule fires** on any version of it (§8). The run records every rule
that fires, with its source and excerpt, as provenance.

| Rule | Evidence | Where checked |
|---|---|---|
| **R1** | Record is on the official list — **always included**, whatever the other rules say (§6.0) | Matched by PMID, DOI or normalised title (§8) |
| **R2** | `UWPR95794` in structured award metadata, **or** in the text after normalisation | OpenAlex `awards[].funder_award_id`; Crossref `funder[].award[]`; full text |
| **R3** | The resource is named in the text | Full text (§7) |
| **R4** | The South Lake Union facility is named | Full text |
| **R5** | An author affiliation is the resource | JATS `<aff>`; OpenAlex raw affiliation strings |
| **R6** | OpenAlex full-text phrase hit (proxy for text we cannot read) | Queries in §6.5 |
| **R7** | A staff member is thanked for data-analysis or technical help, without UWPR being named | Full text, acknowledgement-type sentences (§6.6) |

### 6.0 R1 — the official list always wins

Decided 2026-09-19. Every publication on UWPR's publications pages is included, even when no
other rule fires, and even when the calibration decisions would otherwise exclude it (e.g. the
two papers that only used UWPR's online fragmentation tool, §4.2).

- **Reason of inclusion.** "Listed on UWPR's publications page", with the page URL (year
  page), the date the listing was first seen, and the date it was last seen. It is recorded
  alongside any other evidence found, so the knowledge base can show both.
- **For list-only works** (no other rule fires) it is the sole reason shown.
- **If a paper later disappears from the site,** it stays included (principle 3 in
  [00](00-project-phases.md)). The reason reads "Listed on UWPR's publications page from
  <first seen> to <last seen>", and the run report flags the removal.

**Never sufficient on its own:**
- a staff co-author;
- a staff member thanked for anything other than R7's cases;
- the other two cores (Dept. of Medicine MS Resource, DRC core) named;
- UWPR software or hardware cited;
- a near-miss identifier;
- appearing in any nominating channel.

### 6.1 Text normalisation (applies to R2–R5)

1. Unicode NFKC normalisation.
2. Strip XML tags and collapse whitespace.
3. **Remove** these parts of the paper: the reference list (`<ref-list>`), tables
   (`<table-wrap>`), and the author list (`<contrib-group>`).
4. **Keep** these parts: the body, `<ack>`, `<funding-group>`, `<author-notes>`, `<fn-group>`,
   `<notes>`, and supplementary-material captions. Acknowledgement text appears in all of them.
5. **Block boundaries end sentences** (changed 2026-09-19). Walk the XML tree. Each leaf block
   element — `p`, `title`, `aff`, `fn`, `td`, `th`, `li`, `caption`, `funding-statement` — is
   split into sentences on its own; text is never merged across blocks. `<label>` content (e.g.
   affiliation numbers) is dropped. The block's position gives the evidence section:
   - inside `ack`: acknowledgements;
   - inside `funding-group`: funding;
   - inside `author-notes` or `fn-group`: author notes;
   - inside `aff`: affiliation;
   - inside a `sec` whose title (or an ancestor section's title) names methods, materials,
     experimental procedures or mass spectrometry: methods;
   - otherwise: main text.
6. Within a block, split the text into sentences on `.` and `;` followed by whitespace, **except after an
   initial or title**: a single capital letter, a run of initials like "P.D.", or `Dr`, `Prof`,
   `et al`, `e.g`, `i.e`, `Fig`, `Ref`. The first version split "P. D. von Haller" and
   "…, W. Conrad, P. von Haller", which hid 11 staff acknowledgements, one of them a new paper
   (PMID 21875946). Acknowledgement blocks (`<ack>`) are also searched as a whole, as a
   fallback.

### 6.2 R2 — identifier

- **Pattern:** remove all non-alphanumeric characters, uppercase the text, and test for the
  substring `UWPR95794`.
- **Why a substring:** it handles `UWPR 95794`, `UWPR-95794` and `UWPR95794UWPR`.
- **Near misses** matching `UWPR[\s\-_:#]*\d{4,6}` are logged only; they are not evidence
  (none observed).

### 6.3 R3 — resource named

**Matches** (within one sentence):
- `UW` = `University of Washington('s|’s)?` or `\bUW('s|’s)?\b`
- `RES` = `Proteom(ics|e) Resources?( Cent(er|re)| Facility| Core)?` (case-insensitive)
- A match is either `UW` followed within 40 characters by `RES`, or `RES` followed within 40
  characters by `UW`.
- Or the token `UWPR`, matched case-sensitively and not inside a URL path.

**Mentions.** Matches no more than 20 characters apart are merged into one mention, e.g.
"University of Washington Proteome Resource (UWPR". Exclusions are checked on the whole mention;
checking each match on its own let "(UWPR" escape an exclusion that applied to the phrase next
to it.

**Exclusions.** Discard a mention if the 40 characters on either side of it contain any of the
following:
- a URL or repository path: `github`, `/UWPR`, `proteomicsresource.washington.edu/`;
- a hardware or protocol term: `nanospray`, `NSI source`, `nano-ESI`, `source`, `plans`,
  `manufactured`;
- a software term: `Comet`, `Lorikeet`, `Kojak`, `Hardklor`, `Limelight`, `SEQUEST`,
  `search engine`, `calculator`, `tool(s)` (this covers UWPR's online peptide fragmentation tool,
  §4.2, and software credited to UWPR, e.g. "Sequest HT search engine (The University of
  Washington's Proteomics Resource)", added 2026-09-19);
- another organisation: `Fred Hutch`, `FHCRC`, `Hutchinson`.

The exclusion vocabulary lives in configuration and is covered by the regression fixtures (§12).

### 6.4 R4 and R5

- **R4:** `South Lake Union` followed within 40 characters by `Mass Spec…|Proteomics`, then
  within 20 characters by `Facility|Resource|Core`.
- **R5:** a single affiliation string contains `RES` **and** `University of Washington`, and
  contains no other-organisation term from §6.3.

### 6.5 R6 — OpenAlex full-text proxy

- **Applies to:** records with no readable text of our own (PMC body missing or not in PMC).
- **Fires when:** OpenAlex full-text search matches `"Washington's Proteomics Resource"`,
  `"Washington Proteomics Resource"` or `UWPR95794`. Measured precision is 100% (§4.4). This
  rule covers the diatom fixture (§12), whose text is not in PMC.
- **The two-phrase query** (93% precise) only nominates; it does not include.
- **Mechanism:** each run executes the three queries (about $0.003 in total). R6 fires for any
  record whose DOI is in their results.

### 6.6 R7 — staff thanked for analysis or technical help

Decided 2026-09-19 (calibration C2). R7 fires when **all** of the following hold. The thanks verb may come from the same sentence or
the one before. Items 4 and 5 are tested on the **purpose phrase**: the "for …" phrase that
follows the staff name, up to 160 characters, within the sentence.

A first version tested the whole sentence. It fired on "…the Proteomics Facility at the FHCRC
for help with MS, and Jimmy Eng … for advice with using X!Tandem", where the help-with-work
wording belonged to other people.

1. **A staff name in full form.** The forms are listed in configuration: "Jimmy Eng",
   "Jimmy K. Eng", "J. K. Eng", "Michael Riffle", "Mike Riffle", "Michael Hoopmann",
   "Michael R. Hoopmann", "Vagisha Sharma", "Priska von Haller", "Priska Van Haller",
   "P. von Haller", "P. D. von Haller", "Dr. von Haller", with `Hal+er` to allow the observed
   misspelling "von Haler". A bare surname does not count.
2. **The staff member is not an author** of the paper (checked against `<contrib-group>` and
   OpenAlex authorships).
3. **A thanks verb:** `thank|acknowledg|grateful|indebted|appreciat`.
4. **Help-with-work wording:**
   - `data analysis`, `analy[sz]…` of samples, data, spectra, proteins or peptides;
   - `technical assistance`, `technical support`, `technical help`;
   - `mass spectromet…` combined with `analy…`, `experiment…`, `support`, `assist…` or `help`;
   - `instrument`, `access`, `acqui…`, `perform…`, `carried out`, `ran`, `run`;
   - `assistance with` or `help with` followed by any of these.
5. **None of these disqualifiers:**
   - discussion wording: `discussion|conversation|comment|correspondence|feedback|critical reading|manuscript`;
   - development or contribution wording: `contribut… to|development of|design of|guidance in the development`,
     or software-use advice `advice with/on using|the use` (calibration C3);
   - repository-deposition wording: `Panorama|ProteomeXchange|PRIDE|deposit` (C4: not UWPR support);
   - another institution next to the staff name: `Institute for Systems Biology|ISB` (C5).
6. **Within tenure:** the paper's publication year falls within the staff member's UWPR tenure
   (§5.1). For example, a pre-2024 acknowledgement of Hoopmann never fires R7.

The first-pass detector missed "assistance with data analysis and visualization". Item 4 was
widened to cover it; the kinetochore paper in [01a](01a-discovery-calibration.md) C2 is a
positive fixture.

## 7. Text sources

Checked in order; the first readable source is used, and all identifiers are recorded.

1. **NCBI PMC `efetch` (db=pmc).** Returns JATS XML, including author manuscripts that Europe
   PMC's own full-text endpoint refuses (HTTP 500 for non-open-access records).
2. **Europe PMC `fullTextXML`** for open-access records not yet in NCBI.
3. **OpenAlex full-text proxy** (R6), when neither of the above has a body.
4. **Dataset descriptions** (channel J): PRIDE / ProteomeXchange protocol and description text
   for datasets linked to the publication. R3 is applied to them. They are recorded as
   evidence with section "dataset description" and the dataset accession.

**Contact address.** OpenAlex (`mailto`), Crossref (`mailto`) and NCBI E-utilities
(`email`/`tool`) ask for a contact address. Use `mriffle@uw.edu` (approved 2026-09-19), set in
configuration rather than hard-coded. No other personal address is sent to any service.

Identifiers are resolved with the NCBI ID converter. Send PMIDs and DOIs in **separate** typed
requests (`idtype=pmid` / `idtype=doi`); mixed batches are rejected. This conversion found PMC
copies for 139 candidates that the search APIs had reported without a PMCID.

A record with no readable source is recorded as `fulltext: unavailable`. It can still be
included by R1, R2 (metadata) or R5 (OpenAlex affiliations).

**Not available: publisher text-and-data-mining APIs.** These (Elsevier, Wiley, Springer Nature,
ACS) require UW Libraries entitlements, which this project will not have (decided 2026-09-19).
Paywalled papers outside PMC and OpenAlex's full-text index are therefore read only through
metadata (R2, R5) and R6.

## 8. Matching and versions

- **Same record:** DOI → PMID → PMCID → OpenAlex ID.
- **Official-list entries without a PMID** (8 today): match on normalised title (lowercase,
  alphanumerics only), similarity ≥ 0.85, plus year ±1. Four of these were wrongly counted as
  "new" in the first pass. Where a DOI link is present, match on it first. Where neither
  matches, record a list-only work so R1 still counts it.
- **Versions (work families):** link records by:
  - Crossref `relation` (`is-preprint-of` / `has-preprint`);
  - the bioRxiv/medRxiv API `published` field;
  - OpenAlex `locations`;
  - failing those, title similarity ≥ 0.85 plus first-author match plus year difference ≤ 2.
- **Rule evidence on any version applies to the whole family.** 22 of the 55 off-list rule
  hits were versions of listed papers, so this step matters.
- **Record-type filter (§1):** use OpenAlex `type` and Crossref `type`. Also excluded, whatever
  their type:
  - DOI prefixes `10.7287/…/reviews` (PeerJ reviews) and `10.3410/f.` (Faculty Opinions);
  - titles containing "Abstracts".

  Repository copies (e.g. prefix `10.17615`) become versions of the article they copy.
- **Broken titles:** some preprint records carry a file name as their title (e.g.
  `1_manuscript_2020-04-14.pdf`). Take the title from Crossref or the preprint server instead.

## 9. Early years (2006–2010)

- **What the list shows:**
  - The official list has nothing for 2006–2007 and 4 papers for 2008.
  - The identifier was in use by 2009, and the acknowledgement sentence without the number by
    2008.
  - Full-text search for 2006–2009 found almost nothing beyond the list. PMC full-text coverage
    of older papers is thinner, so this is a coverage limit rather than evidence that no such
    papers exist.
- **Era-specific measures:**
  - rule R4 (South Lake Union facility);
  - channel D3;
  - Europe PMC and OpenAlex full-text searches for the staff-name misspellings `"Van Haller"`
    and `"vonHaller"`, which feed R3 and R4 checks.
- **Recall stays lower for this era, and this is accepted.** The papers most likely to be
  missing are instrument-access acknowledgements in paywalled chemistry journals (like the IJMS
  fixtures). No available source reaches them.

## 10. Known recall limits

| Gap | Size (measured) | Mitigation |
|---|---|---|
| Supported papers with no textual trace of UWPR | ~18% of assessable official-list papers (about 26 of the 43 have no usable signal of any kind, §4.7) | Official list (R1) covers the listed ones. Unlisted ones are not reachable automatically; no pattern is precise enough (§4.7). Accepted. |
| Text not machine-readable (no PMC body, not in PMC, not in OpenAlex full text) | 381 of 1,075 candidates have no body text of our own | R2/R5 metadata; R6 proxy. Accepted. |
| Paywalled acknowledgements of instrument access, mostly early years | Fixtures B, B2 | None available (no publisher TDM access). Accepted. |

## 11. Quality measurement (every run)

- **Recall on the official list:** the share of assessable list papers on which R2–R7 fire.
  Baseline 82% (201 of 246). A fall of more than 5 points signals a broken detector or a changed source.
- **Per-rule and per-channel counts** against a trailing average; alert on sharp changes.
- **Fixtures** (§12) must all produce their expected outcome.
- **Excerpt log:** every new inclusion from R3–R6 is written to the run report with its
  excerpt. This keeps the automatic decisions auditable without requiring anyone to review them.

## 12. Regression fixtures

| Fixture | DOI | Expected | Result 2026-09-19 |
|---|---|---|---|
| A ISME metaproteomics | 10.1038/ismej.2016.132 | R2 text; `UWPR59794` absent | ✔ |
| B IJMS aminoketyl (von Haller, LTQ XL) | 10.1016/j.ijms.2010.06.025 | **Known miss** (accepted): paywalled, not in PMC or OpenAlex full text | ✘ as expected |
| B2 IJMS histatin (von Haller) | 10.1016/j.ijms.2010.08.021 | **Known miss** (accepted): as B | ✘ as expected |
| C Diatom protein in seawater | 10.3389/fmars.2021.757245 | Include | ✔ via R6 (`"Washington Proteomics Resource"`) |
| D Casanovo article + preprint | 10.1021/acs.jproteome.5c00706 | R2 metadata; one family | ✔ |
| E APOA2 on HDL | 10.1016/j.jlr.2026.101113 | R2 | ✔ |
| F Nettle preprint | 10.1101/2025.05.27.656394 | R2 | ✔ |
| G Fragmentation-tool user on the list | PMC13012085 (EpeE, 2026) | R1 only; R3 excluded by C6/D6 | ✔ |
| H Initials in acknowledgement | PMID 21875946 (J Cell Biol 2011, "P. von Haller … for technical assistance") | R7 after the sentence-splitting fix | ✔ |
| I Misspelt name | PMID 22669761 ("Dr. Priska von Haler") | Staff name matched (paper is also R1, R3) | ✔ |
| J Dataset description | PXD011642 → PMID 32613749 | R3 via dataset text | ✔ |

Known misses are monitored: if B or B2 ever start passing (e.g. OpenAlex indexes their full
text), the change is reported.

**Negative fixtures** (must *not* be included):
- a paper citing `github.com/UWPR/Comet`;
- a paper using the "UWPR nanospray source";
- the 2010 SAWN paper (stage built "according to plans from" UWPR);
- the Hunt Lab guide (UWPR in a list of tools);
- a Fred Hutch "Proteomics Resource" affiliation;
- a Panorama Public deposition acknowledgement;
- a staff member thanked while at the Institute for Systems Biology;
- a peer-review record carrying the award ID;
- a paper crediting only the DRC core or Dept. of Medicine MS Resource, not on the list;
- a paper whose only UWPR mention is the online fragmentation calculator, not on the list.

## 13. Outputs handed to later phases

For every included work, Phase 1 hands on the following. The knowledge base (Phase 4) presents
this record as each page's "How we know this is a UWPR publication" section, so it must be
complete and readable on its own.

- **Evidence list.** One entry per rule that fired, on any version of the work:
  - the rule ID and a plain-language label (e.g. "Acknowledgement names the UW Proteomics
    Resource");
  - the source (PMC, Europe PMC, OpenAlex, Crossref or the UWPR website), with URL and
    retrieval date;
  - which version it was found on (preprint or article);
  - the section of the paper (acknowledgements, funding, methods, affiliation or metadata);
  - the excerpt (the matching sentence, at most about 300 characters).
  - For R1 there is no excerpt: record the list page URL and the first-seen and last-seen dates.
  - For R6 there is no excerpt: record "phrase found in OpenAlex full-text index", the phrase,
    and the query date (accepted 2026-09-19).
- **Discovery trail.** The channels that nominated the work, and when each first saw it.
- **Text and metadata already retrieved.** The full-text XML or abstract, author list,
  affiliations and OpenAlex topics, kept so that summaries and subject tagging need no second
  retrieval.

## 14. Open items

None for Phase 1 beyond the exit criteria below.

**Settled 2026-09-19:**
- R6-only works are accepted.
- Publisher text-mining APIs are not available.
- The official list always wins (§6.0).
- The inclusion bar (§2.1): staff count only when acting in an evident UWPR role.
- Cores (D1b): included only through the list.
- Online tools (D6): not facility use.
- Contact address (§7).
- The unexplained papers (§4.7): no usable pattern; three findings adopted.

## 15. Exit criteria

- [x] Scope decisions D1–D5.
- [x] Staff channels run in full; per-channel precision and unique yield measured.
- [x] Candidates beyond the official list examined; rule precision estimated.
- [x] Calibration answers recorded; rules updated to match (C1–C7, preprints, staff tenure).
- [x] Rules re-measured after calibration: recall on the official list is 82%.
- [x] Unexplained official-list papers investigated (§4.7).
- [x] Adopted fixes (sentence splitting, `Hal+er`, channel J) re-measured: recall on the official
  list unchanged at 82%; new works about 32; fixtures H, I and J pass.
- [x] Channel and rule tables frozen as the input to Phase 3 (2026-09-19).
