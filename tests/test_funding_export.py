"""Funding in the app's data contract, `schema_version` 1.1 (docs/09 §11).

The summary is the part most worth testing as arithmetic, for the same reason docs/05's is: the app
recomputes every funding figure in the browser, and `summarizeFunding` must reproduce this block
field for field. The validator's checks are tested one promise at a time, each by breaking only
that promise in an otherwise valid document and asserting its own message. Everything is offline.
"""

import json
import shutil
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

import pytest

from uwpr_pubs.config import load_config
from uwpr_pubs.export import SCHEMA_VERSION, ExportMeta, build_export
from uwpr_pubs.funding.contract import ExportAgency, ExportGrant, WorkGrants
from uwpr_pubs.funding.export import (
    FundingInput,
    build_funding,
    grant_url,
    json_number,
    listings_for,
    no_funding,
)
from uwpr_pubs.funding.overrides import grant_override_for
from uwpr_pubs.funding.summary import build_funding_summary, investigator_key, normalised_name
from uwpr_pubs.sample import FUNDING_CASES, missing_cases
from uwpr_pubs.schemas import schema_errors
from uwpr_pubs.stages.export import (
    build_from_store,
    last_full_refresh,
    load_extra_funding,
    read,
    resource_block,
    schema_problems,
)
from uwpr_pubs.store import io
from uwpr_pubs.store.models import FundingCitation, Grant, Override, RunManifest, Work
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.validate import Report, _validate_funding, validate_export

SAMPLES = Path("samples")
SAMPLE_CASES = SAMPLES / "export_cases.json"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "funding"  # B4's synthetic funding store


def sample() -> tuple[Any, Any]:
    config = load_config(overrides_path=SAMPLES / "overrides.yaml")
    return build_from_store(
        SAMPLES / "store",
        resource_block(config),
        extra=SAMPLE_CASES,
        overrides=config.overrides,
        rate_sources=config.exchange_rates["sources"],
    )


@pytest.fixture(scope="module")
def built() -> tuple[Any, Any]:
    return sample()


@pytest.fixture(scope="module")
def lines() -> dict[str, Any]:
    """The citations lines the sample was built from: its synthetic ones (the store has none yet)."""
    funding, _ = load_extra_funding(SAMPLE_CASES)
    return dict(funding.citations)


def copy(document: Any) -> Any:
    return json.loads(json.dumps(document))


def resummarise(document: Any) -> Any:
    """Recompute the summary after a mutation, so only the promise under test is broken."""
    funding = document["funding"]
    funding["summary"] = build_funding_summary(document["works"], funding["grants"], funding["agencies"])
    return document


def grant_of(document: Any, key: str) -> Any:
    return next(grant for grant in document["funding"]["grants"] if grant["key"] == key)


def listing_of(document: Any, work: str, key: str) -> Any:
    row = next(w for w in document["works"] if w["id"] == work)
    return next(r for r in row["grants"] if r["grant"] == key)


# --- the sample ------------------------------------------------------------------------------------


def test_the_sample_carries_funding_and_validates_against_its_lines(
    built: tuple[Any, Any], lines: dict[str, Any]
) -> None:
    document, lookup = built
    assert document["schema_version"] == SCHEMA_VERSION == "1.1"
    assert document["funding"]["version"] == "2026-09-26.1"
    assert schema_problems(document, lookup) == []
    report = validate_export(document, lookup, run_year=2026, funding_citations=lines)
    assert report.errors == []


def test_the_funding_summary_equals_a_recomputation_from_the_rows(built: tuple[Any, Any]) -> None:
    """Rows as the app receives them (a JSON round trip), and only what the contract carries."""
    document = copy(built[0])
    funding = document["funding"]
    assert (
        build_funding_summary(document["works"], funding["grants"], funding["agencies"]) == funding["summary"]
    )


def test_the_sample_summary_by_hand(built: tuple[Any, Any]) -> None:
    """The synthetic funding's figures, worked out from export_cases.json by hand.

    Nine grants, eight resolved; the CLP grant converts to $2,522,936 at OECD's 2020 rate, and the
    UAH grant stays out of every total. Investigator K is written two ways without an id and is
    one person; L is on two grants with one id. The University of Washington is written in capitals
    once and in title case once, and is one organisation.
    """
    summary = built[0]["funding"]["summary"]
    assert summary == {
        "grants": 9,
        "grants_resolved": 8,
        "grants_with_amount": 6,
        "grants_unconverted": 1,
        "grants_institution_wide": 1,
        "agencies": 4,  # NIH, VA, ANID and the OpenAlex funder; Miscellaneous is not one
        "investigators": 5,
        "organizations": 5,
        "amount_usd": 15_452_936,
        "amount_usd_institution_wide": 2_522_936,
        "amount_usd_nih": 12_930_000,
        "nih_grants": 5,
        "works_with_grants": 4,
        "works_with_listings": 4,
        "first_year": 2019,
        "last_year": 2024,
        "by_first_year": {
            "2019": {
                "grants": 2,
                "grants_institution_wide": 0,
                "amount_usd": 3_130_000,
                "amount_usd_institution_wide": 0,
            },
            "2021": {
                "grants": 1,
                "grants_institution_wide": 0,
                "amount_usd": 4_100_000,
                "amount_usd_institution_wide": 0,
            },
            "2024": {
                "grants": 5,
                "grants_institution_wide": 1,
                "amount_usd": 8_222_936,
                "amount_usd_institution_wide": 2_522_936,
            },
        },
    }


