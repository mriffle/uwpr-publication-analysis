"""The sample's real funding, where the export cannot show it (docs/09 §11.8, B8).

`samples/store/funding/` is fetched live by `samples/build_sample_store.py`, which runs the funding
stage over the sample's thirteen real papers. `uwpr_pubs.sample.REAL_FUNDING_CASES` holds most of
§11.8's real cases against the export. Four are facts of the store that the export leaves out: a
supplement's written number, the funder a source names, the resource code, and the provenance of
an amount the rules refuse. They are held here, against the store.
"""

from pathlib import Path
from typing import Any

from uwpr_pubs.funding.numbers import alnum
from uwpr_pubs.store.read import read_store

SAMPLE = Path(__file__).resolve().parents[1] / "samples" / "store"
FUNDING = read_store(SAMPLE).funding
RESOURCE_CODE = "UWPR95794"


def strings(work: str) -> dict[str, Any]:
    return {string["raw"]: string for string in FUNDING.citations[work]["strings"]}


def test_every_included_work_has_a_citations_line() -> None:
    assert FUNDING.present
    assert set(FUNDING.citations) == set(read_store(SAMPLE).works)


def test_a_type_3_supplement_is_its_parent_grant() -> None:
    """W-000007's OpenAlex writes the supplement `3p30dk017047-45s2`: the grant is P30DK017047."""
    supplement = strings("W-000007")["3p30dk017047-45s2"]
    assert (supplement["outcome"], supplement["method"], supplement["grants"]) == (
        "grant",
        "exact",
        ["NIH:P30DK017047"],
    )


def test_an_nih_number_a_source_gives_to_another_funder_stays_nih() -> None:
    """§6.4: OpenAlex names the American Heart Association for W-000007's `P30 DK017047`; an
    NIH-format number is NIH's whatever is named, so NIH decides, and the AHA's own grant on the
    same paper is the AHA's."""
    p30 = strings("W-000007")["P30 DK017047"]
    assert "American Heart Association" in p30["funders"]
    assert p30["grants"] == ["NIH:P30DK017047"]
    assert FUNDING.grants["NIH:P30DK017047"]["agency"] == "NIDDK"
    assert FUNDING.grants["AHA:15POST22700033"]["agency"] == "AHA"
    assert "AHA:15POST22700033" in FUNDING.citations["W-000007"]["grants"]


def test_the_resource_code_is_never_a_grant() -> None:
    """§6.13: UWPR's own award code, written on three of the papers, is excluded, not a grant."""
    written = {
        work: string
        for work, line in FUNDING.citations.items()
        for string in line["strings"]
        if RESOURCE_CODE in alnum(string["raw"])
    }
    assert set(written) == {"W-000001", "W-000006", "W-000007"}
    for string in written.values():
        assert (string["outcome"], string["method"], string["grants"]) == ("resource_code", None, [])
    assert not [key for key, grant in FUNDING.grants.items() if RESOURCE_CODE in key + alnum(grant["number"])]


def test_a_gepris_amount_is_refused() -> None:
    """§5.4: OpenAlex's DFG amounts from GEPRIS are excluded, so these grants have no amount."""
    for key in ("DFG:461264291", "DFG:497694394"):
        grant = FUNDING.grants[key]
        gepris = [award for award in grant["facts"]["openalex"] if award["provenance"] == "gepris"]
        assert gepris and all(award["amount"] is not None for award in gepris), key
        assert grant["amount"] is None, key
        assert "amount_not_found" in grant["flags"], key


def test_a_multi_project_total_counts_its_parent_rows_alone() -> None:
    """F6, as §5.1 measured it: P30DK017047's 54 parent rows come to $52,843,525 through FY2026;
    with its sub-projects, $86.0M. Later fiscal years are left out, so a rebuild keeps this."""
    years = FUNDING.grants["NIH:P30DK017047"]["facts"]["reporter"]["fiscal_years"]
    assert sum(amount or 0 for year, amount in years.items() if int(year) <= 2026) == 52_843_525
