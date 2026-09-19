# UW Proteomics Resource (UWPR) Publication Discovery and Bibliometrics
## Technical handoff for a command-line development agent

**Status date:** 2026-09-19  
**Primary identifier of interest:** `UWPR95794`  
**Resource:** University of Washington Proteomics Resource (UWPR)  
**Goal:** Build as complete and defensible a corpus as possible of publications supported by the UW Proteomics Resource, then calculate bibliometric summary statistics. The corpus should not be limited to papers whose structured funding metadata contains the exact string `UWPR95794`.

---

## 1. Executive summary

The initial idea was to query OpenAlex for works whose award metadata contains `UWPR95794`. That is useful, but it is not sufficient for a high-recall census of UWPR-supported publications.

The central finding from the investigation so far is:

> **"UWPR-supported publication" and "publication carrying `UWPR95794` in machine-readable funding metadata" are not equivalent sets.**

There are several reasons:

1. UWPR is a core/resource facility, not a conventional grant program. Support may consist of instrument access, data analysis, consultation, software/bioinformatics work, or staff effort.
2. The UWPR itself explicitly defines publication support that broadly.
3. Some genuine UWPR papers acknowledge the resource by name but contain **no `UWPR95794` identifier at all**.
4. Some papers contain the identifier in prose/full-text acknowledgements but that identifier is omitted from PubMed or other structured funding metadata.
5. Formatting varies (`UWPR95794`, `UWPR 95794`, prose around the identifier, etc.).
6. The official UWPR publication list is a very strong curated source, but it is itself not complete and contains version-level duplicates such as preprint/final-publication pairs.
7. Papers authored by UWPR personnel are useful candidates, but author membership alone is not adequate evidence that the resource supported the work.

The recommended master corpus is therefore the **union** of:

- UWPR's official publication list;
- exact and normalized award-ID matches from OpenAlex/Crossref/etc.;
- explicit full-text acknowledgements of UWPR, including instrument/data-analysis support;
- fuzzy/variant `UWPR` identifier candidates;
- publications of known UWPR personnel as a **candidate-discovery stream**, followed by evidence review.

Every record should retain provenance/evidence so that strict and broad analyses can both be produced.

---

## 2. What counts as UWPR support?

The most important source is UWPR's own stated policy.

UWPR says that support for publications may involve:

- instrument access;
- computational analysis;
- consultation with laboratory staff;
- consultation with computational staff;
- related work performed at the Resource.

UWPR asks authors to acknowledge the resource with language equivalent to:

> This work is supported in part by the University of Washington's Proteomics Resource (UWPR95794).

This strongly argues against defining the corpus as "papers funded by grant UWPR95794." The desired concept is closer to:

> **Papers whose work was materially supported by the University of Washington Proteomics Resource.**

Primary sources:

- Publications: https://proteomicsresource.washington.edu/publications/
- Collaboration/publication policy: https://proteomicsresource.washington.edu/collab/
- Current UWPR home page: https://proteomicsresource.washington.edu/
- Current contacts: https://proteomicsresource.washington.edu/contact/

---

## 3. Known UWPR personnel / principals

The user supplied these names as key UWPR personnel and noted that many of their papers are likely UWPR-related, although not necessarily all of them:

- Jimmy K. Eng
- Vagisha Sharma
- Michael R. Hoopmann
- Michael Riffle
- Priska von Haller

Current UWPR contact information independently confirms Hoopmann, Eng, Riffle, and Sharma as UWPR software/data-analysis contacts:

https://proteomicsresource.washington.edu/contact/

Historical UWPR material identifies:

- Priska von Haller — UWPR lab management
- Jimmy Eng — bioinformatics management
- Vagisha Sharma — software developer
- Michael Riffle — software developer

Historical source:

https://www.proteomicsresource.washington.edu/docs/20120709_UWPRworkshop_Intro.pdf

Recent UWPR safety documentation also identifies Priska von Haller with the UW Proteomics Resource, so she remains a useful historical/current discovery name even though she is not displayed in the current short contact list.

**Important rule:** do not automatically classify every paper by one of these people as UWPR-supported. Use these authors to construct a candidate pool and then look for stronger evidence.

---

## 4. Official UWPR publication list: current observed counts

As of 2026-09-19, the official UWPR site contains a working total of **300 publication records**.

Observed counts:

| UWPR page | Records |
|---|---:|
| 2026 | 5 |
| 2025 | 22 |
| 2024 | 16 |
| 2023 | 9 |
| 2022 | 18 |
| 2021 and previous | 230 |
| **Total** | **300** |

URLs:

- 2026/current: https://proteomicsresource.washington.edu/publications/
- 2025: https://proteomicsresource.washington.edu/publications/2025/
- 2024: https://proteomicsresource.washington.edu/publications/2024/
- 2023: https://proteomicsresource.washington.edu/publications/2023/
- 2022: https://proteomicsresource.washington.edu/publications/2022/
- older: https://proteomicsresource.washington.edu/publications/older/

The CLI agent should **re-scrape and verify these counts**, because the site may change.

### Why this list is particularly valuable

