"""The resolver's two passes and the parser's edges (docs/09 §6, §9.1), beyond Appendix A."""

from functools import cache
from typing import Any

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.classify import FundingRules
from uwpr_pubs.funding.numbers import (
    agency_number,
    expand_year,
    fragments,
    misc_key,
    near_miss,
    nsf_number,
    parse_contracts,
    parse_nih,
    split_list,
    swap_variants,
)
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.funding.resolve import Answers, Lookups, Sighting, core_key, family, plan_lookups, resolve_work

NIH = "F4320332161"
NSF = "F4320306076"
NASA = "F4320306101"


@cache
def rules() -> FundingRules:
    config = load_config()
    return FundingRules.from_config(config.funding, config.rules["r2"]["code"])


def resolve(*raws: str, funder: str | None = NIH, links: tuple[str, ...] = (), **answers: Any) -> Any:
    sightings = [
        Sighting(raw, "openalex", funder="A funder", funder_id=funder, award_id="https://openalex.org/G7")
        for raw in raws
    ]
    return resolve_work(sightings, links, Answers(**answers), rules(), data_year=2026)


# --- The parser --------------------------------------------------------------------------


def test_the_parser_reads_i_for_1_and_refuses_what_is_not_a_serial() -> None:
    (number,) = parse_nih("R2I GM123456", rules().ics)
    assert (number.activity, number.fixes) == ("R21", ("I for 1",))
    (number,) = parse_nih("R01 GM12345I", rules().ics)
    assert number.written == "123451" and "I for 1" in number.fixes
    for text in ("R01 GM OOOO", "R01GM123", "R01GM1234567890", "R01GM123456X", "GM-O"):
        assert parse_nih(text, rules().ics) == (), text


def test_a_parsed_number_knows_its_cores_and_its_written_form() -> None:
    (full,) = parse_nih("K99 HL1037680", rules().ics)
    assert full.cores() == ("K99HL103768", "K99HL037680")
    assert full.cores("R00") == ("R00HL103768", "R00HL037680")
    assert full.number == "K99HL1037680"
    (bare,) = parse_nih("HL091055", rules().ics)
    assert (bare.cores(), bare.number, bare.full) == ((), "HL091055", False)


def test_lists_split_on_their_separators_but_not_inside_numbers_or_asides() -> None:
    assert split_list("R01 GM086688; P41 GM103533 and P30 DK017047") == [
        "R01 GM086688",
        "P41 GM103533",
        "P30 DK017047",
    ]
    assert split_list("P30 DK 089,507") == ["P30 DK 089,507"]
    assert split_list("1210644 (A.F.G.Q., L.L.), 1200836") == ["1210644 (A.F.G.Q., L.L.)", "1200836"]
    assert split_list("RTG 2467 - 391498659") == ["RTG 2467", "391498659"]
    assert split_list("P30 - DK017047") == ["P30 - DK017047"]
    assert split_list(" , ;") == []


def test_near_miss_edits() -> None:
    assert near_miss("0996", "092969") is False  # A4.13: no single edit reaches the linked P01
    assert near_miss("1282", "128203")  # two digits added at the end
    assert not near_miss("12A45", "123456")
    assert not near_miss("12345", "12345")


def test_contract_kinds() -> None:
    assert [(c.number, c.kind) for c in parse_contracts("HHSN 272201700036I")] == [
        ("HHSN272201700036I", "idiq")
    ]
    assert [
        c.kind for c in parse_contracts("75N93019D00003 75N93020F00001 75N93021C00012 HHSN268201000033C")
    ] == [
        "idiq",
        "task_order",
        "contract",
        "contract",
    ]


def test_agency_numbers() -> None:
    assert agency_number("FAPESP 2016/00696-3", ["FAPESP"], year_prefix=True, data_year=2026) == "2016006963"
    assert expand_year("98/12345-6", 2026) == "1998/12345-6"
    assert expand_year("16/00696-3", 2026) == "2016/00696-3"
    assert agency_number("NNX16AO69A:0061", data_year=2026, drop_sub_award=True) == "NNX16AO69A"
    assert agency_number("NSFC grant 31200105", ["NSFC"], data_year=2026) == "31200105"
    assert agency_number("ALTF 933-2015", data_year=2026) == "ALTF9332015"
    assert nsf_number("NSF OCE-0939564", ["NSF"]) == "0939564"
    assert nsf_number("OPP 144374") is None
    assert swap_variants("NA140AR") == ("NAI40AR", "NA14OAR")


