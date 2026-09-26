"""Linking the versions of one work, and merging the works they were split across.

Phase 1 §8 gives four ways to decide that two records are versions of the same research, in
descending order of trust:

1. a Crossref `is-preprint-of` relation, which the publisher states outright;
2. the preprint server's own `published` field, which bioRxiv learns from the publisher;
3. a DOI appearing among an OpenAlex record's locations;
4. failing those, title similarity ≥ 0.85 with a matching first author and years within two.

Only the last can be wrong, so it is the last consulted, and each preprint takes at most one link.

Pure: records and link signals in, links and a merge plan out. The requests that produce those
signals belong to the pipeline, which knows about the network.
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from uwpr_pubs.match import TITLE_SIMILARITY, normalise_title, title_similarity
from uwpr_pubs.store.ids import normalise_doi
from uwpr_pubs.store.models import RecordId, VersionMethod, WorkId

YEAR_TOLERANCE = 2  # Phase 1 §8, wider than record matching because a paper can sit in review
# Preprint servers mint one DOI per revision: Research Square appends "/v2", ChemRxiv "-v2" (and
# ".v1" before 2021), Preprints.org and figshare ".v1". A relation may name a revision we do not
# hold, so the version is stripped as a second chance.
DOI_REVISION = re.compile(r"[/.-]v\d+$")


@dataclass(frozen=True)
class VersionRecord:
    """The little a record needs to expose for version linking."""

    record: RecordId
    work: WorkId
    kind: str
    doi: str | None
    title: str
    first_author: str
    year: int | None

    @property
    def is_preprint(self) -> bool:
        return self.kind == "preprint"


@dataclass(frozen=True, order=True)
class Link:
    """One record is a version of another. The preprint is the one that carries the link."""

    preprint: RecordId
    article: RecordId
    method: VersionMethod


@dataclass(frozen=True, order=True)
class Merge:
    """Two works turn out to be one; the lower ID survives (docs/02 §4)."""

    into: WorkId
    retired: WorkId


def _surname(name: str) -> str:
    """The last word of a normalised name, which is all the author check compares."""
    parts = normalise_title(name).split()
    return parts[-1] if parts else ""


def versionless(doi: str) -> str:
    """A preprint DOI without its revision number, e.g. `…-33v24-v2` → `…-33v24`, `….v1` → `…`."""
    return DOI_REVISION.sub("", normalise_doi(doi))


def index_by_doi(records: Iterable[VersionRecord]) -> dict[str, VersionRecord]:
    """DOI → record. A DOI belongs to one record, so later duplicates are ignored."""
    found: dict[str, VersionRecord] = {}
    for record in sorted(records, key=lambda r: r.record):
        if record.doi:
            found.setdefault(normalise_doi(record.doi), record)
    return found


def _lookup(by_doi: Mapping[str, VersionRecord], doi: str) -> VersionRecord | None:
    """The record for a DOI, trying the revision it names and then the work behind it."""
    exact = by_doi.get(normalise_doi(doi))
    if exact is not None:
        return exact
    stripped = versionless(doi)
    matches = [record for key, record in sorted(by_doi.items()) if versionless(key) == stripped]
    return matches[0] if len(matches) == 1 else None


def _pair(left: VersionRecord, right: VersionRecord, method: VersionMethod) -> Link | None:
    """A link needs exactly one preprint, and two records that are not already the same one."""
    if left.record == right.record or left.is_preprint == right.is_preprint:
        return None
    preprint, article = (left, right) if left.is_preprint else (right, left)
    return Link(preprint=preprint.record, article=article.record, method=method)


def links_from_published(
    records: Sequence[VersionRecord], published: Mapping[str, str], method: VersionMethod
) -> list[Link]:
    """`published` maps a preprint's DOI to the DOI of its journal version (signals 1 and 2)."""
    by_doi = index_by_doi(records)
    links: list[Link] = []
    for preprint_doi, article_doi in sorted(published.items()):
        preprint = _lookup(by_doi, preprint_doi)
        article = _lookup(by_doi, article_doi)
        if preprint is None or article is None:
            continue
        link = _pair(preprint, article, method)
        if link is not None:
            links.append(link)
    return links


