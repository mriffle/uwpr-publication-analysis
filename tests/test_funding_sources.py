"""The funding source adapters: request shapes and response parsing, all offline (docs/09).

Every reply here is synthetic and small. None holds an abstract: the tests that care check the
adapters drop one, using a stand-in string.
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import pytest

from uwpr_pubs.cache import Cache
from uwpr_pubs.http import (
    FILTER_PAGE_USD,
    Budget,
    HttpClient,
    HttpError,
    MalformedReplyError,
    Mode,
    RateLimiter,
    Response,
)
from uwpr_pubs.sources import ResultLimitError
from uwpr_pubs.sources.crossref import FUNDER_BATCH, Crossref
from uwpr_pubs.sources.ncbi import PUBMED_BATCH, Ncbi, PubmedGrant, parse_pubmed_grants
from uwpr_pubs.sources.nsf import Nsf
from uwpr_pubs.sources.openalex import AWARD_FIELDS, OpenAlex
from uwpr_pubs.sources.reporter import (
    CORE_BATCH,
    PROJECT_FIELDS,
    Reporter,
    contract_number,
    reachable,
    task_order_part,
)
from uwpr_pubs.sources.usaspending import ID_BATCH, SEARCH_FROM, UsaSpending


@dataclass(frozen=True)
class Sent:
    method: str
    url: str
    params: dict[str, str]
    body: Any  # the parsed JSON body of a POST; None for a GET


Handler = Callable[[Sent], Response]


def client_for(handler: Handler, tmp_path: Path) -> tuple[HttpClient, list[Sent]]:
    seen: list[Sent] = []

    def transport(
        url: str,
        params: Mapping[str, str],
        headers: Mapping[str, str],
        timeout: float,
        *,
        method: str = "GET",
        body: bytes | None = None,
    ) -> Response:
        sent = Sent(method, url, dict(params), None if body is None else json.loads(body))
        seen.append(sent)
        return handler(sent)

    client = HttpClient(
        contact="mriffle@uw.edu",
        user_agent="uwpr-pubs/test",
        mode=Mode.LIVE,
        cache=Cache(tmp_path / "cache"),
        budget=Budget(max_run_usd=0.5, min_remaining_usd=0.1),
        rate_limiter=RateLimiter({}),
        transport=transport,
        sleep=lambda _: None,
        now=lambda: "2026-09-26T00:00:00Z",
    )
    return client, seen


def json_response(payload: object, status: int = 200) -> Response:
    return Response("u", status, json.dumps(payload).encode(), {"content-type": "application/json"})


def xml_response(body: str) -> Response:
    return Response("u", 200, body.encode(), {"content-type": "text/xml"})


def reporter_page(sent: Sent, total: int, make: Callable[[int], dict[str, Any]]) -> Response:
    """One RePORTER page of `total` numbered rows, honouring the request's offset and limit."""
    offset, limit = sent.body["offset"], sent.body["limit"]
    rows = [make(i) for i in range(offset, min(total, offset + limit))]
    return json_response({"meta": {"total": total, "offset": offset, "limit": limit}, "results": rows})


def project(i: int) -> dict[str, Any]:
    return {"appl_id": i, "core_project_num": "R01GM086688", "project_num": f"5R01GM086688-{i:02d}"}


# --- NIH RePORTER ---------------------------------------------------------------------------