def test_every_funding_case_is_exhibited_by_the_committed_sample() -> None:
    document, _ = read(SAMPLES / "export")
    for name, exhibits in FUNDING_CASES.items():
        assert exhibits(document), name
    assert missing_cases(document) == []


def test_a_funding_case_the_sample_loses_is_missing(built: tuple[Any, Any]) -> None:
    document = copy(built[0])
    for grant in document["funding"]["grants"]:
        grant["flags"] = [flag for flag in grant["flags"] if flag != "unconverted_currency"]
    assert "an amount in a currency no rate table covers, unconverted" in missing_cases(document)


def test_the_clp_amount_is_converted_by_the_real_oecd_rate(built: tuple[Any, Any]) -> None:
    config = load_config()
    oecd = next(source for source in config.exchange_rates["sources"] if source["name"].startswith("OECD"))
    assert "CLP" in oecd["currencies"]
    grant = grant_of(built[0], "ANID:1599A0999")
    rate = Decimal(config.exchange_rates["rates"]["CLP"][str(grant["rate_year"])])
    assert grant["amount_usd"] == round(Decimal(str(grant["amount_original"])) * rate)


def test_the_synthetic_funding_is_a_valid_funding_store(tmp_path: Path) -> None:
    """Invariants F1-F7 over the synthetic lines, as if they were a store's `funding/`."""
    document = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))
    funding = document["funding"]
    paths = StorePaths(tmp_path / "store")
    io.write_jsonl(paths.funding_citations, funding["citations"])
    io.write_jsonl(paths.funding_grants, funding["grants"])
    io.write_jsonl(paths.funding_agencies, funding["agencies"])
    included = {work["id"] for work in document["works"]}
    report = Report()
    _validate_funding(paths, included, {}, "UWPR95794", report)
    assert report.errors == []
    for override in funding["overrides"]:
        assert schema_errors("overrides", [override]) == []


def test_the_synthetic_funding_cannot_be_mistaken_for_real_grants() -> None:
    funding = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))["funding"]
    for grant in funding["grants"]:
        assert grant["title"] is None or grant["title"].startswith("SAMPLE: "), grant["key"]
        assert "999" in grant["key"] or "2099" in grant["key"], grant["key"]  # numbers no funder issues
        for person in grant["pis"]:
            assert person["name"].upper().startswith("SAMPLE"), person
    assert {override["by"] for override in funding["overrides"]} == {"sample"}


# --- a work's grants (§11.2) -----------------------------------------------------------------------


def _string(raw: str, method: str | None, grants: list[str], outcome: str = "grant") -> dict[str, Any]:
    return {
        "raw": raw,
        "funders": [],
        "sources": ["pubmed"],
        "first_seen": "2026-09-26",
        "last_seen": "2026-09-26",
        "outcome": outcome,
        "grants": grants,
        "method": method,
        "note": None,
    }


def _line(work: str, strings: list[dict[str, Any]], links: list[str] = ()) -> FundingCitation:  # type: ignore[assignment]
    return cast(
        FundingCitation,
        {
            "schema": 1,
            "work": work,
            "funding_version": "2026-09-26.1",
            "strings": strings,
            "nih_links": [
                {
                    "core": key.split(":")[1],
                    "grant": key,
                    "first_seen": "2026-09-26",
                    "last_seen": "2026-09-26",
                }
                for key in links
            ],
            "jats_checked": {},
            "grants": sorted({k for s in strings for k in s["grants"]} | set(links)),
        },
    )


def _agency(code: str, parent: str | None = None, group: str = "us_federal") -> Any:
    return {
        "schema": 1,
        "code": code,
        "name": code,
        "short_name": None,
        "parent": parent,
        "group": group,
        "country": None,
        "origin": "config",
    }


def _grant(key: str, agency: str, **fields: Any) -> Grant:
    line: dict[str, Any] = {
        "schema": 1,
        "key": key,
        "agency": agency,
        "family": "agency",
        "number": key.rsplit(":", maxsplit=1)[-1],
        "activity": None,
        "category": "other",
        "status": "resolved",
        "scope": "project",
        "scope_reason": None,
        "title": None,
        "pis": [],
        "organization": None,
        "start": None,
        "end": None,
        "facts": {},
        "amount": None,
        "flags": [],
        "openalex_awards": [],
        "first_seen": "2026-09-26",
        "checked": "2026-09-26",
    }
    line.update(fields)
    return cast(Grant, line)


