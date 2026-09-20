"""Version linking and the merges it implies (Phase 1 §8, docs/03 §5 stage 6)."""

from uwpr_pubs.records import dois_in_locations
from uwpr_pubs.versions import (
    Link,
    Merge,
    VersionRecord,
    index_by_doi,
    links_by_title_author,
    links_from_locations,
    links_from_published,
    merges,
    resolve,
)

PREPRINT_DOI = "10.1101/2025.07.25.666826"
ARTICLE_DOI = "10.1021/acs.jproteome.5c00706"
TITLE = "Improvements to Casanovo, a Deep Learning De Novo Peptide Sequencer"


def preprint(
    *,
    record: str = "R-000002",
    work: str = "W-000002",
    doi: str = PREPRINT_DOI,
    title: str = TITLE,
    author: str = "Melih Yilmaz",
    year: int = 2025,
) -> VersionRecord:
    return VersionRecord(record, work, "preprint", doi, title, author, year)


def article(
    *,
    record: str = "R-000001",
    work: str = "W-000001",
    doi: str = ARTICLE_DOI,
    title: str = TITLE,
    author: str = "Melih Yilmaz",
    year: int = 2026,
) -> VersionRecord:
    return VersionRecord(record, work, "article", doi, title, author, year)


def test_a_crossref_relation_links_the_preprint_to_its_article() -> None:
    records = [preprint(), article()]
    links = links_from_published(records, {PREPRINT_DOI: ARTICLE_DOI}, "crossref_relation")
    assert links == [Link("R-000002", "R-000001", "crossref_relation")]


def test_the_published_doi_is_normalised_before_it_is_matched() -> None:
    """Crossref returns a resolver URL; the store keeps the bare, lower-cased DOI."""
    records = [preprint(), article()]
    stated = {f"https://doi.org/{PREPRINT_DOI}": f"https://doi.org/{ARTICLE_DOI.upper()}"}
    assert links_from_published(records, stated, "biorxiv_published") == [
        Link("R-000002", "R-000001", "biorxiv_published")
    ]


def test_a_relation_naming_another_revision_of_the_preprint_still_links_it() -> None:
    """ChemRxiv and Research Square mint a DOI per revision, and the article names one of them.

    The store holds `…-33v24`; the article's `has-preprint` names `…-33v24-v2`. Stripping the
    revision is a second chance, not the first, so an exact DOI always wins.
    """
    stored = preprint(doi="10.26434/chemrxiv-2024-33v24")
    records = [stored, article()]
    stated = {"10.26434/chemrxiv-2024-33v24-v2": ARTICLE_DOI}
    assert links_from_published(records, stated, "crossref_relation") == [
        Link("R-000002", "R-000001", "crossref_relation")
    ]


def test_an_ambiguous_revision_links_nothing() -> None:
    """Two records differing only by revision cannot say which the relation meant."""
    first = preprint(record="R-000002", work="W-000002", doi="10.26434/x-v1")
    second = preprint(record="R-000003", work="W-000003", doi="10.26434/x-v2")
    records = [first, second, article()]
    assert links_from_published(records, {"10.26434/x-v3": ARTICLE_DOI}, "crossref_relation") == []


def test_a_published_doi_we_do_not_hold_links_nothing() -> None:
    assert links_from_published([preprint()], {PREPRINT_DOI: ARTICLE_DOI}, "crossref_relation") == []


def test_two_preprints_are_not_versions_of_each_other() -> None:
    """A link needs exactly one preprint; two preprint DOIs are separate deposits."""
    other = preprint(record="R-000003", work="W-000003", doi="10.1101/other")
    records = [preprint(), other]
    assert links_from_published(records, {PREPRINT_DOI: "10.1101/other"}, "crossref_relation") == []


def test_openalex_locations_link_a_record_to_a_preprint_we_hold() -> None:
    links = links_from_locations([preprint(), article()], {"R-000001": [PREPRINT_DOI]})
    assert links == [Link("R-000002", "R-000001", "openalex_locations")]


def test_a_location_doi_we_do_not_hold_is_ignored() -> None:
    """Mis-parsed DOIs are harmless because only known records can be linked."""
    assert links_from_locations([preprint(), article()], {"R-000001": ["10.1/nonsense"]}) == []


