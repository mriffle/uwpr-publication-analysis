"""The text rules R2-text, R3, R3d, R4, R5, R7 and the signals (Phase 1 §6, 01a).

Every sentence here is one Phase 1 or 01a quotes, or a close paraphrase of a case they decided.
The negatives matter as much as the positives: most of them are papers that mention UWPR for a
reason that is deliberately not evidence (C3-C6), and two of them are the false positives that
the calibration removed.
"""

from collections.abc import Sequence

import pytest

from uwpr_pubs.config import Config, load_config
from uwpr_pubs.rules.common import TextSource
from uwpr_pubs.rules.r2 import award_code_in_text, contains_award_code, near_misses
from uwpr_pubs.rules.r3 import dataset_named, mentions, r3_rules, resource_named
from uwpr_pubs.rules.r4 import facility_named, r4_rules
from uwpr_pubs.rules.r5 import affiliation_is_resource, is_resource_affiliation, r5_rules
from uwpr_pubs.rules.r6 import phrase_found, query_url
from uwpr_pubs.rules.r7 import R7Outcome, purpose_phrase, r7_rules, staff_thanked
from uwpr_pubs.rules.signals import signal_rules, signals_for, text_signals
from uwpr_pubs.rules.staff import StaffMember, is_author, staff_members
from uwpr_pubs.store.models import Evidence
from uwpr_pubs.text import Document, parse_jats, text_rules

TODAY = "2026-09-19"
RECORD = "R-000001"
PMC = TextSource(name="PMC", url="https://pmc.ncbi.nlm.nih.gov/articles/PMC1/", cache="sha256:" + "a" * 64)


@pytest.fixture(scope="module")
def config() -> Config:
    return load_config()


@pytest.fixture(scope="module")
def staff(config: Config) -> tuple[StaffMember, ...]:
    return staff_members(config.staff)


def document(sentence: str, *, section: str = "ack") -> Document:
    """One sentence in a real section of a minimal JATS document."""
    inner = f"<p>{sentence}</p>"
    body = {
        "ack": f"<back><ack>{inner}</ack></back>",
        "methods": f"<body><sec><title>Methods</title>{inner}</sec></body>",
        "main": f"<body><sec><title>Results</title>{inner}</sec></body>",
    }[section]
    parsed = parse_jats(f"<article>{body}</article>", text_rules(load_config().rules["text"]))
    assert parsed is not None
    return parsed


def r3_of(sentence: str, config: Config, staff: Sequence[StaffMember], year: int = 2023) -> list[Evidence]:
    return resource_named(
        document(sentence),
        record=RECORD,
        source=PMC,
        rules=r3_rules(config.rules["r3"]),
        label=config.rules["labels"]["R3"],
        staff=staff,
        year=year,
        today=TODAY,
    )


def r7_of(
    sentence: str,
    config: Config,
    staff: Sequence[StaffMember],
    *,
    year: int = 2020,
    authors: Sequence[str] = (),
) -> R7Outcome:
    return staff_thanked(
        document(sentence),
        record=RECORD,
        source=PMC,
        rules=r7_rules(config.rules["r7"]),
        label=config.rules["labels"]["R7"],
        staff=staff,
        authors=authors,
        year=year,
        today=TODAY,
    )


# --- R3: the resource is named --------------------------------------------------------------

R3_POSITIVE = [
    # The curly apostrophe of Phase 1 §4.6, which the `uw` pattern allows for explicitly.
    "This work was supported in part by the University of Washington’s Proteomics Resource (UWPR95794).",  # noqa: RUF001
    "Mass spectrometry was carried out at the University of Washington Proteomics Resource (Seattle, WA).",
    "We thank the University of Washington Proteomics Resource for advice and helpful discussions.",
    "Samples were run at the Proteomics Resource of the University of Washington.",
    "Work was performed at the University of Washington Proteomics Resource Center.",
]

