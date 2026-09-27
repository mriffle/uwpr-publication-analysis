"""Every resolution case of docs/09 Appendix A, as the rules of §6 decide it (docs/09 §14).

Each row is a work carrying the row's strings, with what the rule needs beyond them: the funder
the sources name (by ID, as a source gives it), the cores RePORTER links to the work, the cores
RePORTER holds, what the NSF API and USAspending know, and any grant override. A row marked †
in the appendix follows §6, not the research. Rows that depend on an Appendix E override are
tested without it and with it.
"""

import json
import re
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.classify import FundingRules, institution_wide
from uwpr_pubs.funding.numbers import AGENCY_CODE, GRANT_KEY, parse_nih, split_list
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.funding.resolve import Answers, Sighting, StringOutcome, WorkFunding, resolve_work

ROOT = Path(__file__).resolve().parent.parent
HYPHEN, EN_DASH = chr(0x2010), chr(0x2013)  # as the sources write them, U+2010 and U+2013

# Funders as the sources name them: OpenAlex funder IDs, and one Crossref funder DOI.
NIH = "F4320332161"
NIA = "F4320337337"
HHS = "F4320306085"
PHS = "F4320332505"
AHA = "F4320306230"
NSF = "F4320306076"
NSF_IOS = "10.13039/100000154"
EMBO = "F4320307844"
UW = "F4320310094"
GATES = "F4320306137"
ARGONNE = "F4320338284"
CINCINNATI = "F4320310256"  # the University of Cincinnati: no agency is configured for it
NIFA = "F4320332299"
IARPA = "F4320333051"
DTRA = "F4320332186"
NOAA = "F4320332181"
SEA_GRANT = "F4320332292"
NASA = "F4320306101"
DOE = "F4320306084"
BATTELLE = "F4320306250"
VR = "F4320322581"
AEI = "F4320335598"
WT = "F4320311904"
BMBF = "F4320321114"
ANR = "F4320320883"
DFG = "F4320320879"
EU = "F4320320300"
CIHR = "F4320334506"
MOORE = "F4320306202"
VA = "F4320306127"
EC = "F4320320300"
LOCKE = "F1"  # a funder no agency is configured for


@cache
def rules() -> FundingRules:
    config = load_config()
    return FundingRules.from_config(config.funding, config.rules["r2"]["code"])


@dataclass(frozen=True)
class Case:
    """One row: its strings on one work, what they should list, and the row's context."""

    id: str
    strings: tuple[str, ...]
    outcome: str
    method: str | None
    grants: tuple[str, ...] = ()
    funders: tuple[str, ...] = (NIH,)
    links: tuple[str, ...] = ()
    holds: tuple[str, ...] = ()  # cores RePORTER holds, beyond the links
    splits: dict[tuple[str, str], tuple[str, ...]] = field(default_factory=dict)
    others: tuple[str, ...] = ()  # the work's other strings, which the rule may need
    nsf: tuple[str, ...] = ()
    usaspending: tuple[tuple[str, str], ...] = ()
    agency_codes: dict[str, str] = field(default_factory=dict)
    overrides: dict[str, str | None] = field(default_factory=dict)


def resolve(case: Case) -> WorkFunding:
    sightings = [
        Sighting(raw, "openalex", funder_id=funder)
        for raw in (*case.strings, *case.others)
        for funder in case.funders
    ]
    held = {core: case.agency_codes.get(core, "NIH") for core in (*case.links, *case.holds)}
    for cores in case.splits.values():
        held.update({core: case.agency_codes.get(core, "NIH") for core in cores})
    answers = Answers(
        reporter=held,
        reporter_splits=case.splits,
        nsf=frozenset(case.nsf),
        usaspending=frozenset(case.usaspending),
    )
    overrides = {override_match_key(raw): key for raw, key in case.overrides.items()}
    return resolve_work(sightings, case.links, answers, rules(), overrides=overrides, data_year=2026)


def outcomes_of(case: Case, work: WorkFunding) -> list[StringOutcome]:
    """The work's strings that are the row's own, found by any form the sources wrote."""
    pieces = {piece for raw in case.strings for piece in split_list(" ".join(raw.split()))}
    return [string for string in work.strings if pieces & set(string.written)]


def check(case: Case) -> None:
    work = resolve(case)
    found = outcomes_of(case, work)
    assert found, f"{case.id}: none of {case.strings} was resolved"
    for string in found:
        assert string.outcome == case.outcome, (case.id, string)
        assert string.method == case.method, (case.id, string)
    assert tuple(sorted({key for string in found for key in string.grants})) == tuple(sorted(case.grants)), (
        case.id,
        found,
    )
    for key in (*case.grants, *work.grants):
        assert GRANT_KEY.fullmatch(key), key


def override(case: Case, raw: str, key: str | None, suffix: str) -> Case:
    """The row again, with an Appendix E override applied."""
    grants = (key,) if key else ()
    outcome = "not_a_grant" if key is None else ("unresolved" if key.startswith("MISC:") else "grant")
    return Case(
        f"{case.id}+{suffix}",
        case.strings,
        outcome,
        "override",
        grants,
        case.funders,
        case.links,
        case.holds,
        case.splits,
        case.others,
        case.nsf,
        case.usaspending,
        case.agency_codes,
        {raw: key},
    )


def nih(*cores: str) -> tuple[str, ...]:
    return tuple(f"NIH:{core}" for core in cores)


# --- A.1 Exact matches and parse fixes (automatic) ------------------------------------------

