"""The funding store's grammar and its grant overrides (docs/09 §6.6, §8.2, §8.3, §8.5).

The grant-key pattern is checked against every key docs/09 writes, read out of the spec itself, so
a key the spec uses and the schema refuses is a failing test rather than a failed seed.
"""

import json
import re
from pathlib import Path
from typing import Any, cast

import pytest
from jsonschema import Draft202012Validator

from uwpr_pubs.funding.overrides import (
    DASHES,
    applies_to,
    grant_overrides,
    grant_overrides_for,
    override_match_key,
)
from uwpr_pubs.schemas import FUNDING_SCHEMAS, schema_errors
from uwpr_pubs.store.models import Override

ROOT = Path(__file__).resolve().parent.parent
SPEC = (ROOT / "docs" / "09-funding-impact.md").read_text(encoding="utf-8")
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text(encoding="utf-8"))["$defs"]
GRANT_KEY = re.compile(COMMON["grantKey"]["pattern"])
AGENCY_CODE = re.compile(COMMON["agencyCode"]["pattern"])


def section(start: str, end: str) -> str:
    """The spec's text from one heading to the next, so a moved heading fails loudly."""
    begin = SPEC.index(start)
    return SPEC[begin : SPEC.index(end, begin)]


def backticked_keys(text: str) -> set[str]:
    """Keys written as code: a family prefix, a colon and more, with no `<placeholder>`.

    A prefix alone (`MISC:`, in "a `MISC:` key") names a family, not a key.
    """
    return {
        token
        for token in re.findall(r"`([^`\s]+)`", text)
        if re.match(r"^[A-Z][A-Za-z0-9-]*:.", token) and "<" not in token
    }


def outcome_keys(text: str) -> set[str]:
    """Appendix A writes its outcomes' keys as plain text too (`NIH:R01CA189986`)."""
    return set(re.findall(r"(?<![\w`/:-])((?:NIH-contract|[A-Z][A-Z0-9-]*)(?::[A-Za-z0-9]+)+)", text))


SECTION_8_2 = backticked_keys(section("### 8.2 Grant keys", "### 8.3"))
# A9.09's two sub-award strings, as a paper writes them: they look like keys and are not.
WRITTEN_NOT_KEYS = {"NNX16AO69A:0061", "NNX16AO69A:0107"}
APPENDIX_A = (
    backticked_keys(section("## Appendix A", "## Appendix B"))
    | outcome_keys(section("## Appendix A", "## Appendix B"))
) - WRITTEN_NOT_KEYS
APPENDIX_B = backticked_keys(section("## Appendix B", "## Appendix C"))
APPENDIX_E = backticked_keys(section("## Appendix E", "## Appendix F"))


def test_the_spec_is_read_for_its_keys() -> None:
    """Guards the extraction itself: a regex that found nothing would pass every check below."""
    assert {
        "NIH:R01GM086688",
        "VA:I01BX000531",
        "NIH-contract:HHSN272201700036I:75N93020F00001",
    } <= SECTION_8_2
    assert {"USA:NASA:NNX14AJ87G", "WT:092809Z10Z", "MISC:P01HL0996", "NSF:1443474"} <= SECTION_8_2
    assert len(APPENDIX_B) == 23  # Appendix B: "23 keys"
    assert len(APPENDIX_E) == 9  # the nine seeded overrides
    assert {"NIH:R01CA189986", "NIH:P50AG005136", "AHA:10SDG3600027", "USA:USDA:80622200002120"} <= APPENDIX_A
    assert {"MISC:DBI659680", "BMBF:031A534A", "ANR:ANR10IAHU0001", "USA:DOD:HDTRA11810001"} <= APPENDIX_A


def grant_override(key: object) -> dict[str, object]:
    """The smallest valid override naming a grant: only the key can make it invalid."""
    return {
        "target": "W-000001",
        "action": "grant",
        "raw": "as written",
        "grant": key,
        "reason": "Checked.",
        "by": "mriffle",
        "date": "2026-09-26",
    }


@pytest.mark.parametrize(
    "key", sorted(SECTION_8_2 | APPENDIX_A | APPENDIX_B | APPENDIX_E), ids=lambda key: key
)
def test_every_key_the_spec_writes_fits_the_grammar(key: str) -> None:
    assert GRANT_KEY.fullmatch(key), key
    assert schema_errors("overrides", [grant_override(key)]) == []


@pytest.mark.parametrize(
    "key",
    [
        "NIH:R01GM086688.1",  # a dot
        "WT:092809/Z/10/Z",  # a slash
        "VR:2019 00217",  # a space
        "NIH:R01%3AGM",  # a percent sign
        "NIH:R01?GM",
        "NIH:R01#GM",
        "nih:R01GM086688",  # lower case
        "NIH:r01gm086688",
        "Nih-contract:HHSN272201700059C",
        "NIH-Contract:HHSN272201700059C",
        "NIH::R01GM086688",  # an empty segment
        "NIH:R01GM086688:",
        ":R01GM086688",
        "NIH",  # no segment
        "USA:NASA:NNX14AJ87G:0061",  # three segments
        "VR:2019-00217",  # a dash is for the prefix alone
        "1NIH:R01GM086688",  # a prefix starts with a letter
        "",
    ],
)
def test_the_grammar_refuses(key: str) -> None:
    assert not GRANT_KEY.fullmatch(key)
    assert schema_errors("overrides", [grant_override(key)]) != []


