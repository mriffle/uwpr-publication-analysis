"""The funding sources' smoke checks, offline (docs/09 §13.2, F16).

Each check is run against a fake that answers in the shape its source answered on 2026-09-26,
trimmed to what the check reads. Then one thing at a time is broken: a 503, which is an outage, or
a changed shape, which is a problem. Neither may stop the week. Funding must never block the
publication update, so a funding source is classified like every other and then ignored by
`blocked`.
"""

import json
from collections.abc import Callable, Mapping
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from uwpr_pubs import cli, smoke
from uwpr_pubs.cache import Cache
from uwpr_pubs.config import load_config
from uwpr_pubs.http import Budget, HttpClient, Mode, RateLimiter, Response
from uwpr_pubs.smoke import Check, Outcome, blocked, funding_checks, run_smoke, verdict

# The rows RePORTER answered for P41GM103533, parent rows only: FY, project number, amount.
P41_ROWS = [
    (2012, "8P41GM103533-17", 2_078_690),
    (2012, "3P41GM103533-17S1", 354_061),
    (2013, "5P41GM103533-18", 2_373_007),
    (2014, "5P41GM103533-19", 2_217_058),
    (2015, "5P41GM103533-20", 1_872_434),
    (2017, "2P41GM103533-21", 2_330_696),
    (2016, "3P41GM103533-20S1", 936_446),
    (2017, "3P41GM103533-20S2", 470_903),
    (2018, "5P41GM103533-22", 1_847_528),
    (2019, "5P41GM103533-23", 1_867_528),
    (2018, "3P41GM103533-22S1", 629_700),
    (2020, "5P41GM103533-24", 1_870_727),
    (2021, "5P41GM103533-25", 1_850_727),
]

PUBMED_XML = """<?xml version="1.0" ?>
<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">19070509</PMID><Article>
<GrantList CompleteYN="Y">
<Grant><GrantID>S10 RR017262</GrantID><Acronym>RR</Acronym><Agency>NCRR NIH HHS</Agency>
<Country>United States</Country></Grant>
<Grant><GrantID>T32 GM007750</GrantID><Acronym>GM</Acronym><Agency>NIGMS NIH HHS</Agency>
<Country>United States</Country></Grant>
</GrantList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>"""

CROSSREF_ITEMS = [
    {
        "DOI": "10.1002/pmic.200900216",
        "funder": [{"name": "University of Washington's Proteomics Resource", "award": ["UWPR95794"]}],
    },
    {
        "DOI": "10.1002/pmic.201000616",
        "funder": [
            {"name": "University of Washington's Proteomics Resource", "award": ["UWPR95794"]},
            {"name": "National Institutes of Health", "award": ["R01 GM080148"]},
        ],
    },
]


def reply(payload: object, status: int = 200) -> Response:
    return Response("u", status, json.dumps(payload).encode(), {"content-type": "application/json"})


def p41_row(fiscal_year: int, number: str, amount: int) -> dict[str, Any]:
    return {
        "appl_id": 10_000_000 + P41_ROWS.index((fiscal_year, number, amount)),
        "core_project_num": "P41GM103533",
        "project_num": number,
        "fiscal_year": fiscal_year,
        "award_amount": amount,
        "subproject_id": None,
    }


def recorded(url: str, params: Mapping[str, str], body: Any) -> Response:  # noqa: PLR0911 - one per source
    """Each funding source's answer, as measured on 2026-09-26."""
    if url.endswith("/projects/search"):
        return reply({"meta": {"total": 13}, "results": [p41_row(*row) for row in P41_ROWS]})
    if url.endswith("/publications/search"):
        links = [
            {"coreproject": "S10RR017262", "pmid": 19070509, "applid": 6500621},
            {"coreproject": "T32GM007750", "pmid": 19070509, "applid": 10615629},
        ]
        return reply({"meta": {"total": 2}, "results": links})
    if "api.nsf.gov" in url:
        award = {
            "id": "1908587",
            "agency": "NSF",
            "fundsObligatedAmt": "900000",
            "estimatedTotalAmt": "900000",
        }
        return reply({"response": {"award": [award]}})
    if url.endswith("/spending_by_award/"):
        row = {
            "Award ID": "NNX14AJ87G",
            "Award Amount": 796089.19,
            "generated_internal_id": "ASST_NON_NNX14AJ87G_080",
        }
        return reply({"results": [row], "page_metadata": {"page": 1, "hasNext": False}})
    if "/api/v2/awards/" in url:
        return reply({"fain": "NNX14AJ87G", "type": "04", "total_obligation": 796089.19})
    if "eutils.ncbi.nlm.nih.gov" in url:
        return Response(url, 200, PUBMED_XML.encode(), {"content-type": "text/xml"})
    if url.endswith("/awards"):
        entity = {"id": "https://openalex.org/G3111500291", "funder_award_id": "1908587", "amount": 900000.0}
        return reply({"meta": {"count": 1}, "results": [{**entity, "currency": "USD"}]})
    if url.startswith("https://api.crossref.org/works/"):
        doi = url.removeprefix("https://api.crossref.org/works/")
        return reply({"message": next(item for item in CROSSREF_ITEMS if item["DOI"] == doi)})
    if url == "https://api.crossref.org/works":
        return reply({"status": "ok", "message": {"items": CROSSREF_ITEMS}})
    raise AssertionError(f"not a funding source: {url}")