# Each of these names UWPR for a reason Phase 1 decided is not evidence (C6, D6, §6.3).
R3_NEGATIVE = [
    "A UWPR nanospray source was utilized for application of the ionization voltage.",
    "The stage was manufactured according to plans from the University of Washington Proteomics Resource.",
    "Fragment ions were calculated using the University of Washington's Proteomics Resource peptide "
    "fragmentation tool.",
    "Data were searched with the Sequest HT search engine "
    "(The University of Washington's Proteomics Resource).",
    "Spectra were processed with Comet from the University of Washington Proteomics Resource.",
    "Samples were analysed at the Fred Hutchinson Cancer Research Center Proteomics Resource.",
    "Tools used included UWPR, listed at proteomicsresource.washington.edu/ for reference.",
]


@pytest.mark.parametrize("sentence", R3_POSITIVE)
def test_r3_fires_when_the_resource_is_named(
    sentence: str, config: Config, staff: Sequence[StaffMember]
) -> None:
    found = r3_of(sentence, config, staff)
    assert [e["rule"] for e in found] == ["R3"]
    assert found[0]["section"] == "acknowledgements"


@pytest.mark.parametrize("sentence", R3_NEGATIVE)
def test_r3_does_not_fire_on_the_excluded_contexts(
    sentence: str, config: Config, staff: Sequence[StaffMember]
) -> None:
    assert r3_of(sentence, config, staff) == []


def test_a_url_path_is_not_the_acronym(config: Config, staff: Sequence[StaffMember]) -> None:
    """`github.com/UWPR/Comet` is a repository path, not a mention (Phase 1 §4.6)."""
    assert r3_of("Comet was downloaded from https://github.com/UWPR/Comet.", config, staff) == []


def test_r3_criterion_is_3_when_the_sentence_names_a_staff_member(
    config: Config, staff: Sequence[StaffMember]
) -> None:
    """Criterion 3 is "staff in their UWPR role"; the sample store's W-000009 is this case."""
    sentence = (
        "We would like to thank the Schweppe and Villen labs at UW and Jimmy Eng of the UWPR "
        "for helpful advice and comments."
    )
    found = r3_of(sentence, config, staff)
    assert found[0]["criterion"] == 3
    assert found[0]["detail"] == {"staff": "eng"}


def test_r3_criterion_is_4_without_a_staff_name(config: Config, staff: Sequence[StaffMember]) -> None:
    found = r3_of(R3_POSITIVE[1], config, staff)
    assert found[0]["criterion"] == 4
    assert found[0]["detail"] == {}


def test_nearby_matches_form_one_mention(config: Config) -> None:
    """ "University of Washington Proteome Resource (UWPR" is one mention, not two (§6.3)."""
    sentence = "Work was done at the University of Washington Proteomics Resource (UWPR) in Seattle."
    assert len(mentions(sentence, r3_rules(config.rules["r3"]))) == 1


def test_an_exclusion_beside_the_mention_discards_it(config: Config) -> None:
    """The Hunt Lab guide case (01a row 15): UWPR listed among software tools."""
    sentence = "The pipeline used several tools, including UWPR and Skyline."
    assert [m.counts for m in mentions(sentence, r3_rules(config.rules["r3"]))] == [False]


def test_the_mention_itself_is_not_its_own_exclusion_window(config: Config) -> None:
    """ "Proteomics Resource" contains the hardware term "source".

    Phase 1 §6.3 checks "the 40 characters on either side of it", so the mention is not part of
    its own window. Were it included, this exclusion would discard every match there is.
    """
    found = mentions(R3_POSITIVE[1], r3_rules(config.rules["r3"]))
    assert [m.counts for m in found] == [True]


def test_a_neighbouring_resource_word_spoils_a_bare_acronym(config: Config) -> None:
    """A known edge of the frozen rules, recorded here so a future change is deliberate.

    `RES` is `Proteom(ics|e) Resources?`, so the singular "Proteomic Resource" of Phase 1 §4.6
    never pairs with `UW`. That leaves the bare "(UWPR)" acronym as the only match — and the
    "Resource" beside it puts the hardware term "source" in its 40-character window, so the
    mention is discarded. Such a paper is reached by R1, R2 or R6 instead.
    """
    sentence = "Analysis was done by the UW Proteomic Resource (UWPR)."
    assert [m.counts for m in mentions(sentence, r3_rules(config.rules["r3"]))] == [False]


