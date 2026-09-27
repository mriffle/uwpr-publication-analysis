"""`config/funding.yaml` and what it classifies (docs/09 §6.4, §6.12-6.15, §8.4, §11.4)."""

import re
from functools import cache

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.classify import (
    NIH,
    FundingRules,
    agency_category,
    choose_agency,
    facility_contract,
    funder_id,
    funder_name_key,
    institution_wide,
    is_resource_code,
    named_agencies,
    nih_category,
    not_a_grant,
    unconfigured_funders,
)
from uwpr_pubs.funding.numbers import AGENCY_CODE, GRANT_KEY
from uwpr_pubs.schemas import schema_errors


@cache
def rules() -> FundingRules:
    config = load_config()
    return FundingRules.from_config(config.funding, config.rules["r2"]["code"])


# The activity codes of the 454 grants RePORTER links to the corpus, by each grant's first row
# (docs/09 §3.2: 58 codes), and the category §11.4 gives each.
LINKED_ACTIVITY_CODES = {
    "DP1": "research",
    "DP2": "research",
    "DP3": "research",
    "F30": "training",
    "F31": "training",
    "F32": "training",
    "I01": "research",
    "K01": "training",
    "K07": "training",
    "K08": "training",
    "K12": "training",
    "K22": "training",
    "K23": "training",
    "K24": "training",
    "K25": "training",
    "K99": "training",
    "KL2": "training",
    "M01": "center",
    "N01": "contract",
    "P01": "center",
    "P20": "center",
    "P30": "center",
    "P40": "center",
    "P41": "center",
    "P42": "center",
    "P50": "center",
    "P51": "center",
    "P60": "center",
    "R00": "research",
    "R01": "research",
    "R03": "research",
    "R21": "research",
    "R24": "center",
    "R25": "training",
    "R33": "research",
    "R35": "research",
    "R37": "research",
    "R42": "research",
    "R43": "research",
    "R44": "research",
    "R56": "research",
    "RC2": "research",
    "RF1": "research",
    "RM1": "research",
    "S10": "instrument",
    "T15": "training",
    "T32": "training",
    "T34": "training",
    "U01": "research",
    "U19": "center",
    "U24": "center",
    "U2C": "center",
    "U41": "center",
    "U42": "center",
    "U54": "center",
    "UL1": "center",
    "UM1": "research",
    "ZIA": "research",
}


def test_every_linked_activity_code_has_one_of_the_five_categories() -> None:
    assert len(LINKED_ACTIVITY_CODES) == 58
    for code, category in LINKED_ACTIVITY_CODES.items():
        assert nih_category(code, rules()) == category, code


def test_other_codes_follow_the_table() -> None:
    assert [nih_category(code, rules()) for code in ("G20", "TL1", "D43", "UH3", "UG3", "SC1", "Z01")] == [
        "instrument",
        "training",
        "training",
        "research",
        "research",
        "research",
        "research",
    ]
    assert nih_category("U10", rules()) == "other"
    assert nih_category(None, rules()) == "other"


def test_nsf_categories_come_from_its_programme_and_award_type() -> None:
    nsf = rules().agencies["NSF"]
    assert (
        agency_category(nsf, {"programme": "Graduate Research Fellowship", "type": "Fellowship Award"})
        == "training"
    )
    assert (
        agency_category(nsf, {"programme": "POLAR POST DOC, POST DOC/TRAVEL", "type": "Fellowship Award"})
        == "training"
    )
    assert (
        agency_category(nsf, {"programme": "STC Integrative Partnrshps Adm, STCs - 2010 Class"}) == "center"
    )
    assert (
        agency_category(nsf, {"programme": "Chemical Oceanography", "type": "Standard Grant"}) == "research"
    )
    assert agency_category(rules().agencies["WT"], {"programme": "anything"}) == "other"
    assert agency_category(None, {}) == "other"


APPENDIX_B = {
    "ANID:15130011",
    "ANID:1523A0008",
    "ANID:FB210008",
    "ANR:ANR10IAHU0001",
    "ANR:ANR10LABX0062",
    "EU:101080544",
    "EU:101103253",
    "EU:101195186",
    "EU:115760",
    "EU:115766",
    "EU:722493",
    "EU:733032",
    "EU:823839",
    "VR:201900217",
    "WT:092809Z10Z",
    "USA:NASA:NCC958",
    "USA:NASA:NNX16AO69A",
    "USA:NOAA:NA14OAR4170078",
    "NSF:0718124",
    "NSF:0939564",
    "NSF:1256082",
    "NSF:1762114",
    "NSF:2140004",
}