@pytest.mark.parametrize("code", ["NIH", "NIGMS", "NSF", "NASA", "WT", "F4320332161", "MISC", "NIH-OD"])
def test_agency_codes(code: str) -> None:
    assert AGENCY_CODE.fullmatch(code)


@pytest.mark.parametrize("code", ["nih", "4NIH", "NIH:NIGMS", "NI H", "NIH.GOV", ""])
def test_agency_codes_refused(code: str) -> None:
    assert not AGENCY_CODE.fullmatch(code)


@pytest.mark.parametrize("name", FUNDING_SCHEMAS)
def test_the_funding_schemas_are_valid_schemas(name: str) -> None:
    schema = json.loads((ROOT / "schemas" / f"{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    assert schema["$id"] == f"https://uwpr-pubs.local/schemas/{name}.schema.json"
    assert schema["additionalProperties"] is False


# --- the match key (§6.6) ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("written", "key"),
    [
        ("U19AG02312", "U19AG02312"),
        ("u19 ag02312", "U19AG02312"),
        ("U19-AG02312", "U19AG02312"),
        ("U19\u2010AG\u201102312", "U19AG02312"),  # hyphen, non-breaking hyphen
        ("U19\u2012AG\u201302312\u2014", "U19AG02312"),  # figure dash, en dash, em dash
        ("U19\u2015AG\u221202312", "U19AG02312"),  # horizontal bar, minus sign
        ("U19\u00a0AG\t02312\n", "U19AG02312"),  # no-break space, tab, newline
        ("\uff35\uff11\uff19AG02312", "U19AG02312"),  # full-width letters and digits, by NFKC
        ("OPP 144374", "OPP144374"),
        ("IOS\u20101922781", "IOS1922781"),
        ("094352", "094352"),
    ],
)
def test_the_match_key_forgives_case_spaces_and_dashes(written: str, key: str) -> None:
    assert override_match_key(written) == key


@pytest.mark.parametrize(("one", "other"), [("U19AG02312", "U19AG023122"), ("R21AO129851", "R21A0129851")])
def test_the_match_key_forgives_nothing_else(one: str, other: str) -> None:
    assert override_match_key(one) != override_match_key(other)


def test_every_dash_the_spec_names() -> None:
    assert set(DASHES) == {"-", "\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212"}


def override(target: Any, action: str, **extra: Any) -> Override:
    entry = {"target": target, "action": action, "reason": "Checked.", "by": "mriffle", "date": "2026-09-26"}
    return cast(Override, {**entry, **extra})


OVERRIDES = [
    override(["W-000004", "W-000005"], "merge"),
    override("W-000222", "grant", raw="U19AG02312", grant="NIH:U19AG023122"),
    override("W-000222", "exclude"),
    override("W-000208", "grant", raw="R21AO129851", grant="NIH:R21AI129851"),
    override("W-000208", "grant", raw="NN13AJ12G", grant="USA:NASA:NNX13AJ12G"),
    override("W-000270", "grant", raw="PGT121", grant=None),
    override("W-000005", "grant", raw="VR-RFI 2019-00217", grant="VR:201900217"),
]


def test_only_grant_overrides_concern_funding() -> None:
    assert [o["target"] for o in grant_overrides(OVERRIDES)] == [
        "W-000222",
        "W-000208",
        "W-000208",
        "W-000270",
        "W-000005",
    ]


def test_a_works_grant_overrides_by_match_key() -> None:
    assert grant_overrides_for(OVERRIDES, "W-000208") == {
        "R21AO129851": "NIH:R21AI129851",
        "NN13AJ12G": "USA:NASA:NNX13AJ12G",
    }
    assert grant_overrides_for(OVERRIDES, "W-000222") == {"U19AG02312": "NIH:U19AG023122"}
    assert grant_overrides_for(OVERRIDES, "W-000270") == {"PGT121": None}  # "not a grant"
    assert grant_overrides_for(OVERRIDES, "W-000001") == {}


def test_an_override_on_a_merged_work_follows_it() -> None:
    """A merge retires an ID; an override written against it still names the same paper."""
    aliases = {"work:W-000005": "W-000004"}
    assert grant_overrides_for(OVERRIDES, "W-000004") == {}
    assert grant_overrides_for(OVERRIDES, "W-000004", aliases) == {"VRRFI201900217": "VR:201900217"}
    assert not applies_to(OVERRIDES[0], "W-000004", aliases)  # a merge's list target is not a grant's


def test_the_later_of_two_disagreeing_overrides_wins() -> None:
    """The validator reports the disagreement; this only keeps the answer stable if it gets past."""
    first = override("W-000001", "grant", raw="P01 HL0996", grant="NIH:P01HL092969")
    second = override("W-000001", "grant", raw="p01-hl0996", grant=None)
    assert grant_overrides_for([first, second], "W-000001") == {"P01HL0996": None}
