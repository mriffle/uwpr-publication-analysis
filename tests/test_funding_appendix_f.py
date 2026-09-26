"""docs/09 Appendix F as the normaliser's oracle: the 270 non-NIH grants the research measured.

The fixture holds the research's 397 non-NIH award entries: each entry's written forms, its
works, the agency and grant the research gave it, and the OpenAlex, Crossref and PubMed sightings
of those forms, each with the funder its source names — an ID, a name, or PubMed's agency
(tests/fixtures/funding/non_nih_entries.json, funding metadata only). Two tests:

- **Under its agency** (§6.8-6.10): every form of a row, named for the row's agency by funder ID,
  resolves to one key of that agency, bar the cases Appendix A.9 names as not merged. The three
  pairs the research left apart (‡) merge, TRISH's two rows are one grant, and the facility
  contracts are excluded.
- **Under the sources' own attribution** (§6.4): with the funders the sources actually name, the
  same keys, except where a v1 source names no configured agency, by ID or by a whole name given
  without an ID (B3a).
"""

import collections
import json
from collections.abc import Iterable
from functools import cache
from pathlib import Path
from typing import Any

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.classify import FundingRules, institution_wide
from uwpr_pubs.funding.numbers import GRANT_KEY, alnum, split_list
from uwpr_pubs.funding.overrides import override_match_key
from uwpr_pubs.funding.resolve import Answers, Sighting, WorkFunding, resolve_work

FIXTURE = Path(__file__).parent / "fixtures" / "funding" / "non_nih_entries.json"

# The research's agency names, and the configured agency each is.
AGENCY = {
    "AEI (Spain)": "AEI",
    "AHA": "AHA",
    "ANID (Chile)": "ANID",
    "ANR": "ANR",
    "ARC (Australia)": "ARC",
    "Academy of Medical Sciences (UK)": "AMS",
    "Alzheimer's Association": "ALZ",
    "American Diabetes Association": "ADA",
    "BBSRC": "BBSRC",
    "BMBF": "BMBF",
    "BMWi": "BMWI",
    "CIHR": "CIHR",
    "CIHR?": "CIHR",
    "CPRIT": "CPRIT",
    "CUHK (internal)": "CUHK",
    "Cancer Research UK": "CRUK",
    "China Scholarship Council": "CSC",
    "DFG": "DFG",
    "DFG? (looks like a BMBF FKZ)": "DFG",
    "DLR (Germany)": "DLR",
    "DOE": "DOE",
    "DOI": "DOI",
    "DoD": "DOD",
    "EMBO": "EMBO",
    "EPSRC": "EPSRC",
    "EU (CORDIS)": "EU",
    "FAPESP (Brazil)": "FAPESP",
    "FNR (Luxembourg)": "FNR",
    "FWO": "FWO",
    "Gates Foundation": "GATES",
    "Ghent University BOF": "UGENT",
    "HFSP": "HFSP",
    "HHMI": "HHMI",
    "Hawaii Dept. of Health": "HIDOH",
    "Independent Research Fund Denmark": "DFF",
    "JSPS": "JSPS",
    "JST": "JST",
    "KAIST": "KAIST",
    "KBSI (Korea)": "KBSI",
    "KHIDI (Korea)": "KHIDI",
    "KIMS (Korea)": "KIMS",
    "Lundbeck Foundation": "LUNDBECK",
    "MOST (China)": "MOST",
    "MRC": "MRC",
    "MSIT (Korea)": "MSIT",
    "MWK Baden-Württemberg": "MWK",
    "Moore Foundation": "MOORE",
    "NASA": "NASA",
    "NERC": "NERC",
    "NIH": "NIH",
    "NIHR (UK)": "NIHR",
    "NKFIH (Hungary)": "NKFIH",
    "NOAA": "NOAA",
    "NRF Korea": "NRF",
    "NSF": "NSF",
    "NSFC (China)": "NSFC",
    "NWO": "NWO",
    "National Fish and Wildlife Foundation": "NFWF",
    "Ontario Genomics / Genome Canada": "OGI",
    "Open Targets": "OPENTARGETS",
    "Parkinson's Disease Foundation": "PDF",
    "Polish Ministry of Science": "MNISW",
    "RGC/UGC (Hong Kong)": "RGC",
    "SNSF": "SNSF",
    "SSF (Sweden)": "SSF",
    "Simons Foundation": "SIMONS",
    "Starr Foundation": "STARR",
    "Swedish Cancer Society": "CANCERFONDEN",
    "Swedish Research Council": "VR",
    "TRDRP (California)": "TRDRP",
    "USDA": "USDA",
    "University of Washington": "UW",
    "VA": "VA",
    "Wallenberg Foundation": "KAW",
    "Wellcome": "WT",
}