def test_every_appendix_b_key_is_institution_wide_with_its_reason() -> None:
    assert set(rules().institution_wide) == APPENDIX_B
    for key in APPENDIX_B:
        assert GRANT_KEY.fullmatch(key)
        assert institution_wide(key, None, rules())
    assert institution_wide("NSF:0939564", None, rules()) == "NSF Science and Technology Center (C-DEBI)"


def test_nsf_programmes_make_an_award_institution_wide() -> None:
    """§6.15: GRFP and STC awards on the NSF API's programme name; a fellowship to one person
    is not institution-wide."""
    assert (
        institution_wide("NSF:9999999", "Graduate Research Fellowship", rules())
        == "NSF GRFP institutional award"
    )
    assert institution_wide("NSF:9999998", "STC Integrative Partnrshps Adm, STCs - 2010 Class", rules())
    assert institution_wide("NSF:0444148", "POLAR POST DOC, POST DOC/TRAVEL", rules()) is None
    assert institution_wide("NSF:1233014", None, rules()) is None
    assert institution_wide("AHA:10SDG3600027", "Graduate Research Fellowship", rules()) is None


HYPHEN, EN_DASH = chr(0x2010), chr(0x2013)
APPENDIX_C = {
    "DE-AC02-05CH11231": [
        "DE-AC02-05CH11231.",
        "DE AC02 05CH11231",
        "AC02-05CH11231",
        "05CH11231",
        f"DEAC02{EN_DASH}05CH11231",
    ],
    "DE-AC02-06CH11357": [
        "Contract DE-AC02-06CH11357",
        "DE- AC02-06-CH11357",
        f"AC02{HYPHEN}06CH11357",
        "06CH11357",
    ],
    "DE-AC05-76RL01830": [
        "DE-AC05-76RLO 1830",
        f"DE{HYPHEN}AC05{HYPHEN}76RLO1830",
        "76RLO 1830",
        "DEAC0576RL01830",
        "76RL01830",
    ],
    "DE-SC0012704": [
        "Contract No: DESC0012704",
        "Contract No. DE-SC0012704",
        "No. DE-SC0012704",
        "SC0012704.",
    ],
}


@pytest.mark.parametrize(
    ("contract", "form"), [(contract, form) for contract, forms in APPENDIX_C.items() for form in forms]
)
def test_every_appendix_c_form_is_a_facility_contract(contract: str, form: str) -> None:
    assert facility_contract(form, rules()) == contract


@pytest.mark.parametrize("form", ["DE-AC02", "DE-AC02-", "DE-AC05", "DE-AC05?", "DE-AC52-07NA27344"])
def test_the_de_ac_pattern_catches_the_rest(form: str) -> None:
    assert facility_contract(form, rules()) == "DE-AC"


@pytest.mark.parametrize(
    "form", ["DOE-SC10010566", "SC10010566", "DE-SC0010566", "R01GM086688", "DEACTIVATED 12"]
)
def test_a_real_doe_grant_is_no_facility_contract(form: str) -> None:
    assert facility_contract(form, rules()) is None


def test_the_resource_code_is_read_from_the_rules() -> None:
    assert load_config().rules["r2"]["code"] == "UWPR95794"
    assert "UWPR95794" not in (load_config().funding.__repr__())
    for form in ("UWPR95794", "UWPR 95794", "uwpr-95794", "the UW Proteome Resource UWPR95794"):
        assert is_resource_code(form, rules()), form
    assert not is_resource_code("UWPR9579", rules())


@pytest.mark.parametrize(
    "form",
    [
        "K99/R00",
        "K99-R00",
        "k99 - r00",
        "PGT121",
        "35O22",
        "-0001",
        "Project 3",
        "N/A",
        "na",
        "Z/17/Z",
        "AEI/10",
        "2018-",
        "2015-2018",
        "1999",
        "SCR_022606",
        "RRID:SCR_022606",
        "501100011033",
        "CAREER",
        "Research Grant",
    ],
)
def test_not_grants_match_the_whole_string(form: str) -> None:
    assert not_a_grant(form, rules()), form


@pytest.mark.parametrize(
    "form",
    [
        "K99/R00 1K99HL103768-01",
        "2019-00217",
        "2016-2518",
        "2021-02468",
        "R01GM130391",
        "PGT1210",
        "H2020-123456",
        "HBM4EU",
        "100576",
        "2015AA020108",
    ],
)
def test_grant_numbers_are_not_not_grants(form: str) -> None:
    assert not_a_grant(form, rules()) is None, form