def test_r3_reports_one_entry_per_section(config: Config, staff: Sequence[StaffMember]) -> None:
    rules = text_rules(config.rules["text"])
    parsed = parse_jats(
        "<article><body><sec><title>Methods</title>"
        f"<p>{R3_POSITIVE[1]}</p></sec></body>"
        f"<back><ack><p>{R3_POSITIVE[2]}</p></ack></back></article>",
        rules,
    )
    assert parsed is not None
    found = resource_named(
        parsed,
        record=RECORD,
        source=PMC,
        rules=r3_rules(config.rules["r3"]),
        label=config.rules["labels"]["R3"],
        staff=staff,
        year=2023,
        today=TODAY,
    )
    assert sorted(str(e["section"]) for e in found) == ["acknowledgements", "methods"]


# --- R3d: the same test on a dataset description --------------------------------------------


def test_r3d_reads_a_dataset_description(config: Config) -> None:
    """Channel J found one paper nothing else did (PXD011642 → PMID 32613749)."""
    evidence = dataset_named(
        ["The mass spectrometry analysis was performed at the University of Washington Proteomics Resource."],
        record=RECORD,
        source=TextSource(
            name="PRIDE", url="https://www.ebi.ac.uk/pride/archive/projects/PXD011642", cache=None
        ),
        rules=r3_rules(config.rules["r3"]),
        label=config.rules["labels"]["R3d"],
        dataset="PXD011642",
        today=TODAY,
    )
    assert evidence is not None
    assert evidence["rule"] == "R3d"
    assert evidence["criterion"] == 4
    assert evidence["section"] == "dataset description"
    assert evidence["detail"] == {"dataset": "PXD011642"}


def test_r3d_is_silent_when_the_description_says_nothing(config: Config) -> None:
    assert (
        dataset_named(
            ["Samples were analysed on a QExactive instrument."],
            record=RECORD,
            source=TextSource(name="PRIDE", url=None, cache=None),
            rules=r3_rules(config.rules["r3"]),
            label=config.rules["labels"]["R3d"],
            dataset="PXD000001",
            today=TODAY,
        )
        is None
    )


# --- R4: the early-era facility -------------------------------------------------------------


def test_r4_finds_the_south_lake_union_facility(config: Config, staff: Sequence[StaffMember]) -> None:
    sentence = (
        "We thank Dr. Priska Van Haller at the University of Washington South Lake Union "
        "Mass Spectrometry Facility for her help."
    )
    evidence = facility_named(
        document(sentence),
        record=RECORD,
        source=PMC,
        rules=r4_rules(config.rules["r4"]),
        label=config.rules["labels"]["R4"],
        staff=staff,
        year=2009,
        today=TODAY,
    )
    assert evidence is not None
    assert evidence["criterion"] == 4
    assert evidence["detail"] == {"staff": "vonhaller"}


def test_r4_ignores_the_neighbourhood_on_its_own(config: Config, staff: Sequence[StaffMember]) -> None:
    assert (
        facility_named(
            document("The laboratory moved to South Lake Union in Seattle."),
            record=RECORD,
            source=PMC,
            rules=r4_rules(config.rules["r4"]),
            label=config.rules["labels"]["R4"],
            staff=staff,
            year=2009,
            today=TODAY,
        )
        is None
    )


# --- R5: an author's affiliation is the resource --------------------------------------------


@pytest.mark.parametrize(
    ("affiliation", "expected"),
    [
        ("University of Washington Proteomics Resource, 850 Republican Street, Seattle, WA 98109, USA", True),
        ("Proteomics Resource, University of Washington, Seattle, WA", True),
        ("Department of Genome Sciences, University of Washington, Seattle, WA", False),
        ("Fred Hutchinson Cancer Center Proteomics Resource, Seattle, WA", False),
        ("Proteomics Resource, Fred Hutch, Seattle, WA", False),
    ],
)
def test_r5_recognises_the_resource_as_an_address(affiliation: str, expected: bool, config: Config) -> None:
    assert (
        is_resource_affiliation(
            affiliation, rules=r5_rules(config.rules["r5"]), r3=r3_rules(config.rules["r3"])
        )
        is expected
    )