The page itself says the listed papers are supported through instrument access, computational analysis, staff consultation, etc. Therefore this is not simply a search result for a grant string: it is effectively a curated resource-use bibliography.

Treat presence on this list as strong evidence of UWPR support.

---

## 5. The official list is not complete

Several independently verified UWPR-supported works are absent from the current official list.

These are useful both as additions and as **regression-test fixtures** for the discovery pipeline.

### 5.1 Proper and improper aminoketyl radicals in electron-based peptide dissociations

**Citation**

Thomas W. Chung and František Tureček.  
*Proper and improper aminoketyl radicals in electron-based peptide dissociations.*  
International Journal of Mass Spectrometry 301 (2011), 55-61.  
DOI: `10.1016/j.ijms.2010.06.025`

Source:

https://www.sciencedirect.com/science/article/pii/S1387380610002083

**Evidence**

The acknowledgement explicitly thanks Dr. Priska von Haller of the University of Washington Proteomics Resource Center for access to the Thermo LTQ XL instrument.

The structured funding mentioned there is NSF funding; the acknowledgement does **not** use `UWPR95794`.

This paper is not present on the current UWPR older-publications page.

**Why this is important**

This is a clean demonstration that an exact funding-ID query cannot recover all genuine UWPR-supported papers.

---

### 5.2 Amplified histidine effect in electron-transfer dissociation of histidine-rich peptides from histatin 5

**Citation**

Thomas W. Chung and František Tureček.  
*Amplified histidine effect in electron-transfer dissociation of histidine-rich peptides from histatin 5.*  
International Journal of Mass Spectrometry 306 (2011), 99-107.  
DOI: `10.1016/j.ijms.2010.08.021`

Accessible full-text copy found at:

https://www.lookchem.com/FreePDFArticle/163716-48-1.htm

**Evidence**

The acknowledgement thanks Dr. Priska von Haller of the University of Washington Proteomics Resource Center for access to the Thermo LTQ XL.

No `UWPR95794` string was observed in that acknowledgement.

This title was not found on the current UWPR older-publications page.

**Caution**

The accessible acknowledgement was seen through a third-party full-text copy. The implementation should verify it against the publisher PDF or another authoritative copy if accessible.

---

### 5.3 Degradation of Diatom Protein in Seawater: A Peptide-Level View

**Citation**

Megan E. Duffy et al.  
*Degradation of Diatom Protein in Seawater: A Peptide-Level View.*  
Frontiers in Marine Science 8 (2022), 757245.  
DOI: `10.3389/fmars.2021.757245`

Source:

https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2021.757245/full

**Evidence**

Funding is listed as NSF funding.

Separately, the acknowledgements explicitly thank Priska von Haller at the University of Washington Proteomics Resource Center for assistance.

No `UWPR95794` identifier is needed to establish resource involvement.

The work is not present on the current 2022 UWPR list.

---

### 5.4 Improved quantitative accuracy in data-independent acquisition proteomics via retention time boundary imputation ("Nettle")

**Citation**

Lincoln J. Harris, Michael Riffle, William Stafford Noble, Michael J. MacCoss.  
*Improved quantitative accuracy in data-independent acquisition proteomics via retention time boundary imputation.*  
bioRxiv (2025).  
DOI: `10.1101/2025.05.27.656394`

Sources:

- https://www.biorxiv.org/content/10.1101/2025.05.27.656394v1
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12154835/

**Evidence**

The full text contains `UWPR95794`.

The title was not found on the current UWPR 2025 publication page.

---

### 5.5 Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer

**Final article**

*Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer.*  
Journal of Proteome Research 25(2) (2026), 755-764.  
DOI: `10.1021/acs.jproteome.5c00706`

Publisher:

https://pubs.acs.org/doi/10.1021/acs.jproteome.5c00706

**Preprint**

DOI: `10.1101/2025.07.25.666826`

https://www.biorxiv.org/content/10.1101/2025.07.25.666826v1

**Evidence**

Both the preprint and final publisher metadata explicitly identify:

- University of Washington / University of Washington Proteomics Resource
- award ID `UWPR95794`

The final 2026 article was not among the five works visible on the current UWPR 2026 publication page at the time of this investigation.

**Deduplication note**

The preprint and published paper should be represented as a single **work family** for paper-level statistics, while preserving both manifestations/records.

---

### 5.6 A model of human APOA2 on HDL

**Citation**

Yi He et al.  
*A model of human APOA2 on HDL.*  
Journal of Lipid Research (2026).  
DOI: `10.1016/j.jlr.2026.101113`

Sources:

- https://www.jlr.org/article/S0022-2275%2826%2900143-4/fulltext
- https://pmc.ncbi.nlm.nih.gov/articles/PMC13505420/

**Evidence**

The article explicitly thanks the Proteomics Resource and includes `(UWPR95794)`.

It was not one of the five items displayed on the current UWPR 2026 publication page during this investigation.

---

## 6. Working lower bound before full programmatic reconciliation

The official site contains **300 raw publication records**.

At least six additional work-level candidates with direct evidence of UWPR support were independently identified during this investigation.

Therefore:

- **300** is not a complete count.
- A naive "300 + 6 = 306" can be used as a **raw confirmed-record lower-bound indicator**, but **must not be reported as the final number of unique papers** until version-level deduplication is performed.
- Preprints and final publications can represent the same scientific work.
- The next agent should construct explicit `record` and `work_family` layers.

The real final count may be higher than this lower bound because the search performed here was exploratory rather than exhaustive.

---

## 7. Version duplication exists inside the official UWPR list

The UWPR site can list a preprint in one year and its final article in another.

Observed example:

### 2023
*MultiomicsTracks96: A high throughput PIXUL-Matrix-based toolbox to profile frozen and FFPE tissues multiomes.*  
Mar D, Babenko IM, Zhang R, Noble WS, Denisenko O, Vaisar T, Bomsztyk K.  
bioRxiv preprint.

### 2024
*A High-Throughput PIXUL-Matrix-Based Toolbox to Profile Frozen and Formalin-Fixed Paraffin-Embedded Tissues Multiomes.*  
Mar D, Babenko IM, Zhang R, Noble WS, Denisenko O, Vaisar T, Bomsztyk K.  
Laboratory Investigation.

These appear to be versions of the same work.

**Implication:** publication-site record count is not identical to unique scholarly work count.

Recommended data model:

- `manifestation_id`: each preprint/article/database record
- `work_family_id`: all versions of the same intellectual work

For most bibliometric reporting, use the final published article as the canonical manifestation when one exists.

---

## 8. Formatting variants of `UWPR95794`

Confirmed/expected representations to normalize include at least:

```text
UWPR95794
UWPR 95794
UWPR-95794
UWPR_95794
UWPR:95794
UWPR #95794
```

The spaced form `UWPR 95794` is definitely used in publications.

The implementation should normalize Unicode punctuation and whitespace before comparing strings.

Suggested normalization:

```python
import re
import unicodedata

def normalize_award_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s
```

Then all of the variants above normalize to:

```text
UWPR95794
```

Also search for bare `95794` when it occurs close to an unambiguous UWPR/resource phrase.

---

## 9. Important correction: `UWPR59794` is NOT currently a confirmed typo

An earlier exploratory search result was interpreted as evidence that a 2017 ISME Journal paper used `UWPR59794`.

That interpretation was incorrect.

The authoritative publisher page and PubMed Central full text for:

> Timmins-Schiffman et al., *Critical decisions in metaproteomics: achieving high confidence protein annotations in a sea of unknowns*

show the normal identifier:

```text
UWPR95794
```

DOI: `10.1038/ismej.2016.132`

Sources:

- https://www.nature.com/articles/ismej2016132
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5270573/

**Do not seed `UWPR59794` into the confirmed corpus.**

It may still be sensible to search one-digit substitutions and transpositions because the user correctly noted that a neighboring five-digit `UWPR` code is unlikely to represent a different program. But such strings must be treated as **candidate typo matches requiring contextual verification**, not automatically as confirmed variants.

---

## 10. Fuzzy identifier searching is still worth doing

Even though no numerical typo is currently confirmed, fuzzy search costs little and may find additional records.

Extract likely UWPR codes with something like:

```regex
(?i)\bUWPR[\s\-_:#]*([0-9]{4,6})\b
```

Then compare the digit string with:

```text
95794
```

Recommended handling:

- exact after punctuation/space normalization -> strong identifier evidence
- Damerau-Levenshtein distance 1 -> candidate for review
- transposition of two adjacent digits -> candidate for review
- insertion/deletion giving 4 or 6 digits -> candidate for review
- distance >= 2 -> only retain if the surrounding text explicitly names the UW Proteomics Resource

Context should dominate the decision.

For example, a candidate string one edit away from `95794` appearing in a sentence containing:

```text
University of Washington Proteomics Resource
```

is much stronger than the same five-digit number occurring in unrelated text.

---

## 11. Resource-name and acknowledgement phrases to search

Search full text and acknowledgements using combinations of:

```text
University of Washington Proteomics Resource
University of Washington's Proteomics Resource
University of Washington’s Proteomics Resource
University of Washington Proteomics Resource Center
UW Proteomics Resource
UW Proteomics Resource Center
Proteomics Resource Center, University of Washington
Proteomics Resource, University of Washington
UWPR
UWPR95794
UWPR 95794
```

Also search personnel names near facility/support language:

```text
Priska von Haller
Jimmy Eng
Vagisha Sharma
Michael Riffle
Michael Hoopmann
```

Useful co-occurring terms include:

```text
proteomics resource
resource center
instrument access
mass spectrometer
mass spectrometry
LC-MS
Orbitrap
LTQ
data analysis
bioinformatics
database searching
computational analysis
acknowledge
acknowledgment
acknowledgement
supported in part
```

Historical papers may mention the individual and instrument access without using the acronym UWPR.

---

## 12. A critical metadata failure mode: PubMed can omit UWPR even when full text contains it

The ISME Journal paper above provides a useful example.

Full text explicitly says the work is supported in part by UWPR and contains `UWPR95794`.

However, the PubMed "Grants and funding" display lists conventional NIH grants and does not expose UWPR95794 in that structured section.

This demonstrates:

> **Do not use PubMed grant metadata as a completeness test.**

