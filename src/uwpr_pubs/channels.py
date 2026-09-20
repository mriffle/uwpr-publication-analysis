"""Running the discovery channels (Phase 1 §5, docs/03 §5 stage 2).

Channels only nominate. A channel that fails degrades the run and its nominations are simply
missing this time; nothing is ever removed because a channel went quiet (§9).

Stage 2 also keeps two things the rules need later (§6.1): the DOIs each R6 phrase query matched,
and the PRIDE datasets channel J found, whose descriptions R3d reads.
"""

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from uwpr_pubs.config import Config
from uwpr_pubs.http import HttpError
from uwpr_pubs.records import ids_from_openalex
from uwpr_pubs.rules.r6 import R6Rules
from uwpr_pubs.rules.staff import StaffMember
from uwpr_pubs.sources import ResultLimitError
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.sources.pride import Dataset, Pride
from uwpr_pubs.store.ids import normalise_doi
from uwpr_pubs.store.models import Channel, Ids

# The channels M2 ran: the official list is stage 1, and the rest needed text (M3).
IDENTIFIER_CHANNELS = ("B1", "B2", "C1", "C2")
ALL_CHANNELS = ("B1", "B2", "C1", "C2", "D1", "D2", "D3", "E", "F", "G", "J")
FULLTEXT_SEARCH = "fulltext.search:"


@dataclass(frozen=True)
class Nomination:
    channel: Channel
    ids: Ids
    title: str | None
    year: int | None
    source: str
    payload: Mapping[str, Any] = field(default_factory=dict)


@dataclass
class ChannelResult:
    channel: str
    queries: int = 0
    nominated: int = 0
    errors: list[str] = field(default_factory=list)
    nominations: list[Nomination] = field(default_factory=list)


@dataclass
class DiscoveryResult:
    """What stage 2 hands on: nominations, plus the evidence inputs that need no text."""

    channels: list[ChannelResult] = field(default_factory=list)
    phrase_hits: dict[str, set[str]] = field(default_factory=dict)  # R6 phrase -> DOIs
    datasets: list[Dataset] = field(default_factory=list)

    @property
    def nominations(self) -> list[Nomination]:
        return [n for result in self.channels for n in result.nominations]


def _openalex_nomination(work: Mapping[str, Any], channel: Channel) -> Nomination:
    return Nomination(
        channel=channel,
        ids=ids_from_openalex(work),
        title=work.get("display_name"),
        year=work.get("publication_year"),
        source="openalex",
        payload=work,
    )


def _crossref_nomination(item: Mapping[str, Any], channel: Channel) -> Nomination:
    doi = item.get("DOI")
    titles = item.get("title") or []
    parts = ((item.get("issued") or {}).get("date-parts") or [[None]])[0]
    return Nomination(
        channel=channel,
        ids={"doi": normalise_doi(str(doi)) if doi else None},
        title=str(titles[0]) if titles else None,
        year=int(parts[0]) if parts and parts[0] else None,
        source="crossref",
        payload=item,
    )


def _europepmc_nomination(result: Mapping[str, Any], channel: Channel) -> Nomination:
    doi = result.get("doi")
    pmid = result.get("pmid")
    pmcid = result.get("pmcid")
    year = result.get("pubYear")
    return Nomination(
        channel=channel,
        ids={
            "doi": normalise_doi(str(doi)) if doi else None,
            "pmid": str(pmid) if pmid else None,
            "pmcid": str(pmcid) if pmcid else None,
        },
        title=result.get("title"),
        year=int(year) if year else None,
        source="europepmc",
        payload=result,
    )


def _dataset_nominations(dataset: Dataset, channel: Channel) -> Iterator[Nomination]:
    """A dataset nominates the publications it names (Phase 1 §5 channel J)."""
    for pmid in dataset.pmids:
        yield Nomination(channel=channel, ids={"pmid": pmid}, title=None, year=None, source="pride")
    for doi in dataset.dois:
        yield Nomination(
            channel=channel, ids={"doi": normalise_doi(doi)}, title=None, year=None, source="pride"
        )