def test_r5_evidence_quotes_the_affiliation(config: Config) -> None:
    address = "University of Washington Proteomics Resource, 850 Republican Street, Seattle, WA 98109, USA"
    found = affiliation_is_resource(
        [address, address, "Department of Chemistry, University of Washington"],
        record=RECORD,
        source=PMC,
        rules=r5_rules(config.rules["r5"]),
        r3=r3_rules(config.rules["r3"]),
        label=config.rules["labels"]["R5"],
        today=TODAY,
    )
    assert len(found) == 1  # the same address twice is one piece of evidence
    assert found[0]["criterion"] == 3
    assert found[0]["section"] == "affiliation"
    assert found[0]["excerpt"] == address


# --- R2 in the text -------------------------------------------------------------------------


def test_r2_matches_the_code_however_it_is_punctuated() -> None:
    for text in ("UWPR95794", "UWPR 95794", "UWPR-95794", "UWPR95794UWPR", "(UWPR95794)"):
        assert contains_award_code(text, "UWPR95794")


def test_r2_does_not_match_the_transposed_identifier() -> None:
    """Fixture A: `UWPR59794` is absent from that paper and must stay absent from the rules."""
    assert not contains_award_code("UWPR59794", "UWPR95794")


def test_near_misses_are_logged_not_counted(config: Config) -> None:
    found = near_misses(
        "Grant UWPR59794 supported this.", config.rules["r2"]["near_miss_pattern"], "UWPR95794"
    )
    assert found == ["UWPR59794"]


def test_r2_text_evidence_quotes_the_sentence(config: Config) -> None:
    sentence = (
        "This work was supported in part by the University of Washington’s Proteomics Resource (UWPR95794)."  # noqa: RUF001 - the curly apostrophe is a real variant (§4.6)
    )
    found = award_code_in_text(
        document(sentence),
        record=RECORD,
        source=PMC,
        code=config.rules["r2"]["code"],
        label=config.rules["labels"]["R2.text"],
        today=TODAY,
    )
    assert len(found) == 1
    assert found[0]["detail"] == {"match": "text"}
    assert found[0]["section"] == "acknowledgements"
    assert found[0]["criterion"] == 2


# --- R6: the OpenAlex full-text proxy -------------------------------------------------------


def test_r6_criterion_depends_on_the_phrase(config: Config) -> None:
    code = phrase_found(record=RECORD, doi="10.1/x", phrase="UWPR95794", label="l", today=TODAY)
    name = phrase_found(
        record=RECORD, doi="10.1/x", phrase='"Washington Proteomics Resource"', label="l", today=TODAY
    )
    assert code["criterion"] == 2  # the code is funding, criterion 2
    assert name["criterion"] == 4  # the name is facility use, criterion 4
    assert name["detail"] == {"phrase": "Washington Proteomics Resource", "query_date": TODAY}


def test_r6_has_no_excerpt(config: Config) -> None:
    """We never see the text, only that OpenAlex's index matched (Phase 1 §13)."""
    evidence = phrase_found(record=RECORD, doi="10.1/x", phrase="UWPR95794", label="l", today=TODAY)
    assert evidence["excerpt"] is None


def test_r6_records_the_query_it_ran() -> None:
    url = query_url('"Washington\'s Proteomics Resource"', "10.3389/fmars.2021.757245")
    assert url == (
        "https://api.openalex.org/works?filter=fulltext.search:"
        "%22Washington%27s%20Proteomics%20Resource%22,doi:10.3389%2Ffmars.2021.757245"
    )


# --- R7: a staff member thanked for analysis or technical help -------------------------------