PubMed/PMID is excellent for identity resolution, but full-text acknowledgements and publisher/Crossref/OpenAlex metadata need to be evaluated separately.

---

## 13. OpenAlex: correct strict query

OpenAlex now represents work-level grant information in `awards`; the older `grants` representation is deprecated.

Documentation:

- Awards: https://help.openalex.org/data/awards/
- Work attributes: https://help.openalex.org/data/works/attributes/
- API recipes: https://help.openalex.org/how-to/api-recipes/

The strict work query is:

```text
https://api.openalex.org/works?filter=awards.funder_award_id:UWPR95794
```

For a script:

```python
params = {
    "filter": "awards.funder_award_id:UWPR95794",
    "per_page": 100,
    "cursor": "*",
}
```

Retrieve all cursor pages.

OpenAlex documentation explicitly states that award/work matching can be incomplete when a grant was never supplied in matchable publication metadata. That documented failure mode is directly relevant to UWPR.

### Important unresolved item

The prior investigation environment could read OpenAlex documentation but could **not execute `api.openalex.org` directly**. The browsing layer rejected direct API URLs, and the local container had no external DNS/network access.

Therefore the exact OpenAlex count for `UWPR95794` has **not yet been obtained**.

This should be one of the new agent's first actions.

---

## 14. Suggested OpenAlex collection strategy

Do not issue only one query.

At minimum collect:

### A. Strict exact award query

```text
awards.funder_award_id:UWPR95794
```

### B. Variants if OpenAlex preserves them rather than normalizing them

Query separately for likely representations if necessary.

OpenAlex may normalize upstream metadata; do not assume that without testing.

### C. Search official UWPR records by DOI/PMID/title

For every record scraped from the official UWPR list:

1. resolve DOI if possible;
2. look up the OpenAlex work;
3. save the entire `awards` array;
4. save `funders`;
5. record whether `UWPR95794` is represented;
6. record citation count and other metadata.

This allows direct measurement of the **sensitivity of OpenAlex award metadata relative to UWPR's curated bibliography**.

That is a valuable result in its own right.

### D. OpenAlex author candidate pools

Resolve OpenAlex author IDs for:

- Jimmy K. Eng
- Vagisha Sharma
- Michael R. Hoopmann
- Michael Riffle
- Priska von Haller

Then retrieve their works as candidates.

Use ORCID, UW affiliation, publication history, and coauthor network to avoid same-name author collisions.

Do not classify author-only candidates as confirmed UWPR works without additional evidence.

---

## 15. OpenAlex fields worth retaining

For each OpenAlex work retain at least:

```text
id
doi
display_name
publication_year
publication_date
type
authorships
institutions
primary_location
locations
open_access
cited_by_count
counts_by_year
primary_topic
topics
keywords
funders
awards
related_works
referenced_works
ids
```

The `awards` objects should include fields such as:

```text
id
funder_award_id
funder_id
funder_display_name
display_name
doi
```

Retain the raw JSON as well as normalized columns.

---

## 16. Other data sources to use

### 16.1 UWPR site

Primary curated backbone.

Scrape all year pages.

### 16.2 Crossref

For every DOI, inspect Crossref metadata, especially funder/award fields.

API pattern:

```text
https://api.crossref.org/works/{DOI}
```

Do not assume Crossref will contain every acknowledgement.

### 16.3 PubMed / PMC

Use PMID for identity resolution.

When PMCID/full text exists, search the acknowledgement/funding sections directly.

For PMC articles, full-text XML is much more valuable than PubMed's structured grant list.

### 16.4 Europe PMC

Useful for:

- PMID/PMCID/DOI resolution;
- open full text;
- acknowledgement/funding text when available.

### 16.5 Publisher pages

Especially valuable when publisher HTML exposes acknowledgement and structured funding metadata.

Examples already observed:

- ACS exposes `UWPR95794` in funding metadata for Casanovo.
- JLR full text exposes `UWPR95794` for the APOA2 paper.
- ScienceDirect exposes explicit facility access acknowledgements in older papers.

### 16.6 General web search

Use only as a discovery/fallback mechanism, then verify against authoritative sources.

High-value queries:

```text
"UWPR95794"
"UWPR 95794"
"University of Washington Proteomics Resource"
"University of Washington Proteomics Resource Center"
"Priska von Haller" "Proteomics Resource"
"Jimmy Eng" "Proteomics Resource"
"Vagisha Sharma" "Proteomics Resource"
"Michael Riffle" "Proteomics Resource"
"Michael Hoopmann" "Proteomics Resource"
```

---

## 17. Evidence model

Do not collapse everything into a boolean too early.

Recommended explicit evidence columns:

```text
on_official_uwpr_list
exact_uwpr95794_in_structured_metadata
exact_uwpr95794_in_fulltext
normalized_uwpr95794_variant_in_fulltext
explicit_uwpr_resource_acknowledgement
explicit_uwpr_instrument_access
explicit_uwpr_computational_support
named_uwpr_person_acknowledged
uwpr_principal_author
fuzzy_award_candidate
fuzzy_award_distance
source_urls
evidence_excerpt
review_status
```

Recommended classification:

### `CONFIRMED_OFFICIAL`
On UWPR's official publication list.

### `CONFIRMED_IDENTIFIER`
Exact/normalized `UWPR95794` is present in authoritative metadata or full text.

### `CONFIRMED_ACKNOWLEDGEMENT`
The article explicitly acknowledges the University of Washington Proteomics Resource or clearly states use of its instruments/services, even without the code.

### `PROBABLE_TYPO`
A near-match to `UWPR95794` occurs with explicit UWPR context. Requires review.

### `CANDIDATE_PERSONNEL`
A known UWPR principal is an author, but no direct resource evidence has been found.

### `REJECTED`
Reviewed and judged not to have evidence of UWPR resource support.

A single record may satisfy several evidence types.

---

## 18. Suggested rule for the "broad confirmed" corpus

A work enters the broad confirmed corpus if **any** of these is true:

```python
confirmed = (
    on_official_uwpr_list
    or exact_uwpr95794_in_structured_metadata
    or exact_uwpr95794_in_fulltext
    or normalized_uwpr95794_variant_in_fulltext
    or explicit_uwpr_resource_acknowledgement
    or explicit_uwpr_instrument_access
    or explicit_uwpr_computational_support
)
```

A principal author alone should **not** set `confirmed = True`.

A fuzzy number match alone should **not** set `confirmed = True` unless contextual review supports it.

---

## 19. Deduplication strategy

Deduplication is essential.

Use hierarchical matching.

### Tier 1: DOI

Normalize DOI:

```python
def normalize_doi(doi):
    if not doi:
        return None
    doi = doi.strip().lower()
    doi = doi.removeprefix("https://doi.org/")
    doi = doi.removeprefix("http://doi.org/")
    doi = doi.removeprefix("doi:")
    return doi.strip()
```

Exact DOI match => same manifestation.

### Tier 2: PMID / PMCID / OpenAlex ID

Use external identifiers to merge duplicate database records.

### Tier 3: title + authors + year

For records lacking identifiers:

- Unicode-normalize title;
- lowercase;
- strip punctuation;
- collapse whitespace;
- compare with a high fuzzy-title threshold;
- require compatible author sets/year.

### Tier 4: preprint-to-final work-family linking

Do **not** merge the manifestation records themselves.

Instead link them using `work_family_id`.

Signals:

- highly similar titles;
- same/similar author list;
- preprint DOI cited by final article;
- Crossref relation metadata;
- bioRxiv "published as" metadata;
- final article explicitly cites the preprint.

Canonical bibliometric record for a family should usually be the final peer-reviewed publication.

---

## 20. Proposed data schema

A practical `works.csv` / SQLite table might contain:

```text
work_record_id
work_family_id

title
year
publication_date
venue
work_type

doi
pmid
pmcid
openalex_id

authors_json
author_names
institutions_json

source_discovery_methods
on_official_uwpr_list
official_uwpr_year_page

exact_uwpr95794_in_structured_metadata
exact_uwpr95794_in_fulltext
normalized_identifier_found
raw_identifier_strings
fuzzy_award_distance

explicit_uwpr_resource_acknowledgement
explicit_uwpr_instrument_access
explicit_uwpr_computational_support
named_uwpr_person_acknowledged
named_persons

uwpr_principal_author
uwpr_principal_authors

evidence_class
evidence_excerpt
evidence_urls
manual_review_notes

openalex_cited_by_count
openalex_open_access_status
openalex_primary_topic
openalex_topics_json
openalex_awards_json
openalex_funders_json

crossref_funder_json

is_preprint
canonical_family_record
```

Also preserve raw source payloads in `data/raw/`.

---

## 21. Recommended repository layout

```text
uwpr-bibliometrics/
├── README.md
├── pyproject.toml
├── config/
│   ├── people.yaml
│   ├── search_terms.yaml
│   └── known_fixtures.yaml
├── data/
│   ├── raw/
│   │   ├── uwpr_site/
│   │   ├── openalex/
│   │   ├── crossref/
│   │   ├── pubmed/
│   │   └── fulltext/
│   ├── interim/
│   │   ├── candidates.parquet
│   │   └── manifestations.parquet
│   └── curated/
│       ├── works.parquet
│       ├── work_families.parquet
│       ├── exclusions.parquet
│       └── review_queue.csv
├── src/uwpr_biblio/
│   ├── scrape_uwpr.py
│   ├── openalex.py
│   ├── crossref.py
│   ├── pubmed.py
│   ├── acknowledgements.py
│   ├── author_candidates.py
│   ├── normalize.py
│   ├── dedupe.py
│   ├── classify.py
│   └── summarize.py
├── tests/
│   ├── test_normalize.py
│   ├── test_dedupe.py
│   ├── test_classify.py
│   └── test_known_fixtures.py
└── reports/
    ├── summary.md
    ├── discovery_audit.md
    └── figures/
```

---

## 22. Suggested implementation phases

### Phase 1 — scrape authoritative UWPR bibliography

1. Fetch all UWPR publication pages.
2. Parse every list item.
3. Extract:
   - title;
   - author string;
   - venue;
   - year;
   - PMID/link;
   - page/year.