def test_funder_ids_are_read_in_any_form() -> None:
    assert funder_id("https://openalex.org/F4320306076") == "F4320306076"
    assert funder_id("f4320306076") == "F4320306076"
    assert funder_id("http://dx.doi.org/10.13039/100000057") == "10.13039/100000057"
    assert funder_id("https://doi.org/10.13039/100000057") == "10.13039/100000057"
    assert funder_id("10.13039/501100000780") == "10.13039/501100000780"
    assert funder_id("National Science Foundation") is None
    assert funder_id(None) is None
    assert funder_id("") is None


def test_nih_attribution_is_by_id_and_pubmed_never_by_a_name_pattern() -> None:
    """§6.4: the research's pattern "national institute(s) of" caught NIFA, which is USDA's."""
    nifa = named_agencies(
        ["https://openalex.org/F4320332299"], ["National Institute of Food and Agriculture"], rules()
    )
    assert nifa == {"USDA"}
    assert named_agencies([], ["NIGMS NIH HHS"], rules()) == {NIH}
    assert named_agencies([], ["PHS HHS"], rules()) == {NIH}
    assert named_agencies([], ["National Institute of Allergy and Infectious Diseases"], rules()) == {NIH}
    assert named_agencies(["10.13039/100000057"], [None], rules()) == {NIH}
    assert named_agencies(["F4320306085", "F4320332505"], [], rules()) == {NIH}  # HHS and PHS
    assert named_agencies([], ["National Institute for Health and Care Research"], rules()) == set()
    assert named_agencies([None, "F9"], [], rules()) == set()


def test_a_name_never_names_nih_hhs_or_phs() -> None:
    """§6.4 stands for NIH: no name pattern reaches it, its institutes, HHS or PHS, nor NIFA."""
    names = [
        "National Institutes of Health",
        "NIH",
        "NIGMS NIH HHS",
        "PHS HHS",
        "National Institute of General Medical Sciences",
        "U.S. Department of Health and Human Services",
        "Public Health Service",
        "National Institute of Food and Agriculture",
    ]
    assert named_agencies([], [], rules(), names) == set()
    assert not rules().agencies[NIH].name_patterns


@pytest.mark.parametrize("agency", [{"code": "NIH"}, {"code": "HHS"}, {"code": "PHS"}, {"parent": "HHS"}])
def test_nih_hhs_and_phs_may_have_no_funder_names(agency: dict[str, str]) -> None:
    funding = load_config().funding
    entry = {**funding["agencies"][1], **agency, "funder_names": ["national institutes of health"]}
    entry.setdefault("code", "NIHX")
    with pytest.raises(ValueError, match="by funder ID and PubMed alone"):
        FundingRules.from_config({**funding, "agencies": [entry]}, "UWPR95794")
    errors = schema_errors("config/funding", {**funding, "agencies": [entry]})
    assert errors == [
        "schema: agencies/0/funder_names: ['national institutes of health'] is expected to be empty"
    ]


def test_funder_names_are_written_casefolded() -> None:
    funding = load_config().funding
    entry = {**funding["agencies"][1], "funder_names": ["National Science Foundation"]}
    with pytest.raises(ValueError, match="casefolded"):
        FundingRules.from_config({**funding, "agencies": [entry]}, "UWPR95794")
    assert schema_errors("config/funding", {**funding, "agencies": [entry]})
    entry["funder_names"] = ["straße"]  # casefolds to "strasse", which a name would be compared as
    with pytest.raises(ValueError, match="casefolded"):
        FundingRules.from_config({**funding, "agencies": [entry]}, "UWPR95794")


NO_BREAK_SPACE, FULLWIDTH_NSF = chr(0xA0), "".join(chr(0xFEE0 + ord(letter)) for letter in "NSF")
APOSTROPHE, OKINA = chr(0x2019), chr(0x02BB)  # as the sources write them
EM_DASH = chr(0x2014)


def test_a_funders_name_is_compared_normalised() -> None:
    assert (
        funder_name_key(f"  National{NO_BREAK_SPACE}Science   Foundation. ") == "national science foundation"
    )
    assert funder_name_key(FULLWIDTH_NSF) == "nsf"  # NFKC
    assert funder_name_key("“Washington Sea Grant Award”,") == "washington sea grant award"
    assert funder_name_key("National Science Foundation (NSF)") == "national science foundation (nsf)"
    assert funder_name_key("(NSF)") == "(nsf)"
    assert funder_name_key("--") == ""