AGENCIES = {"NIH": _agency("NIH"), "NIGMS": _agency("NIGMS", "NIH")}
GRANTS = {key: _grant(key, "NIGMS", family="reporter") for key in ("NIH:R01GM000001", "NIH:R01GM000002")}


def _override(target: str, raw: str, grant: str, by: str = "mriffle") -> Override:
    return cast(
        Override,
        {
            "target": target,
            "action": "grant",
            "raw": raw,
            "grant": grant,
            "reason": "r",
            "by": by,
            "date": "2026-10-03",
        },
    )


def test_how_is_the_strongest_evidence_and_cited_as_does_not_depend_on_it() -> None:
    """W-000147's P01HL092969, in miniature: written exactly, linked, and written short elsewhere."""
    line = _line(
        "W-000001",
        [
            _string("R01 GM00000", "corrected", ["NIH:R01GM000001"]),
            _string("R01GM000001", "exact", ["NIH:R01GM000001"]),
        ],
        ["NIH:R01GM000001", "NIH:R01GM000002"],
    )
    rows = listings_for("W-000001", line, FundingInput(grants=GRANTS, agencies=AGENCIES))
    assert rows == [
        {
            "grant": "NIH:R01GM000001",
            "how": "listed",
            "cited_as": ["R01 GM00000"],
            "agencies": ["NIH", "NIGMS"],
        },
        {"grant": "NIH:R01GM000002", "how": "nih_link", "agencies": ["NIH", "NIGMS"]},
    ]


def test_corrected_outranks_override_and_the_override_is_attributed_through_a_merge() -> None:
    line = _line(
        "W-000002",
        [
            _string("R01  GM00000", "override", ["NIH:R01GM000001"]),
            _string("R01GM00000 1", "corrected", ["NIH:R01GM000001"]),
        ],
    )
    funding = FundingInput(
        grants=GRANTS,
        agencies=AGENCIES,
        overrides=[_override("W-000009", "r01gm00000", "NIH:R01GM000001")],
        aliases={"work:W-000009": "W-000002"},
    )
    [row] = listings_for("W-000002", line, funding)
    assert row["how"] == "corrected"
    assert row["cited_as"] == ["R01 GM00000", "R01GM00000 1"]  # whitespace collapsed
    assert row["override"] == {"reason": "r", "by": "mriffle", "date": "2026-10-03"}


def test_an_override_nobody_attributes_is_left_for_the_validator_to_report() -> None:
    line = _line("W-000003", [_string("U19AG02312", "override", ["NIH:R01GM000001"])])
    [row] = listings_for("W-000003", line, FundingInput(grants=GRANTS, agencies=AGENCIES))
    assert row["how"] == "override"
    assert "override" not in row


def test_the_override_entry_is_the_later_of_two_and_none_for_another_string() -> None:
    first, second = (
        _override("W-000001", "U19 AG02312", "NIH:A", "one"),
        _override("W-000001", "u19-ag02312", "NIH:B", "two"),
    )
    assert grant_override_for([first, second], "W-000001", "U19AG02312") == second
    assert grant_override_for([first, second], "W-000001", "U19AG02313") is None
    assert grant_override_for([first], "W-000002", "U19AG02312") is None
    unfinished = cast(Override, {"target": "W-000001", "action": "grant", "reason": "r", "by": "b"})
    assert grant_override_for([unfinished], "W-000001", "U19AG02312") is None  # the schema's to refuse


def test_only_exported_works_lines_count_and_a_grant_takes_its_earliest_works_year() -> None:
    funding = FundingInput(
        citations={
            "W-000001": _line("W-000001", [_string("R01GM000001", "exact", ["NIH:R01GM000001"])]),
            "W-000002": _line("W-000002", [], ["NIH:R01GM000001"]),
            "W-000404": _line("W-000404", [_string("R01GM000002", "exact", ["NIH:R01GM000002"])]),
        },
        grants=GRANTS,
        agencies=AGENCIES,
    )
    listings, block = build_funding({"W-000001": 2021, "W-000002": 2018}, funding)
    assert sorted(listings) == ["W-000001", "W-000002"]
    assert [grant["key"] for grant in block["grants"]] == ["NIH:R01GM000001"]
    assert block["grants"][0]["first_year"] == 2018
    assert [agency["code"] for agency in block["agencies"]] == ["NIGMS", "NIH"]  # sorted, parent included


def test_no_lines_for_any_exported_work_is_no_funding_data() -> None:
    funding = FundingInput(citations={"W-000404": _line("W-000404", [])}, grants=GRANTS, agencies=AGENCIES)
    assert build_funding({"W-000001": 2020}, funding) == ({}, no_funding())


