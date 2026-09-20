# Phase 1a — Calibration of Automated Inclusion Rules

**Status:** Complete · 2026-09-19. All case types decided and the spot-check approved.
**Purpose:** the pipeline decides inclusion with no human review (see
[01-discovery-strategy.md](01-discovery-strategy.md) §6). This file settles the judgement calls
the rules must encode, using real examples, and spot-checks what the rules found.

**How to answer:** for Part 1, write `include` or `exclude` after each **Your decision**. For
Part 2, mark each row ✔ (correct), ✘ (wrong) or ? in the **You** column. Short notes welcome.

---

## Part 1 — Case types (policy decisions)

Each type becomes one rule in the pipeline. The counts are from the 1,075 candidates examined on
2026-09-19.

### C1. The resource is thanked for advice or discussion, with no stated instrument use

- 2022 · *Mitochondrial interactome quantitation reveals structural changes…* · PMC9667921
  > "We thank the University of Washington Proteomics Resource for advice and helpful discussions."
- 2023 · *Real-Time Spectral Library Matching for Sample Multiplexed Quantitative…* · PMC11554524
  > "…and Jimmy Eng of the UWPR for helpful advice and comments."

UWPR's own definition names "consultation with computational staff".
**Decided 2026-09-19: include.** The current rules already do.

### C2. A staff member is thanked for analysis or technical help, and UWPR is not named

- 2020 · *Reconstitution reveals two paths of force transmission through the kinetochore* · PMC7367685
  > "We also thank Michael Riffle for assistance with data analysis and visualization."
- 2019 · *Quantitative assay of targeted proteome in tomato trichome glandular cells* · PMC6480907
  > "…Vagisha Sharma (University of Washington) for their excellent technical assistance."
- 2023 · *A multiplexed assay for quantifying immunomodulatory proteins…* · PMC10185886
  > "…Vagisha Sharma (University of Washington) for technical support in assembling and sharing data…"

This is rare: a handful of papers among all the candidates. On the official list it was never
the only evidence for a paper.
**Decided 2026-09-19: include.** Encoded as rule R7 (strategy §6.6). No requirement for a UW
co-author; precision comes from full-name matching plus help-with-work wording.

**Narrowed 2026-09-20 by the calibration review.** The kinetochore paper stands: "assistance with
data analysis and visualization" names analysis work. The other two examples above do not, and
neither is UWPR support:
- **PMC10185886** is C4, not C2 — "assembling and sharing data" is repository help. R7's
  deposition disqualifier now covers that wording, so no similar paper is included again.
- **PMC6480907** names no work at all, only "excellent technical assistance". No rule can
  separate that from the same phrase on listed papers, so it is excluded by `overrides.yaml`.

The lesson for any later review: **a credit that names the work is evidence; a credit that names
only the helper is not.**

### C3. A staff member is thanked for advice on, or contributions to, software or standards they develop

- 2024 · *EndoGenius: Optimized Neuropeptide Identification…* — "thank Jimmy Eng for guidance in the development of the peptide fragmentation portion of the program."
- 2019 · *An integrated workflow for crosslinking mass spectrometry* — "thank Michael Hoopmann for his support with pairing kojak and peptideProphet."
- 2010, 2011 · *mzML* papers; 2010 *The PeptideAtlas Project* — staff listed among many contributors.

**Decided 2026-09-19: exclude.** This is software-author courtesy, equivalent to citing Comet or Kojak.

### C4. A staff member is thanked for help depositing data in Panorama Public or ProteomeXchange

- 2020 · *Phosphoproteomics identifies dual-site phosphorylation…* · PMC7244511
- 2023 · *Sample Preparation Methods for Targeted Single-Cell Proteomics* · PMC10243106
- 2026 · *A quantitative proteomics dataset for assessment and prediction of…* · PMC13228472

**Decided 2026-09-19: exclude.** Help with repository deposition is not UWPR support.

**Widened 2026-09-20** (calibration review, Phase 1 §6.6): the same act is often described
without naming the repository — "technical support in assembling and sharing data". That wording
is now excluded too. It moves one paper, PMC10185886 below, from C2 to C4; the C2 entry for it is
marked accordingly.