def exercise_reporter(tmp_path: Path) -> list[Sent]:
    """Every kind of RePORTER question once, on a fake that pages whatever it is asked."""

    def handler(sent: Sent) -> Response:
        if sent.url.endswith("/publications/search"):
            pmids = sent.body["criteria"]["pmids"]
            return reporter_page(
                sent, 6 * len(pmids), lambda i: {"pmid": pmids[i // 6], "coreproject": f"R01GM{i:06d}"}
            )
        return reporter_page(sent, 700, project)

    client, seen = client_for(handler, tmp_path)
    reporter = Reporter(client, "mriffle@uw.edu")
    reporter.publications([str(pmid) for pmid in range(1000, 1150)])
    reporter.projects(["R01GM086688", "P30CA015704"])
    reporter.projects_by_nums(["R01GM08668*"])
    reporter.projects_by_split(ic="DK", serial="017047")
    reporter.contracts("HHSN272201700059C")
    return seen


def test_every_reporter_request_is_sorted(tmp_path: Path) -> None:
    seen = exercise_reporter(tmp_path)
    assert {sent.method for sent in seen} == {"POST"}
    for sent in seen:
        # Unsorted paging repeats and drops rows. The publications search refuses `appl_id`
        # (HTTP 500, measured), and sorts by `coreproject` instead.
        expected = "coreproject" if sent.url.endswith("/publications/search") else "appl_id"
        assert (sent.body["sort_field"], sent.body["sort_order"]) == (expected, "asc")
        assert sent.body["limit"] <= 500


def test_projects_exclude_subprojects_and_never_ask_for_abstracts(tmp_path: Path) -> None:
    projects = [sent for sent in exercise_reporter(tmp_path) if sent.url.endswith("/projects/search")]
    assert projects
    for sent in projects:
        assert sent.body["criteria"]["exclude_subprojects"] is True
        assert sent.body["include_fields"] == list(PROJECT_FIELDS)
    assert not {"AbstractText", "PhrText"} & set(PROJECT_FIELDS)
    assert {"SubprojectId", "AwardAmount", "FiscalYear", "CoreProjectNum"} <= set(PROJECT_FIELDS)


def test_projects_page_until_the_total(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: reporter_page(sent, 1200, project), tmp_path)
    rows = Reporter(client, "mriffle@uw.edu").projects(["R01GM086688"])
    assert [sent.body["offset"] for sent in seen] == [0, 500, 1000]
    assert len(rows) == 1200
    assert len({row["appl_id"] for row in rows}) == 1200


def test_offset_cap_raises(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: reporter_page(sent, 20_000, project), tmp_path)
    with pytest.raises(ResultLimitError) as raised:
        Reporter(client, "mriffle@uw.edu").projects_by_nums(["R01*"])
    assert (raised.value.total, raised.value.limit) == (20_000, 15_000)
    assert len(seen) == 1  # from the first page, not after paging to the cap
    assert reachable(14_999) == 15_000
    assert reachable(9_999) == 10_000


def test_a_total_that_grows_past_the_cap_while_paging_still_raises(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        return reporter_page(sent, 15_000 if sent.body["offset"] == 0 else 16_000, project)

    client, seen = client_for(handler, tmp_path)
    with pytest.raises(ResultLimitError):
        Reporter(client, "mriffle@uw.edu").projects(["R01GM086688"])
    assert seen[-1].body["offset"] == 14_500  # never an offset past 14,999


def test_projects_are_asked_25_cores_at_a_time(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: reporter_page(sent, 0, project), tmp_path)
    cores = [f"R01GM{i:06d}" for i in range(60, 0, -1)]
    Reporter(client, "mriffle@uw.edu").projects([*cores, cores[0]])
    asked = [sent.body["criteria"]["project_nums"] for sent in seen]
    assert [len(batch) for batch in asked] == [CORE_BATCH, CORE_BATCH, 10]
    assert [core for batch in asked for core in batch] == sorted(set(cores))


def test_publications_split_a_batch_that_needs_more_than_one_page(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        pmids = sent.body["criteria"]["pmids"]
        return reporter_page(
            sent, 6 * len(pmids), lambda i: {"pmid": pmids[i // 6], "coreproject": f"C{i % 6}", "applid": i}
        )

    client, seen = client_for(handler, tmp_path)
    links = Reporter(client, "mriffle@uw.edu").publications([str(p) for p in range(1150, 1000, -1)])
    asked = [sent.body["criteria"]["pmids"] for sent in seen]
    # 100 papers make 600 links, more than a page: each half is asked on one page instead.
    assert [len(batch) for batch in asked] == [100, 50, 50, 50]
    assert all(sent.body["offset"] == 0 for sent in seen)
    assert asked[0] == list(range(1001, 1101))  # numbers, sorted
    assert len(links) == 900
    assert len({(link["pmid"], link["coreproject"]) for link in links}) == 900


def test_one_paper_with_more_than_a_page_of_links_is_paged(tmp_path: Path) -> None:
    client, seen = client_for(
        lambda sent: reporter_page(sent, 700, lambda i: {"pmid": 1, "coreproject": f"C{i:04d}"}), tmp_path
    )
    links = Reporter(client, "mriffle@uw.edu").publications(["1"])
    assert [sent.body["offset"] for sent in seen] == [0, 500]
    assert len(links) == 700


def test_one_paper_beyond_the_publication_cap_raises(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: reporter_page(sent, 10_001, project), tmp_path)
    with pytest.raises(ResultLimitError):
        Reporter(client, "mriffle@uw.edu").publications(["1"])


def test_contracts_drop_the_hhsn_prefix_and_key_rows_by_project_number(tmp_path: Path) -> None:
    rows = [
        {"appl_id": 1, "project_num": "272201700036I-0-27200001-1", "core_project_num": "27220170003"},
        {"appl_id": 2, "project_num": "272201700036I-0-759302000001-1", "core_project_num": "27220170003"},
        {
            "appl_id": 3,
            "project_num": "272201700036I-P00004-759302000001-1",
            "core_project_num": "27220170003",
        },
    ]
    client, seen = client_for(lambda sent: json_response({"meta": {"total": 3}, "results": rows}), tmp_path)
    by_number = Reporter(client, "mriffle@uw.edu").contracts("HHSN272201700036I")
    assert seen[0].body["criteria"] == {"project_nums": ["272201700036I*"], "exclude_subprojects": True}
    assert list(by_number) == [row["project_num"] for row in rows]
    # The cited task order is the third part, its letters removed.
    part = task_order_part("75N93020F00001")
    assert part == "759302000001"
    assert [num for num in by_number if num.split("-")[2] == part] == [
        "272201700036I-0-759302000001-1",
        "272201700036I-P00004-759302000001-1",
    ]


@pytest.mark.parametrize(
    ("written", "stored"),
    [
        ("HHSN272201700059C", "272201700059C"),
        ("hhsn 272201700059c", "272201700059C"),
        ("HHSN-272201700059C", "272201700059C"),
        ("272201700059C", "272201700059C"),
        ("75N93019D00003", "75N93019D00003"),  # newer contracts keep their prefix
    ],
)
def test_contract_numbers_are_asked_as_reporter_stores_them(written: str, stored: str) -> None:
    assert contract_number(written) == stored


def test_a_contract_number_must_hold_something(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: json_response({}), tmp_path)
    with pytest.raises(ValueError, match="contract"):
        Reporter(client, "mriffle@uw.edu").contracts("HHSN")
    assert seen == []


def test_projects_by_split_sends_only_the_parts_given(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: reporter_page(sent, 0, project), tmp_path)
    reporter = Reporter(client, "mriffle@uw.edu")
    reporter.projects_by_split(ic="DK", serial="017047")
    reporter.projects_by_split("P30", "DK", "017047")
    assert [sent.body["criteria"]["project_num_split"] for sent in seen] == [
        {"ic_code": "DK", "serial_num": "017047"},
        {"activity_code": "P30", "ic_code": "DK", "serial_num": "017047"},
    ]
    with pytest.raises(ValueError, match="at least one"):
        reporter.projects_by_split()


def test_a_reporter_reply_without_a_total_has_changed_shape(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: json_response({"results": []}), tmp_path)
    with pytest.raises(MalformedReplyError, match=r"meta\.total"):
        Reporter(client, "mriffle@uw.edu").projects(["R01GM086688"])


def test_reporter_is_spaced_on_its_own_host(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: reporter_page(sent, 0, project), tmp_path)
    Reporter(client, "mriffle@uw.edu").projects(["R01GM086688"])
    assert set(client.usage) == {"reporter"}


# --- NSF ------------------------------------------------------------------------------------


def nsf_reply(*awards: dict[str, Any]) -> Response:
    return json_response({"response": {"award": list(awards), "metadata": {"totalCount": len(awards)}}})


def test_nsf_asks_one_award_and_keeps_only_the_named_fields(tmp_path: Path) -> None:
    award = {
        "id": "1233014",
        "estimatedTotalAmt": "350000",
        "fundsObligatedAmt": "350000",
        "startDate": "10/01/2012",
        "expDate": "09/30/2016",
        "piFirstName": "Brook",
        "piLastName": "Nunn",
        "abstractText": "a stand-in abstract",
        "piEmail": "someone@example.org",
        "poEmail": "officer@example.org",
        "awardeePhone": "2065550100",
    }
    client, seen = client_for(lambda sent: nsf_reply(award), tmp_path)
    kept = Nsf(client, "mriffle@uw.edu").award("1233014")
    assert seen[0].method == "GET"
    assert seen[0].params == {"id": "1233014"}
    assert set(client.usage) == {"nsf"}
    assert kept == {
        "id": "1233014",
        "estimatedTotalAmt": "350000",
        "fundsObligatedAmt": "350000",
        "startDate": "10/01/2012",
        "expDate": "09/30/2016",
        "piFirstName": "Brook",
        "piLastName": "Nunn",
    }


def test_an_award_nsf_does_not_have_is_none(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: nsf_reply(), tmp_path)
    assert Nsf(client, "mriffle@uw.edu").award("0659680") is None


def test_an_nsf_award_number_is_seven_digits(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: nsf_reply(), tmp_path)
    for bad in ("144374", "DGE-1256082", "12345678"):
        with pytest.raises(ValueError, match="7 digits"):
            Nsf(client, "mriffle@uw.edu").award(bad)
    assert seen == []


def test_an_nsf_error_notice_is_an_http_error(tmp_path: Path) -> None:
    notice = {"notificationType": "ERROR", "notificationMessage": "bad parameter"}
    client, _ = client_for(
        lambda sent: json_response({"response": {"serviceNotification": [notice]}}), tmp_path
    )
    with pytest.raises(HttpError, match="bad parameter"):
        Nsf(client, "mriffle@uw.edu").award("1233014")


@pytest.mark.parametrize("payload", [{}, {"response": {"metadata": {}}}])
def test_an_nsf_reply_without_an_award_list_has_changed_shape(tmp_path: Path, payload: object) -> None:
    client, _ = client_for(lambda sent: json_response(payload), tmp_path)
    with pytest.raises(MalformedReplyError):
        Nsf(client, "mriffle@uw.edu").award("1233014")


# --- USAspending ----------------------------------------------------------------------------


def test_usaspending_batches_award_ids(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        ids = sent.body["filters"]["award_ids"]
        return json_response({"results": [{"Award ID": i} for i in ids], "page_metadata": {"hasNext": False}})

    client, seen = client_for(handler, tmp_path)
    ids = [f"NNX14AH{i:02d}G" for i in range(60)]
    rows = UsaSpending(client, "mriffle@uw.edu").awards([*ids, " ", ids[0]])
    assert [len(sent.body["filters"]["award_ids"]) for sent in seen] == [ID_BATCH, ID_BATCH, 10]
    assert [row["Award ID"] for row in rows] == sorted(ids)
    for sent in seen:
        assert sent.method == "POST"
        filters = sent.body["filters"]
        assert filters["award_type_codes"] == ["02", "03", "04", "05"]
        assert filters["time_period"][0]["start_date"] == SEARCH_FROM == "2007-10-01"
        assert "generated_internal_id" in sent.body["fields"]
        assert "Award Amount" in sent.body["fields"]
        assert (sent.body["sort"], sent.body["order"]) == ("Award ID", "asc")
    assert set(client.usage) == {"usaspending"}


def test_usaspending_asks_one_award_type_group_at_a_time(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: json_response({"results": [], "page_metadata": {}}), tmp_path)
    UsaSpending(client, "mriffle@uw.edu").awards(["DEAC0205CH11231"], "contracts")
    assert seen[0].body["filters"]["award_type_codes"] == ["A", "B", "C", "D"]


def test_usaspending_pages_while_there_is_more(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        page = sent.body["page"]
        return json_response({"results": [{"Award ID": f"X{page}"}], "page_metadata": {"hasNext": page < 2}})

    client, seen = client_for(handler, tmp_path)
    rows = UsaSpending(client, "mriffle@uw.edu").awards(["X"])
    assert [sent.body["page"] for sent in seen] == [1, 2]
    assert [row["Award ID"] for row in rows] == ["X1", "X2"]


def test_a_usaspending_search_without_results_has_changed_shape(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: json_response({"messages": ["no"]}), tmp_path)
    with pytest.raises(MalformedReplyError):
        UsaSpending(client, "mriffle@uw.edu").awards(["X"])


def test_award_detail_reads_total_obligation_and_never_total_funding(tmp_path: Path) -> None:
    detail = {
        "generated_unique_award_id": "ASST_NON_NA14OAR4170078_013",
        "fain": "NA14OAR4170078",
        "category": "grant",
        "type": "04",
        "total_obligation": 13408673.0,
        "total_funding": 20800000.0,
        "non_federal_funding": 7391327.0,
        "period_of_performance": {"start_date": "2014-02-01", "end_date": "2020-01-31"},
        "recipient": {"recipient_name": "UNIVERSITY OF WASHINGTON"},
        "awarding_agency": {
            "toptier_agency": {"name": "Department of Commerce", "abbreviation": "DOC"},
            "subtier_agency": {
                "name": "National Oceanic and Atmospheric Administration",
                "abbreviation": "NOAA",
            },
        },
        "description": "a stand-in description",
    }
    client, seen = client_for(lambda sent: json_response(detail), tmp_path)
    got = UsaSpending(client, "mriffle@uw.edu").award_detail("ASST_NON_NA14OAR4170078_013")
    assert seen[0].method == "GET"
    assert seen[0].url == "https://api.usaspending.gov/api/v2/awards/ASST_NON_NA14OAR4170078_013/"
    assert got is not None
    assert got["total_obligation"] == 13408673.0
    assert "total_funding" not in got
    assert "description" not in got
    assert got["recipient_name"] == "UNIVERSITY OF WASHINGTON"
    assert got["awarding_agency"]["sub_abbreviation"] == "NOAA"
    assert got["funding_agency"] == {
        "name": None,
        "abbreviation": None,
        "sub_name": None,
        "sub_abbreviation": None,
    }


def test_an_award_usaspending_lacks_is_none_and_ids_are_escaped(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: json_response({"detail": "No Award found"}, 404), tmp_path)
    assert UsaSpending(client, "mriffle@uw.edu").award_detail("CONT_AWD_A/B_0") is None
    assert seen[0].url.endswith("/awards/CONT_AWD_A%2FB_0/")
    assert unquote(seen[0].url).endswith("/awards/CONT_AWD_A/B_0/")


def test_an_award_detail_outage_is_not_an_answer(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: json_response({}, 503), tmp_path)
    with pytest.raises(HttpError):
        UsaSpending(client, "mriffle@uw.edu").award_detail("ASST_NON_1_049")


def test_an_award_detail_without_its_amount_has_changed_shape(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: json_response({"fain": "X"}), tmp_path)
    with pytest.raises(MalformedReplyError):
        UsaSpending(client, "mriffle@uw.edu").award_detail("ASST_NON_1_049")


# --- PubMed ---------------------------------------------------------------------------------

PUBMED_XML = """<?xml version="1.0"?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN"
  "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">18641041</PMID>
      <Article>
        <Abstract><AbstractText>A stand-in abstract.</AbstractText></Abstract>
        <GrantList CompleteYN="Y">
          <Grant>
            <GrantID>P50 GM076547</GrantID>
            <Acronym>GM</Acronym>
            <Agency>NIGMS NIH HHS</Agency>
            <Country>United States</Country>
          </Grant>
          <Grant>
            <GrantID>U01  CA111273</GrantID>
            <Agency>NCI NIH HHS</Agency>
            <Country>United States</Country>
          </Grant>
        </GrantList>
      </Article>
      <CommentsCorrectionsList>
        <CommentsCorrections RefType="Cites"><PMID Version="1">11111111</PMID></CommentsCorrections>
      </CommentsCorrectionsList>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation Status="PubMed-not-MEDLINE" Owner="NLM">
      <PMID Version="1">18753624</PMID>
      <Article><ArticleTitle>No grants</ArticleTitle></Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>
"""


def test_pubmed_grant_lists_are_read_and_nothing_else() -> None:
    found = parse_pubmed_grants(PUBMED_XML.encode())
    assert set(found) == {"18641041", "18753624"}  # a cited PMID is not a record
    listed = found["18641041"]
    assert listed.complete == "Y"
    assert listed.grants == (
        PubmedGrant("P50 GM076547", "GM", "NIGMS NIH HHS", "United States"),
        PubmedGrant("U01 CA111273", None, "NCI NIH HHS", "United States"),
    )
    empty = found["18753624"]
    assert (empty.complete, empty.grants) == (None, ())
    assert "stand-in abstract" not in repr(found)


def test_pubmed_grants_are_fetched_200_papers_at_a_time(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: xml_response(PUBMED_XML), tmp_path)
    pmids = [str(n) for n in range(450, 0, -1)]
    found = Ncbi(client, "mriffle@uw.edu").pubmed_grants([*pmids, "", pmids[0]])
    batches = [sent.params["id"].split(",") for sent in seen]
    assert [len(batch) for batch in batches] == [PUBMED_BATCH, PUBMED_BATCH, 50]
    assert batches[0][:3] == ["1", "2", "3"]  # numeric order
    for sent in seen:
        assert (sent.params["db"], sent.params["retmode"], sent.params["email"]) == (
            "pubmed",
            "xml",
            "mriffle@uw.edu",
        )
    assert set(client.usage) == {"ncbi"}
    assert set(found) == {"18641041", "18753624"}


def test_pubmed_xml_that_will_not_parse_is_malformed(tmp_path: Path) -> None:
    client, _ = client_for(lambda sent: xml_response("<PubmedArticleSet><unclosed>"), tmp_path)
    with pytest.raises(MalformedReplyError, match="PubMed XML") as raised:
        Ncbi(client, "mriffle@uw.edu").pubmed_grants(["1"])
    assert raised.value.status == 200  # a body that is there but will not parse: a changed shape
    with pytest.raises(MalformedReplyError) as empty:
        parse_pubmed_grants(b"  ", 200)
    assert empty.value.status is None  # no answer at all, which reads as an outage


def test_a_pubmed_record_without_a_pmid_is_skipped() -> None:
    xml = b"<PubmedArticleSet><PubmedArticle><MedlineCitation/></PubmedArticle></PubmedArticleSet>"
    assert parse_pubmed_grants(xml) == {}


# --- OpenAlex -------------------------------------------------------------------------------


def test_openalex_awards_are_asked_by_their_full_url(tmp_path: Path) -> None:
    client, seen = client_for(lambda sent: json_response({"results": [{"id": "x"}]}), tmp_path)
    ids = [f"G{n}" for n in range(1, 121)]
    oa = OpenAlex(client, "mriffle@uw.edu", "fake-key")
    awards = list(oa.awards_by_ids([*ids[:60], *(f"https://openalex.org/{g}" for g in ids[60:]), "G1", " "]))
    assert len(seen) == 3  # 50 a page
    assert len(awards) == 3
    first = seen[0]
    assert first.url == "https://api.openalex.org/awards"
    values = first.params["filter"].removeprefix("id:").split("|")
    assert len(values) == 50
    assert all(value.startswith("https://openalex.org/G") for value in values)  # the short form finds nothing
    assert first.params["select"] == AWARD_FIELDS
    assert first.params["per-page"] == "50"
    assert first.params["api_key"] == "fake-key"
    assert {"amount", "currency", "funder", "start_year", "provenance"} <= set(AWARD_FIELDS.split(","))
    assert client.budget.spent_usd == pytest.approx(3 * FILTER_PAGE_USD)


def test_openalex_funders_are_asked_with_the_openalex_filter(tmp_path: Path) -> None:
    client, seen = client_for(
        lambda sent: json_response({"results": [{"id": "https://openalex.org/F1"}]}), tmp_path
    )
    oa = OpenAlex(client, "mriffle@uw.edu")
    funders = list(oa.funders_by_ids(["https://openalex.org/F4320337354", "F4320337351"]))
    assert funders == [{"id": "https://openalex.org/F1"}]
    assert seen[0].url == "https://api.openalex.org/funders"
    # Funders have no `id:` filter (HTTP 400, measured); `openalex:` takes the short form.
    assert seen[0].params["filter"] == "openalex:F4320337351|F4320337354"
    assert client.budget.spent_usd == pytest.approx(FILTER_PAGE_USD)


# --- Crossref -------------------------------------------------------------------------------


def test_crossref_funders_are_asked_50_dois_at_a_time(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        dois = [value.removeprefix("doi:") for value in sent.params["filter"].split(",")]
        items = [{"DOI": doi.upper(), "funder": [{"name": "NIH", "award": [doi]}]} for doi in dois]
        return json_response({"message": {"items": items}})

    client, seen = client_for(handler, tmp_path)
    dois = [f"10.1000/X{n:03d}" for n in range(60)]
    found = Crossref(client, "mriffle@uw.edu").funders_by_dois(dois)
    assert len(seen) == 2
    assert [len(sent.params["filter"].split(",")) for sent in seen] == [FUNDER_BATCH, 10]
    assert seen[0].params["select"] == "DOI,funder"
    assert seen[0].params["mailto"] == "mriffle@uw.edu"
    assert seen[0].params["filter"].startswith("doi:10.1000/x000,doi:10.1000/x001,")
    assert set(found) == {doi.lower() for doi in dois}
    assert found["10.1000/x007"] == [{"name": "NIH", "award": ["10.1000/x007"]}]


def test_crossref_asks_a_doi_the_batch_missed_on_its_own(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        if "filter" in sent.params:
            return json_response({"message": {"items": [{"DOI": "10.1/a"}]}})  # no funder at all
        if sent.url.endswith("10.1/b,c"):
            return json_response({"message": {"DOI": "10.1/b,c", "funder": [{"name": "NSF"}]}})
        return json_response({"status": "failed"}, 404)

    client, seen = client_for(handler, tmp_path)
    found = Crossref(client, "mriffle@uw.edu").funders_by_dois(["10.1/A", "10.1/b,c", "10.1/missing"])
    # A comma would split the filter, so that DOI never goes in a batch.
    assert seen[0].params["filter"] == "doi:10.1/a,doi:10.1/missing"
    assert [sent.url for sent in seen[1:]] == [
        "https://api.crossref.org/works/10.1/b,c",
        "https://api.crossref.org/works/10.1/missing",
    ]
    assert found == {"10.1/a": [], "10.1/b,c": [{"name": "NSF"}]}  # Crossref's 404 leaves it out


def test_a_crossref_outage_during_the_fallback_is_not_an_answer(tmp_path: Path) -> None:
    def handler(sent: Sent) -> Response:
        return (
            json_response({"message": {"items": []}}) if "filter" in sent.params else json_response({}, 503)
        )

    client, _ = client_for(handler, tmp_path)
    with pytest.raises(HttpError):
        Crossref(client, "mriffle@uw.edu").funders_by_dois(["10.1/a"])