# Whole names each named agency's patterns accept (their own and the research's), and look-alikes
# they must not: another agency's name, a longer name that starts or ends the same, a sentence.
FUNDER_NAMES = {
    "NSF": [
        "National Science Foundation",
        "NSF",
        "U.S. National Science Foundation",
        "US National Science Foundation",
        "National Science Foundation (NSF)",
        "National Science Foundation Graduate Research Fellowship Program",  # W-000014, B3b
        "NSF Graduate Research Fellowship Program",
        "National Science Foundation Graduate Research Fellowship",
        "U.S. National Science Foundation Graduate Research Fellowships",
        "NSF Graduate Research Fellowship Program (GRFP)",
        "NSF GRFP",
        "NSF-GRFP",
    ],
    "NOAA": [
        "National Oceanic and Atmospheric Administration",
        "NOAA",
        "Washington Sea Grant Award",
        "Washington Sea Grant, University of Washington",
    ],
    "EU": [
        "European Union",
        "European Commission",
        "European Commission H2020 program",
        "H2020 EU EPIC-XS",
        "Zoonoses Anticipation and Preparedness Initiative",
    ],
    "UW": [
        "University of Washington Royalty Research Fund",
        "Royalty Research Fund, University of Washington",
    ],
    "HIDOH": ["Hawaii Department of Heath", "Hawaii State Department of Health"],
    "CUHK": [
        "Direct Grants from the Chinese University of Hong Kong",
        "The Chinese University of Hong Kong",
    ],
    "DLR": [
        "DLR Space program",
        "German Aerospace Center",
        "Deutsches Zentrum für Luft- und Raumfahrt (DLR)",
    ],
    "RGC": [
        "Research Grants Council General Research Fund",
        "Research Grants Council of the Hong Kong Special Administrative Region",
        "Hong Kong University Grants Committee Area of Excellence Scheme",
        "University Grants Committee of Hong Kong",
    ],
    "FWO": [
        f"Research Foundation {EN_DASH} Flanders",  # an en dash, as Crossref writes it on W-000014 (B3b)
        "Research Foundation - Flanders",
        "Research Foundation Flanders",
        "Research Foundation-Flanders",
        "Research Foundation - Flanders (FWO)",
        "Research Foundation Flanders (FWO-Vlaanderen)",
        f"The Research Foundation {EM_DASH} Flanders",
        "Fonds Wetenschappelijk Onderzoek",
        f"Fonds Wetenschappelijk Onderzoek {EN_DASH} Vlaanderen",
        "Fonds voor Wetenschappelijk Onderzoek - Vlaanderen",
        "Fonds Wetenschappelijk Onderzoek (FWO)",
        "Flemish Research Foundation",
        "FWO",
        "FWO Vlaanderen",
        "FWO-Vlaanderen",
    ],
}
LOOK_ALIKES = [
    "Swiss National Science Foundation",
    "National Natural Science Foundation of China",
    "National Science Foundation of China",
    "National Science Foundation of Sri Lanka",
    "Swiss NSF",
    "NSFC",
    "National Sleep Foundation",
    "Washington Research Foundation",
    "Washington State Department of Health",
    "European Molecular Biology Organization",
    "European Research Council under the European Union's Horizon 2020 research and innovation programme",
    "European Union's Horizon 2020 research and innovation programme under grant agreement No 823839",
    "University of Washington",
    "University of Washington Proteomics Resource",
    f"Fred Hutch/University of Washington/Seattle Children{APOSTROPHE}s Cancer Consortium",
    "Royalty Research Fund",
    "University of Hawaii",
    f"Hawai{OKINA}i Institute of Marine Biology",
    "The Chinese University of Hong Kong, Shenzhen",
    "Chinese University of Hong Kong Shenzhen",
    "City University of Hong Kong",
    "DLR",
    "DLR Projektträger",
    "Projektträger im DLR",
    "Research Grants Council",
    "University Grants Commission",
    "University Grants Committee",
    "Innovation and Technology Commission, Hong Kong Special Administrative Region Government",
    "Graduate Research Fellowship Program",  # it does not say whose
    "National Defense Science and Engineering Graduate Fellowship",
    "Swiss National Science Foundation Graduate Research Fellowship",
    "NSF Graduate Research Fellowship Program under Grant No. DGE-2140004",
    "NSF Graduate Research Fellowship Program and the Hertz Foundation",
    "Research Foundation",
    "National Research Foundation",
    "Flanders Institute for Biotechnology",
    "Flanders Innovation & Entrepreneurship",
    "Fonds de la Recherche Scientifique - FNRS",
    "F.R.S.-FNRS",
    "Austrian Science Fund FWF",
    "FWF",
    f"Research Foundation {EN_DASH} Flanders and the Special Research Fund of Ghent University",
    "Research Foundation Flanders Odysseus programme",
]