A1 = [
    Case("A1.01", ("RO1 CA189986",), "grant", "normalised", nih("R01CA189986"), holds=("R01CA189986",)),
    Case("A1.02", ("1RO1GM086394",), "grant", "normalised", nih("R01GM086394"), holds=("R01GM086394",)),
    Case("A1.03", ("PO1 DE021954",), "grant", "normalised", nih("P01DE021954"), holds=("P01DE021954",)),
    Case("A1.04", ("UO1HL099993",), "grant", "normalised", nih("U01HL099993"), holds=("U01HL099993",)),
    Case("A1.05", ("RO1AG037603",), "grant", "normalised", nih("R01AG037603"), holds=("R01AG037603",)),
    Case("A1.06", ("RO1ES019319",), "grant", "normalised", nih("R01ES019319"), holds=("R01ES019319",)),
    Case("A1.07", ("RO1 GM080148",), "grant", "normalised", nih("R01GM080148"), holds=("R01GM080148",)),
    Case(
        "A1.08",
        ("R21ESO34337",),
        "grant",
        "normalised",
        nih("R21ES034337"),
        funders=(HHS,),
        holds=("R21ES034337",),
    ),
    Case(
        "A1.09",
        ("AGO5131",),
        "grant",
        "normalised",
        nih("P50AG005131"),
        funders=(NIA, PHS),
        links=("P50AG005131",),
    ),
    Case(
        "A1.10",
        ("PM50 GMO76547",),
        "grant",
        "normalised",
        nih("P50GM076547"),
        funders=(PHS,),
        links=("P50GM076547",),
    ),
    Case("A1.11", ("R01CA10720 9",), "grant", "normalised", nih("R01CA107209"), holds=("R01CA107209",)),
    Case("A1.12", ("R21CA14977 2",), "grant", "normalised", nih("R21CA149772"), holds=("R21CA149772",)),
    Case("A1.13", ("P30 DK 089,507",), "grant", "normalised", nih("P30DK089507"), holds=("P30DK089507",)),
    Case("A1.14", ("P40OD010 440",), "grant", "normalised", nih("P40OD010440"), holds=("P40OD010440",)),
    Case("A1.15", ("R01-HL1-26028",), "grant", "normalised", nih("R01HL126028"), holds=("R01HL126028",)),
    Case("A1.16", ("UL1-TR-000,040",), "grant", "normalised", nih("UL1TR000040"), holds=("UL1TR000040",)),
    Case(
        "A1.17",
        ("K99/R00 1K99HL103768-01",),
        "grant",
        "normalised",
        nih("K99HL103768", "R00HL103768"),
        holds=("K99HL103768", "R00HL103768"),
    ),
    Case(
        "A1.18",
        ("5R00HL103768-04",),
        "grant",
        "exact",
        nih("K99HL103768", "R00HL103768"),
        holds=("K99HL103768", "R00HL103768"),
    ),
    Case(
        "A1.19",
        ("UH3 AG064706",),
        "grant",
        "exact",
        nih("UH2AG064706", "UH3AG064706"),
        holds=("UH2AG064706", "UH3AG064706"),
    ),
    Case("A1.20", ("1R01-HL14477801",), "grant", "normalised", nih("R01HL144778"), holds=("R01HL144778",)),
    Case("A1.21", ("1R01-HL14477801A1",), "grant", "normalised", nih("R01HL144778"), holds=("R01HL144778",)),
    Case("A1.22", ("1S10RR-449017262",), "grant", "normalised", nih("S10RR017262"), holds=("S10RR017262",)),
    Case("A1.23", ("5DP5OD03615502",), "grant", "normalised", nih("DP5OD036155"), holds=("DP5OD036155",)),
    Case("A1.24", ("5dp5od036155-02",), "grant", "exact", nih("DP5OD036155"), holds=("DP5OD036155",)),
    Case("A1.25", ("P41 RR0011823",), "grant", "normalised", nih("P41RR011823"), holds=("P41RR011823",)),
    Case("A1.26", ("U24 CA0126477",), "grant", "normalised", nih("U24CA126477"), holds=("U24CA126477",)),
    Case("A1.27", ("DP3DK108209",), "grant", "exact", nih("DP3DK108209"), holds=("DP3DK108209",)),
    Case("A1.28", ("KL2 TR000421",), "grant", "exact", nih("KL2TR000421"), holds=("KL2TR000421",)),
    Case("A1.29", ("TL1TR002318",), "grant", "exact", nih("TL1TR002318"), holds=("TL1TR002318",)),
    Case("A1.30", ("UL1 RR 024156",), "grant", "exact", nih("UL1RR024156"), holds=("UL1RR024156",)),
    Case("A1.31", ("3p30dk017047-45s2",), "grant", "exact", nih("P30DK017047"), holds=("P30DK017047",)),
    Case("A1.32", ("3t32gm008268-21a1s1",), "grant", "exact", nih("T32GM008268"), holds=("T32GM008268",)),
    Case("A1.33", ("1k08ar082939-01a1",), "grant", "exact", nih("K08AR082939"), holds=("K08AR082939",)),
    Case("A1.34", ("NIH 5T32HG002760",), "grant", "exact", nih("T32HG002760"), holds=("T32HG002760",)),
    Case("A1.35", ("#P30 CA091842",), "grant", "exact", nih("P30CA091842"), holds=("P30CA091842",)),
    Case("A1.36", ("P30AG31679",), "grant", "normalised", nih("P30AG031679"), holds=("P30AG031679",)),
    Case("A1.37", ("T32-EB1650",), "grant", "normalised", nih("T32EB001650"), holds=("T32EB001650",)),
    Case("A1.38", ("P50 AG05131",), "grant", "normalised", nih("P50AG005131"), holds=("P50AG005131",)),
    Case("A1.39", ("R01 DK61516",), "grant", "normalised", nih("R01DK061516"), holds=("R01DK061516",)),
    Case("A1.40", ("P01- AG017242",), "grant", "exact", nih("P01AG017242"), holds=("P01AG017242",)),
    Case("A1.41", ("R01-AG-037603",), "grant", "exact", nih("R01AG037603"), holds=("R01AG037603",)),
    Case(
        "A1.42", (f"U01 NS091272{HYPHEN}01A1",), "grant", "exact", nih("U01NS091272"), holds=("U01NS091272",)
    ),
    Case(
        "A1.43",
        ("R01HL126028,DP3DK108209,R01HL127694,P30DK017047,P01HL092969",),
        "grant",
        "exact",
        nih("R01HL126028", "DP3DK108209", "R01HL127694", "P30DK017047", "P01HL092969"),
        holds=("R01HL126028", "DP3DK108209", "R01HL127694", "P30DK017047", "P01HL092969"),
    ),
    Case(
        "A1.44",
        ("R01 AR074939, R01 AR081654, R01 AI186337, R21 AR077266, T32 AR007108, K08 AR082939",),
        "grant",
        "exact",
        nih("R01AR074939", "R01AR081654", "R01AI186337", "R21AR077266", "T32AR007108", "K08AR082939"),
        holds=("R01AR074939", "R01AR081654", "R01AI186337", "R21AR077266", "T32AR007108", "K08AR082939"),
    ),
    Case(
        "A1.45",
        ("CA282268",),
        "grant",
        "normalised",
        nih("K22CA282268"),
        splits={("CA", "282268"): ("K22CA282268",)},
    ),
    Case(
        "A1.46",
        ("GM111097",),
        "grant",
        "normalised",
        nih("R01GM111097"),
        holds=("R01GM111097",),
        others=("R01 GM111097",),
    ),
    Case(
        "A1.47",
        ("AT007177",),
        "grant",
        "normalised",
        nih("K01AT007177"),
        holds=("K01AT007177",),
        others=("K01 AT007177",),
    ),
    Case(
        "A1.48",
        ("DK59637",),
        "grant",
        "normalised",
        nih("U24DK059637", "U2CDK059637"),
        links=("U24DK059637", "U2CDK059637"),
    ),
    # † The research also listed K99HL091055, which RePORTER holds under the same serial; §6.3
    # lists only what the work itself lists.
    Case(
        "A1.49",
        ("HL091055",),
        "grant",
        "normalised",
        nih("R00HL091055"),
        links=("R00HL091055",),
        splits={("HL", "091055"): ("K99HL091055", "R00HL091055")},
    ),
    Case(
        "A1.50",
        (f"DK{HYPHEN}035816",),
        "grant",
        "normalised",
        nih("P30DK035816"),
        funders=(UW,),
        links=("P30DK035816",),
    ),
    # The funder named does not matter (§6.4).
    Case(
        "A1.51",
        ("P30 DK017047",),
        "grant",
        "exact",
        nih("P30DK017047"),
        funders=(AHA,),
        holds=("P30DK017047",),
    ),
    Case(
        "A1.52",
        ("P41 GM103533",),
        "grant",
        "exact",
        nih("P41GM103533"),
        funders=(NSF,),
        holds=("P41GM103533",),
    ),
    Case(
        "A1.53",
        ("1S10OD018111",),
        "grant",
        "exact",
        nih("S10OD018111"),
        funders=(EMBO,),
        holds=("S10OD018111",),
    ),
    Case(
        "A1.54", ("R01GM120553",), "grant", "exact", nih("R01GM120553"), funders=(UW,), holds=("R01GM120553",)
    ),
    Case(
        "A1.55",
        ("R01AI124348",),
        "grant",
        "exact",
        nih("R01AI124348"),
        funders=(GATES,),
        holds=("R01AI124348",),
    ),
    Case(
        "A1.56",
        ("P41 GM103403",),
        "grant",
        "exact",
        nih("P41GM103403"),
        funders=(ARGONNE,),
        holds=("P41GM103403",),
    ),
    Case(
        "A1.57",
        ("P01HL128203",),
        "grant",
        "exact",
        nih("P01HL128203"),
        funders=(CINCINNATI,),
        holds=("P01HL128203",),
    ),
]