R7_POSITIVE = [
    "We also thank Michael Riffle for assistance with data analysis and visualization.",
    "We thank Vagisha Sharma (University of Washington) for their excellent technical assistance.",
    "We thank Vagisha Sharma (University of Washington) for technical support in assembling data.",
    "We thank P. von Haller for technical assistance with the mass spectrometry experiments.",
    "We are grateful to Jimmy Eng for running the samples on the instrument.",
]

R7_NEGATIVE = [
    # C3: advice on software the staff member develops.
    "We thank Jimmy Eng for guidance in the development of the peptide fragmentation portion.",
    "We thank Jimmy Eng for advice with using X!Tandem.",
    "We thank Michael Riffle for contributions to the development of Limelight.",
    # C4: help depositing data.
    "We thank Vagisha Sharma for help depositing the data in Panorama Public.",
    # Discussion only (not C1's institutional thanks, which R3 covers).
    "We thank Michael Riffle for helpful discussions and comments on the manuscript.",
    # A bare surname never counts (§6.6 item 1).
    "We thank Sharma for technical assistance with the analysis.",
]


@pytest.mark.parametrize("sentence", R7_POSITIVE)
def test_r7_fires_on_analysis_and_technical_help(
    sentence: str, config: Config, staff: Sequence[StaffMember]
) -> None:
    outcome = r7_of(sentence, config, staff)
    assert [e["rule"] for e in outcome.evidence] == ["R7"]
    assert outcome.evidence[0]["criterion"] == 3
    assert "staff" in outcome.evidence[0]["detail"]


@pytest.mark.parametrize("sentence", R7_NEGATIVE)
def test_r7_does_not_fire_on_the_excluded_cases(
    sentence: str, config: Config, staff: Sequence[StaffMember]
) -> None:
    assert r7_of(sentence, config, staff).evidence == []


def test_r7_tests_the_purpose_phrase_not_the_sentence(config: Config, staff: Sequence[StaffMember]) -> None:
    """The false positive that made §6.6 use the purpose phrase: the help belonged to others."""
    sentence = (
        "We thank the Proteomics Facility at the FHCRC for help with MS, and Jimmy Eng "
        "for advice with using X!Tandem."
    )
    assert r7_of(sentence, config, staff).evidence == []


def test_r7_respects_tenure(config: Config, staff: Sequence[StaffMember]) -> None:
    """Hoopmann joined UWPR in 2024; earlier work of his is not UWPR support (D4, C5)."""
    sentence = "We thank Michael Hoopmann for technical assistance with the analysis."
    assert r7_of(sentence, config, staff, year=2019).evidence == []
    assert r7_of(sentence, config, staff, year=2025).evidence != []


def test_r7_ignores_another_institution_beside_the_name(config: Config, staff: Sequence[StaffMember]) -> None:
    """C5, worded by Phase 1 as "another institution next to the staff name"."""
    sentence = (
        "We thank Michael Hoopmann (Institute for Systems Biology) for technical assistance "
        "with the analysis."
    )
    assert r7_of(sentence, config, staff, year=2025).evidence == []


def test_r7_does_not_count_a_staff_author(config: Config, staff: Sequence[StaffMember]) -> None:
    """§6.6 item 2: co-authorship is not support (D2), so a thanked author does not fire R7."""
    sentence = "We also thank Michael Riffle for assistance with data analysis."
    assert r7_of(sentence, config, staff, authors=["Riffle M"]).evidence == []
    assert r7_of(sentence, config, staff, authors=["Michael Riffle"]).evidence == []
    assert r7_of(sentence, config, staff, authors=["Jane Q. Smith"]).evidence != []


def test_the_thanks_verb_may_be_in_the_previous_sentence(
    config: Config, staff: Sequence[StaffMember]
) -> None:
    sentence = "We thank several people. Michael Riffle provided technical assistance with the analysis."
    assert r7_of(sentence, config, staff).evidence != []


def test_a_thanked_staff_member_who_does_not_qualify_becomes_a_signal(
    config: Config, staff: Sequence[StaffMember]
) -> None:
    outcome = r7_of(R7_NEGATIVE[0], config, staff)
    assert outcome.evidence == []
    assert outcome.acknowledged == {"eng"}