def test_fragments_list_the_longest_number_they_are_part_of() -> None:
    assert fragments(["HDTRA1", "HDTRA118", "HDTRA11810001"]) == {
        "HDTRA1": ("HDTRA11810001",),
        "HDTRA118": ("HDTRA11810001",),
    }
    assert fragments(["ANR10", "ANR10IAHU0001", "ANR10IAHU01"])["ANR10"] == ("ANR10IAHU0001",)
    assert fragments(["12", "123456"]) == {}  # too short to be a fragment
    assert fragments(["123", "ab123", "ab123cd"]) == {"123": ("ab123cd",), "ab123": ("ab123cd",)}


def test_a_misc_key_needs_a_letter_or_digit() -> None:
    assert misc_key("P01 HL0996") == "MISC:P01HL0996"
    assert misc_key("--") is None


# --- Keys ----------------------------------------------------------------------------------


def test_keys_and_their_families() -> None:
    assert core_key("R01GM086688") == "NIH:R01GM086688"
    assert core_key("I01BX000531", "VA") == "VA:I01BX000531"
    assert core_key("N01HV028179") == "NIH-contract:N01HV028179"
    with pytest.raises(ValueError, match="restore"):
        core_key("27220170005")
    assert [family(key, rules()) for key in (
        "NIH:R01GM086688", "VA:I01BX000531", "NIH-contract:HHSN272201700059C",
        "NIH-contract:HHSN272201700036I:75N93020F00001", "NSF:1233014", "USA:NASA:NCC958", "WT:092809Z10Z",
        "F4320310256:A1", "MISC:P01HL0996",
    )] == [
        "reporter", "reporter", "nih_contract", "nih_task_order", "nsf", "us_federal", "agency",
        "openalex_funder", "miscellaneous",
    ]  # fmt: skip


# --- Resolution ------------------------------------------------------------------------------


def test_sightings_are_pooled_however_the_string_is_written() -> None:
    work = resolve(
        "P30 DK017047", "P30DK017047", "p30-dk017047", "P30 DK017047", reporter={"P30DK017047": "NIH"}
    )
    (string,) = work.strings
    assert string.raw == "P30 DK017047"  # the most frequent form
    assert string.written == ("P30 DK017047", "P30DK017047", "p30-dk017047")
    assert string.openalex_awards == ("G7",)
    assert string.funders == ("A funder",)


def test_head_and_tail_both_held_list_neither() -> None:
    """§6.3: two serial candidates held are two grants, not phases of one; the string is reported."""
    work = resolve("R01 GM1234567", reporter={"R01GM123456": "NIH", "R01GM234567": "NIH"})
    (string,) = work.strings
    assert string.outcome == "unresolved"
    assert string.note is not None and "ambiguous" in string.note


def test_a_bare_serial_with_nothing_to_confirm_it_is_not_a_grant_of_its_own() -> None:
    held_twice = resolve("GM123456", reporter_splits={("GM", "123456"): ("R01GM123456", "K99GM123456")})
    assert held_twice.strings[0].grants == ("MISC:GM123456",)
    unknown = resolve("GM123456", funder=NSF, nsf=frozenset())
    assert unknown.strings[0].grants == ("MISC:GM123456",)


def test_task_orders_take_their_idiq_from_reporter() -> None:
    alone = resolve("75N93020F00001", task_orders={"75N93020F00001": "HHSN272201700036I"})
    assert alone.grants == ("NIH-contract:HHSN272201700036I:75N93020F00001",)
    unknown = resolve("75N93020F00001")
    assert unknown.grants == ("NIH-contract:75N93020F00001",)
    idiq = resolve("HHSN272201700036I")
    assert idiq.grants == ("NIH-contract:HHSN272201700036I",)
    old = resolve("NO1-HV-28179")
    assert (old.grants, old.strings[0].method) == (("NIH-contract:N01HV028179",), "normalised")


def test_a_funder_no_agency_is_configured_for_keys_its_own_grants() -> None:
    work = resolve("A172539 X", funder="https://openalex.org/F4320310256")
    assert work.grants == ("F4320310256:A172539X",)
    assert work.strings[0].method == "openalex_award"
    nobody = resolve("A172539", funder=None)
    assert nobody.grants == ("MISC:A172539",)
    several = resolve_work(
        [Sighting("B1234", "openalex", funder_id="F1"), Sighting("B1234", "crossref", funder_id="F2")],
        [],
        Answers(),
        rules(),
        data_year=2026,
    )
    assert several.grants == ("MISC:B1234",)