# --- a grant (§11.4) ----------------------------------------------------------------------------------


def _reporter(**fields: Any) -> dict[str, Any]:
    return {
        "reporter": {
            "fiscal_years": {},
            "application_types": [],
            "first_support_year": None,
            "latest_appl_id": 11374793,
            **fields,
        }
    }


@pytest.mark.parametrize(
    ("key", "family", "facts", "expected"),
    [
        (
            "NIH:P30DK017047",
            "reporter",
            _reporter(),
            ("https://reporter.nih.gov/project-details/11374793", "NIH RePORTER project page"),
        ),
        (
            "NIH-contract:HHSN272201700059C",
            "nih_contract",
            _reporter(),
            ("https://reporter.nih.gov/project-details/11374793", "NIH RePORTER project page"),
        ),
        (
            "NSF:2140004",
            "nsf",
            {},
            ("https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2140004", "NSF award page"),
        ),
        (
            "USA:NASA:80NSSC18K1291",
            "us_federal",
            {
                "usaspending": {
                    "total_obligation": None,
                    "type": None,
                    "pop_start": None,
                    "pop_end": None,
                    "generated_id": "ASST_NON_80NSSC18K1291_080",
                }
            },
            ("https://www.usaspending.gov/award/ASST_NON_80NSSC18K1291_080", "USAspending award page"),
        ),
        ("VR:201900217", "agency", {}, (None, None)),
        ("NIH:R01GM000001", "reporter", {}, (None, None)),  # no RePORTER facts yet: no page to name
    ],
)
def test_each_grant_links_to_the_page_that_checks_it(
    key: str, family: str, facts: dict[str, Any], expected: tuple[str | None, str | None]
) -> None:
    """The three forms were each opened once, as plain pages, on 2026-09-26: RePORTER's project
    11374793 (P30DK017047, FY2026), NSF's award 2140004 and USAspending's ASST_NON_80NSSC18K1291_080."""
    assert grant_url(_grant(key, "X", family=family, facts=facts)) == expected


def test_amounts_leave_as_exact_json_numbers() -> None:
    assert json_number("52843525") == 52843525
    assert isinstance(json_number("2000000000"), int)
    assert json_number("3976833.96") == 3976833.96
    assert json_number("796089.19") == 796089.19
    with pytest.raises(ValueError, match="without changing it"):
        json_number("0.12345678901234567890123")


def test_the_last_full_refresh_is_the_newest_full_run() -> None:
    def run(run_id: str, mode: str | None) -> RunManifest:
        funding = {"version": "v", "fingerprint": "f", **({"mode": mode} if mode else {})}
        return cast(
            RunManifest, {"run_id": run_id, "started": f"{run_id[:10]}T01:00:00Z", "funding": funding}
        )

    runs = [
        run("2026-10-03T01-00-live", "full"),
        run("2026-10-10T01-00-live", "incremental"),
        run("2026-10-31T01-00-live", "full"),
        run("2026-11-07T01-00-live", None),
    ]
    assert last_full_refresh(runs) == "2026-10-31"
    assert last_full_refresh([run("2026-10-10T01-00-live", "incremental")]) is None
    assert last_full_refresh([cast(RunManifest, {"run_id": "2026-09-26T17-26-live"})]) is None


# --- the summary, as arithmetic (§11.6) -------------------------------------------------------------


def _row(key: str, agency: str = "NIGMS", **fields: Any) -> ExportGrant:
    row: dict[str, Any] = {
        "key": key,
        "agency": agency,
        "status": "resolved",
        "scope": "project",
        "amount_usd": None,
        "flags": [],
        "pis": [],
        "organization": None,
        "first_year": 2020,
    }
    row.update(fields)
    return cast(ExportGrant, row)


EXPORT_AGENCIES = cast(
    list[ExportAgency],
    [
        {"code": "NIH", "parent": None},
        {"code": "NIGMS", "parent": "NIH"},
        {"code": "NSF", "parent": None},
        {"code": "MISC", "parent": None},
    ],
)


def test_people_are_keyed_by_id_else_by_the_name_normalised() -> None:
    assert normalised_name("  \uff2aane\u00a0 DOE ") == "jane doe"  # NFKC folds the full-width J
    assert investigator_key({"name": "Jane Doe", "id": "123"}) == "123"
    assert investigator_key({"name": "JANE  doe", "id": None}) == "jane doe"
    grants = [
        _row("NIH:A", pis=[{"name": "Jane Doe", "id": "123"}, {"name": "JANE  doe", "id": None}]),
        _row("NIH:B", pis=[{"name": "Jane Doe", "id": "123"}, {"name": "jane doe", "id": None}]),
        _row("MISC:C", "MISC", status="unresolved", pis=[{"name": "Someone Else", "id": None}]),
    ]
    assert build_funding_summary([], grants, EXPORT_AGENCIES)["investigators"] == 2  # one by id, one by name