### C5. A staff member is thanked for work done at another institution

- 2018 · *The Micronemal Plasmodium Proteins P36 and P52…* — "Michael Hoopmann, PhD (Institute for Systems Biology)"
- 2023 · *Combination of deep XLMS with deep learning…* — "Michael Hoopmann (ISB, Seattle)"

**Decided 2026-09-19: exclude.**

### C6. The paper mentions UWPR only because it used something UWPR made publicly available

UWPR publishes free software (on GitHub) and some hardware designs (on its website). Other labs
use these on their own and mention UWPR in the process; UWPR did no work for that paper.

- 2020, 2021 · top-down proteomics papers — "A UWPR nanospray source was utilized for application
  of the ionization voltage…" with a link to the design on UWPR's protocols page. The lab built
  an ion source from UWPR's posted design.
- 2010 · *Surface acoustic wave nebulization…* — a stage "manufactured according to plans from"
  the resource.
- Several 2025–2026 papers that list `https://github.com/UWPR/Comet` in their software table.

The question: does "used a UWPR-published design or tool" count as UWPR support? It is the same
situation as citing Comet.
**Decided 2026-09-19: exclude.** The rules already filter these out.

### C7. Record types that carry the identifier but are not ordinary papers

| Type | Found | Recommendation |
|---|---:|---|
| Peer-review reports (PeerJ) and Faculty Opinions recommendations | 5 | Exclude — not publications |
| Institutional-repository copies of an article | 1 | Treat as a version of that article |
| Dissertations | 5 | **Decided: exclude.** A preprint or article of the same work is included on its own evidence |
| Data papers (e.g. *Scientific Data*) | 1 | Include — peer-reviewed articles |
| Preprints with no journal version yet | 12 | **Decided: include**, labelled as preprints; merged with the article when it appears |

*All C7 items decided.*

### C8. The Department of Medicine Mass Spectrometry Resource is named alongside UWPR in the same sentence

Settled: only the UWPR part counts. No action needed; listed for completeness.

---

## Part 2 — Spot-check: automatic inclusions not on the official list

These are the works the automatic rules found that are **not** on UWPR's publications pages,
with preprints and journal versions grouped. Rule codes are explained in
[01-discovery-strategy.md](01-discovery-strategy.md) §6:
**ID-meta** = `UWPR95794` in funding metadata, **ID-text** = in the paper's text,
**Named** = resource named in the text, **Affil** = an author's address is the resource.

"My read" is my own assessment from the text. The rules have already been fixed for the two ✘.

**Reviewed 2026-09-19: approved as marked.**