@pytest.mark.parametrize("case", A1, ids=lambda case: case.id)
def test_exact_matches_and_parse_fixes(case: Case) -> None:
    check(case)


# A component's number after the serial, which Appendix A has no row for: the seed's rehearsal
# (B9a) found these strings in Miscellaneous, each beside the core its work already lists. The
# works are those of 2026-09-27.
COMPONENTS = [
    Case("W-000115", ("P30 ES007033-6364",), "grant", "exact", nih("P30ES007033"), links=("P30ES007033",)),
    Case("W-000123", ("P42 ES004696-5897",), "grant", "exact", nih("P42ES004696"), links=("P42ES004696",)),
    Case(
        "W-000152",
        (f"P50 NS062684{HYPHEN}6221",),
        "grant",
        "exact",
        nih("P50NS062684"),
        links=("P50NS062684",),
    ),
    Case("W-000166", ("P30 ES007033-8649",), "grant", "exact", nih("P30ES007033"), holds=("P30ES007033",)),
    Case("W-000113", ("ES007033-6364",), "grant", "normalised", nih("P30ES007033"), links=("P30ES007033",)),
    Case(
        "W-000041",
        ("S10 RR023044-010001 || RR",),
        "grant",
        "exact",
        nih("S10RR023044"),
        links=("S10RR023044",),
    ),
]


@pytest.mark.parametrize("case", COMPONENTS, ids=lambda case: case.id)
def test_a_components_number_after_the_serial_is_a_suffix(case: Case) -> None:
    check(case)