def test_organisations_are_names_normalised_and_null_counts_for_nothing() -> None:
    grants = [
        _row("NIH:A", organization="UNIVERSITY OF WASHINGTON"),
        _row("NIH:B", organization="University of  Washington"),
        _row("NSF:C", "NSF", organization=None),
    ]
    assert build_funding_summary([], grants, EXPORT_AGENCIES)["organizations"] == 1


def test_unknown_is_never_zero_and_miscellaneous_is_no_agency() -> None:
    grants = [
        _row("NIH:A", amount_usd=100, first_year=2019),
        _row("NSF:B", "NSF", amount_usd=None, scope="institution-wide", first_year=2021),
        _row("NSF:C", "NSF", amount_usd=40, scope="institution-wide", first_year=2019, flags=["active"]),
        _row("MISC:D", "MISC", status="unresolved", first_year=2017),
        _row("F1:E", "F1", amount_usd=None, flags=["unconverted_currency"], first_year=2021),
    ]
    works = cast(
        list[WorkGrants],
        [
            {"id": "W-1", "year": 2017, "grants": [{"grant": "MISC:D"}]},
            {"id": "W-2", "year": 2019, "grants": [{"grant": "NIH:A"}, {"grant": "NSF:C"}]},
            {"id": "W-3", "year": 2021, "grants": [{"grant": "NSF:B"}, {"grant": "F1:E"}]},
            {"id": "W-4", "year": 2022, "grants": []},
        ],
    )
    summary = build_funding_summary(works, grants, EXPORT_AGENCIES)
    assert summary["grants"] == 5
    assert summary["grants_resolved"] == 4
    assert summary["grants_with_amount"] == 2
    assert summary["grants_unconverted"] == 1
    assert summary["agencies"] == 3  # NIH (NIGMS's root), NSF, and F1, which is its own root
    assert summary["amount_usd"] == 140
    assert summary["amount_usd_institution_wide"] == 40
    assert summary["amount_usd_nih"] == 100
    assert summary["nih_grants"] == 1
    assert summary["works_with_grants"] == 2
    assert summary["works_with_listings"] == 3
    assert (summary["first_year"], summary["last_year"]) == (2019, 2021)  # Miscellaneous's 2017 is not one
    assert summary["by_first_year"] == {
        "2019": {
            "grants": 2,
            "grants_institution_wide": 1,
            "amount_usd": 140,
            "amount_usd_institution_wide": 40,
        },
        "2021": {
            "grants": 2,
            "grants_institution_wide": 1,
            "amount_usd": 0,
            "amount_usd_institution_wide": 0,
        },
    }


def test_a_grant_no_work_dates_adds_to_no_year() -> None:
    """`first_year` is null only for a grant no exported work lists, which the validator refuses."""
    summary = build_funding_summary([], [_row("NIH:A", amount_usd=10, first_year=None)], EXPORT_AGENCIES)
    assert (summary["amount_usd"], summary["first_year"], summary["by_first_year"]) == (10, None, {})


# --- no funding data (§11.1) ------------------------------------------------------------------------


def _meta() -> ExportMeta:
    config = load_config()
    return ExportMeta(
        run_id="2026-09-26T00-00-test",
        generated_at="2026-09-26T00:00:00Z",
        pipeline_version="0",
        rule_version=config.rule_version,
        run_year=2026,
        citations_as_of="2026-09-26",
        resource=resource_block(config),
    )


def test_no_funding_data_validates_with_every_list_empty_and_every_count_zero() -> None:
    works = cast(list[Work], json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))["works"])
    document = build_export(works, [], _meta())
    funding = document["funding"]
    assert funding["version"] is None and funding["as_of"] is None
    assert [funding["sources"], funding["exchange_rates"], funding["agencies"], funding["grants"]] == [[]] * 4
    assert all(value == 0 for value in funding["method"]["strings"].values())
    assert all(value == 0 for value in funding["method"]["resolution"].values())
    assert funding["method"]["works_without_funding_metadata"] == 0
    assert {value for value in funding["summary"].values() if value not in (None, {})} == {0}
    assert all(work["grants"] == [] for work in document["works"])
    assert schema_errors("export", document) == []
    report = validate_export(
        document, {"schema_version": SCHEMA_VERSION, "generated_at": "x", "aliases": {}, "not_included": []}
    )
    assert [error for error in report.errors if "lookup" not in error] == []