def test_the_title_fallback_needs_the_author_the_year_and_the_title() -> None:
    records = [preprint(), article()]
    assert links_by_title_author(records) == [Link("R-000002", "R-000001", "title_author")]

    other_author = [preprint(author="Someone Else"), article()]
    assert links_by_title_author(other_author) == []

    distant_year = [preprint(year=2018), article()]
    assert links_by_title_author(distant_year) == []

    other_title = [preprint(title="An entirely different paper about something else"), article()]
    assert links_by_title_author(other_title) == []


def test_the_title_fallback_ignores_records_already_in_one_work() -> None:
    records = [preprint(work="W-000001"), article(work="W-000001")]
    assert links_by_title_author(records) == []


def test_a_stated_relation_wins_over_the_title_fallback() -> None:
    """Both signals fire here; the recorded method must be the one we trust (§8)."""
    decoy = article(record="R-000009", work="W-000009", doi="10.1/decoy", year=2025)
    records = [preprint(), article(), decoy]
    links = resolve(records, published=[("crossref_relation", {PREPRINT_DOI: "10.1/decoy"})])
    assert links == [Link("R-000002", "R-000009", "crossref_relation")]


def test_resolve_gives_each_preprint_at_most_one_link() -> None:
    records = [preprint(), article()]
    links = resolve(
        records,
        published=[("crossref_relation", {PREPRINT_DOI: ARTICLE_DOI})],
        locations={"R-000001": [PREPRINT_DOI]},
    )
    assert links == [Link("R-000002", "R-000001", "crossref_relation")]


def test_merging_keeps_the_lower_work_id() -> None:
    records = {r.record: r for r in (preprint(), article())}
    links = [Link("R-000002", "R-000001", "crossref_relation")]
    assert merges(links, records) == [Merge(into="W-000001", retired="W-000002")]


def test_a_chain_of_links_collapses_into_one_work() -> None:
    """Linking a preprint to two articles must retire both into the lowest ID, not just one."""
    first = preprint(record="R-000002", work="W-000002")
    second = article(record="R-000003", work="W-000003")
    third = article(record="R-000001", work="W-000001")
    records = {r.record: r for r in (first, second, third)}
    links = [
        Link("R-000002", "R-000003", "crossref_relation"),
        Link("R-000002", "R-000001", "openalex_locations"),
    ]
    assert merges(links, records) == [
        Merge(into="W-000001", retired="W-000002"),
        Merge(into="W-000001", retired="W-000003"),
    ]


def test_records_already_in_one_work_need_no_merge() -> None:
    records = {r.record: r for r in (preprint(work="W-000001"), article(work="W-000001"))}
    assert merges([Link("R-000002", "R-000001", "title_author")], records) == []


def test_index_by_doi_is_stable_when_two_records_share_a_doi() -> None:
    """Two records should never share a DOI, but if they do the choice must not wobble."""
    first = article(record="R-000005")
    second = article(record="R-000004")
    assert index_by_doi([first, second])[ARTICLE_DOI].record == "R-000004"
    assert index_by_doi([second, first])[ARTICLE_DOI].record == "R-000004"


def test_dois_are_read_out_of_openalex_location_urls() -> None:
    """The preprint location carries the DOI inside a URL, with a version and file suffix."""
    work = {
        "id": "https://openalex.org/W1",
        "ids": {"doi": f"https://doi.org/{ARTICLE_DOI}"},
        "locations": [
            {"landing_page_url": f"https://pubs.acs.org/doi/{ARTICLE_DOI}"},
            {"landing_page_url": "https://www.biorxiv.org/content/10.1101/2025.07.25.666826v2.full.pdf"},
            {"landing_page_url": "https://example.org/no-doi-here"},
        ],
    }
    assert dois_in_locations(work) == [PREPRINT_DOI]


def test_a_location_doi_field_is_used_when_openalex_gives_one() -> None:
    work = {"ids": {"doi": ARTICLE_DOI}, "locations": [{"doi": f"https://doi.org/{PREPRINT_DOI}"}]}
    assert dois_in_locations(work) == [PREPRINT_DOI]


def test_a_record_with_no_locations_points_nowhere() -> None:
    assert dois_in_locations({"ids": {"doi": ARTICLE_DOI}}) == []