# RePORTER's answers for the five NIH grants the research filed as non-NIH (Appendix A.7), and
# the VA project it holds; the NIH links are the works' own.
REPORTER = {"P50AG005131": "NIH", "P50GM076547": "NIH", "P30DK035816": "NIH", "R21ES034337": "NIH"}
REPORTER_VA = {"I01BX000531": "VA"}
LINKS = {"W-000113": ["P50AG005131"], "W-000044": ["P50GM076547"], "W-000188": ["P30DK035816"]}
# Appendix E's four non-NIH overrides, each on its work.
OVERRIDES = {
    "W-000287": {"OPP 144374": "NSF:1443474"},
    "W-000233": {"IOS-1922781": "NSF:1922871"},
    "W-000094": {"DGE-071824": "NSF:0718124"},
    "W-000208": {"NN13AJ12G": "USA:NASA:NNX13AJ12G"},
}
FACILITY = {"DOE:DE-AC02-05CH11231", "DOE:DE-AC02-06CH11357", "DOE:DE-AC05-76RL01830", "DOE:DE-SC0012704"}
# The rows §6's rules do not bring to one key, each as Appendix A.9 (or §6.1) says.
NOT_ONE_KEY = {
    "ANR:ANR-10-IAHU-0001": {"ANR:ANR10IAHU0001", "ANR:ANR10IAHU01"},  # A9.18: the padding differs
    "ARC:DP170102108; DP130100679": {"ARC:DP130100679", "ARC:DP170102108"},  # two numbers, split on ";"
    "CIHR:178013": {"CIHR:1780131", "CIHR:MO178013"},  # A9.23
    "DFG:391498659": {"DFG:391498659", "DFG:RTG2467"},  # A9.19: a training group beside its project
    "DFG:421152132": {"DFG:421152132", "DFG:CRC1423"},  # A9.20
    "EU:733032": {"EU:733032", "EU:HBM4EU"},  # A9.22: an acronym beside the number
}
# Every row's key under its agency, where the key is not the research's own number with its
# separators removed: prefixes stripped (§6.10), a fragment's whole (§6.10), a year expanded.
RENAMED = {
    "FAPESP:16/00696-3": "FAPESP:2016006963",
    "FNR:12341006": "FNR:A18BM12341006",
    "NKFIH:2018-1.2-1-NKP": "NKFIH:2018121NKP201800005",
    "SNSF:181503": "SNSF:P2ZHP3181503",
    "SNSF:194379": "SNSF:P400PB194379",
    "MOORE:GBMF6000?": "MOORE:6000",
    "NASA:NNX13AJ12G?": "USA:NASA:NNX13AJ12G",
    "DOE:DE-SC0010566?": "USA:DOE:SC10010566",
    "NRFK:2016R1A5A1010764": "NRF:2016R1A5A1010764",
    "NSF:0659680": "MISC:DBI659680",  # A8.5: the NSF API does not know 0659680, nor 659680
}


@cache
def rules() -> FundingRules:
    config = load_config()
    return FundingRules.from_config(config.funding, config.rules["r2"]["code"])


@cache
def entries() -> tuple[dict[str, Any], ...]:
    return tuple(json.loads(FIXTURE.read_text(encoding="utf-8"))["entries"])


def sighting(raw: str, agency: str) -> Sighting:
    """A form, named for the row's agency by a funder ID, else by a PubMed agency it matches, else
    by its own name, without an ID (B3a's four agencies, which no source names otherwise)."""
    configured = rules().agencies[AGENCY[agency]]
    ids = sorted(configured.funder_ids, key=lambda i: (not i.startswith("F"), i))
    if ids:
        return Sighting(raw, "openalex", funder_id=ids[0])
    if configured.pubmed_patterns:
        pubmed = configured.pubmed_patterns[0].pattern.strip("^$").replace("(?i)", "")
        return Sighting(raw, "pubmed", pubmed_agency=pubmed)
    return Sighting(raw, "crossref", funder=configured.name)