def test_the_real_store_exports_no_funding_data() -> None:
    document, _ = read(Path("export"))
    assert document["schema_version"] == "1.1"
    assert document["funding"]["version"] is None
    assert all(work["grants"] == [] for work in document["works"])


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda f, w, s: f["grants"].append(s["grants"][0]), "version is null, but grants has 1 entries"),
        (lambda f, w, s: f.update(as_of="2026-09-26"), "version is null, but as_of is 2026-09-26"),
        (
            lambda f, w, s: f["method"]["strings"].update(grant=1),
            "version is null, but method.strings.grant is 1",
        ),
        (lambda f, w, s: f["summary"].update(amount_usd=5), "version is null, but summary.amount_usd is 5"),
        (
            lambda f, w, s: w[0]["grants"].append({"grant": "NIH:X", "how": "listed", "agencies": ["NIH"]}),
            "lists grants, but the export's funding version",
        ),
    ],
)
def test_no_funding_data_means_none_at_all(
    built: tuple[Any, Any], mutate: Callable[[Any, Any, Any], None], message: str
) -> None:
    document, lookup = read(Path("export"))
    document = copy(document)
    mutate(document["funding"], document["works"], built[0]["funding"])
    report = validate_export(document, lookup)
    assert any(message in error for error in report.errors), report.errors


def test_a_1_0_document_fails_only_on_its_version_and_the_funding_it_lacks() -> None:
    document, lookup = read(Path("export"))
    old = copy(document)
    old["schema_version"] = "1.0"
    del old["funding"]
    for work in old["works"]:
        del work["grants"]
    errors = validate_export(old, lookup).errors
    assert "uwpr_publications.json: schema_version is 1.0, but this contract is 1.1" in errors
    assert "uwpr_publications.json: schema: (root): 'funding' is a required property" in errors
    rest = [error for error in errors if "schema_version" not in error and "'funding'" not in error]
    assert len(rest) == len(old["works"])
    assert all(error.endswith("'grants' is a required property") for error in rest)


# --- the validator's cross-checks (§11.7), each with its own message ----------------------------------


def _unlisted(d: Any) -> None:
    grant = copy(grant_of(d, "NIH:R01GM999001"))
    grant["key"] = "NIH:R01GM999002"
    d["funding"]["grants"].append(grant)


def _unknown(d: Any) -> None:
    d["funding"]["grants"] = [g for g in d["funding"]["grants"] if g["key"] != "NIH:U19AG999002"]


def _no_parent(d: Any) -> None:
    d["funding"]["agencies"] = [a for a in d["funding"]["agencies"] if a["code"] != "NIH"]


def _cycle(d: Any) -> None:
    next(a for a in d["funding"]["agencies"] if a["code"] == "NIH")["parent"] = "NIGMS"


def _misc_resolved(d: Any) -> None:
    grant_of(d, "MISC:R01GM999999")["status"] = "resolved"


def _misc_amount(d: Any) -> None:
    grant_of(d, "MISC:R01GM999999").update(amount_usd=1000, amount_original=1000, currency="USD")


def _misc_group(d: Any) -> None:
    grant_of(d, "MISC:R01GM999999")["agency"] = "NIGMS"
    listing_of(d, "W-000104", "MISC:R01GM999999")["agencies"] = ["NIH", "NIGMS"]


def _code_as_key(d: Any) -> None:
    grant = grant_of(d, "MISC:R01GM999999")
    grant["key"] = "MISC:UWPR95794"
    listing_of(d, "W-000104", "MISC:R01GM999999")["grant"] = "MISC:UWPR95794"


def _code_as_number(d: Any) -> None:
    grant_of(d, "ANID:1599A0999")["number"] = "UWPR 95794"


def _code_cited(d: Any) -> None:
    listing_of(d, "W-000105", "NIH:U19AG999002")["cited_as"] = ["U19AG9990", "UWPR-95794"]


def _url_unnamed(d: Any) -> None:
    grant_of(d, "NIH:R01GM999001")["url_name"] = None