4. Save raw HTML.
5. Verify expected current counts: 5 / 22 / 16 / 9 / 18 / 230.

Do not hard-code the total; fail or warn if counts change.

### Phase 2 — resolve identifiers

For every official record:

1. resolve PMID -> DOI;
2. DOI -> Crossref;
3. DOI -> OpenAlex;
4. DOI/PMCID -> full text where available.

### Phase 3 — run strict OpenAlex award query

Fetch all works matching:

```text
awards.funder_award_id:UWPR95794
```

Deduplicate against the official list.

Report:

```text
strict_openalex_count
official_list_count
intersection_count
openalex_only_count
official_only_count
```

This is the first quantitative measure of structured-metadata recall.

### Phase 4 — identifier variant/fuzzy discovery

Search structured metadata and available full text for normalized variants.

Extract all `UWPR + digits` strings and calculate edit distance to `95794`.

### Phase 5 — acknowledgement discovery

Search full-text acknowledgements for facility names and staff/resource combinations.

Start with:

- PMC/open-access corpus;
- papers by known UWPR personnel;
- papers citing/related to already confirmed UWPR works if useful.

### Phase 6 — personnel candidate sweep

Resolve the five UWPR principals and pull all publications.

For each candidate not already confirmed, search:

- full text;
- publisher acknowledgement;
- Crossref funding metadata;
- coauthors;
- instrument/resource language.

### Phase 7 — version-family deduplication

Create work families and select canonical records.

### Phase 8 — manual review queue

Any record that is only:

- a fuzzy ID match; or
- a principal-author candidate; or
- indirect/ambiguous facility evidence

goes to manual review.

The review file should include enough evidence for a human to decide quickly.

### Phase 9 — statistics

Calculate both:

1. **strict award-metadata statistics**
2. **broad curated UWPR-supported statistics**

Do not mix the two without labeling them.

---

## 23. Statistics requested / recommended

For the final broad curated corpus:

### Basic output

- number of unique work families;
- number of manifestation records;
- publication year range;
- publications per year;
- total citations;
- mean citations;
- median citations;
- citation quartiles;
- maximum citations;
- h-index of the corpus;
- number and percentage open access;
- work types.

### Impact/distribution

- top cited papers;
- top journals/sources;
- top authors;
- top institutions;
- OpenAlex domains/fields/subfields/topics;
- number of distinct external institutions;
- proportion of papers with UWPR personnel as coauthors;
- proportion supported by explicit instrument access vs computational work when inferable.

### Discovery/audit statistics

These may be especially useful to UWPR:

- number found on official UWPR list;
- number found by exact award ID;
- number recovered only via acknowledgement text;
- number recovered only through another discovery source;
- percentage of official UWPR works whose OpenAlex award metadata contains `UWPR95794`;
- percentage of exact `UWPR95794` works absent from the official UWPR site;
- number of preprint/final duplicates;
- number requiring manual review.

This turns the project into both a bibliometric analysis and a measurement of metadata completeness.

---

## 24. Citation-count semantics

Citation counts are time-dependent.

Record:

```text
citation_source = "OpenAlex"
citation_snapshot_date = YYYY-MM-DD
```

For a preprint/final family, avoid adding citation counts from both manifestations.

Preferred approach:

1. final peer-reviewed article is canonical if present;
2. report its OpenAlex citation count;
3. optionally retain preprint citations separately;
4. never silently sum them unless the project explicitly defines a family-level combined citation metric.

---

## 25. Known-positive regression fixtures

The implementation should contain fixtures that prove each discovery channel works.

### Fixture A — exact identifier in full text
**Critical decisions in metaproteomics**  
DOI: `10.1038/ismej.2016.132`  
Expected:
- `UWPR95794` detected;
- Michael Riffle author;
- Jimmy Eng named in acknowledgement;
- canonical ID is `UWPR95794`, **not** `UWPR59794`.

### Fixture B — facility support with no UWPR code
**Proper and improper aminoketyl radicals...**  
DOI: `10.1016/j.ijms.2010.06.025`  
Expected:
- no need for exact ID;
- explicit Priska/UW Proteomics Resource Center instrument-access evidence;
- broad classification = confirmed acknowledgement.

### Fixture C — another no-code acknowledgement
**Degradation of Diatom Protein in Seawater**  
DOI: `10.3389/fmars.2021.757245`  
Expected:
- NSF is formal funding;
- Priska/UWPR explicitly acknowledged separately;
- broad classification = confirmed acknowledgement.

### Fixture D — structured award metadata
**Improvements to Casanovo**  
DOI: `10.1021/acs.jproteome.5c00706`  
Expected:
- award `UWPR95794` detected;
- absent from current official UWPR site snapshot;
- link preprint and final into one work family.

### Fixture E — exact code in acknowledgement, missing from current UWPR page
**A model of human APOA2 on HDL**  
DOI: `10.1016/j.jlr.2026.101113`  
Expected:
- exact `UWPR95794` detected.

### Fixture F — exact code, 2025 preprint missing from UWPR 2025 page
**Nettle / Improved quantitative accuracy...**  
DOI: `10.1101/2025.05.27.656394`  
Expected:
- exact `UWPR95794` detected.