def answers() -> Answers:
    rows = [row for entry in entries() for row in entry["research_id"]]
    nsf = {row[4:] for row in rows if row.startswith("NSF:")} - {"0659680"}  # the one NSF lacks (A8.5)
    usa = {
        (AGENCY[entry["agency"]], alnum(row.split(":")[1]))
        for entry in entries()
        if entry["group"] == "us_federal" and AGENCY[entry["agency"]] not in ("NSF", "VA")
        for row in entry["research_id"]
        if row not in FACILITY
    }
    return Answers(reporter={**REPORTER, **REPORTER_VA}, nsf=frozenset(nsf), usaspending=frozenset(usa))


def resolve_all(
    sightings_by_work: dict[str, list[Sighting]], funding_rules: FundingRules | None = None
) -> dict[str, WorkFunding]:
    found = answers()
    return {
        work: resolve_work(
            sightings,
            LINKS.get(work, []),
            found,
            funding_rules or rules(),
            overrides={override_match_key(raw): key for raw, key in OVERRIDES.get(work, {}).items()},
            data_year=2026,
        )
        for work, sightings in sightings_by_work.items()
    }


@cache
def under_agency() -> dict[str, WorkFunding]:
    """The rows' forms, each named for its row's agency. The research's junk list (Appendix A.6,
    tested there) has no row and no agency."""
    by_work: dict[str, list[Sighting]] = collections.defaultdict(list)
    for entry in entries():
        if entry["research_id"]:
            for work in entry["works"]:
                by_work[work] += [sighting(raw, entry["agency"]) for raw in entry["raw"]]
    return resolve_all(by_work)


def sources_sightings() -> dict[str, list[Sighting]]:
    by_work: dict[str, list[Sighting]] = collections.defaultdict(list)
    for entry in entries():
        for seen in entry["sightings"]:
            by_work[seen["work"]].append(
                Sighting(
                    seen["raw"],
                    seen["source"],
                    funder=seen["funder"],
                    funder_id=seen["funder_id"],
                    pubmed_agency=seen["pubmed_agency"],
                )
            )
    return by_work


@cache
def under_sources() -> dict[str, WorkFunding]:
    return resolve_all(sources_sightings())


def row_outcomes(resolved: dict[str, WorkFunding]) -> dict[str, list[tuple[str, str, tuple[str, ...]]]]:
    """Each research row's strings, on each of its works, as (form, outcome, keys).

    A form that is a list is the row's only in the item that carries the row's number, so the
    FONDECYT list's other ANID grants are not counted against each of them.
    """
    rows: dict[str, list[tuple[str, str, tuple[str, ...]]]] = collections.defaultdict(list)
    for entry in entries():
        for row in entry["research_id"]:
            number = alnum(row.split(":", 1)[1])
            for work in entry["works"]:
                by_form = {form: string for string in resolved[work].strings for form in string.written}
                for raw in entry["raw"]:
                    pieces = split_list(raw)
                    for piece in pieces:
                        mine = alnum(piece)
                        if len(pieces) > 1 and not (mine and (mine in number or number in mine)):
                            continue
                        string = by_form.get(piece)
                        if string is not None:
                            rows[row].append((piece, string.outcome, string.grants))
    return rows


def keys_of(outcomes: Iterable[tuple[str, str, tuple[str, ...]]]) -> set[str]:
    return {key for _, _, keys in outcomes for key in keys}


def family_prefix(agency: str) -> str:
    """The key prefix of the row's agency's grants (§8.2)."""
    code = AGENCY[agency]
    if code == "NSF" or not rules().agencies[code].us_federal or code == "VA":
        return f"{code}:"
    return f"USA:{code}:"


def test_the_fixture_is_the_research() -> None:
    rows = {row for entry in entries() for row in entry["research_id"]}
    non_nih = {row for row in rows if not row.startswith("NIH:")}
    assert len(entries()) == 397
    assert len(non_nih) == 270, "Appendix F's rows"
    assert all(entry["sightings"] for entry in entries())