@pytest.mark.parametrize(
    ("code", "name"), [(code, name) for code, names in FUNDER_NAMES.items() for name in names]
)
def test_a_funder_name_names_its_agency(code: str, name: str) -> None:
    assert named_agencies([], [], rules(), [name]) == {code}


@pytest.mark.parametrize("name", LOOK_ALIKES)
def test_a_look_alike_name_names_no_agency(name: str) -> None:
    assert named_agencies([], [], rules(), [name]) == set(), name


def test_no_agencys_names_reach_another_configured_agency() -> None:
    """Every agency with funder names is tested above, and none of its patterns matches another
    configured agency's name or short name: "national science foundation" is not the SNSF's."""
    agencies = rules().agencies.values()
    assert {agency.code for agency in agencies if agency.name_patterns} == set(FUNDER_NAMES)
    for agency in agencies:
        others = [
            agency_name
            for other in agencies
            if other is not agency
            for agency_name in (other.name, other.short_name)
        ]
        for name in filter(None, others):
            assert not any(p.fullmatch(funder_name_key(name)) for p in agency.name_patterns), (
                agency.code,
                name,
            )


def test_unconfigured_funders_are_openalex_funders_nobody_claims() -> None:
    assert unconfigured_funders(["F4320310256", "F4320306076", "10.13039/100000865", None], rules()) == {
        "F4320310256"
    }


@pytest.mark.parametrize(
    ("named", "numbers", "chosen"),
    [
        ({"NIH", "AHA"}, {"AHA": "10SDG3600027"}, "AHA"),
        ({"KHIDI", "NRF"}, {"KHIDI": "HI14C1277", "NRF": "HI14C1277"}, "KHIDI"),
        ({"GATES", "NWO"}, {"GATES": "INV002022", "NWO": "INV002022"}, "GATES"),
        ({"NOAA", "UW"}, {"NOAA": "NA14OAR4170078", "UW": "NA14OAR4170078"}, "NOAA"),
        ({"VR", "SSF"}, {"VR": "SB160039", "SSF": "SB160039"}, "SSF"),
        ({"WT", "CIHR"}, {"WT": "1097737", "CIHR": "1097737"}, None),
        ({"NOAA"}, {"NOAA": "RSFA8"}, None),
        ({"NIH"}, {}, None),
    ],
)
def test_several_agencies_named_leave_the_one_whose_pattern_fits(
    named: set[str], numbers: dict[str, str], chosen: str | None
) -> None:
    assert choose_agency(named, numbers, rules()) == chosen


def test_the_configuration_is_consistent() -> None:
    funding = load_config().funding
    codes = [agency["code"] for agency in funding["agencies"]]
    assert len(codes) == len(set(codes))
    assert all(AGENCY_CODE.fullmatch(code) for code in codes)
    ids = [
        i
        for agency in funding["agencies"]
        for i in (*agency["openalex_funders"], *agency["crossref_funder_dois"])
    ]
    assert len(ids) == len(set(ids)), "one funder ID names one agency"
    parents = {agency.get("parent") for agency in funding["agencies"]} - {None}
    assert parents <= set(codes)
    patterns = [
        *(agency["number_pattern"] for agency in funding["agencies"] if agency["number_pattern"]),
        *(p for agency in funding["agencies"] for p in agency["pubmed_agency_patterns"]),
        *(p for agency in funding["agencies"] for p in agency.get("funder_names", [])),
        *(entry["pattern"] for entry in funding["not_grants"] if "pattern" in entry),
        *(entry["pattern"] for entry in funding["facility_contracts"] if "pattern" in entry),
    ]
    for pattern in patterns:
        re.compile(pattern)
    assert all(len(ic) == 2 for ic in rules().ics)
    assert {"K99", "R00", "R33", "R21", "R61", "UH2", "UH3", "UG3", "R01", "R37"} == set(rules().partners)
    assert rules().partners["R33"] == {"R21", "R61"}
    assert rules().openalex_excluded == {"gepris"}
    assert rules().openalex_multipliers == {"anid_github": 1000}
    assert (rules().large_award_review_usd, rules().total_drop_alert) == (20_000_000, 0.05)