---

## 26. Things not to assume

### Do not assume exact award metadata is complete

OpenAlex itself documents incomplete award-to-work matching as a possible failure mode.

### Do not assume the UWPR site is exhaustive

Confirmed UWPR-supported works have been found that are not listed there.

### Do not assume every UWPR-personnel paper is a UWPR paper

Personnel authorship is candidate evidence only.

### Do not assume the publication-site item count equals unique paper count

Preprint/final duplicates exist.

### Do not assume PubMed grant metadata reflects the acknowledgement section

It demonstrably can omit UWPR.

### Do not treat `UWPR59794` as a confirmed typo

That was a false lead and was corrected against authoritative full text.

### Do not discard papers because the acknowledgement uses "access", "assistance", or "thanks" rather than "funding"

For a research resource/core, these may be the strongest possible evidence of facility support.

---

## 27. Suggested command-line behavior

A useful CLI might eventually support:

```bash
uwpr-biblio scrape-official
uwpr-biblio fetch-openalex
uwpr-biblio resolve-identifiers
uwpr-biblio fetch-fulltext
uwpr-biblio discover-acknowledgements
uwpr-biblio discover-authors
uwpr-biblio dedupe
uwpr-biblio classify
uwpr-biblio review export
uwpr-biblio summarize
uwpr-biblio audit
```

Useful outputs:

```bash
uwpr-biblio summarize --corpus strict-award
uwpr-biblio summarize --corpus broad-confirmed
```

and:

```bash
uwpr-biblio audit --compare official,openalex-award
```

---

## 28. Reproducibility requirements

Every HTTP-derived artifact should retain:

- source URL;
- retrieval timestamp;
- HTTP status;
- content hash if practical;
- API parameters;
- raw response.

Never overwrite raw source snapshots.

The curated layer should be rebuildable from raw data plus code.

Manual decisions should be logged, e.g.:

```yaml
- work_family_id: ...
  decision: confirmed
  reviewer: ...
  date: ...
  reason: "Acknowledgement explicitly thanks UW Proteomics Resource Center for LTQ XL access."
  evidence_url: ...
```

---

## 29. Priority questions for the next agent to answer

The highest-priority unresolved questions are:

1. **How many OpenAlex works currently match exact `awards.funder_award_id:UWPR95794`?**
2. How many of the 300 official UWPR records can be resolved to OpenAlex?
3. Of those official records, how many contain `UWPR95794` in OpenAlex award metadata?
4. How many exact OpenAlex `UWPR95794` matches are absent from the official UWPR site?
5. How many explicit acknowledgement-only papers can be found beyond the official list?
6. After work-family deduplication, what is the actual number of unique UWPR-supported works?
7. What is the earliest confirmed UWPR-supported work?
8. What variants/near-miss identifiers actually occur in the corpus?
9. What fraction of confirmed papers include one of the five identified UWPR principals as an author?
10. What are the requested bibliometric statistics for the strict and broad corpora?

---

## 30. Recommended first commands for a new CLI agent

Start with connectivity:

```bash
python - <<'PY'
import requests

url = "https://api.openalex.org/works"
params = {
    "filter": "awards.funder_award_id:UWPR95794",
    "per_page": 5,
}
r = requests.get(url, params=params, timeout=30)
r.raise_for_status()
data = r.json()
print("count:", data["meta"]["count"])
for w in data["results"]:
    print(w["publication_year"], w["display_name"], w["doi"])
PY
```

Then scrape the UWPR site:

```bash
python - <<'PY'
import requests
from bs4 import BeautifulSoup

urls = [
    "https://proteomicsresource.washington.edu/publications/",
    "https://proteomicsresource.washington.edu/publications/2025/",
    "https://proteomicsresource.washington.edu/publications/2024/",
    "https://proteomicsresource.washington.edu/publications/2023/",
    "https://proteomicsresource.washington.edu/publications/2022/",
    "https://proteomicsresource.washington.edu/publications/older/",
]

for url in urls:
    html = requests.get(url, timeout=30).text
    soup = BeautifulSoup(html, "html.parser")
    # Inspect DOM before choosing a selector; do not blindly trust this one.
    items = [li.get_text(" ", strip=True) for li in soup.select("main li")]
    print(url, len(items))
PY
```

The DOM should be inspected and the parser tested against expected title/PMID fixtures rather than relying on the illustrative selector above.

---

## 31. OpenAlex pagination skeleton

```python
import requests

BASE = "https://api.openalex.org/works"

def iter_openalex(filter_expr: str):
    params = {
        "filter": filter_expr,
        "per_page": 100,
        "cursor": "*",
    }

    while True:
        r = requests.get(BASE, params=params, timeout=60)
        r.raise_for_status()
        payload = r.json()

        yield from payload["results"]

        cursor = payload["meta"].get("next_cursor")
        if not cursor:
            break
        params["cursor"] = cursor

works = list(iter_openalex("awards.funder_award_id:UWPR95794"))
print(len(works))
```

Cache the raw payloads rather than re-querying on every run.

---

## 32. Identifier fuzzy-matching skeleton

Use Damerau-Levenshtein if available because digit transpositions are plausible human errors.