Answer = Callable[[str, Mapping[str, str], Any], Response]


def client_for(answer: Answer, tmp_path: Path, asked: list[str] | None = None) -> HttpClient:
    def transport(
        url: str,
        params: Mapping[str, str],
        headers: Mapping[str, str],
        timeout: float,
        *,
        method: str = "GET",
        body: bytes | None = None,
    ) -> Response:
        if asked is not None:
            asked.append(url)
        return answer(url, params, None if body is None else json.loads(body))

    return HttpClient(
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


def checks_with(answer: Answer, tmp_path: Path) -> dict[str, Check]:
    return {
        check.name: check
        for check in funding_checks(client_for(answer, tmp_path), "mriffle@uw.edu", None, None)
    }


def breaking(
    matches: Callable[[str], bool], broken: Callable[[str, Mapping[str, str], Any], Response]
) -> Answer:
    """The recorded answers, with one source's replaced."""

    def answer(url: str, params: Mapping[str, str], body: Any) -> Response:
        return broken(url, params, body) if matches(url) else recorded(url, params, body)

    return answer


# --- the known answers -----------------------------------------------------------------------


def test_every_funding_source_passes_on_the_answers_it_gave_when_measured(tmp_path: Path) -> None:
    asked: list[str] = []
    checks = funding_checks(client_for(recorded, tmp_path, asked), "mriffle@uw.edu", None, None)

    assert [check.name for check in checks] == [
        "nih reporter projects",
        "nih reporter publications",
        "nsf award api",
        "usaspending award",
        "pubmed grant list",
        "openalex award amount",
        "crossref funder batch",
    ]
    assert all(check.outcome is Outcome.OK for check in checks), [check.line() for check in checks]
    assert not any(check.blocks for check in checks)
    assert checks[0].detail.startswith(
        "13 rows for P41GM103533 (FY2012-2021), 13 with an award_amount ($20,699,505), none a sub-project;"
    )
    assert verdict(checks) == "VERDICT  PROCEED: all 7 checks passed."


def test_the_checks_cost_one_or_two_requests_a_source(tmp_path: Path) -> None:
    """Smoke is meant to be cheap, and RePORTER is asked to be spared (docs/09 §5.1)."""
    asked: list[str] = []
    funding_checks(client_for(recorded, tmp_path, asked), "mriffle@uw.edu", None, None)
    hosts = [url.split("/")[2] for url in asked]
    assert len(asked) == 8
    assert {host: hosts.count(host) for host in set(hosts)} == {
        "api.reporter.nih.gov": 2,
        "api.nsf.gov": 1,
        "api.usaspending.gov": 2,
        "eutils.ncbi.nlm.nih.gov": 1,
        "api.openalex.org": 1,
        "api.crossref.org": 1,
    }


# --- an outage: DOWN, and the week goes ahead -------------------------------------------------

CHECKS_BY_HOST = {
    "api.reporter.nih.gov": {"nih reporter projects", "nih reporter publications"},
    "api.nsf.gov": {"nsf award api"},
    "api.usaspending.gov": {"usaspending award"},
    "eutils.ncbi.nlm.nih.gov": {"pubmed grant list"},
    "api.openalex.org": {"openalex award amount"},
    "api.crossref.org": {"crossref funder batch"},
}


@pytest.mark.parametrize("host", sorted(CHECKS_BY_HOST))
def test_a_funding_source_answering_503_is_down_and_does_not_block(host: str, tmp_path: Path) -> None:
    checks = checks_with(breaking(lambda url: host in url, lambda *_: reply({}, 503)), tmp_path)

    for name, check in checks.items():
        expected = Outcome.OUTAGE if name in CHECKS_BY_HOST[host] else Outcome.OK
        assert check.outcome is expected, check.line()
    assert checks[min(CHECKS_BY_HOST[host])].line().startswith("DOWN  ")
    assert not blocked(list(checks.values()))
    assert verdict(list(checks.values())).startswith("VERDICT  PROCEED: funding sources: ")


# --- a changed shape: FAIL, and the week still goes ahead -------------------------------------


def reporter_rows(rows: list[Any]) -> Answer:
    return breaking(
        lambda url: url.endswith("/projects/search"),
        lambda *_: reply({"meta": {"total": len(rows)}, "results": rows}),
    )


def json_at(fragment: str, payload: object) -> Answer:
    return breaking(lambda url: fragment in url, lambda *_: reply(payload))


P41 = [p41_row(*row) for row in P41_ROWS]
CHANGED_SHAPES: dict[str, tuple[str, Answer]] = {
    "reporter drops its total": ("nih reporter projects", json_at("/projects/search", {"results": P41})),
    "reporter returns a sub-project": (
        "nih reporter projects",
        reporter_rows([*P41, {**P41[0], "subproject_id": "5001", "project_num": "8P41GM103533-17-5001"}]),
    ),
    "reporter renames the amount": (
        "nih reporter projects",
        reporter_rows([{**row, "award_amount": None, "total_cost": row["award_amount"]} for row in P41]),
    ),
    "reporter stops linking the paper": (
        "nih reporter publications",
        json_at("/publications/search", {"meta": {"total": 0}, "results": []}),
    ),
    "nsf drops the obligated amount": (
        "nsf award api",
        json_at("api.nsf.gov", {"response": {"award": [{"id": "1908587", "estimatedTotalAmt": "900000"}]}}),
    ),
    "nsf no longer knows the award": ("nsf award api", json_at("api.nsf.gov", {"response": {"award": []}})),
    "usaspending drops total_obligation": (
        "usaspending award",
        json_at("/api/v2/awards/", {"fain": "NNX14AJ87G", "total_funding": 796089.19}),
    ),
    "usaspending's amount means something else": (
        "usaspending award",
        json_at("/api/v2/awards/", {"fain": "NNX14AJ87G", "total_obligation": 1_592_178.38}),
    ),
    "pubmed answers html": (
        "pubmed grant list",
        breaking(lambda url: "eutils" in url, lambda *_: Response("u", 200, b"<!doctype html><p>", {})),
    ),
    "openalex drops the amount": (
        "openalex award amount",
        json_at("/awards", {"meta": {"count": 1}, "results": [{"id": "https://openalex.org/G3111500291"}]}),
    ),
    "openalex refuses the field list": (
        "openalex award amount",
        breaking(lambda url: url.endswith("/awards"), lambda *_: reply({"error": "Invalid select"}, 400)),
    ),
    # The adapter then asks the other DOI alone, and gets its funders: only the count shows it.
    "crossref's batch stops ORing its DOIs": (
        "crossref funder batch",
        breaking(
            lambda url: url == "https://api.crossref.org/works",
            lambda *_: reply({"message": {"items": CROSSREF_ITEMS[:1]}}),
        ),
    ),
    "an answer nobody foresaw": ("nih reporter projects", reporter_rows(["P41GM103533"])),
}


@pytest.mark.parametrize("case", sorted(CHANGED_SHAPES))
def test_a_funding_source_in_a_changed_shape_fails_and_does_not_block(case: str, tmp_path: Path) -> None:
    name, answer = CHANGED_SHAPES[case]
    checks = checks_with(answer, tmp_path)

    assert checks[name].outcome is Outcome.PROBLEM, checks[name].line()
    assert checks[name].line().startswith(f"FAIL  {name}: ")
    assert not checks[name].blocks
    assert not blocked(list(checks.values()))
    assert "the publication update proceeds" in verdict(list(checks.values()))


def test_a_refused_request_is_a_problem_like_any_other_4xx(tmp_path: Path) -> None:
    """RePORTER answering 403 is the IP block docs/09 §13.7 fears. It needs a person, not the week."""
    checks = checks_with(breaking(lambda url: "reporter" in url, lambda *_: reply({}, 403)), tmp_path)
    assert checks["nih reporter projects"].outcome is Outcome.PROBLEM
    assert "HTTP 403" in checks["nih reporter projects"].detail
    assert not blocked(list(checks.values()))


# --- the verdict and the exit code -----------------------------------------------------------


def funding(outcome: Outcome, name: str = "nsf award api") -> Check:
    return Check(name, outcome, "d", blocks=False)


def test_only_a_publication_source_can_block() -> None:
    assert not blocked([funding(Outcome.PROBLEM), funding(Outcome.OUTAGE, "usaspending award")])
    assert blocked([funding(Outcome.OK), Check("official list", Outcome.PROBLEM, "d")])


def test_the_verdict_names_failing_funding_sources_and_proceeds() -> None:
    checks = [
        Check("official list", Outcome.OK, "d"),
        funding(Outcome.PROBLEM),
        funding(Outcome.OUTAGE, "usaspending award"),
    ]
    assert verdict(checks) == (
        "VERDICT  PROCEED: funding sources: nsf award api (FAIL), usaspending award (DOWN) — the funding"
        " stage will degrade; the publication update proceeds."
    )


def test_the_verdict_keeps_funding_apart_from_a_publication_source_that_is_down() -> None:
    line = verdict([Check("europe pmc search", Outcome.OUTAGE, "d"), funding(Outcome.PROBLEM)])
    assert line.startswith("VERDICT  PROCEED: 1 source is down (europe pmc search);")
    assert line.endswith(" Funding sources: nsf award api (FAIL) — the funding stage will degrade.")


def test_the_verdict_still_blocks_on_a_publication_source_and_says_funding_would_not_have() -> None:
    line = verdict([Check("ncbi id converter", Outcome.PROBLEM, "d"), funding(Outcome.PROBLEM)])
    assert line.startswith("VERDICT  BLOCKED: 1 check needs a person (ncbi id converter);")
    assert line.endswith(
        " Funding sources failed as well (nsf award api (FAIL)), which never blocks the run."
    )


def test_a_passing_funding_source_is_counted_like_any_check() -> None:
    assert verdict([Check("official list", Outcome.OK, "d"), funding(Outcome.OK)]) == (
        "VERDICT  PROCEED: all 2 checks passed."
    )


def test_funding_failures_alone_exit_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The workflow reads the exit code, so this is what keeps the week going (docs/09 F16)."""
    client = SimpleNamespace(budget=SimpleNamespace(spent_usd=0.002), usage={"x": SimpleNamespace(calls=16)})
    checks = [Check("official list", Outcome.OK, "306 entries"), funding(Outcome.PROBLEM)]
    monkeypatch.setattr(cli, "load_config", lambda *a, **k: object())
    monkeypatch.setattr(cli, "api_keys", lambda: (None, None))
    monkeypatch.setattr(cli, "build_client", lambda *a, **k: client)
    monkeypatch.setattr(cli, "run_smoke", lambda *a, **k: checks)

    assert cli.main(["smoke"]) == 0
    out = capsys.readouterr().out
    assert "PASS  official list: 306 entries\n\nFunding sources, which never block the run" in out
    assert "FAIL  nsf award api: d" in out
    assert "VERDICT  PROCEED: funding sources: nsf award api (FAIL)" in out


def test_run_smoke_asks_the_funding_sources_last(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """With every publication source unreachable, the funding checks still run, and still pass."""

    def answer(url: str, params: Mapping[str, str], body: Any) -> Response:
        if (
            any(host in url for host in ("reporter", "nsf", "usaspending"))
            or url.endswith("/awards")
            or params.get("db") == "pubmed"
            or params.get("filter", "").startswith("doi:")
        ):
            return recorded(url, params, body)
        raise ConnectionError("unreachable in this test")

    monkeypatch.setattr(smoke, "api_keys", lambda: (None, None))
    checks = run_smoke(load_config(), client_for(answer, tmp_path))

    assert [check.blocks for check in checks] == [True] * 8 + [False] * 7
    assert all(check.outcome is Outcome.OK for check in checks[8:]), [check.line() for check in checks[8:]]