def test_an_override_can_name_a_whole_list_and_a_miscellaneous_key() -> None:
    raw = "DP170102108; DP130100679"
    whole = resolve_work(
        [Sighting(raw, "crossref", funder_id="10.13039/501100000923")],
        [],
        Answers(),
        rules(),
        overrides={override_match_key(raw): "ARC:DP170102108"},
        data_year=2026,
    )
    assert [(s.raw, s.grants, s.method) for s in whole.strings] == [(raw, ("ARC:DP170102108",), "override")]
    misc = resolve_work(
        [Sighting("S10OD032290", "openalex", funder_id=NIH)],
        [],
        Answers(),
        rules(),
        overrides={"S10OD032290": "MISC:S10OD032290"},
        data_year=2026,
    )
    assert (misc.strings[0].outcome, misc.strings[0].method) == ("unresolved", "override")


def test_a_string_with_nothing_to_key_it_by_is_no_grant() -> None:
    """Only if the no-digit not-grant pattern were taken out of the configuration."""
    funding = dict(load_config().funding)
    funding["not_grants"] = [entry for entry in funding["not_grants"] if entry.get("pattern") != "[^0-9]*"]
    bare = FundingRules.from_config(funding, "UWPR95794")
    work = resolve_work(
        [Sighting("--", "pubmed", pubmed_agency="NIH HHS")], [], Answers(), bare, data_year=2026
    )
    assert (work.strings[0].outcome, work.strings[0].method) == ("not_a_grant", None)


def test_a_us_federal_number_usaspending_knows_stands_as_written() -> None:
    work = resolve("NNX14AJ87G", funder=NASA, usaspending=frozenset({("NASA", "NNX14AJ87G")}))
    assert (work.grants, work.strings[0].method) == (("USA:NASA:NNX14AJ87G",), "agency_number")


# --- Planning ----------------------------------------------------------------------------


def test_the_first_round_asks_for_everything_the_strings_could_be() -> None:
    sightings = [
        Sighting("R01 GM086688", "pubmed", pubmed_agency="NIGMS NIH HHS", award_id="G1"),
        Sighting("K99 HL103768", "openalex", funder_id=NIH, award_id="https://openalex.org/G2"),
        Sighting("HHSN272201700036I, 75N93020F00001", "jats"),
        Sighting("N01-HV-28179", "jats"),
        Sighting("NSF DBI-1933311", "openalex", funder_id=NSF, award_id="G3"),
        Sighting("NA140AR4170078", "openalex", funder_id="F4320332292"),
        Sighting("UWPR95794", "openalex", funder_id="F4320310094", award_id="G4"),
        Sighting("CAREER", "openalex", funder_id=NSF, award_id="G5"),
        Sighting("U19AG02312", "openalex", funder_id=NIH, award_id="G6"),
    ]
    overrides = {
        override_match_key("U19AG02312"): "NIH:U19AG023122",
        "X": "NSF:1443474",
        "Y": "USA:NASA:NNX13AJ12G",
        "Z": "MISC:P01HL0996",
        "W": None,
    }
    plan = plan_lookups(sightings, ["P30DK017047"], rules(), overrides=overrides, data_year=2026)
    assert plan.reporter_cores == {
        "R01GM086688",
        "R37GM086688",
        "K99HL103768",
        "R00HL103768",
        "N01HV028179",
        "U19AG023122",
    }
    assert plan.contracts == {"HHSN272201700036I", "75N93020F00001"}
    assert plan.nsf == {"1933311", "1443474"}
    assert ("NOAA", "NA140AR4170078") in plan.usaspending and ("NOAA", "NA14OAR4170078") in plan.usaspending
    assert ("NASA", "NNX13AJ12G") in plan.usaspending
    assert plan.openalex_awards == {
        "G1",
        "G2",
        "G3",
    }  # not the resource code's, a not-grant's or an override's
    assert plan.reporter_splits == frozenset()


def test_the_second_round_asks_only_what_the_first_answers_leave_open() -> None:
    sightings = [
        Sighting("GM111097", "openalex", funder_id=NIH),
        Sighting("R01 GM111097", "openalex", funder_id=NIH),
        Sighting("CA282268", "openalex", funder_id=NIH),
        Sighting("DK59637", "openalex", funder_id=NIH),
        Sighting("P01 HL0996", "openalex", funder_id=NIH),
        Sighting("HL12345", "openalex", funder_id=NIH),
    ]
    first = Answers(reporter={"R01GM111097": "NIH"})
    plan = plan_lookups(sightings, ["U24DK059637"], rules(), data_year=2026, answers=first)
    assert plan.reporter_splits == {("CA", "282268"), ("HL", "000996")}
    combined = plan | Lookups(nsf=frozenset({"1233014"}))
    assert combined.nsf == {"1233014"} and combined.reporter_splits == plan.reporter_splits
