"""PRIDE / ProteomeXchange dataset descriptions (Phase 1 §5 channel J, §7 source 4).

Submitters often describe where the work was done in the dataset's own protocol text, even when
the paper does not. Channel J found one paper nothing else found (PXD011642 → PMID 32613749), so
it earns its place despite nominating almost nothing.

The response shape differs between the archive's API versions, so every field is read through a
tolerant accessor: the adapter takes the first key that is present rather than assuming one.
"""

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from uwpr_pubs.http import HttpClient, HttpError, Policy

BASE = "https://www.ebi.ac.uk/pride/ws/archive/v3"
PAGE_SIZE = 100
PROJECT_URL = "https://www.ebi.ac.uk/pride/archive/projects"

# Free text a submitter may have written the resource's name into.
TEXT_FIELDS = (
    "projectDescription",
    "description",
    "sampleProcessingProtocol",
    "dataProcessingProtocol",
)
REFERENCE_FIELDS = ("references", "publications", "projectReferences")


@dataclass(frozen=True)
class Dataset:
    accession: str
    title: str
    sentences: tuple[str, ...]
    pmids: tuple[str, ...]
    dois: tuple[str, ...]

    @property
    def url(self) -> str:
        return f"{PROJECT_URL}/{self.accession}"


def _first(payload: Mapping[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        if payload.get(key):
            return payload[key]
    return None


def _results(payload: Any) -> list[dict[str, Any]]:
    """v3 answers with a list; v2 wraps it in `_embedded`."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        embedded = payload.get("_embedded")
        if isinstance(embedded, dict):
            for value in embedded.values():
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        for key in ("projects", "compactprojects", "content"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _references(project: Mapping[str, Any]) -> tuple[tuple[str, ...], tuple[str, ...]]:
    pmids: list[str] = []
    dois: list[str] = []
    references = _first(project, REFERENCE_FIELDS) or []
    if not isinstance(references, list):
        return (), ()
    for reference in references:
        if not isinstance(reference, dict):
            continue
        pmid = _first(reference, ("pubmedId", "pubmedID", "pmid"))
        doi = _first(reference, ("doi", "DOI"))
        if pmid:
            pmids.append(str(pmid))
        if doi:
            dois.append(str(doi))
    return tuple(pmids), tuple(dois)


def dataset_from(project: Mapping[str, Any]) -> Dataset | None:
    accession = _first(project, ("accession", "projectAccession"))
    if not accession:
        return None
    texts = [str(project[field]) for field in TEXT_FIELDS if project.get(field)]
    pmids, dois = _references(project)
    return Dataset(
        accession=str(accession),
        title=str(_first(project, ("title", "projectTitle")) or ""),
        sentences=tuple(texts),
        pmids=pmids,
        dois=dois,
    )


class Pride:
    def __init__(self, client: HttpClient, contact: str) -> None:
        self.client = client
        self.contact = contact

    def search(self, keyword: str, page_size: int = PAGE_SIZE) -> Iterator[Dataset]:
        """Every dataset matching a keyword, paged until a page comes back short.

        A search hit already carries the protocol text and the references, so channel J costs one
        request per page rather than one per dataset.
        """
        page = 0
        while True:
            reply = self.client.get(
                f"{BASE}/search/projects",
                {"keyword": keyword, "pageSize": str(page_size), "page": str(page)},
                host="pride",
                policy=Policy.REFRESH,
            )
            projects = _results(reply.json())
            for project in projects:
                dataset = dataset_from(project)
                if dataset is not None:
                    yield dataset
            if len(projects) < page_size:
                return
            page += 1

    def project(self, accession: str) -> Dataset | None:
        """The full record: a search hit carries no protocol text."""
        if not accession:
            return None
        try:
            reply = self.client.get(f"{BASE}/projects/{accession}", {}, host="pride", policy=Policy.REFRESH)
        except HttpError:
            return None
        payload = reply.json()
        return dataset_from(payload) if isinstance(payload, dict) else None