def staff_queries(staff: Sequence[StaffMember], window_start: int) -> list[str]:
    """Channel G: each staff member's verified OpenAlex IDs, bounded by their tenure (§5.1).

    Without the bound, Hoopmann's earlier work at the Institute for Systems Biology would be
    nominated as though it were UWPR's.
    """
    queries = []
    for member in staff:
        if not member.openalex:
            continue
        ids = "|".join(member.openalex)
        start = max(window_start, member.start)
        parts = [f"author.id:{ids}", f"from_publication_date:{start}-01-01"]
        if member.end is not None:
            parts.append(f"to_publication_date:{member.end}-12-31")
        queries.append(",".join(parts))
    return queries


class ChannelRunner:
    def __init__(  # noqa: PLR0913 - one adapter per source, and the config that drives them
        self,
        config: Config,
        openalex: OpenAlex,
        crossref: Crossref,
        europepmc: EuropePmc,
        *,
        pride: Pride | None = None,
        staff: Sequence[StaffMember] = (),
        r6: R6Rules | None = None,
    ) -> None:
        self.config = config
        self.openalex = openalex
        self.crossref = crossref
        self.europepmc = europepmc
        self.pride = pride
        self.staff = staff
        self.r6 = r6
        self.result = DiscoveryResult()

    def _r6_phrase(self, query: str) -> str | None:
        """The R6 phrase a full-text query stands for, if it is one of the three (§6.5)."""
        if self.r6 is None or not query.startswith(FULLTEXT_SEARCH):
            return None
        phrase = query.removeprefix(FULLTEXT_SEARCH)
        return phrase if phrase in self.r6.include_phrases else None

    def _queries(self, definition: Mapping[str, Any]) -> list[str]:
        queries = [str(query) for query in definition["queries"]]
        if definition.get("queries_from_staff"):
            queries += staff_queries(self.staff, self.config.window_start)
        return queries

    def _openalex_results(self, query: str, channel: Channel, limit: int | None) -> list[Nomination]:
        phrase = self._r6_phrase(query)
        found = []
        for work in self.openalex.works(query, max_results=limit):
            nomination = _openalex_nomination(work, channel)
            found.append(nomination)
            doi = nomination.ids.get("doi")
            if phrase and doi:
                self.result.phrase_hits.setdefault(phrase, set()).add(str(doi))
        if phrase:
            self.result.phrase_hits.setdefault(phrase, set())
        return found

    def _results(self, source: str, query: str, channel: Channel, limit: int | None) -> list[Nomination]:
        if source == "openalex":
            return self._openalex_results(query, channel, limit)
        if source == "crossref":
            return [_crossref_nomination(item, channel) for item in self.crossref.by_filter(query)]
        if source == "europepmc":
            return [
                _europepmc_nomination(r, channel) for r in self.europepmc.search(query, max_results=limit)
            ]
        if source == "pride":
            if self.pride is None:  # pragma: no cover - the runner is always given one in a run
                return []
            found: list[Nomination] = []
            for dataset in self.pride.search(query):
                self.result.datasets.append(dataset)
                found.extend(_dataset_nominations(dataset, channel))
            return found
        raise ValueError(f"channel source {source!r} is not a query source")

    def run(self, channels: Sequence[str] = ALL_CHANNELS) -> DiscoveryResult:
        """One ChannelResult per channel id, even where two definitions share one (D3, F)."""
        merged: dict[str, ChannelResult] = {}
        for definition in self.config.enabled_channels():
            channel_id = str(definition["id"])
            queries = self._queries(definition)
            if channel_id not in channels or not queries:
                continue
            outcome = merged.setdefault(channel_id, ChannelResult(channel=channel_id))
            limit = int(definition["max_results"])
            for query in queries:
                outcome.queries += 1
                try:
                    found = self._results(str(definition["source"]), query, definition["id"], limit)
                except ResultLimitError as exc:
                    outcome.errors.append(f"{query}: {exc}; treating the channel as failed")
                    continue
                except HttpError as exc:
                    outcome.errors.append(f"{query}: {exc}")
                    continue
                if len(found) > limit:  # a source that reports no total is still caught
                    outcome.errors.append(
                        f"{query}: {len(found)} results exceeds max_results {limit}; "
                        "treating the channel as failed"
                    )
                    continue
                outcome.nominations.extend(found)
            outcome.nominated = len(outcome.nominations)
        self.result.channels = [merged[key] for key in sorted(merged)]
        return self.result