def test_purpose_phrase_stops_at_the_limit() -> None:
    sentence = "We thank Michael Riffle for " + "x" * 300
    assert len(purpose_phrase(sentence, sentence.index("Riffle") + 6, 160)) == 160


def test_author_matching_tolerates_the_forms_sources_use(staff: Sequence[StaffMember]) -> None:
    riffle = next(member for member in staff if member.key == "riffle")
    assert is_author(riffle, ["Riffle, Michael"])
    assert is_author(riffle, ["M. Riffle"])
    assert is_author(riffle, ["Riffle"])
    assert not is_author(riffle, ["Jane Riffle-Smith"])
    assert not is_author(riffle, ["Vagisha Sharma"])


# --- signals --------------------------------------------------------------------------------


def test_signals_record_the_excluded_cores(config: Config) -> None:
    sentence = "Samples were run by the Quantitative and Functional Proteomics Core at UW."
    found = text_signals(
        document(sentence), rules=signal_rules(config.rules), r3=r3_rules(config.rules["r3"])
    )
    assert found == {"core_named:drc"}


def test_signals_record_the_department_of_medicine_resource(config: Config) -> None:
    sentence = "Analysis was performed by the Department of Medicine Mass Spectrometry Resource."
    found = text_signals(
        document(sentence), rules=signal_rules(config.rules), r3=r3_rules(config.rules["r3"])
    )
    assert "core_named:dom_msr" in found


@pytest.mark.parametrize(
    ("sentence", "signal"),
    [
        ("A UWPR nanospray source was utilized for the ionization voltage.", "uwpr_hardware_mention"),
        (
            "Fragment ions were calculated with the University of Washington Proteomics Resource "
            "fragmentation tool.",
            "uwpr_tool_mention",
        ),
        (
            "Spectra were processed with Comet from the University of Washington Proteomics Resource.",
            "uwpr_software_mention",
        ),
        ("Grant UWPR59794 supported this work.", "near_miss_identifier"),
    ],
)
def test_an_excluded_mention_still_leaves_a_signal(sentence: str, signal: str, config: Config) -> None:
    found = text_signals(
        document(sentence), rules=signal_rules(config.rules), r3=r3_rules(config.rules["r3"])
    )
    assert signal in found


def test_signals_are_sorted_and_unique() -> None:
    assert signals_for(
        text={"uwpr_tool_mention", "core_named:drc"},
        staff_authors=["riffle", "riffle"],
        acknowledged=["eng"],
    ) == ["core_named:drc", "staff_ack_other:eng", "staff_coauthor:riffle", "uwpr_tool_mention"]


def test_the_purpose_phrase_stops_at_the_next_persons_clause(
    config: Config, staff: Sequence[StaffMember]
) -> None:
    """§6.6's 160 characters are a ceiling, not a target.

    Here von Haller is thanked for mass-spectrometry help and two other people for discussions.
    Reading on past her clause would let their wording disqualify her.
    """
    sentence = (
        "We thank Priska von Haller for help with mass spectrometry, Martin Morgan for "
        "computational advice, and Phil Gafken for helpful discussions."
    )
    outcome = r7_of(sentence, config, staff)
    assert [e["detail"]["staff"] for e in outcome.evidence] == ["vonhaller"]


def test_a_named_service_survives_discussion_wording(config: Config, staff: Sequence[StaffMember]) -> None:
    """01a C2 decides that thanks for technical help is UWPR support.

    "Discussions and technical assistance" names two things, one of which qualifies outright.
    """
    for sentence in (
        "We thank Priska von Haller for their discussions and technical assistance.",
        "We thank Priska von Haller for technical assistance and helpful discussions.",
    ):
        assert r7_of(sentence, config, staff).evidence != [], sentence


def test_discussion_alone_still_disqualifies(config: Config, staff: Sequence[StaffMember]) -> None:
    """The veto is narrowed, not removed: help described only in passing does not count."""
    sentence = "We thank Priska von Haller for helpful discussions about running the instrument."
    assert r7_of(sentence, config, staff).evidence == []