def test_a_component_is_read_only_after_a_whole_serial() -> None:
    """Five digits and a dash may be a split serial (`R01-HL1-26028`), so four more digits there
    are not taken for a component: `P30 DK01047-1234` is left unread, as it was."""
    ics = rules().ics
    assert [n.cores() for n in parse_nih("P30 ES007033-6364", ics)] == [("P30ES007033",)]
    assert [n.suffix for n in parse_nih("S10 RR023044-010001", ics)] == ["-010001"]
    assert [n.suffix for n in parse_nih("3P30 ES007033-10S1", ics)] == ["-10S1"]
    assert parse_nih("P30 DK01047-1234", ics) == ()
    assert parse_nih("P30 ES007033-63645", ics) == ()


# --- A.3 IC + serial matches with the wrong activity code (all refused) ----------------------

A3 = [
    # (row, the string, its work's links, the core RePORTER holds under the IC and serial, final)
    ("A3.1", "P01 HL0996", ("P01HL092969", "R01HL108897", "R01HL112625"), "Z01HL000996", "MISC:P01HL0996"),
    ("A3.2", "P01HL1282", ("P01HL076491", "P01HL092969", "P01HL128203"), "Z01HL001282", "NIH:P01HL128203"),
    ("A3.3", "P30 DK01047", ("P30DK017047",), "K04DK001047", "NIH:P30DK017047"),
    ("A3.4", "P41GM103551", ("P41GM103533", "R01GM086394", "R01GM103551"), "R01GM103551", "NIH:R01GM103551"),
    ("A3.5", "S10RR02510", ("R01RR023334",), "R24RR002510", "MISC:S10RR02510"),
]


@pytest.mark.parametrize(("row", "raw", "links", "found", "final"), A3, ids=[row[0] for row in A3])
def test_ic_and_serial_alone_never_decide(
    row: str, raw: str, links: tuple[str, ...], found: str, final: str
) -> None:
    """§6.3: a core under the same IC and serial with another activity code is refused.

    Four of the five are wrong matches; the fifth names the right core, which the near-miss rule
    reaches on its own terms because NIH links the paper to it (§6.5 clause 2).
    """
    splits: dict[tuple[str, str], tuple[str, ...]] = {(found[3:5], found[5:]): (found,)}
    case = Case(row, (raw,), "grant", None, (final,), links=links, splits=splits)
    string = outcomes_of(case, resolve(case))[0]
    assert string.grants == (final,), string
    if final.startswith("MISC:"):
        assert string.outcome == "unresolved"
        assert string.note is not None and found in string.note and "refused" in string.note


# --- A.4 The 17 NIH grants unresolved after parsing -----------------------------------------

A4 = [
    Case(
        "A4.1",
        ("P50 AG003156-30",),
        "grant",
        "corrected",
        nih("P50AG005136"),
        links=("P50AG005131", "P50AG005136", "R01AG033398"),
    ),
    Case(
        "A4.2",
        ("3U01AI42001-02S1",),
        "grant",
        "corrected",
        nih("U01AI142001"),
        links=("DP1AI158186", "R01AI118803", "T32AI106677", "U01AI142001"),
    ),
    Case(
        "A4.3",
        ("U01 CA11273-04S1",),
        "grant",
        "corrected",
        nih("U01CA111273"),
        links=("R21CA126216", "U01CA111273"),
    ),
    Case("A4.4", ("PO1DE02195",), "grant", "corrected", nih("P01DE021954"), links=("P01DE021954",)),
    Case("A4.5", ("U19AG02312",), "unresolved", "miscellaneous", ("MISC:U19AG02312",)),
    Case(
        "A4.6",
        ("P30 DK01047",),
        "grant",
        "corrected",
        nih("P30DK017047"),
        links=("P30DK017047", "P30DK020593", "P30DK035816", "P30DK058404", "U24DK059637", "U2CDK059637"),
    ),
    Case(
        "A4.7",
        ("5R01GM08668",),
        "grant",
        "corrected",
        nih("R01GM086688"),
        links=("R01GM086688", "R01GM097112"),
    ),
    Case(
        "A4.8",
        ("P41GM103551",),
        "grant",
        "corrected",
        nih("R01GM103551"),
        links=("P41GM103533", "R01GM086394", "R01GM103551"),
    ),
    Case(
        "A4.9",
        ("1R01-GM122864",),
        "unresolved",
        "miscellaneous",
        ("MISC:R01GM122864",),
        links=("R01GM086688", "R01GM097112"),
    ),
    Case(
        "A4.10",
        ("F32 GM801262",),
        "grant",
        "corrected",
        nih("F32GM080126"),
        links=("F32GM080126", "P41GM103533"),
    ),
    Case(
        "A4.11",
        ("P01 HL09296",),
        "grant",
        "corrected",
        nih("P01HL092969"),
        links=("P01HL092969", "R01HL108897", "R01HL112625"),
    ),
    Case(
        "A4.12",
        ("P01HL12803",),
        "unresolved",
        "miscellaneous",
        ("MISC:P01HL12803",),
        links=("P01HL151328", "R01HL149685", "R01HL155601"),
    ),
    Case(
        "A4.13",
        ("P01 HL0996",),
        "unresolved",
        "miscellaneous",
        ("MISC:P01HL0996",),
        links=("P01HL092969", "R01HL108897", "R01HL112625"),
    ),
    Case(
        "A4.14",
        (
            "P01HL1282",
            "R01HL112625,R01HL108897,P01HL092969,DP3DK108209,R01HL149685,T32HL007828,P01HL076491,P01HL1282",
        ),
        "grant",
        "corrected",
        nih("P01HL128203"),
        links=(
            "P01HL076491",
            "P01HL092969",
            "P01HL128203",
            "R01HL108897",
            "R01HL112625",
            "R01HL149685",
            "T32HL007828",
        ),
    ),
    Case(
        "A4.15",
        ("P01HL123208",),
        "grant",
        "corrected",
        nih("P01HL128203"),
        links=("P01HL092969", "P01HL128203", "R01HL149685", "R21HL113405"),
    ),
    Case(
        "A4.16",
        ("S10OD032290", "S10 OD032290"),
        "unresolved",
        "miscellaneous",
        ("MISC:S10OD032290",),
        links=("S10OD023476",),
    ),
    Case(
        "A4.17", ("S10RR02510",), "unresolved", "miscellaneous", ("MISC:S10RR02510",), links=("R01RR023334",)
    ),
]
A4_OVERRIDDEN = [
    override(A4[4], "U19AG02312", "NIH:U19AG023122", "E.1"),
    override(A4[11], "P01HL12803", "NIH:P01HL128203", "E.2"),
    override(A4[16], "S10RR02510", "NIH:S10RR025107", "E.3"),
]