def links_from_locations(
    records: Sequence[VersionRecord], locations: Mapping[RecordId, Sequence[str]]
) -> list[Link]:
    """Signal 3: a record's OpenAlex locations name the DOI of another record we hold.

    A DOI that matches nothing we know is ignored, which is what makes parsing DOIs out of
    location URLs safe: a mis-parsed one simply finds no record.
    """
    by_doi = index_by_doi(records)
    by_record = {record.record: record for record in records}
    links: list[Link] = []
    for record_id, dois in sorted(locations.items()):
        source = by_record.get(record_id)
        if source is None:
            continue
        for doi in sorted({normalise_doi(d) for d in dois}):
            other = by_doi.get(doi)
            if other is None:
                continue
            link = _pair(source, other, "openalex_locations")
            if link is not None:
                links.append(link)
    return links


def links_by_title_author(
    records: Sequence[VersionRecord],
    *,
    threshold: float = TITLE_SIMILARITY,
    tolerance: int = YEAR_TOLERANCE,
) -> list[Link]:
    """Signal 4, the only fallible one: same first author, near-identical title, close years.

    Articles are indexed by first-author surname first, so the expensive title comparison runs
    only on the handful of records that could possibly match.
    """
    by_surname: dict[str, list[VersionRecord]] = {}
    for record in sorted(records, key=lambda r: r.record):
        if record.is_preprint:
            continue
        surname = _surname(record.first_author)
        if surname:
            by_surname.setdefault(surname, []).append(record)

    links: list[Link] = []
    for preprint in sorted((r for r in records if r.is_preprint), key=lambda r: r.record):
        surname = _surname(preprint.first_author)
        best: tuple[float, VersionRecord] | None = None
        for article in by_surname.get(surname, []):
            if article.work == preprint.work:
                continue
            if preprint.year and article.year and abs(article.year - preprint.year) > tolerance:
                continue
            score = title_similarity(preprint.title, article.title)
            if score >= threshold and (best is None or score > best[0]):
                best = (score, article)
        if best is not None:
            links.append(Link(preprint=preprint.record, article=best[1].record, method="title_author"))
    return links


def resolve(
    records: Sequence[VersionRecord],
    *,
    published: Sequence[tuple[VersionMethod, Mapping[str, str]]] = (),
    locations: Mapping[RecordId, Sequence[str]] | None = None,
    title_fallback: bool = True,
) -> list[Link]:
    """Every link, best method first. A preprint keeps the first link found for it."""
    found: list[list[Link]] = [
        links_from_published(records, mapping, method) for method, mapping in published
    ]
    if locations:
        found.append(links_from_locations(records, locations))
    if title_fallback:
        found.append(links_by_title_author(records))

    chosen: dict[RecordId, Link] = {}
    for batch in found:
        for link in sorted(batch):
            chosen.setdefault(link.preprint, link)
    return sorted(chosen.values())


def merges(links: Sequence[Link], records: Mapping[RecordId, VersionRecord]) -> list[Merge]:
    """The works these links join, as `retired → survivor` pairs with the lower ID surviving.

    A chain of links can join more than two works, so the groups are built by union-find rather
    than pairwise: linking A→B and B→C must retire both B and C into A.
    """
    parent: dict[WorkId, WorkId] = {}

    def find(work: WorkId) -> WorkId:
        parent.setdefault(work, work)
        while parent[work] != work:
            parent[work] = parent[parent[work]]
            work = parent[work]
        return work

    for link in sorted(links):
        left = records.get(link.preprint)
        right = records.get(link.article)
        if left is None or right is None:
            continue
        low, high = sorted((find(left.work), find(right.work)))
        if low != high:
            parent[high] = low

    return sorted(Merge(into=find(work), retired=work) for work in parent if find(work) != work)