FUNDING_MUTATIONS: list[tuple[str, Callable[[Any], None], str]] = [
    ("an unlisted grant", _unlisted, "funding.grants: NIH:R01GM999002 is listed by no exported work"),
    ("a listed key the block lacks", _unknown, "W-000105: lists NIH:U19AG999002, which funding.grants lacks"),
    ("a parent missing", _no_parent, "NHLBI's parent NIH is not in funding.agencies"),
    (
        "an agency missing",
        lambda d: d["funding"]["agencies"].pop(0),
        "ANID:1599A0999's agency ANID is not in",
    ),
    ("a cycle", _cycle, "funding.agencies: NIH's parents form a cycle"),
    (
        "a chain not root first",
        lambda d: listing_of(d, "W-000104", "NIH:R01GM999001").update(agencies=["NIGMS", "NIH"]),
        "lists NIH:R01GM999001 under agencies ['NIGMS', 'NIH'], but its chain is ['NIH', 'NIGMS']",
    ),
    (
        "a wrong first year",
        lambda d: grant_of(d, "NIH:P01HL999001").update(first_year=2021),
        "NIH:P01HL999001's first_year is 2021, but the earliest exported work listing it is from 2019",
    ),
    (
        "fiscal years that do not sum",
        lambda d: grant_of(d, "NIH:R01GM999001")["fiscal_years"].update({"2022": 1}),
        "NIH:R01GM999001's fiscal years sum to 1030001, but amount_usd is 1030000",
    ),
    (
        "fiscal years without an amount",
        lambda d: grant_of(d, "VA:I01BX999001")["fiscal_years"].update({"2019": 7}),
        "VA:I01BX999001's fiscal years hold 7, but it has no amount_usd",
    ),
    (
        "corrected without cited_as",
        lambda d: listing_of(d, "W-000104", "NIH:P01HL999001").pop("cited_as"),
        "W-000104: NIH:P01HL999001 is how: corrected, but has no cited_as",
    ),
    (
        "an override unattributed",
        lambda d: listing_of(d, "W-000105", "NIH:U19AG999002").pop("override"),
        "W-000105: NIH:U19AG999002 is how: override, but carries no override attribution",
    ),
    (
        "an attribution without cited_as",
        lambda d: listing_of(d, "W-000105", "NIH:U19AG999002").pop("cited_as"),
        "NIH:U19AG999002 carries an override attribution, but no cited_as",
    ),
    (
        "a Miscellaneous grant resolved",
        _misc_resolved,
        "MISC:R01GM999999 is a Miscellaneous grant, but its status",
    ),
    (
        "a Miscellaneous grant with an amount",
        _misc_amount,
        "MISC:R01GM999999 is a Miscellaneous grant, but has an amount",
    ),
    (
        "a Miscellaneous grant elsewhere",
        _misc_group,
        "is a Miscellaneous grant, but its agency is not in that group",
    ),
    (
        "the resource code as a key",
        _code_as_key,
        "the resource code UWPR95794 is in the key of MISC:UWPR95794",
    ),
    (
        "the resource code as a number",
        _code_as_number,
        "the resource code UWPR95794 is in the number of ANID",
    ),
    (
        "the resource code as written",
        _code_cited,
        "the resource code UWPR95794 is written in cited_as 'UWPR-95794'",
    ),
    ("a url without its name", _url_unnamed, "NIH:R01GM999001 has a url without a url_name"),
]


@pytest.mark.parametrize(
    ("name", "mutate", "message"), FUNDING_MUTATIONS, ids=[m[0] for m in FUNDING_MUTATIONS]
)
def test_each_broken_promise_is_its_own_error(
    built: tuple[Any, Any], name: str, mutate: Callable[[Any], None], message: str
) -> None:
    document = copy(built[0])
    mutate(document)
    report = validate_export(resummarise(document), built[1])
    assert any(message in error for error in report.errors), report.errors


def test_a_summary_that_disagrees_with_the_rows_is_an_error(built: tuple[Any, Any]) -> None:
    document = copy(built[0])
    document["funding"]["summary"]["amount_usd"] += 1
    errors = validate_export(document, built[1]).errors
    assert errors == ["funding.summary: amount_usd is 15452937, recomputed as 15452936"]


def test_a_key_outside_the_grammar_fails_the_schema(built: tuple[Any, Any]) -> None:
    document = copy(built[0])
    grant_of(document, "NIH:R01GM999001")["key"] = "NIH:r01/gm"
    errors = validate_export(document, built[1]).errors
    assert any("does not match" in error and "NIH:r01/gm" in error for error in errors), errors


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda d: listing_of(d, "W-000104", "NIH:R01GM999001").update(how="nih_link"),
            "W-000104: NIH:R01GM999001 is how: nih_link, but its strings and links make it listed",
        ),
        (
            lambda d: listing_of(d, "W-000105", "NIH:R01GM999001").update(cited_as=["R01 GM999001"]),
            "NIH:R01GM999001's cited_as is ['R01 GM999001'], but the forms corrected or overridden",
        ),
        (
            lambda d: listing_of(d, "W-000105", "NIH:P01HL999001").update(
                override={"reason": "r", "by": "b", "date": "2026-10-03"}
            ),
            "NIH:P01HL999001: its override and its listing disagree",
        ),
        (
            lambda d: next(w for w in d["works"] if w["id"] == "W-000103")["grants"].append(
                {"grant": "NIH:R01GM999001", "how": "listed", "agencies": ["NIH", "NIGMS"]}
            ),
            "W-000103: lists ['NIH:R01GM999001'], but its citations line lists []",
        ),
    ],
)
def test_the_listings_are_what_the_lines_say(
    built: tuple[Any, Any], lines: dict[str, Any], mutate: Callable[[Any], None], message: str
) -> None:
    document = copy(built[0])
    mutate(document)
    report = validate_export(resummarise(document), built[1], funding_citations=lines)
    assert any(message in error for error in report.errors), report.errors