@pytest.mark.parametrize("case", [*A4, *A4_OVERRIDDEN], ids=lambda case: case.id)
def test_unresolved_nih_grants(case: Case) -> None:
    """§6.5 corrects a near-miss only when NIH links the same paper to the one core it nearly is."""
    if case.id == "A4.14":
        work = resolve(case)
        listed = [s for s in work.strings if "P01HL1282" in s.written]
        assert len(listed) == 1 and listed[0].grants == nih("P01HL128203")
        assert listed[0].method == "corrected"
        return
    check(case)


def test_a_correction_lists_only_a_core_nih_links_to_the_paper() -> None:
    """Without the link, the same string stays unresolved (§6.5: never outside the linked set)."""
    case = Case("A4.11-unlinked", ("P01 HL09296",), "unresolved", "miscellaneous", ("MISC:P01HL09296",))
    check(case)


def test_several_near_misses_leave_the_string_unresolved() -> None:
    case = Case(
        "several",
        ("R01GM08668",),
        "unresolved",
        "miscellaneous",
        ("MISC:R01GM08668",),
        links=("R01GM086681", "R01GM086688"),
    )
    work = resolve(case)
    string = outcomes_of(case, work)[0]
    assert string.outcome == "unresolved"
    assert string.note is not None and "several near-misses" in string.note


# --- A.5 NIH overrides outside the unresolved list -----------------------------------------

A5 = [
    Case("A5.1", ("R21AO129851",), "unresolved", "miscellaneous", ("MISC:R21AO129851",)),
    Case("A5.2", ("094352",), "unresolved", "miscellaneous", ("MISC:094352",), funders=(NIH, PHS)),
]
A5_OVERRIDDEN = [
    override(A5[0], "R21AO129851", "NIH:R21AI129851", "E.4"),
    override(A5[1], "094352", "NIH:R01HL094352", "E.5"),
]


@pytest.mark.parametrize("case", [*A5, *A5_OVERRIDDEN], ids=lambda case: case.id)
def test_nih_overrides(case: Case) -> None:
    check(case)


def test_ao_is_not_an_institute_code() -> None:
    assert "AO" not in rules().ics
    assert "BX" in rules().ics and "RR" in rules().ics


# --- A.6 Not grants, and other agencies' numbers attributed to NIH ------------------------