def test_every_row_under_its_agency_resolves_to_one_key_of_that_agency() -> None:
    outcomes = row_outcomes(under_agency())
    agency_of = {row: entry["agency"] for entry in entries() for row in entry["research_id"]}
    for row, found in sorted(outcomes.items()):
        keys = keys_of(found)
        if row in FACILITY:
            assert keys == set() and {outcome for _, outcome, _ in found} == {"facility_contract"}, row
            continue
        if row in NOT_ONE_KEY:
            assert keys == NOT_ONE_KEY[row], row
            continue
        assert len(keys) == 1, (row, found)
        key = keys.pop()
        assert GRANT_KEY.fullmatch(key), key
        if row.startswith("NIH:"):
            assert key.startswith(("NIH:", "NIH-contract:")), (row, key)
        elif row in RENAMED:
            assert key == RENAMED[row], (row, key)
        else:
            assert key.startswith(family_prefix(agency_of[row])), (row, key)
            assert key.rsplit(":", 1)[1] in alnum(row.split(":", 1)[1]), (row, key)


def test_the_three_pairs_the_research_left_apart_merge() -> None:
    """Appendix F's ‡: spacing and dashes (EMBO), one funder under two names (NRF Korea), and a
    two-digit year (FAPESP) are each one grant; so are TRISH's two sub-award rows (§6.9)."""
    outcomes = row_outcomes(under_agency())
    pairs = [
        ("EMBO:ALTF 933-2015", "EMBO:ALTF933-2015", "EMBO:ALTF9332015"),
        ("NRF:2016R1A5A1010764", "NRFK:2016R1A5A1010764", "NRF:2016R1A5A1010764"),
        ("FAPESP:16/00696-3", "FAPESP:FAPESP 2016/00696-3", "FAPESP:2016006963"),
        ("NASA:NNX16AO69A:0061", "NASA:NNX16AO69A:0107", "USA:NASA:NNX16AO69A"),
    ]
    for first, second, key in pairs:
        assert keys_of(outcomes[first]) == keys_of(outcomes[second]) == {key}


def test_the_distinct_keys_are_counted() -> None:
    """270 rows come to 267 keys under their agencies, with the seeded overrides applied.

    270 less the 4 facility contracts is 266. Five merges take one each: TRISH's two rows, the
    three ‡ pairs, and NKFIH's `2018-1.2-1-NKP`, a fragment of `2018-1.2.1-NKP-2018-00005` on the
    same work (§6.10), which the research left as its own row — 261. Six rows stand as two keys
    each (NOT_ONE_KEY), adding 6: 267. The typo rows need their overrides (Appendix E) to reach
    their grant; without them `OPP 144374` and `IOS-1922781` would add two Miscellaneous keys.
    """
    outcomes = row_outcomes(under_agency())
    keys = set().union(*(keys_of(found) for row, found in outcomes.items() if not row.startswith("NIH:")))
    assert len(keys) == 267
    assert not any(key.startswith("MISC:") for key in keys - {"MISC:DBI659680"})


def test_every_appendix_b_key_is_listed_and_tagged() -> None:
    outcomes = row_outcomes(under_agency())
    keys = set().union(*(keys_of(found) for found in outcomes.values()))
    wide = set(rules().institution_wide)
    assert len(wide) == 23
    assert wide <= keys, sorted(wide - keys)
    assert all(institution_wide(key, None, rules()) for key in wide)


# Rows the sources' own attribution resolves differently, and why. Each difference is a
# Miscellaneous key where no v1 source names the row's agency, by ID or by a whole name (§6.4):
UNATTRIBUTED = {
    # Crossref's entry gives CIHR's ROR (01gavpb45) alone: no name, no registry DOI.
    "CIHR:PJT-206152",
    # OpenAlex names only Genome Canada, Ontario Genomics and EFPIA for IMI's 115766: not an OGI number.
    "EU:115766",
    # PubMed's Agency for IOS-1922541 is "Forsgren", an investigator.
    "NSF:1922541",
    # OpenAlex names both Wellcome and CIHR, and neither agency's pattern decides (§6.4).
    "UNK:1097737",
}