# --- B4's fixture store -------------------------------------------------------------------------------


def test_the_b4_fixture_store_exports_and_validates(tmp_path: Path) -> None:
    """A store with `funding/` beside real works, through the same path the real store takes.

    Its W-000010 names NSF:1443474 by an override, so the store's overrides must attribute it.
    """
    store = tmp_path / "store"
    shutil.copytree(SAMPLES / "store", store)
    shutil.copytree(FIXTURE, store / "funding")
    overrides = (SAMPLES / "overrides.yaml").read_text(encoding="utf-8") + (
        "- target: W-000010\n  action: grant\n  raw: OPP 144374\n  grant: NSF:1443474\n"
        "  reason: a digit dropped\n  by: mriffle\n  date: 2026-10-03\n"
    )
    (tmp_path / "overrides.yaml").write_text(overrides, encoding="utf-8")
    config = load_config(overrides_path=tmp_path / "overrides.yaml")
    document, lookup = build_from_store(
        store,
        resource_block(config),
        overrides=config.overrides,
        rate_sources=config.exchange_rates["sources"],
    )
    assert schema_problems(document, lookup) == []
    lines = {line["work"]: line for line in io.read_jsonl(store / "funding" / "citations.jsonl")}
    assert validate_export(document, lookup, run_year=2026, funding_citations=lines).errors == []

    assert [grant["key"] for grant in document["funding"]["grants"]] == sorted(
        {key for line in lines.values() for key in line["grants"]}
    )
    t32 = grant_of(document, "NIH:T32GM007750")
    assert (t32["start_year"], t32["flags"]) == (
        1985,
        ["starts_before_fy1985"],
    )  # RePORTER's first year, not 1975
    assert grant_of(document, "NIH:P30DK017047")["fiscal_years"] == {
        "2019": 1500000,
        "2020": 1550000,
        "2021": 1600000,
        "2026": 400000,
    }
    va = grant_of(document, "VA:I01BX000531")
    assert (va["amount_usd"], va["amount_source"], va["fiscal_years"]) == (
        None,
        None,
        {"2009": None, "2010": None},
    )
    assert grant_of(document, "EU:722493")["amount_original"] == 3976833.96
    assert (
        grant_of(document, "USA:NASA:NNX14AJ87G")["url"]
        == "https://www.usaspending.gov/award/ASST_NON_NNX14AJ87G_8000"
    )
    assert listing_of(document, "W-000010", "NSF:1443474") == {
        "grant": "NSF:1443474",
        "how": "listed",
        "cited_as": ["OPP 144374"],
        "override": {"reason": "a digit dropped", "by": "mriffle", "date": "2026-10-03"},
        "agencies": ["NSF"],
    }
    assert listing_of(document, "W-000011", "NIH:R01GM086688")["how"] == "nih_link"
    assert listing_of(document, "W-000007", "NIH:P01HL092969")["how"] == "corrected"
    sources = {source["id"]: source for source in document["funding"]["sources"]}
    assert set(sources) == {"reporter", "nsf", "usaspending", "openalex", "pubmed", "crossref", "pmc"}
    assert (sources["reporter"]["amounts_from"], sources["reporter"]["partial_year"]) == (1985, 2026)
    assert (sources["usaspending"]["amounts_from"], sources["usaspending"]["partial_year"]) == (2008, None)
    assert document["funding"]["as_of"] == "2026-09-26"  # no run records a full refresh: the latest check


def test_without_the_attribution_the_b4_fixture_store_fails_to_validate(tmp_path: Path) -> None:
    store = tmp_path / "store"
    shutil.copytree(SAMPLES / "store", store)
    shutil.copytree(FIXTURE, store / "funding")
    config = load_config(overrides_path=SAMPLES / "overrides.yaml")
    document, lookup = build_from_store(store, resource_block(config), overrides=config.overrides)
    lines = {line["work"]: line for line in io.read_jsonl(store / "funding" / "citations.jsonl")}
    errors = validate_export(document, lookup, funding_citations=lines).errors
    assert errors == ["W-000010: NSF:1443474: its override and its listing disagree (no attribution)"]


def test_synthetic_funding_that_clashes_with_the_stores_is_refused(tmp_path: Path) -> None:
    store = tmp_path / "store"
    shutil.copytree(SAMPLES / "store", store)
    shutil.copytree(FIXTURE, store / "funding")
    cases = json.loads(SAMPLE_CASES.read_text(encoding="utf-8"))
    cases["funding"]["grants"].append(io.read_jsonl(FIXTURE / "grants.jsonl")[0])
    (tmp_path / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
    with pytest.raises(ValueError, match="clashes with the store's: ANID:1523A0008"):
        build_from_store(store, resource_block(load_config()), extra=tmp_path / "cases.json")