A6 = [
    Case("A6.01", ("PGT121", "PGT145"), "not_a_grant", None),
    Case("A6.02", ("PGDM1400",), "not_a_grant", None),
    Case("A6.03", ("35O22",), "not_a_grant", None),
    Case("A6.04", ("SCR_022606",), "not_a_grant", None),
    Case("A6.05", ("Project 3",), "not_a_grant", None),
    Case("A6.06", ("NIH-R01",), "not_a_grant", None),
    Case("A6.07", ("K99-R00", "K99/R00", f"K99{HYPHEN}R00"), "not_a_grant", None),
    Case("A6.08", ("H2020",), "not_a_grant", None),
    Case("A6.09", ("-0001",), "not_a_grant", None, funders=(NIH, DTRA)),
    Case("A6.10", ("10SDG3600027",), "grant", "agency_number", ("AHA:10SDG3600027",), funders=(NIH, AHA)),
    Case("A6.11", ("20CDA35320109",), "grant", "agency_number", ("AHA:20CDA35320109",), funders=(NIH, AHA)),
    Case("A6.12", ("DE-AC02-05CH11231", f"DE-AC02{EN_DASH}05CH11231"), "facility_contract", None),
    Case("A6.13", ("DE-AC02-06CH11357", f"DE-AC02{EN_DASH}06CH11357"), "facility_contract", None),
    Case("A6.14", ("DE-AC05-76RL01830",), "facility_contract", None),
    Case(
        "A6.15",
        ("DGE-1256082",),
        "grant",
        "agency_number",
        ("NSF:1256082",),
        funders=(NIH, NSF),
        nsf=("1256082",),
    ),
    Case("A6.16", ("OPP1156262",), "grant", "agency_number", ("GATES:OPP1156262",), funders=(NIH, GATES)),
    # Named by the research's pattern "national institute(s) of" for the National Institute of Food
    # and Agriculture; by funder ID they are USDA's.
    Case("A6.17", ("1008590",), "grant", "agency_number", ("USA:USDA:1008590",), funders=(NIFA,)),
    Case(
        "A6.18", ("80622200002120",), "grant", "agency_number", ("USA:USDA:80622200002120",), funders=(NIFA,)
    ),
    Case(
        "A6.19",
        ("W911NF2220059",),
        "grant",
        "agency_number",
        ("USA:DOD:W911NF2220059",),
        funders=(NIH, IARPA),
    ),
    # The research's non-NIH junk list.
    Case("A6.20", ("DE-AC02", "DE-AC02-"), "facility_contract", None, funders=(DOE,)),
    Case("A6.21", ("DE-AC05",), "facility_contract", None, funders=(BATTELLE,)),
    Case("A6.22", ("DE-AC05?",), "facility_contract", None, funders=(DOE,)),
    Case("A6.23", ("CAREER",), "not_a_grant", None, funders=(NSF,)),
    Case("A6.24", ("H2020", "HORIZON2020"), "not_a_grant", None, funders=(EC,)),
    Case("A6.25", ("K99/R00",), "not_a_grant", None, funders=(AHA,)),
    Case("A6.26", ("N/A", "NA"), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.27", ("2015-2018",), "not_a_grant", None, funders=(NSF, EC)),
    Case("A6.28", ("2018-",), "not_a_grant", None, funders=(VR,)),
    Case("A6.29", ("2019-",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.30", ("Z/17/Z",), "not_a_grant", None, funders=(WT,)),
    Case("A6.31", ("10.13039", "13039", "501100011033", "AEI/10"), "not_a_grant", None, funders=(AEI,)),
    Case(
        "A6.32",
        (
            "10.13039/501100011033",
            "10.13039.501100011033",
            ".13039/501100011033",
            "/ AEI10.13039/501100011033",
            "AEI//10.13039/501100011033/",
            "MCIU/AEI/10.13039/501100011033",
            "MCIU/AEI/ 10.13039/501100011033",
        ),
        "not_a_grant",
        None,
        funders=(AEI,),
    ),
    Case("A6.33", ("Biomedical Scholars Award",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.34", ("Developmental Career Award",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.35", ("Graduate Fellowship",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.36", ("Hanna H. Gray Fellows Program",), "not_a_grant", None, funders=(LOCKE,)),
    Case(
        "A6.37",
        ("Investigators in the Pathogenesis of Infectious Disease Award",),
        "not_a_grant",
        None,
        funders=(LOCKE,),
    ),
    Case("A6.38", ("LEAPS",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.39", ("PSSCRA",), "not_a_grant", None, funders=(LOCKE,)),
    Case("A6.40", ("Research Grant",), "not_a_grant", None, funders=(LOCKE,)),
    Case(
        "A6.41", ("Research Program Grant", "Research Program grant"), "not_a_grant", None, funders=(LOCKE,)
    ),
    Case("A6.42", ("Royalty Research Fund Grant",), "not_a_grant", None, funders=(UW,)),
    # A real number that matches nothing: Washington Sea Grant's internal project number, which
    # is not a NOAA award number.
    Case("A6.43", ("R/SFA-8",), "unresolved", "miscellaneous", ("MISC:RSFA8",), funders=(NOAA,)),
    Case("A6.44", ("094352",), "unresolved", "miscellaneous", ("MISC:094352",), funders=(PHS,)),
]
A6_OVERRIDDEN = [override(A6[-1], "094352", "NIH:R01HL094352", "E.5")]


@pytest.mark.parametrize("case", [*A6, *A6_OVERRIDDEN], ids=lambda case: case.id)
def test_not_grants_and_other_agencies_numbers(case: Case) -> None:
    check(case)


def test_a_not_grant_override_says_so() -> None:
    """An override can also say a string is not a grant (§8.5: `grant: null`)."""
    check(override(A5[0], "R21AO129851", None, "null"))


# --- A.7 NIH grants misfiled in the non-NIH list ------------------------------------------

A7 = [
    Case(
        "A7.1",
        ("PM50 GMO76547",),
        "grant",
        "normalised",
        nih("P50GM076547"),
        funders=(PHS,),
        links=("P50GM076547",),
    ),
    Case(
        "A7.2",
        ("AGO5131", "AG-O5131"),
        "grant",
        "normalised",
        nih("P50AG005131"),
        funders=(NIA, PHS),
        links=("P50AG005131",),
    ),
    Case(
        "A7.3",
        ("R21ESO34337",),
        "grant",
        "normalised",
        nih("R21ES034337"),
        funders=(HHS,),
        holds=("R21ES034337",),
    ),
    Case(
        "A7.4",
        (f"DK{HYPHEN}035816",),
        "grant",
        "normalised",
        nih("P30DK035816"),
        funders=(UW,),
        links=("P30DK035816",),
    ),
    Case(
        "A7.5", ("HHSN272201700059C",), "grant", "exact", ("NIH-contract:HHSN272201700059C",), funders=(UW,)
    ),
    Case("A7.contracts", ("HHSN268201000033C",), "grant", "exact", ("NIH-contract:HHSN268201000033C",)),
    Case("A7.contracts2", ("HHSN272201800004C",), "grant", "exact", ("NIH-contract:HHSN272201800004C",)),
    Case(
        "A7.task-order",
        ("HHSN272201700036I", "75N93020F00001"),
        "grant",
        "exact",
        ("NIH-contract:HHSN272201700036I:75N93020F00001",),
    ),
]


@pytest.mark.parametrize("case", A7, ids=lambda case: case.id)
def test_nih_grants_misfiled_in_the_non_nih_list(case: Case) -> None:
    check(case)


def test_a_linked_contract_is_keyed_by_its_contract_number() -> None:
    work = resolve(Case("A7.N01", ("UWPR95794",), "resource_code", None, links=("N01HV028179",)))
    assert work.links == (("N01HV028179", "NIH-contract:N01HV028179"),)
    assert work.grants == ("NIH-contract:N01HV028179",)


# --- A.8 Non-NIH typos the research resolved (seeded as overrides, Appendix E) --------------

A8 = [
    Case(
        "A8.1",
        ("OPP 144374",),
        "unresolved",
        "miscellaneous",
        ("MISC:OPP144374",),
        funders=(NSF,),
        nsf=("1443474",),
    ),
    Case(
        "A8.2",
        (f"IOS{HYPHEN}1922781",),
        "unresolved",
        "miscellaneous",
        ("MISC:IOS1922781",),
        funders=(NSF_IOS,),
        nsf=("1922871",),
    ),
    Case(
        "A8.3",
        ("DGE-071824",),
        "unresolved",
        "miscellaneous",
        ("MISC:DGE071824",),
        funders=(NSF,),
        nsf=("0718124",),
    ),
    Case(
        "A8.4",
        ("NN13AJ12G",),
        "grant",
        "agency_number",
        ("USA:NASA:NN13AJ12G",),
        funders=(NASA,),
        usaspending=(("NASA", "NNX13AJ12G"),),
    ),
    Case("A8.5", ("DBI 659680",), "unresolved", "miscellaneous", ("MISC:DBI659680",), funders=(NSF,)),
]
A8_OVERRIDDEN = [
    override(A8[0], "OPP 144374", "NSF:1443474", "E.6"),
    override(A8[1], f"IOS{HYPHEN}1922781", "NSF:1922871", "E.7"),
    override(A8[2], "DGE-071824", "NSF:0718124", "E.8"),
    override(A8[3], "NN13AJ12G", "USA:NASA:NNX13AJ12G", "E.9"),
]


@pytest.mark.parametrize("case", [*A8, *A8_OVERRIDDEN], ids=lambda case: case.id)
def test_non_nih_typos(case: Case) -> None:
    """None is automatic under F8: an NSF number the API does not know is not NSF's (§6.8)."""
    check(case)


def test_an_override_matches_however_the_string_is_spaced_or_dashed() -> None:
    """§6.6: case, spaces and dashes are forgiven, so the seeded `IOS-1922781` matches too."""
    case = override(A8[1], "ios 1922781", "NSF:1922871", "E.7-spaced")
    check(case)


# --- A.9 Other non-NIH normalisation cases --------------------------------------------------

A9 = [
    Case(
        "A9.01",
        ("NSF-CDEBI OCE-0939564", f"NSF OCE{HYPHEN}0939564", "OCE0939564", "0939564"),
        "grant",
        "agency_number",
        ("NSF:0939564",),
        funders=(NSF,),
        nsf=("0939564",),
    ),
    Case(
        "A9.02",
        (f"NSF OCE{HYPHEN}1558916, NSF OCE{HYPHEN}1360077",),
        "grant",
        "agency_number",
        ("NSF:1360077", "NSF:1558916"),
        funders=(NSF,),
        nsf=("1558916", "1360077"),
    ),
    Case(
        "A9.03",
        ("DBI-193331.1", "DBI-1933311"),
        "grant",
        "agency_number",
        ("NSF:1933311",),
        funders=(NSF,),
        nsf=("1933311",),
    ),
    Case(
        "A9.04",
        ("DGE-214-0004", "DGE-2140004"),
        "grant",
        "agency_number",
        ("NSF:2140004",),
        funders=(NSF,),
        nsf=("2140004",),
    ),
    Case(
        "A9.05",
        ("CBET CBE 1803054",),
        "grant",
        "agency_number",
        ("NSF:1803054",),
        funders=(NSF,),
        nsf=("1803054",),
    ),
    Case(
        "A9.06",
        ("HDTRA1", "HDTRA1-18", f"HDTRA1{HYPHEN}18{HYPHEN}1{HYPHEN}0001"),
        "grant",
        "agency_number",
        ("USA:DOD:HDTRA11810001",),
        funders=(DTRA,),
        usaspending=(("DOD", "HDTRA11810001"),),
    ),
    Case(
        "A9.07",
        ("NA14OAR4170078", "#NA14OAR4170078"),
        "grant",
        "agency_number",
        ("USA:NOAA:NA14OAR4170078",),
        funders=(SEA_GRANT,),
        usaspending=(("NOAA", "NA14OAR4170078"),),
    ),
    Case(
        "A9.08",
        ("NA140AR4170078",),
        "grant",
        "normalised",
        ("USA:NOAA:NA14OAR4170078",),
        funders=(SEA_GRANT,),
        usaspending=(("NOAA", "NA14OAR4170078"),),
    ),
    Case(
        "A9.09",
        ("NNX16AO69A:0061", "NNX16AO69A:0107"),
        "grant",
        "agency_number",
        ("USA:NASA:NNX16AO69A",),
        funders=(NASA,),
        usaspending=(("NASA", "NNX16AO69A"),),
    ),
    Case(
        "A9.10",
        ("NCC 9-58", "NCC958"),
        "grant",
        "agency_number",
        ("USA:NASA:NCC958",),
        funders=(NASA,),
        usaspending=(("NASA", "NCC958"),),
    ),
    Case(
        "A9.11",
        ("VR-RFI 2019-00217", "2019-00217"),
        "grant",
        "agency_number",
        ("VR:201900217",),
        funders=(VR,),
    ),
    Case(
        "A9.12",
        ("2021-02468", f"2021{EN_DASH}02468"),
        "grant",
        "agency_number",
        ("VR:202102468",),
        funders=(VR,),
    ),
    Case(
        "A9.13",
        ("PID2023", "PID2023-153058OB-I00"),
        "grant",
        "agency_number",
        ("AEI:PID2023153058OBI00",),
        funders=(AEI,),
    ),
    Case(
        "A9.14",
        ("100576", "PRE2021-100576"),
        "grant",
        "agency_number",
        ("AEI:PRE2021100576",),
        funders=(AEI,),
    ),
    Case(
        "A9.15",
        ("208391", "208391/Z/17/Z", "08391/Z/17/Z"),
        "grant",
        "agency_number",
        ("WT:208391Z17Z",),
        funders=(WT,),
        others=("08391/Z/17/Z, 223745/Z/21/Z",),
    ),
    Case(
        "A9.16",
        ("FKZ 031", "FKZ 031 A", "A 534A", "031 A 534A", "FKZ 031 A 534A"),
        "grant",
        "agency_number",
        ("BMBF:031A534A",),
        funders=(BMBF,),
    ),
    Case(
        "A9.17",
        ("ANR-10", "ANR-10-IAHU-0001"),
        "grant",
        "agency_number",
        ("ANR:ANR10IAHU0001",),
        funders=(ANR,),
        others=("10-IAHU-01", "ANR-10-IAHU- 01"),
    ),
    # Not merged: the zero padding differs. The two stand as one grant of their own, which the
    # report lists beside ANR10IAHU0001 for a person to merge (§6.10).
    Case(
        "A9.18",
        ("10-IAHU-01", "ANR-10-IAHU- 01"),
        "grant",
        "agency_number",
        ("ANR:ANR10IAHU01",),
        funders=(ANR,),
        others=("ANR-10", "ANR-10-IAHU-0001"),
    ),
    # Not merged: a DFG training-group number beside its project ID. The spaced dash is a list
    # separator between two numbers, so the combined form names both, each its own grant.
    Case(
        "A9.19",
        ("RTG 2467", "RTG 2467 - 391498659", "391498659"),
        "grant",
        "agency_number",
        ("DFG:391498659", "DFG:RTG2467"),
        funders=(DFG,),
    ),
    Case(
        "A9.20",
        ("CRC 1423", "CRC 1423 - 421152132", "421152132"),
        "grant",
        "agency_number",
        ("DFG:421152132", "DFG:CRC1423"),
        funders=(DFG,),
    ),
    Case(
        "A9.21",
        ("INST 193/90-1 FUGG; project-ID: 497694394", "497694394"),
        "grant",
        "agency_number",
        ("DFG:497694394", "DFG:INST193901FUGG"),
        funders=(DFG,),
    ),
    Case("A9.22", ("HBM4EU", "733032"), "grant", "agency_number", ("EU:733032", "EU:HBM4EU"), funders=(EU,)),
    Case(
        "A9.23",
        ("MO-178013", "178013_1"),
        "grant",
        "agency_number",
        ("CIHR:1780131", "CIHR:MO178013"),
        funders=(CIHR,),
    ),
    Case("A9.24", ("#6000", "6000"), "grant", "agency_number", ("MOORE:6000",), funders=(MOORE,)),
    Case(
        "A9.25",
        ("DOE-SC10010566", f"DOE{HYPHEN}SC10010566", "SC10010566"),
        "grant",
        "agency_number",
        ("USA:DOE:SC10010566",),
        funders=(DOE,),
    ),
    Case(
        "A9.26",
        ("Contract No: DESC0012704", "No. DE-SC0012704", "SC0012704"),
        "facility_contract",
        None,
        funders=(DOE,),
    ),
    Case("A9.27", ("76RLO 1830", "DE-AC05-76RLO-1830"), "facility_contract", None, funders=(BATTELLE,)),
    Case(
        "A9.28",
        ("I01 BX000531",),
        "grant",
        "exact",
        ("VA:I01BX000531",),
        funders=(VA,),
        holds=("I01BX000531",),
        agency_codes={"I01BX000531": "VA"},
    ),
    Case("A9.29", ("UWPR95794",), "resource_code", None, funders=(UW,)),
]


@pytest.mark.parametrize("case", A9, ids=lambda case: case.id)
def test_other_non_nih_normalisation(case: Case) -> None:
    check(case)


def test_the_resource_code_inside_a_list_is_never_a_grant() -> None:
    """A9.29: the list splits, and its UWPR95794 is the resource code wherever it sits (F1)."""
    raw = "R01GM086688, 1R01-GM122864 and in part by the UW Proteome Resource UWPR95794"
    case = Case("A9.29-list", (raw,), "grant", None, links=("R01GM086688",), holds=("R01GM086688",))
    work = resolve(case)
    by_outcome = {string.outcome: string for string in work.strings}
    assert by_outcome["resource_code"].grants == ()
    assert by_outcome["resource_code"].method is None
    assert by_outcome["unresolved"].grants == ("MISC:R01GM122864",)
    assert by_outcome["grant"].grants == ("NIH:R01GM086688",)
    assert not any("UWPR95794" in key for key in work.grants)
    written = [
        Case("UWPR", (form,), "resource_code", None) for form in ("UWPR 95794", "uwpr-95794", "(UWPR95794)")
    ]
    for form in written:
        check(form)


def test_institution_wide_rows_are_tagged() -> None:
    """A9.01, A9.04, A9.07, A9.09, A9.10 and A9.11 list institution-wide grants (Appendix B)."""
    for key in (
        "NSF:0939564",
        "NSF:2140004",
        "USA:NOAA:NA14OAR4170078",
        "USA:NASA:NNX16AO69A",
        "USA:NASA:NCC958",
        "VR:201900217",
        "ANR:ANR10IAHU0001",
    ):
        assert institution_wide(key, None, rules()), key


def test_every_appendix_a_key_matches_the_grammar() -> None:
    cases = [*A1, *A4, *A4_OVERRIDDEN, *A5, *A5_OVERRIDDEN, *A6, *A7, *A8, *A8_OVERRIDDEN, *A9]
    keys = {key for case in cases for key in case.grants}
    assert len(keys) > 100
    assert all(GRANT_KEY.fullmatch(key) for key in keys)


def test_the_grant_key_grammar_is_the_schemas() -> None:
    """One grammar, two places: `numbers.GRANT_KEY` and `common.schema.json`'s grantKey."""
    common = json.loads((ROOT / "schemas" / "common.schema.json").read_text(encoding="utf-8"))["$defs"]
    assert GRANT_KEY.pattern == common["grantKey"]["pattern"]
    assert AGENCY_CODE.pattern == common["agencyCode"]["pattern"]
    assert re.compile(common["grantKey"]["pattern"]).fullmatch(
        "NIH-contract:HHSN272201700036I:75N93020F00001"
    )
