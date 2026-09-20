"""The source adapters: request shapes and response parsing, all offline."""

import json
from collections.abc import Callable, Mapping
from pathlib import Path

import pytest

from uwpr_pubs.cache import Cache
from uwpr_pubs.http import Budget, HttpClient, Mode, RateLimiter, Response
from uwpr_pubs.sources import ResultLimitError
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.ncbi import Ncbi
from uwpr_pubs.sources.openalex import ID_BATCH, WORK_FIELDS, OpenAlex
from uwpr_pubs.sources.uwpr_site import (
    UwprSite,
    entry_key,
    page_label,
    page_links,
    parse_page,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
Handler = Callable[[str, dict[str, str]], Response]


def client_for(handler: Handler, tmp_path: Path, mode: Mode = Mode.LIVE) -> tuple[HttpClient, list[str]]:
    seen: list[str] = []

    def transport(
        url: str, params: Mapping[str, str], headers: Mapping[str, str], timeout: float
    ) -> Response:
        seen.append(url)
        return handler(url, dict(params))

    client = HttpClient(
        contact="mriffle@uw.edu",
        user_agent="uwpr-pubs/test",
        mode=mode,
        cache=Cache(tmp_path / "cache"),
        budget=Budget(max_run_usd=0.5, min_remaining_usd=0.1),
        rate_limiter=RateLimiter({}),
        transport=transport,
        sleep=lambda _: None,
        now=lambda: "2026-09-21T00:00:00Z",
    )
    return client, seen


def json_response(payload: object) -> Response:
    return Response("u", 200, json.dumps(payload).encode(), {"content-type": "application/json"})


# --- the UWPR site ------------------------------------------------------------------------


def test_the_real_page_markup_parses() -> None:
    entries = parse_page((FIXTURES / "uwpr_publications_2023.html").read_text(encoding="utf-8"), "current")
    assert len(entries) == 3  # the navigation items are not publications
    first = entries[0]
    assert first.page == "2023"  # from the year heading, not the URL
    assert first.pmid == "38665238"
    assert first.title.startswith("An HIV-1 broadly neutralizing antibody")
    assert first.venue_text == "Npj Viruses."
    assert first.authors_text.startswith("Hodge EA, Chatterjee A")
    assert first.key == entry_key("2023", first.title)
    assert len({e.key for e in entries}) == 3


@pytest.mark.parametrize(
    ("heading", "expected"),
    [("2026", "2026"), (" 2025 ", "2025"), ("2021 and Previous Years", "older"), ("Publications", "older")],
)
def test_page_label_comes_from_the_heading(heading: str, expected: str) -> None:
    assert page_label(heading) == expected


def test_entry_keys_ignore_punctuation_and_case_but_not_the_page() -> None:
    assert entry_key("2023", "A Title: With Punctuation.") == entry_key("2023", "a title with punctuation")
    assert entry_key("2023", "A Title") != entry_key("2024", "A Title")


def test_page_links_finds_the_year_pages() -> None:
    index = """
      <a href="/publications/">Publications</a>
      <a href="/publications/2025/">2025</a>
      <a href="/publications/older/">Older</a>
      <a href="/collab/">Collaborate</a>
    """
    pattern = r"^(?:https://proteomicsresource\.washington\.edu)?/publications/(?:[0-9]{4}|older)/$"
    links = page_links(index, pattern, "https://proteomicsresource.washington.edu/publications/")
    assert links == [
        "https://proteomicsresource.washington.edu/publications/2025/",
        "https://proteomicsresource.washington.edu/publications/older/",
    ]


def test_uwpr_site_follows_the_index_to_every_page(tmp_path: Path) -> None:
    page = (FIXTURES / "uwpr_publications_2023.html").read_text(encoding="utf-8")
    index = '<a href="/publications/2023/">2023</a><a href="/publications/older/">Older</a>'

    def handler(url: str, params: dict[str, str]) -> Response:
        body = index if url.endswith("/publications/") else page
        return Response(url, 200, body.encode(), {"content-type": "text/html"})

    client, seen = client_for(handler, tmp_path)
    site = UwprSite(
        client,
        "https://proteomicsresource.washington.edu/publications/",
        r"^(?:https://proteomicsresource\.washington\.edu)?/publications/(?:[0-9]{4}|older)/$",
    )
    entries = site.entries()
    assert len(seen) == 3  # the index plus the two pages it links to
    assert len(entries) == 6
    assert {e.page for _, e in entries} == {"2023"}


# --- OpenAlex -----------------------------------------------------------------------------


def test_openalex_sends_the_contact_and_key_and_omits_abstracts(tmp_path: Path) -> None:
    captured: list[dict[str, str]] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        captured.append(params)
        return json_response({"results": [], "meta": {"next_cursor": None}})

    client, _ = client_for(handler, tmp_path)
    list(OpenAlex(client, "mriffle@uw.edu", "fake-key").works("awards.funder_award_id:UWPR95794"))
    assert captured[0]["mailto"] == "mriffle@uw.edu"
    assert captured[0]["api_key"] == "fake-key"
    assert "abstract_inverted_index" not in WORK_FIELDS
    assert "awards" in WORK_FIELDS and "locations" in WORK_FIELDS


def test_openalex_pages_through_a_cursor(tmp_path: Path) -> None:
    pages = [
        {"results": [{"id": "W1"}], "meta": {"next_cursor": "second"}},
        {"results": [{"id": "W2"}], "meta": {"next_cursor": None}},
    ]
    cursors: list[str] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        cursors.append(params["cursor"])
        return json_response(pages[len(cursors) - 1])

    client, _ = client_for(handler, tmp_path)
    works = list(OpenAlex(client, "c@x.y").works("filter:x"))
    assert [w["id"] for w in works] == ["W1", "W2"]
    assert cursors == ["*", "second"]
    assert client.budget.spent_usd == pytest.approx(0.0002)  # two filter pages


def test_openalex_batches_id_lookups(tmp_path: Path) -> None:
    filters: list[str] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        filters.append(params["filter"])
        return json_response({"results": [], "meta": {"next_cursor": None}})

    client, _ = client_for(handler, tmp_path)
    ids = [f"W{n}" for n in range(ID_BATCH + 5)]
    list(OpenAlex(client, "c@x.y").works_by_ids(ids))
    assert len(filters) == 2
    assert filters[0].startswith("openalex_id:W0|W1|")
    assert filters[1] == "openalex_id:" + "|".join(ids[ID_BATCH:])


def test_openalex_orcid_check_asks_for_author_ids(tmp_path: Path) -> None:
    def handler(url: str, params: dict[str, str]) -> Response:
        assert url.endswith("/authors")
        assert params["filter"] == "orcid:0000-0001-6352-6737"
        return json_response({"results": [{"id": "A5011565192"}], "meta": {"next_cursor": None}})

    client, _ = client_for(handler, tmp_path)
    found = list(OpenAlex(client, "c@x.y").authors_by_orcid(["0000-0001-6352-6737"]))
    assert [a["id"] for a in found] == ["A5011565192"]


# --- NCBI ---------------------------------------------------------------------------------


def test_id_converter_sends_pmids_and_dois_in_separate_typed_requests(tmp_path: Path) -> None:
    requests: list[dict[str, str]] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        requests.append(params)
        return json_response({"records": [{"pmid": "1", "pmcid": "PMC1"}]})

    client, _ = client_for(handler, tmp_path)
    ncbi = Ncbi(client, "mriffle@uw.edu")
    list(ncbi.convert(["1", "2"], "pmid"))
    list(ncbi.convert(["10.1/a"], "doi"))
    assert [r["idtype"] for r in requests] == ["pmid", "doi"]
    assert requests[0]["ids"] == "1,2"
    assert all(r["tool"] == "uwpr-pubs" and r["email"] == "mriffle@uw.edu" for r in requests)


def test_pmc_full_text_is_fetched_once_and_then_cached(tmp_path: Path) -> None:
    calls: list[str] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        calls.append(params["id"])
        return Response(url, 200, b"<article>...</article>", {"content-type": "application/xml"})

    client, _ = client_for(handler, tmp_path)
    ncbi = Ncbi(client, "c@x.y")
    assert ncbi.pmc_xml("PMC3073872") == b"<article>...</article>"
    ncbi.pmc_xml("PMC3073872")
    assert calls == ["3073872"]  # immutable: fetched once


def test_unfetchable_full_text_is_none_not_an_error(tmp_path: Path) -> None:
    client, _ = client_for(lambda url, params: Response(url, 404, b"", {}), tmp_path)
    assert Ncbi(client, "c@x.y").pmc_xml("PMC999") is None


# --- Crossref -----------------------------------------------------------------------------


def test_crossref_award_numbers_and_preprint_relation() -> None:
    work = {
        "funder": [
            {"name": "NIH", "award": ["P30 DK017047"]},
            {"name": "UW", "award": ["UWPR95794", "OTHER"]},
        ],
        "relation": {"is-preprint-of": [{"id": "10.1021/acs.jproteome.5c00706"}]},
    }
    assert Crossref.award_numbers(work) == ["P30 DK017047", "UWPR95794", "OTHER"]
    assert Crossref.preprint_of(work) == "10.1021/acs.jproteome.5c00706"
    assert Crossref.award_numbers({}) == []
    assert Crossref.preprint_of({}) is None


def test_crossref_states_the_relation_from_the_article_side_too() -> None:
    """Most publishers declare `has-preprint` rather than the preprint declaring the article."""
    article = {"relation": {"has-preprint": [{"id": "10.1101/2024.04.09.588743"}], "has-review": []}}
    assert Crossref.has_preprint(article) == ["10.1101/2024.04.09.588743"]
    assert Crossref.has_preprint({}) == []
    assert Crossref.has_preprint({"relation": {"is-preprint-of": [{"id": "10.1/x"}]}}) == []


def test_crossref_pages_with_a_cursor(tmp_path: Path) -> None:
    pages = [
        {"message": {"items": [{"DOI": "10.1/a"}], "next-cursor": "next"}},
        {"message": {"items": [], "next-cursor": "next"}},
    ]
    seen: list[str] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        seen.append(params["cursor"])
        return json_response(pages[len(seen) - 1])

    client, _ = client_for(handler, tmp_path)
    items = list(Crossref(client, "c@x.y").by_filter("award.number:UWPR95794"))
    assert [i["DOI"] for i in items] == ["10.1/a"]
    assert seen == ["*", "next"]


# --- Europe PMC ---------------------------------------------------------------------------


def test_europepmc_search_stops_at_the_last_cursor(tmp_path: Path) -> None:
    pages = [
        {"resultList": {"result": [{"id": "1"}]}, "nextCursorMark": "b"},
        {"resultList": {"result": []}, "nextCursorMark": "b"},
    ]
    seen: list[str] = []

    def handler(url: str, params: dict[str, str]) -> Response:
        seen.append(params["cursorMark"])
        return json_response(pages[len(seen) - 1])

    client, _ = client_for(handler, tmp_path)
    results = list(EuropePmc(client, "c@x.y").search('"UWPR95794"'))
    assert [r["id"] for r in results] == ["1"]
    assert seen == ["*", "b"]


def test_europepmc_full_text_returns_none_for_non_open_access(tmp_path: Path) -> None:
    """A 500 here is normal for anything not open access (Phase 1 §7)."""
    client, _ = client_for(lambda url, params: Response(url, 500, b"", {}), tmp_path)
    assert EuropePmc(client, "c@x.y").full_text_xml("PMC1") is None


# --- max_results is enforced from the first page (docs/03 §10.3) ---------------------------


def test_an_over_broad_query_stops_at_the_first_page(tmp_path: Path) -> None:
    """D3's `"Van Haller"` full-text search matches 13,608 works.

    Paging through them to discover that costs $0.068 in search pages, for nominations the
    channel then throws away. The API reports the total on page one, so that is where it stops.
    """
    page = {"meta": {"count": 13608, "next_cursor": "next"}, "results": [{"id": "W1"}]}
    client, seen = client_for(lambda url, params: json_response(page), tmp_path)

    with pytest.raises(ResultLimitError) as raised:
        list(OpenAlex(client, "mriffle@uw.edu").works("fulltext.search:x", max_results=3000))

    assert raised.value.total == 13608
    assert len(seen) == 1


def test_a_query_within_its_limit_pages_normally(tmp_path: Path) -> None:
    page = {"meta": {"count": 2, "next_cursor": None}, "results": [{"id": "W1"}, {"id": "W2"}]}
    client, _ = client_for(lambda url, params: json_response(page), tmp_path)

    found = list(OpenAlex(client, "mriffle@uw.edu").works("awards.funder_award_id:X", max_results=3000))
    assert [w["id"] for w in found] == ["W1", "W2"]


def test_europe_pmc_reports_its_own_total(tmp_path: Path) -> None:
    page = {"hitCount": 99999, "resultList": {"result": [{"pmid": "1"}]}, "nextCursorMark": "n"}
    client, seen = client_for(lambda url, params: json_response(page), tmp_path)

    with pytest.raises(ResultLimitError):
        list(EuropePmc(client, "mriffle@uw.edu").search("UWPR*", max_results=3000))
    assert len(seen) == 1