Pseudocode:

```python
TARGET = "95794"

for text in acknowledgement_and_funding_texts:
    for digits in extract_uwpr_digit_strings(text):
        d = damerau_levenshtein(digits, TARGET)

        if d == 0:
            evidence = "exact"
        elif d == 1 and has_explicit_uwpr_context(text):
            evidence = "probable_typo_review"
        else:
            evidence = "weak_candidate"
```

Do not let a fuzzy-number match override contrary contextual evidence.

---

## 33. Suggested author-candidate query logic

For each principal:

1. resolve a unique OpenAlex author entity;
2. validate with UW affiliation and known publications;
3. fetch all works;
4. remove works already confirmed;
5. rank remaining candidates by:
   - proteomics/mass-spectrometry topic;
   - UW affiliation;
   - coauthors repeatedly present in confirmed UWPR works;
   - presence of `UWPR`, `Proteomics Resource`, or personnel names in full text;
   - use of known UWPR instrumentation if explicitly acknowledged.

The ranking is only for review prioritization, not automatic classification.

---

## 34. Potentially valuable graph expansion

Once a confirmed corpus exists, candidate discovery can be expanded conservatively by looking at:

- repeated UWPR collaborators;
- papers citing known UWPR software/resource publications;
- papers sharing principal authors and proteomics topics;
- publisher acknowledgements containing known staff;
- related works in OpenAlex.

However, graph expansion should never itself establish inclusion. It should only generate candidates.

---

## 35. Final deliverables recommended

The development project should produce:

### Machine-readable

- `manifestations.parquet`
- `work_families.parquet`
- `confirmed_uwpr_works.csv`
- `strict_openalex_award_works.csv`
- `review_queue.csv`
- `excluded_candidates.csv`
- raw JSON/HTML snapshots

### Human-readable

- `discovery_audit.md`
- `summary_statistics.md`
- `missing_from_uwpr_site.md`
- `metadata_false_negatives.md`
- `manual_review_log.md`

### Figures

- publications by year;
- cumulative publications;
- citations by publication year;
- strict OpenAlex vs broad confirmed corpus size;
- discovery source overlap, ideally an UpSet plot rather than an unreadable many-set Venn diagram;
- top topics/fields;
- top journals;
- top collaborating institutions.

---

## 36. Source/reference list

### UWPR

- https://proteomicsresource.washington.edu/
- https://proteomicsresource.washington.edu/publications/
- https://proteomicsresource.washington.edu/publications/2025/
- https://proteomicsresource.washington.edu/publications/2024/
- https://proteomicsresource.washington.edu/publications/2023/
- https://proteomicsresource.washington.edu/publications/2022/
- https://proteomicsresource.washington.edu/publications/older/
- https://proteomicsresource.washington.edu/collab/
- https://proteomicsresource.washington.edu/contact/
- https://www.proteomicsresource.washington.edu/docs/20120709_UWPRworkshop_Intro.pdf

### OpenAlex documentation

- https://help.openalex.org/data/awards/
- https://help.openalex.org/data/works/
- https://help.openalex.org/data/works/attributes/
- https://help.openalex.org/how-to/api-recipes/
- https://help.openalex.org/api/deprecations/

### Known/illustrative publications

- Critical decisions in metaproteomics  
  https://doi.org/10.1038/ismej.2016.132  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5270573/

- Proper and improper aminoketyl radicals  
  https://doi.org/10.1016/j.ijms.2010.06.025  
  https://www.sciencedirect.com/science/article/pii/S1387380610002083

- Amplified histidine effect  
  https://doi.org/10.1016/j.ijms.2010.08.021

- Degradation of Diatom Protein in Seawater  
  https://doi.org/10.3389/fmars.2021.757245  
  https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2021.757245/full

- Nettle / Improved quantitative accuracy in DIA proteomics  
  https://doi.org/10.1101/2025.05.27.656394  
  https://www.biorxiv.org/content/10.1101/2025.05.27.656394v1

- Improvements to Casanovo  
  https://doi.org/10.1021/acs.jproteome.5c00706  
  https://doi.org/10.1101/2025.07.25.666826

- A model of human APOA2 on HDL  
  https://doi.org/10.1016/j.jlr.2026.101113  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC13505420/

---

## 37. Bottom line for the next agent

The project should **not** be implemented as "query OpenAlex for `UWPR95794` and summarize the result."

It should be implemented as a **provenance-tracked publication discovery and reconciliation pipeline**.

The official UWPR list is the best high-precision backbone currently identified, because UWPR itself defines those papers as having received resource support. Exact `UWPR95794` metadata provides another high-precision stream and can recover omissions from the website. Full-text acknowledgement searches recover genuine core-facility use that never appears as a grant. UWPR-principal author searches maximize recall but must feed a review/evidence process rather than automatic inclusion.

The final analysis should publish **two clearly labeled views**:

1. **Strict structured-award corpus:** papers OpenAlex identifies with award `UWPR95794`.
2. **Broad curated UWPR-supported corpus:** the deduplicated union of official UWPR records and other works with direct evidence of resource support.

The difference between those two corpora is itself an important and useful result.
