"""Running the discovery channels (Phase 1 §5, docs/03 §5 stage 2).

Channels only nominate. A channel that fails degrades the run and its nominations are simply
missing this time; nothing is ever removed because a channel went quiet (§9).
"""

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any

from uwpr_pubs.config import Config
from uwpr_pubs.http import HttpError
from uwpr_pubs.records import ids_from_openalex
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.store.ids import normalise_doi
from uwpr_pubs.store.models import Channel, Ids

# The channels this milestone runs: the official list is stage 1, and the rest need text (M3).
IDENTIFIER_CHANNELS = ("B1", "B2", "C1", "C2")


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


class ChannelRunner:
    def __init__(self, config: Config, openalex: OpenAlex, crossref: Crossref, europepmc: EuropePmc) -> None:
        self.config = config
        self.openalex = openalex
        self.crossref = crossref
        self.europepmc = europepmc

    def _results(self, source: str, query: str, channel: Channel) -> Iterator[Nomination]:
        if source == "openalex":
            for work in self.openalex.works(query):
                yield _openalex_nomination(work, channel)
        elif source == "crossref":
            for item in self.crossref.by_filter(query):
                yield _crossref_nomination(item, channel)
        elif source == "europepmc":
            for result in self.europepmc.search(query):
                yield _europepmc_nomination(result, channel)
        else:  # pragma: no cover - PRIDE and the site have their own adapters
            raise ValueError(f"channel source {source!r} is not a query source")

    def run(self, channels: tuple[str, ...] = IDENTIFIER_CHANNELS) -> list[ChannelResult]:
        results: list[ChannelResult] = []
        for definition in self.config.enabled_channels():
            channel_id = str(definition["id"])
            if channel_id not in channels or not definition["queries"]:
                continue
            outcome = ChannelResult(channel=channel_id)
            for query in definition["queries"]:
                outcome.queries += 1
                try:
                    found = list(self._results(str(definition["source"]), str(query), definition["id"]))
                except HttpError as exc:
                    outcome.errors.append(f"{query}: {exc}")
                    continue
                if len(found) > int(definition["max_results"]):
                    outcome.errors.append(
                        f"{query}: {len(found)} results exceeds max_results "
                        f"{definition['max_results']}; treating the channel as failed"
                    )
                    continue
                outcome.nominations.extend(found)
            outcome.nominated = len(outcome.nominations)
            results.append(outcome)
        return results