# The strings only a Crossref funder entry without a registry DOI names, by a name an agency's
# `funder_names` match whole (B3a), and the key each now has: Miscellaneous under B3.
NAMED = {
    ("W-000184", "OCE 1633939"): "NSF:1633939",  # "NSF"
    ("W-000203", "IMI115760"): "EU:115760",  # "Zoonoses Anticipation and Preparedness Initiative"
    ("W-000208", "50WB1535"): "DLR:50WB1535",  # "DLR Space program"
    ("W-000222", "823839"): "EU:823839",  # "H2020 EU EPIC-XS"
    ("W-000246", "MOA 13-502"): "HIDOH:MOA13502",  # "Hawaii Department of Heath"
    ("W-000274", "NA140AR4170078"): "USA:NOAA:NA14OAR4170078",  # "Washington Sea Grant Award"
    ("W-000301", "A172539"): "UW:A172539",  # "University of Washington Royalty Research Fund"
    ("W-000632", "14102014"): "RGC:14102014",  # "Research Grants Council General Research Fund"
    ("W-000632", "4053242"): "CUHK:4053242",  # "Direct Grants from the Chinese University of Hong Kong"
    ("W-000632", "4053364"): "CUHK:4053364",
    ("W-000632", "AoE/M-403/16"): "RGC:AOEM40316",  # "Hong Kong University Grants Committee Area of…"
}
NAMED_ROWS = {
    "CUHK:4053242",
    "CUHK:4053364",
    "DLR:50WB1535",
    "EU:115760",
    "EU:823839",
    "HAWAII:MOA 13-502",
    "NOAA:NA14OAR4170078",
    "NSF:1633939",
    "RGC/UGC:14102014",
    "RGC/UGC:AoE/M-403/16",
    "UNIVERSITY:A172539",
}


def test_the_sources_own_attribution_gives_the_same_keys() -> None:
    by_agency = row_outcomes(under_agency())
    by_sources = row_outcomes(under_sources())
    differ = {row for row in by_agency if keys_of(by_agency[row]) != keys_of(by_sources[row])}
    assert differ == UNATTRIBUTED
    for row in differ:
        extra = keys_of(by_sources[row]) - keys_of(by_agency[row])
        assert extra and all(key.startswith("MISC:") for key in extra), (row, extra)


def rules_without_names() -> FundingRules:
    """B3's attribution: the configuration with every agency's `funder_names` taken out."""
    config = load_config()
    agencies = [
        {name: value for name, value in agency.items() if name != "funder_names"}
        for agency in config.funding["agencies"]
    ]
    return FundingRules.from_config({**config.funding, "agencies": agencies}, config.rules["r2"]["code"])


def test_the_name_rule_moves_only_the_strings_it_names() -> None:
    """B3a: a whole name given without an ID brings 11 rows to exactly their agency's key, and
    moves nothing else — no other string on any work, and no other row. Under B3, 15 rows
    differed from their agency's keys; 4 still do."""
    before = resolve_all(sources_sightings(), rules_without_names())
    after = under_sources()

    def grants(resolved: dict[str, WorkFunding]) -> dict[tuple[str, str], tuple[str, ...]]:
        return {
            (work, string.raw): string.grants for work, found in resolved.items() for string in found.strings
        }

    was, now = grants(before), grants(after)
    assert was.keys() == now.keys()
    moved = {string: keys for string, keys in now.items() if keys != was[string]}
    assert moved == {string: (key,) for string, key in NAMED.items()}
    assert all(len(was[string]) == 1 and was[string][0].startswith("MISC:") for string in moved)

    by_agency, rows_before, rows_after = (row_outcomes(r) for r in (under_agency(), before, after))
    changed = {row for row in rows_after if keys_of(rows_before[row]) != keys_of(rows_after[row])}
    assert changed == NAMED_ROWS
    for row in changed:
        assert keys_of(rows_after[row]) == keys_of(by_agency[row]), row
        assert len(keys_of(rows_after[row])) == 1, row
    differed = {row for row in by_agency if keys_of(by_agency[row]) != keys_of(rows_before[row])}
    assert (len(differed), len(UNATTRIBUTED)) == (15, 4)
    assert differed == UNATTRIBUTED | NAMED_ROWS


@pytest.mark.parametrize("pattern", [None, "NSF:1922871", "NSF:1933311"])
def test_the_registrys_other_nsfs_name_nsf_numbers(pattern: str | None) -> None:
    """Publishers chose the National Sleep Foundation's registry entry for NSF's own numbers
    on W-000222; configured under NSF, the numbers are NSF's, and the NSF API still decides."""
    outcomes = row_outcomes(under_sources())
    if pattern is None:
        assert not any(
            key.startswith("F4320307381:") for found in outcomes.values() for key in keys_of(found)
        )
    else:
        assert keys_of(outcomes[pattern]) >= {pattern}