| # | Year | Work | Versions | Rules | My read | You |
|---:|---|---|---|---|---|---|
| 1 | 2010 | *Surface acoustic wave nebulization of peptides as a microfluidic interface for…* | [article](https://doi.org/10.1021/ac100372c) | Named | ✘ Hardware plans (C6); now excluded | |
| 2 | 2010 | *Low clusterin levels in high-density lipoprotein associate with insulin resist…* | [article](https://doi.org/10.1161/atvbaha.110.212894) | Named | ? Funding list; relevant clause cut off | |
| 3 | 2012 | *Development of a Novel LC/MS/MS Extraction Assay for Galanthamine in Guinea Pi…* | [article](https://doi.org/10.4172/scientificreports.149) | ID-meta | ? Probably the official-list entry *An Extraction Assay Analysis for Galanthamine…* (no PMID on list) | |
| 4 | 2017 | *Phytoplankton Plastid Proteomics: Cracking Open Diatoms to Understand Plastid …* | [article](https://doi.org/10.59720/16-082) | ID-meta | ✔ | |
| 5 | 2017 | *Activation of γ2-AMPK Suppresses Ribosome Biogenesis and Protects Against Myoc…* | [article](https://doi.org/10.1161/circresaha.117.311159) | Named | ✔ | |
| 6 | 2019 | *Automated high-throughput proteome and phosphoproteome analysis using paramagn…* | [preprint](https://doi.org/10.1101/647784) | ID-meta | ✔ | |
| 7 | 2020 | *Improving power while controlling the false discovery rate when only a subset …* | [preprint](https://doi.org/10.1101/2020.10.20.347278) | ID-meta | ✔ | |
| 8 | 2021 | *Cryo-ET of HIV reveals Env positioning on Gag lattice and structural variation…* | [preprint](https://doi.org/10.1101/2021.08.31.458345) | ID-meta | ✔ | |
| 9 | 2022 | *Proteome-wide identification of amino acid substitutions deleterious for prote…* | [preprint](https://doi.org/10.1101/2022.04.06.487405) | ID-meta | ✔ | |
| 10 | 2022 | *Mitochondrial interactome quantitation reveals structural changes in metabolic…* | [article](https://doi.org/10.1038/s44161-022-00127-4) | Named | ✔ Consultation (C1) | |
| 11 | 2023 | *Combinatorial immune refocusing within the influenza hemagglutinin RBD improve…* | [article](https://doi.org/10.1016/j.celrep.2023.113553), [preprint](https://doi.org/10.1101/2023.05.23.541996) | ID-meta, ID-text, Named | ✔ | |
| 12 | 2023 | *Real-Time Spectral Library Matching for Sample Multiplexed Quantitative Proteo…* | [article](https://doi.org/10.1021/acs.jproteome.3c00085) | Named | ✔ Consultation (C1) | |
| 13 | 2023 | *Effectors of anterior morphogenesis in C. elegans embryos.* | [article](https://doi.org/10.1242/bio.059982) | Named | ✔ | |
| 14 | 2024 | *Resilience in a time of stress: revealing the molecular underpinnings of coral…* | [preprint](https://doi.org/10.1101/2024.04.02.587798), [preprint](https://doi.org/10.21203/rs.3.rs-4566379/v1) | ID-meta | ✔ | |
| 15 | 2024 | *The Hunt Lab Guide to De Novo Peptide Sequence Analysis by Tandem Mass Spectro…* | [article](https://doi.org/10.1016/j.mcpro.2024.100875) | Named | ✘ UWPR appears in a list of software tools; now excluded | |
| 16 | 2024 | *Multistate and functional protein design using RoseTTAFold sequence space diff…* | [article](https://doi.org/10.1038/s41587-024-02395-w) | Named | ✔ | |
| 17 | 2025 | *Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer* | [article](https://doi.org/10.1021/acs.jproteome.5c00706), [preprint](https://doi.org/10.1101/2025.07.25.666826) | ID-meta | ✔ | |
| 18 | 2025 | *Improved quantitation in data-independent acquisition proteomics via retention…* | [preprint](https://doi.org/10.1101/2025.05.27.656394) | ID-meta, ID-text, Named | ✔ | |
| 19 | 2025 | *Disorder with consequence: Phosphorylation sites in HSPB5 yield distinct struc…* | [preprint](https://doi.org/10.1101/2025.10.27.684587) | ID-meta, ID-text, Named | ✔ | |
| 20 | 2025 | *Type I interferons increase expression of endogenous retrovirus K102 and envel…* | [article](https://doi.org/10.1186/s13100-025-00371-y) | Named | ✔ | |
| 21 | 2026 | *Plasma-driven disassembly of amyloid-β aggregates by the interplay of physicoc…* | [article](https://doi.org/10.1016/j.xcrp.2025.103090) | ID-meta | ✔ | |
| 22 | 2026 | *A model of human APOA2 on HDL* | [article](https://doi.org/10.1016/j.jlr.2026.101113) | ID-meta, ID-text | ✔ | |
| 23 | 2026 | *A Spatiotemporal Atlas of the Androgen Receptor Proximal Interactome* | [preprint](https://doi.org/10.64898/2026.08.03.742469) | Affil | ✔ | |
| 24 |  | *Oral Actinobacteria sense and defend against parasitic epibionts* | [preprint](https://doi.org/10.64898/2026.09.08.750141) | ID-meta | ✔ | |

**Totals:** 24 works. 2 are false positives now handled by the rules. 1 is uncertain. 1 is
probably an official-list entry under a different title. That leaves **about 20 genuinely new
works**. OpenAlex phrase searches surfaced another 10–20 candidates that have not yet been
examined.
