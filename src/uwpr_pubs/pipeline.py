"""The stage machine (docs/03-retrieval-pipeline.md §5).

This milestone runs stages 0-3, 5 (R1 and the R2 metadata arm), 7, 8, 9, 12 and 13. Text, the
remaining rules, version linking and the commit step arrive with later milestones; the stage
order and the gate are already the final ones.

Nothing reaches the real store until stage 9 has validated a complete copy of it.
"""

import datetime as dt
import shutil
import subprocess
import time
import traceback
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from uwpr_pubs import git, versions
from uwpr_pubs.channels import ALL_CHANNELS, ChannelRunner, DiscoveryResult, Nomination
from uwpr_pubs.config import Config
from uwpr_pubs.context import RunContext
from uwpr_pubs.evidence import MergeContext, merge_evidence
from uwpr_pubs.fixtures import evaluate
from uwpr_pubs.fulltext import TextFetcher, TextResult, fulltext_field, needs_evaluation, recheck_after
from uwpr_pubs.http import HttpClient, HttpError, Mode
from uwpr_pubs.match import (
    TITLE_SIMILARITY,
    TitleCandidate,
    by_identifier,
    by_title,
    normalise_ids,
    title_similarity,
)
from uwpr_pubs.metrics import metrics_line
from uwpr_pubs.records import (
    UNKNOWN_KIND,
    canonical_record,
    dois_in_locations,
    ids_from_openalex,
    kind_of,
    merge_ids,
    record_from_list_entry,
    record_from_openalex,
    to_candidate_record,
    year_from_text,
)
from uwpr_pubs.report import (
    NewWork,
    RunRecorder,
    adapter_source,
    channel_source,
    stage_source,
    trailing_average,
    trends,
)
from uwpr_pubs.rules.common import TextSource
from uwpr_pubs.rules.r1 import official_list_evidence
from uwpr_pubs.rules.r2 import award_code_in_metadata, award_code_in_text
from uwpr_pubs.rules.r3 import dataset_named, r3_rules, resource_named
from uwpr_pubs.rules.r4 import facility_named, r4_rules
from uwpr_pubs.rules.r5 import affiliation_is_resource, openalex_affiliations, r5_rules
from uwpr_pubs.rules.r6 import phrase_found, r6_rules
from uwpr_pubs.rules.r7 import r7_rules, staff_thanked
from uwpr_pubs.rules.signals import signal_rules, signals_for, text_signals
from uwpr_pubs.rules.staff import StaffMember, staff_members
from uwpr_pubs.runtime import api_keys
from uwpr_pubs.schemas import project_root
from uwpr_pubs.secrets import scrub
from uwpr_pubs.sources.biorxiv import Biorxiv
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.ncbi import Ncbi
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.sources.pride import Dataset, Pride
from uwpr_pubs.sources.uwpr_site import UwprSite
from uwpr_pubs.stages import export as export_stage
from uwpr_pubs.stages import kb as kb_stage
from uwpr_pubs.status import Status, StatusInput, decide
from uwpr_pubs.store import io
from uwpr_pubs.store.ids import Minter, external_keys, mint_order, normalise_doi, retired_key
from uwpr_pubs.store.models import (
    Candidate,
    CandidateRecord,
    ChannelRun,
    Discovery,
    Evidence,
    FullText,
    Ids,
    IncludedKind,
    ListEntry,
    MetricsLine,
    Record,
    RecordId,
    StaffKey,
    VersionMethod,
    Work,
    WorkId,
)
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import StoreSnapshot, read_store
from uwpr_pubs.text import split_sentences, text_rules
from uwpr_pubs.validate import validate_store

CODE_VERSION = "m4"
INCLUDED_RECORD_KINDS: frozenset[str] = frozenset(IncludedKind.__args__)  # type: ignore[attr-defined]
# A repository copy is a version of the article it copies (Phase 1 §8), so it may be linked even
# though it is not a publication we count on its own.
VERSION_KINDS: frozenset[str] = INCLUDED_RECORD_KINDS | {"repository-copy"}
PREPRINT_DOI_PREFIXES = ("10.1101/",)  # bioRxiv and medRxiv; asking about others wastes requests
MIN_RUNS_FOR_ALERT = 2  # "degraded in N runs running" needs at least this run and one before it


class RunFailureError(Exception):
    """A condition that stops the run before anything is written (§9)."""


@dataclass
class RunOptions:
    store: Path
    mode: Mode = Mode.LIVE
    dry_run: bool = False
    channels: tuple[str, ...] = ALL_CHANNELS
    summary_out: Path | None = None
    check_clean: bool = True
    no_commit: bool = False

    @property
    def partial(self) -> bool:
        """A run of selected channels only. It must not commit, and says so in the report."""
        return tuple(self.channels) != tuple(ALL_CHANNELS)

    @property
    def commits(self) -> bool:
        return not (self.dry_run or self.no_commit or self.partial)


@dataclass
class RunResult:
    status: str
    run_id: str
    report: str
    written: bool
    commit: str | None = None
    errors: list[str] = field(default_factory=list)


@dataclass
class Draft:
    """One work in progress: what the store held, plus what this run found."""

    id: WorkId
    records: dict[RecordId, Record] = field(default_factory=dict)
    kinds: dict[RecordId, str] = field(default_factory=dict)
    stored_evidence: list[Evidence] = field(default_factory=list)
    derived_evidence: list[Evidence] = field(default_factory=list)
    discovery: dict[tuple[str, str], Discovery] = field(default_factory=dict)
    payloads: dict[RecordId, Mapping[str, Any]] = field(default_factory=dict)
    candidate_records: list[CandidateRecord] = field(default_factory=list)
    texts: dict[RecordId, TextResult] = field(default_factory=dict)
    signals: set[str] = field(default_factory=set)
    stored_signals: list[str] = field(default_factory=list)
    created: str = ""
    since: str | None = None
    first_seen: str = ""
    on_official_list: bool = False
    is_new: bool = False
    evaluated: bool = False  # §6.4: a work not re-evaluated keeps the signals it had

    def record_for_ids(self, ids: Ids) -> RecordId | None:
        """The record these identifiers already belong to, if any.

        Candidate lines keep a smaller record shape, but their ids are permanent too, so they are
        searched as well: a candidate that becomes included keeps its record id.
        """
        wanted = set(external_keys(ids))
        for record_id, record in self.records.items():
            if wanted & set(external_keys(record["ids"])):
                return record_id
        for candidate in self.candidate_records:
            if wanted & set(external_keys(candidate["ids"])):
                return candidate["id"]
        return None


class Pipeline:
    def __init__(
        self,
        config: Config,
        client: HttpClient,
        context: RunContext,
        options: RunOptions,
    ) -> None:
        self.config = config
        self.client = client
        self.context = context
        self.options = options
        self.paths = StorePaths(options.store)
        self.recorder = RunRecorder(
            context=context,
            rule_version=config.rule_version,
            config_fingerprint=config.config_fingerprint,
            rules_fingerprint=config.rules_fingerprint,
            code_version=CODE_VERSION,
        )
        openalex_key, ncbi_key = api_keys()
        self.openalex = OpenAlex(client, config.contact, openalex_key)
        self.crossref = Crossref(client, config.contact)
        self.europepmc = EuropePmc(client, config.contact)
        self.ncbi = Ncbi(client, config.contact, ncbi_key)
        self.pride = Pride(client, config.contact)
        self.biorxiv = Biorxiv(client, config.contact)
        self.staff: tuple[StaffMember, ...] = staff_members(config.staff)
        self.text_rules = text_rules(config.rules["text"])
        self.fetcher = TextFetcher(self.ncbi, self.europepmc, self.text_rules)
        self.r3 = r3_rules(config.rules["r3"])
        self.r4 = r4_rules(config.rules["r4"])
        self.r5 = r5_rules(config.rules["r5"])
        self.r6 = r6_rules(config.rules["r6"])
        self.r7 = r7_rules(config.rules["r7"])
        self.signal_rules = signal_rules(config.rules)
        self.discovered = DiscoveryResult()
        self.unevaluated: set[RecordId] = set()
        self._acknowledged: dict[WorkId, set[StaffKey]] = {}
        self.drafts: dict[WorkId, Draft] = {}
        self.aliases: dict[str, WorkId] = {}
        self.entries: dict[str, ListEntry] = {}
        self.entry_pages: dict[str, str] = {}
        self.snapshot: StoreSnapshot | None = None
        self.minter = Minter()
        self.list_nominations: list[Nomination] = []
        self._unreachable: set[str] = set()  # sources that failed once; stage 6 stops asking
        self.crossref_payloads: dict[str, Mapping[str, Any]] = {}  # kept for stage 6's relations

    # --- stage 0 ---------------------------------------------------------------------------

    def precheck(self) -> None:
        store = self.options.store
        self._require_clean_store()
        if store.exists():
            report = validate_store(store)
            if not report.ok and any("store is empty" not in e for e in report.errors):
                raise RunFailureError(
                    "the committed store does not validate; fix it before running:\n  "
                    + "\n  ".join(report.errors[:10])
                )
            self.snapshot = read_store(store)
        if self.snapshot is None:
            self.snapshot = read_store(store)  # an empty store reads as empty collections
        self._guard_rules_fingerprint()
        self._seed_from_snapshot()

    def _require_clean_store(self) -> None:
        """A run interrupted in stage 13 leaves files that must not be read back as committed."""
        store = self.options.store
        if not self.options.check_clean or self.options.dry_run or not store.exists():
            return
        if not git.is_repository(store):
            return
        dirty = git.status([store], store)
        if dirty:
            raise RunFailureError(
                "the store has uncommitted changes, so an earlier run may have been interrupted. "
                "Commit them, or discard them with `git checkout` and `git clean -fd`:\n  "
                + "\n  ".join(dirty[:10])
            )

    def _guard_rules_fingerprint(self) -> None:
        latest = self.snapshot.latest_run() if self.snapshot else None
        if latest is None:
            return
        same_version = latest["rule_version"] == self.config.rule_version
        changed = latest["rules_fingerprint"] != self.config.rules_fingerprint
        if same_version and changed:
            raise RunFailureError(
                "rules.yaml or staff.yaml changed without a new rule_version "
                f"(still {self.config.rule_version}); bump it so every work is re-evaluated"
            )

    def _seed_from_snapshot(self) -> None:
        snapshot = self.snapshot
        if snapshot is None:  # pragma: no cover - precheck always reads one first
            return
        self.aliases = dict(snapshot.aliases)
        self.minter = snapshot.minter()
        for work_id, work in snapshot.works.items():
            draft = Draft(
                id=work_id,
                records={r["id"]: r for r in work["records"]},
                kinds={r["id"]: r["kind"] for r in work["records"]},
                stored_evidence=list(work["evidence"]),
                discovery={(d["channel"], d["record"]): d for d in work["discovery"]},
                created=work["created"],
                since=work["status"]["since"],
                first_seen=work["created"],
            )
            self.drafts[work_id] = draft
        for line in snapshot.candidates:
            self.drafts[line["id"]] = Draft(
                id=line["id"],
                stored_evidence=list(line.get("former_evidence") or []),
                candidate_records=list(line["records"]),
                stored_signals=list(line.get("signals") or []),
                created=line["first_seen"],
                first_seen=line["first_seen"],
            )
        self.entries = {entry["key"]: entry for entry in snapshot.entries}

    # --- stage 1 ---------------------------------------------------------------------------

    def official_list(self) -> None:
        site = UwprSite(
            self.client,
            self.config.settings["official_list"]["index_url"],
            self.config.settings["official_list"]["page_link_pattern"],
        )
        try:
            found = site.entries()
        except HttpError as exc:
            self.recorder.degrade(stage_source("official_list"), f"fetch failed: {exc}")
            return

        previous_total = len(self.entries)
        tolerance = float(self.config.settings["list_drop_tolerance"])
        if previous_total and len(found) < previous_total * (1 - tolerance):
            self.recorder.degrade(
                stage_source("official_list"),
                f"parsed {len(found)} entries, down from {previous_total}; keeping the stored list",
            )
            return

        seen: set[str] = set()
        for url, entry in found:
            key = entry.key
            seen.add(key)
            self.entry_pages[key] = url
            stored = self.entries.get(key)
            if stored is None:
                self.recorder.list_appeared.append(key)
                self.entries[key] = cast(
                    ListEntry,
                    {
                        "schema": 1,
                        "key": key,
                        "page": entry.page,
                        "title": entry.title,
                        "authors_text": entry.authors_text,
                        "venue_text": entry.venue_text,
                        "pmid": entry.pmid,
                        "links": entry.links,
                        "work": "",  # stage 3 matches it
                        "first_seen": self.context.date,
                        "last_seen": self.context.date,
                    },
                )
            else:
                updated = dict(stored)
                updated.update(
                    page=entry.page,
                    title=entry.title,
                    authors_text=entry.authors_text,
                    venue_text=entry.venue_text,
                    pmid=entry.pmid,
                    links=entry.links,
                    last_seen=self.context.date,  # entries keep exact dates (docs/02 §7)
                )
                self.entries[key] = cast(ListEntry, updated)
        for key in set(self.entries) - seen:
            if self.entries[key]["last_seen"] == self.context.date:
                continue
            self.recorder.list_disappeared.append(key)

        # A listed paper with a PMID is nominated like any other candidate, so stage 3 fetches its
        # metadata and builds a real record. Only an entry that matches nothing becomes a stub.
        self.list_nominations = [
            Nomination(
                channel="A",
                ids={"pmid": entry["pmid"]},
                title=entry["title"],
                year=year_from_text(entry["venue_text"], entry["page"]),
                source="uwpr_site",
            )
            for entry in self.entries.values()
            if entry["pmid"] and entry["key"] in seen
        ]
        self.recorder.channels["A"] = cast(
            ChannelRun,
            {
                "queries": 1,
                "nominated": len(self.list_nominations),
                "new": 0,
                "errors": [],
            },
        )

    # --- stage 2 ---------------------------------------------------------------------------

    def discover(self) -> list[Nomination]:
        runner = ChannelRunner(
            self.config,
            self.openalex,
            self.crossref,
            self.europepmc,
            pride=self.pride,
            staff=self.staff,
            r6=self.r6,
            r3=self.r3,
        )
        self.discovered = runner.run(self.options.channels)
        for result in self.discovered.channels:
            self.recorder.channels[result.channel] = cast(
                ChannelRun,
                {
                    "queries": result.queries,
                    "nominated": result.nominated,
                    "new": 0,
                    "errors": result.errors,
                },
            )
            for message in result.errors:
                self.recorder.degrade(channel_source(result.channel), message)
        self.check_staff_orcids()
        return self.discovered.nominations

    def check_staff_orcids(self) -> None:
        """Phase 1 §5.1: a staff ORCID carrying an unknown OpenAlex ID is an alert, never a fix.

        Same-name authors exist — a second "Vagisha Sharma" publishes in medicine — so the
        pipeline never adds an ID itself; a person confirms each one.
        """
        orcids = [member.orcid for member in self.staff if member.orcid]
        if not orcids:
            return
        known = {identifier for member in self.staff for identifier in member.openalex}
        try:
            authors = list(self.openalex.authors_by_orcid(orcids))
        except HttpError as exc:
            self.recorder.degrade(adapter_source("openalex"), f"ORCID check failed: {exc}")
            return
        for author in authors:
            identifier = str(author.get("id") or "").rsplit("/", 1)[-1]
            if identifier and identifier not in known:
                self.recorder.alert(
                    f"OpenAlex author {identifier} ({author.get('orcid')}) carries a staff ORCID "
                    f"but is not in staff.yaml",
                    "confirm it is the same person, then add the ID to staff.yaml and bump rule_version",
                )

    # --- stage 3 ---------------------------------------------------------------------------

    def resolve(self, nominations: Sequence[Nomination]) -> None:
        by_identity: dict[str, list[Nomination]] = {}
        for nomination in nominations:
            ids = normalise_ids(nomination.ids)
            keys = external_keys(ids)
            if not keys:
                continue
            by_identity.setdefault(keys[0], []).append(nomination)

        ordered = sorted(by_identity.items(), key=lambda item: mint_order(normalise_ids(item[1][0].ids)))
        payloads = self._metadata_for(ordered)

        for identity, group in ordered:
            ids = normalise_ids(group[0].ids)
            payload = payloads.get(identity)
            if payload is None:
                self.recorder.note(f"no metadata for {identity}; skipped this run")
                continue
            work_id = by_identifier(ids_from_openalex(payload), self.aliases) or by_identifier(
                ids, self.aliases
            )
            draft = self._draft_for(work_id)
            record_id = self._record_for(draft, payload)
            draft.payloads[record_id] = payload
            for nomination in group:
                key = (nomination.channel, record_id)
                existing = draft.discovery.get(key)
                draft.discovery[key] = cast(
                    Discovery,
                    {
                        "channel": nomination.channel,
                        "record": record_id,
                        "first_seen": existing["first_seen"] if existing else self.context.date,
                        "last_seen": self.context.date,
                    },
                )
                if nomination.source == "crossref":
                    self._crossref_evidence(draft, record_id, nomination.payload)
                    crossref_doi = nomination.payload.get("DOI")
                    if crossref_doi:
                        self.crossref_payloads[normalise_doi(str(crossref_doi))] = nomination.payload
            self._openalex_evidence(draft, record_id, payload)

    def refresh_stored_records(self) -> None:
        """Stage 3's second half: metadata for records no channel named this run.

        Without it a stored work's R2 metadata would never be re-derived, and its citations would
        go stale, which is what §6.1 means by refreshing evidence that needs no text.
        """
        wanted: dict[str, tuple[Draft, RecordId]] = {}
        for draft in self.drafts.values():
            for record_id, record in draft.records.items():
                if record_id in draft.payloads:
                    continue
                openalex_id = record["ids"].get("openalex")
                if openalex_id:
                    wanted[str(openalex_id)] = (draft, record_id)
        if not wanted:
            return
        try:
            refreshed = list(self.openalex.works_by_ids(sorted(wanted)))
        except HttpError as exc:
            self.recorder.degrade(adapter_source("openalex"), f"stored-record refresh failed: {exc}")
            return
        for payload in refreshed:
            openalex_id = ids_from_openalex(payload).get("openalex")
            found = wanted.get(str(openalex_id))
            if not found:
                continue
            draft, record_id = found
            draft.payloads[record_id] = payload
            self._openalex_evidence(draft, record_id, payload)

    def _metadata_for(self, groups: Sequence[tuple[str, list[Nomination]]]) -> dict[str, Mapping[str, Any]]:
        """Every record's OpenAlex metadata, refreshed each run (§6.1), in batches."""
        payloads: dict[str, Mapping[str, Any]] = {}
        wanted_dois: list[str] = []
        wanted_pmids: list[str] = []
        for identity, group in groups:
            nominated = [n.payload for n in group if n.source == "openalex" and n.payload]
            payload = _preferred(nominated)
            if payload:
                payloads[identity] = payload
                continue
            ids = normalise_ids(group[0].ids)
            if ids.get("doi"):
                wanted_dois.append(str(ids["doi"]))
            elif ids.get("pmid"):
                wanted_pmids.append(str(ids["pmid"]))
        fetched: list[Mapping[str, Any]] = []
        for key, values in (("doi", wanted_dois), ("pmid", wanted_pmids)):
            if not values:
                continue
            try:
                fetched.extend(self.openalex.works_by_ids(values, key=key))
            except HttpError as exc:
                self.recorder.degrade(adapter_source("openalex"), f"metadata refresh failed: {exc}")
        self._choose_payloads(fetched, payloads)
        return payloads

    def _choose_payloads(
        self, fetched: Sequence[Mapping[str, Any]], payloads: dict[str, Mapping[str, Any]]
    ) -> None:
        by_identity: dict[str, list[Mapping[str, Any]]] = {}
        for work in fetched:
            for identity in external_keys(ids_from_openalex(work)):
                by_identity.setdefault(identity, []).append(work)
        for identity, works in by_identity.items():
            if identity in payloads:
                continue
            if len(works) > 1:
                self._note_duplicate(identity, works)
            chosen = _preferred(works)
            if chosen is not None:
                payloads[identity] = chosen

    def _note_duplicate(self, identity: str, works: Sequence[Mapping[str, Any]]) -> None:
        """OpenAlex sometimes holds two work records for one DOI, with different types.

        Whichever arrived first used to win, and the order is not stable between runs, so the
        same paper could be an `article` one week and a `dissertation` the next. The choice is
        now fixed; the duplicate is reported because M4's version linking should merge it.
        """
        ids = ", ".join(sorted(str(ids_from_openalex(w).get("openalex")) for w in works))
        note = f"OpenAlex has {len(works)} records for {identity} ({ids}); taking the lowest id"
        if note not in self.recorder.notes:
            self.recorder.note(note)

    def _draft_for(self, work_id: WorkId | None) -> Draft:
        if work_id and work_id in self.drafts:
            return self.drafts[work_id]
        minted = self.minter.mint_work()
        draft = Draft(id=minted, created=self.context.date, first_seen=self.context.date, is_new=True)
        self.drafts[minted] = draft
        return draft

    def _record_for(self, draft: Draft, payload: Mapping[str, Any]) -> RecordId:
        ids = ids_from_openalex(payload)
        existing = draft.record_for_ids(ids)
        record_id = existing or self.minter.mint_record()
        record = record_from_openalex(payload, record_id, self.config, self.context.date)
        kind = kind_of(payload, self.config)
        if kind == UNKNOWN_KIND and payload.get("type"):
            note = f"unmapped record type {payload['type']!r}; treated as excluded"
            if note not in self.recorder.notes:
                self.recorder.note(note)
        draft.kinds[record_id] = kind
        if existing in draft.records:
            stored = draft.records[existing]
            record["fulltext"] = stored["fulltext"]  # stage 4 owns the text
            record["version_link"] = stored["version_link"]  # stage 6 owns the link
            record["ids"] = merge_ids(stored["ids"], record["ids"])
        draft.records[record_id] = record
        for key in external_keys(record["ids"]):
            self.aliases[key] = draft.id
        return record_id

    def _openalex_evidence(self, draft: Draft, record: RecordId, payload: Mapping[str, Any]) -> None:
        evidence = award_code_in_metadata(
            payload,
            record=record,
            code=self.config.rules["r2"]["code"],
            source_name="OpenAlex",
            source_url=f"https://api.openalex.org/works/{str(payload.get('id') or '').rsplit('/', 1)[-1]}",
            label=self.config.rules["labels"]["R2.metadata"],
            today=self.context.date,
        )
        if evidence:
            draft.derived_evidence.append(evidence)

    def _crossref_evidence(self, draft: Draft, record: RecordId, payload: Mapping[str, Any]) -> None:
        doi = payload.get("DOI")
        evidence = award_code_in_metadata(
            payload,
            record=record,
            code=self.config.rules["r2"]["code"],
            source_name="Crossref",
            source_url=f"https://api.crossref.org/works/{doi}" if doi else None,
            label=self.config.rules["labels"]["R2.metadata"],
            today=self.context.date,
        )
        if evidence:
            draft.derived_evidence.append(evidence)

    # --- stage 3b: the official list joins the works it names ------------------------------

    def attach_official_list(self) -> None:
        candidates = [
            TitleCandidate(draft.id, record["title"], record["year"] or None)
            for draft in self.drafts.values()
            for record in draft.records.values()
        ]
        for key, entry in sorted(self.entries.items()):
            work_id = None
            if entry["pmid"]:
                work_id = self.aliases.get(f"pmid:{entry['pmid']}")
            if work_id is None:
                year = year_from_text(entry["venue_text"], entry["page"])
                work_id = by_title(entry["title"], year, candidates)
            if work_id is None:
                work_id = self._search_for_entry(entry)
            if work_id is None:
                work_id = self._list_only_work(entry)
                if work_id is None:
                    continue
            draft = self.drafts[work_id]
            draft.on_official_list = True
            self.entries[key] = cast(ListEntry, {**entry, "work": work_id})
            record = self._entry_record(draft, entry)
            page_url = self.entry_pages.get(key, self.config.settings["official_list"]["index_url"])
            draft.derived_evidence.append(
                official_list_evidence(
                    self.entries[key],
                    record,
                    page_url,
                    self.config.rules["labels"]["R1"],
                    self.context.date,
                )
            )

    def _search_for_entry(self, entry: ListEntry) -> WorkId | None:
        """A listed paper with no PMID is looked up by title before we give up on identifying it.

        A search page costs $0.001, and there are only a handful of such entries; once one is
        stored, later runs match it by title against the store instead.
        """
        try:
            results = self.openalex.search_by_title(entry["title"])
        except HttpError as exc:
            self.recorder.degrade(adapter_source("openalex"), f"title search failed: {exc}")
            return None
        year = year_from_text(entry["venue_text"], entry["page"])
        best: tuple[float, Mapping[str, Any]] | None = None
        for work in results:
            score = title_similarity(entry["title"], str(work.get("display_name") or ""))
            published = work.get("publication_year")
            if year and published and abs(int(published) - year) > 1:
                continue
            if score >= TITLE_SIMILARITY and (best is None or score > best[0]):
                best = (score, work)
        if best is None:
            return None
        payload = best[1]
        draft = self._draft_for(by_identifier(ids_from_openalex(payload), self.aliases))
        record_id = self._record_for(draft, payload)
        draft.payloads[record_id] = payload
        draft.discovery[("A", record_id)] = cast(
            Discovery,
            {
                "channel": "A",
                "record": record_id,
                "first_seen": self.context.date,
                "last_seen": self.context.date,
            },
        )
        self._openalex_evidence(draft, record_id, payload)
        self.recorder.note(f"list entry {entry['key']} identified by title search")
        return draft.id

    def _entry_record(self, draft: Draft, entry: ListEntry) -> RecordId:
        if entry["pmid"]:
            for record_id, record in draft.records.items():
                if record["ids"].get("pmid") == entry["pmid"]:
                    return record_id
        listed = draft.record_for_ids({"list": entry["key"]})
        return listed or next(iter(draft.records))

    def _list_only_work(self, entry: ListEntry) -> WorkId | None:
        """A listed paper we cannot find anywhere else still counts (Phase 1 §8)."""
        year = year_from_text(entry["venue_text"], entry["page"])
        if year is None:
            self.recorder.note(f"list entry {entry['key']} has no year; not stored")
            return None
        draft = self._draft_for(None)
        record_id = self.minter.mint_record()
        draft.records[record_id] = record_from_list_entry(
            record_id=record_id,
            key=entry["key"],
            title=entry["title"],
            year=year,
            pmid=entry["pmid"],
            today=self.context.date,
        )
        draft.kinds[record_id] = "article"
        for alias in external_keys(draft.records[record_id]["ids"]):
            self.aliases[alias] = draft.id
        return draft.id

    # --- stage 4: text ---------------------------------------------------------------------

    def fetch_text(self) -> None:
        """Read the records that need evaluating (§6.1), resolving PMCIDs first.

        A text fetch that fails leaves the record's stored evidence exactly as it was and degrades
        the run (§6.2): a source going down must never remove a work.
        """
        wanted = self._records_needing_text()
        if not wanted:
            return
        self._resolve_pmcids(wanted)
        failures = 0
        for draft, record_id in wanted:
            record = draft.records[record_id]
            try:
                result = self.fetcher.fetch(record["ids"].get("pmcid"))
            except HttpError as exc:
                failures += 1
                self.unevaluated.add(record_id)
                if failures == 1:
                    self.recorder.degrade(adapter_source("ncbi"), f"text fetch failed: {exc}")
                continue
            draft.texts[record_id] = result
            draft.evaluated = True
            draft.records[record_id] = cast(
                Record,
                {
                    **record,
                    "fulltext": fulltext_field(
                        result,
                        today=self.context.date,
                        recheck_days=int(self.config.settings["recheck_days"]),
                    ),
                },
            )
        if failures:
            self.recorder.note(f"{failures} records could not be read this run; their evidence is kept")

    def _records_needing_text(self) -> list[tuple[Draft, RecordId]]:
        overrides_changed = self._overrides_changed()
        wanted: list[tuple[Draft, RecordId]] = []
        for _, draft in sorted(self.drafts.items()):
            versions = {e["rule_version"] for e in draft.stored_evidence if e.get("record")}
            evidence_version = min(versions) if versions else None
            for record_id in sorted(draft.records):
                if overrides_changed or needs_evaluation(
                    draft.records[record_id],
                    today=self.context.date,
                    rule_version=self.config.rule_version,
                    evidence_version=evidence_version,
                ):
                    wanted.append((draft, record_id))
        return wanted

    def _overrides_changed(self) -> bool:
        """A change to overrides.yaml re-evaluates the works it names (§6.1 item 4)."""
        latest = self.snapshot.latest_run() if self.snapshot else None
        if latest is None:
            return False
        return bool(latest["config_fingerprint"] != self.config.config_fingerprint)

    def _resolve_pmcids(self, wanted: Sequence[tuple[Draft, RecordId]]) -> None:
        """The ID converter found PMC copies for 139 candidates the search APIs missed (§7)."""
        by_pmid: dict[str, tuple[Draft, RecordId]] = {}
        by_doi: dict[str, tuple[Draft, RecordId]] = {}
        for draft, record_id in wanted:
            ids = draft.records[record_id]["ids"]
            if ids.get("pmcid"):
                continue
            if ids.get("pmid"):
                by_pmid[str(ids["pmid"])] = (draft, record_id)
            elif ids.get("doi"):
                by_doi[str(ids["doi"])] = (draft, record_id)
        for idtype, wanted_ids in (("pmid", by_pmid), ("doi", by_doi)):
            if not wanted_ids:
                continue
            try:  # mixed batches are rejected, so each type goes on its own (Phase 1 §7)
                converted = list(self.ncbi.convert(sorted(wanted_ids), cast(Any, idtype)))
            except HttpError as exc:
                self.recorder.degrade(adapter_source("ncbi"), f"id conversion failed: {exc}")
                continue
            for entry in converted:
                pmcid = entry.get("pmcid")
                found = wanted_ids.get(str(entry.get(idtype, "")))
                if not pmcid or not found:
                    continue
                draft, record_id = found
                record = draft.records[record_id]
                updated = cast(Record, {**record, "ids": {**record["ids"], "pmcid": str(pmcid)}})
                draft.records[record_id] = updated
                for key in external_keys(updated["ids"]):
                    self.aliases[key] = draft.id  # a new identifier is a new alias (invariant 2)

    # --- stage 5: rules --------------------------------------------------------------------

    def apply_rules(self) -> None:
        """R2 text, R3, R4, R5, R7 from our own text; R5 metadata, R6 and R3d without it."""
        datasets = self._datasets_by_identifier()
        for _, draft in sorted(self.drafts.items()):
            for record_id in sorted(draft.records):
                self._rules_for_record(draft, record_id, datasets)
            draft.signals = set(
                signals_for(
                    text=draft.signals,
                    staff_authors=self._staff_authors(draft),
                    acknowledged=self._acknowledged.get(draft.id, set()),
                )
            )

    def _rules_for_record(
        self, draft: Draft, record_id: RecordId, datasets: Mapping[str, list[Dataset]]
    ) -> None:
        record = draft.records[record_id]
        year = record["year"] or None
        payload = draft.payloads.get(record_id)
        if payload is not None:
            self._openalex_affiliation_evidence(draft, record_id, payload)
        result = draft.texts.get(record_id)
        if result is not None and result.readable:
            self._text_evidence(draft, record_id, result, year)
        elif not self._has_readable_text(record, result):
            # R6 stands in only where we have no text of our own — including text read on an
            # earlier run and not re-fetched today, or P13 would re-add R6 to a readable record.
            self._phrase_evidence(draft, record_id, record)
        for dataset in datasets.get(record_id, []):
            self._dataset_evidence(draft, record_id, dataset)

    @staticmethod
    def _has_readable_text(record: Record, result: TextResult | None) -> bool:
        if result is not None:
            return result.readable
        return record["fulltext"]["status"] != "unavailable"

    def _text_evidence(self, draft: Draft, record_id: RecordId, result: TextResult, year: int | None) -> None:
        document = result.document
        if document is None:  # pragma: no cover - `readable` already guarantees one
            return
        source = TextSource(name=result.source_name, url=result.url, cache=result.cache)
        labels = self.config.rules["labels"]
        authors = [*document.author_names, *self._openalex_author_names(draft, record_id)]
        derived: list[Evidence] = [
            *award_code_in_text(
                document,
                record=record_id,
                source=source,
                code=self.config.rules["r2"]["code"],
                label=labels["R2.text"],
                today=self.context.date,
            ),
            *resource_named(
                document,
                record=record_id,
                source=source,
                rules=self.r3,
                label=labels["R3"],
                staff=self.staff,
                year=year,
                today=self.context.date,
            ),
            *affiliation_is_resource(
                document.affiliations,
                record=record_id,
                source=source,
                rules=self.r5,
                r3=self.r3,
                label=labels["R5"],
                today=self.context.date,
            ),
        ]
        facility = facility_named(
            document,
            record=record_id,
            source=source,
            rules=self.r4,
            label=labels["R4"],
            staff=self.staff,
            year=year,
            today=self.context.date,
        )
        if facility:
            derived.append(facility)
        thanks = staff_thanked(
            document,
            record=record_id,
            source=source,
            rules=self.r7,
            label=labels["R7"],
            staff=self.staff,
            authors=authors,
            year=year,
            today=self.context.date,
        )
        derived.extend(thanks.evidence)
        self._acknowledged.setdefault(draft.id, set()).update(thanks.acknowledged)
        draft.derived_evidence.extend(derived)
        draft.signals.update(text_signals(document, rules=self.signal_rules, r3=self.r3))

    def _phrase_evidence(self, draft: Draft, record_id: RecordId, record: Record) -> None:
        """R6: only for a record with no readable text of our own (Phase 1 §6.5, P13)."""
        doi = record["ids"].get("doi")
        if not doi:
            return
        for phrase in self.r6.include_phrases:
            if str(doi) in self.discovered.phrase_hits.get(phrase, set()):
                draft.derived_evidence.append(
                    phrase_found(
                        record=record_id,
                        doi=str(doi),
                        phrase=phrase,
                        label=self.config.rules["labels"]["R6"],
                        today=self.context.date,
                    )
                )

    def _openalex_affiliation_evidence(
        self, draft: Draft, record_id: RecordId, payload: Mapping[str, Any]
    ) -> None:
        """R5 from raw affiliation strings needs no text, so it is refreshed every run (§6.1)."""
        draft.derived_evidence.extend(
            affiliation_is_resource(
                openalex_affiliations(dict(payload)),
                record=record_id,
                source=TextSource(
                    name="OpenAlex",
                    url=f"https://api.openalex.org/works/{str(payload.get('id') or '').rsplit('/', 1)[-1]}",
                    cache=None,
                ),
                rules=self.r5,
                r3=self.r3,
                label=self.config.rules["labels"]["R5"],
                today=self.context.date,
            )
        )

    def _dataset_evidence(self, draft: Draft, record_id: RecordId, dataset: Dataset) -> None:
        sentences = [
            sentence for block in dataset.sentences for sentence in split_sentences(block, self.text_rules)
        ]
        evidence = dataset_named(
            sentences,
            record=record_id,
            source=TextSource(name="PRIDE", url=dataset.url, cache=None),
            rules=self.r3,
            label=self.config.rules["labels"]["R3d"],
            dataset=dataset.accession,
            today=self.context.date,
        )
        if evidence:
            draft.derived_evidence.append(evidence)

    def _datasets_by_identifier(self) -> dict[RecordId, list[Dataset]]:
        """Channel J's datasets, attached to the records they name."""
        found: dict[RecordId, list[Dataset]] = {}
        for dataset in self.discovered.datasets:
            keys = [f"pmid:{pmid}" for pmid in dataset.pmids]
            keys += [f"doi:{normalise_doi(doi)}" for doi in dataset.dois]
            for key in keys:
                work_id = self.aliases.get(key)
                if work_id is None or work_id not in self.drafts:
                    continue
                draft = self.drafts[work_id]
                for record_id, record in draft.records.items():
                    if key in external_keys(record["ids"]):
                        found.setdefault(record_id, []).append(dataset)
        return found

    def _staff_authors(self, draft: Draft) -> list[StaffKey]:
        keys = {
            author["staff"]
            for record in draft.records.values()
            for author in record["authors"]
            if author.get("staff")
        }
        return sorted(key for key in keys if key)

    def _openalex_author_names(self, draft: Draft, record_id: RecordId) -> list[str]:
        record = draft.records.get(record_id)
        return [author["name"] for author in record["authors"]] if record else []

    # --- stage 6: versions -----------------------------------------------------------------

    def link_versions(self) -> None:
        """Join the records that are versions of one work, and merge the works they sat in.

        Most of the excess over Phase 1 §4.3 is one paper counted twice: a preprint that one
        channel found and the journal article that another found, with no link between them. The
        trusted signals come from metadata, and only the title fallback can be wrong (§8).
        """
        published = self._published_versions()
        self._create_published_records(published)
        records = self._version_records()
        links = versions.resolve(records, published=published, locations=self._location_dois())
        index = {record.record: record for record in records}
        for merge in versions.merges(links, index):
            self._merge_drafts(merge.into, merge.retired)
        self._apply_links(links)
        self._apply_override_merges()
        self._apply_override_splits()

    def _current_work(self, target: str) -> WorkId | None:
        """Where a work ID points now: itself, or whatever it was merged into."""
        found = target if target in self.drafts else self.aliases.get(retired_key(target))
        return found if found in self.drafts else None

    def _apply_override_merges(self) -> None:
        """Works that only a person can join (docs/02 §9, docs/03 §5 stage 6).

        The NUP153 preprint and its article are the worked example, and the reason this exists:
        their titles differ, their first authors differ, and neither Crossref nor OpenAlex states
        a relation, so none of Phase 1 §8's four signals reaches them.
        """
        for override in self.config.overrides:
            targets = override["target"]
            if override["action"] != "merge" or not isinstance(targets, list):
                continue
            resolved = sorted({found for found in map(self._current_work, targets) if found})
            if len(resolved) < 2:  # noqa: PLR2004 - a merge of fewer than two works is a no-op
                continue
            survivor = resolved[0]
            for retired in resolved[1:]:
                self._merge_drafts(survivor, retired)
            self._link_within(survivor, "override")

    def _link_within(self, work_id: WorkId, method: VersionMethod) -> None:
        """Point a work's unlinked preprints at its article, once a person has said they are one."""
        draft = self.drafts[work_id]
        articles = [r for r in sorted(draft.records) if draft.kinds.get(r) not in (None, "preprint")]
        if not articles:
            return
        article = canonical_record([draft.records[r] for r in articles])
        for record_id in sorted(draft.records):
            record = draft.records[record_id]
            if draft.kinds.get(record_id) == "preprint" and record["version_link"] is None:
                draft.records[record_id] = cast(
                    Record, {**record, "version_link": {"to": article, "method": method}}
                )

    def _apply_override_splits(self) -> None:
        """Move the named records out into a work of their own (docs/02 §4, §9).

        A split mints a new ID rather than reusing one, and the records take their evidence and
        discovery with them, since both are keyed by record.
        """
        for override in self.config.overrides:
            target = override["target"]
            leaving = set(override.get("records") or [])
            if override["action"] != "split" or not isinstance(target, str) or not leaving:
                continue
            source_id = self._current_work(target)
            if source_id is None:
                continue
            source = self.drafts[source_id]
            moving = sorted(leaving & set(source.records))
            if not moving or len(moving) == len(source.records):
                continue
            self._split_out(source, moving)

    def _split_out(self, source: Draft, moving: Sequence[RecordId]) -> None:
        minted = self.minter.mint_work()
        draft = Draft(id=minted, created=source.created, first_seen=source.first_seen, is_new=True)
        self.drafts[minted] = draft
        for record_id in moving:
            record = source.records.pop(record_id)
            draft.records[record_id] = cast(Record, {**record, "version_link": None})
            draft.kinds[record_id] = source.kinds.pop(record_id, record["kind"])
            if record_id in source.payloads:
                draft.payloads[record_id] = source.payloads.pop(record_id)
            if record_id in source.texts:
                draft.texts[record_id] = source.texts.pop(record_id)
            for alias in external_keys(record["ids"]):
                self.aliases[alias] = minted
        moved = set(moving)

        draft.stored_evidence = [e for e in source.stored_evidence if e.get("record") in moved]
        source.stored_evidence = [e for e in source.stored_evidence if e.get("record") not in moved]
        draft.derived_evidence = [e for e in source.derived_evidence if e.get("record") in moved]
        source.derived_evidence = [e for e in source.derived_evidence if e.get("record") not in moved]
        for key in [k for k in sorted(source.discovery) if k[1] in moved]:
            draft.discovery[key] = source.discovery.pop(key)
        # A record that stays behind may have pointed at one that left, and a version_link must
        # stay inside its own work or the gate rejects the store.
        for record_id, record in sorted(source.records.items()):
            link = record["version_link"]
            if link and link["to"] in moved:
                source.records[record_id] = cast(Record, {**record, "version_link": None})
        self.recorder.note(f"{source.id}: {', '.join(moving)} split out into {minted} by override")

    def _published_versions(self) -> list[tuple[VersionMethod, dict[str, str]]]:
        """Ask each preprint-only work whether its journal version has appeared (stage 6).

        A work that already holds both versions needs no request: its records are in one file and
        its `version_link` is carried forward, so a normal week asks about a handful of preprints.
        """
        relations = self._stated_relations()
        published: dict[str, str] = {}
        for draft in self._preprint_only_drafts():
            for doi in self._preprint_dois(draft):
                if doi in relations:
                    continue  # a channel's own metadata already said so; no request needed
                article = self._crossref_relation(doi)
                if article:
                    relations[doi] = normalise_doi(article)
                    continue
                article = self._biorxiv_published(doi)
                if article:
                    published[doi] = normalise_doi(article)
        return [("crossref_relation", relations), ("biorxiv_published", published)]

    def _stated_relations(self) -> dict[str, str]:
        """Relations from Crossref records a channel already fetched, in both directions (§8).

        Publishers state the relation from the article's side far more often than preprint
        servers state it from theirs — 13 of the 63 award-filter works carry `has-preprint`
        against one carrying `is-preprint-of` — and reading it costs no request at all.
        """
        found: dict[str, str] = {}
        for doi, payload in sorted(self.crossref_payloads.items()):
            stated = Crossref.preprint_of(payload)
            if stated:
                found.setdefault(doi, normalise_doi(stated))
            for preprint_doi in Crossref.has_preprint(payload):
                found.setdefault(normalise_doi(preprint_doi), doi)
        return found

    def _crossref_relation(self, doi: str) -> str | None:
        if "crossref" in self._unreachable:
            return None
        try:
            payload = self.crossref.by_doi(doi)
        except HttpError as exc:
            # One failure is enough to conclude the source is unwell: asking 40 more times would
            # cost minutes of backoff for the same answer, and version linking is not worth that.
            self._unreachable.add("crossref")
            self.recorder.degrade(adapter_source("crossref"), f"preprint relations unavailable: {exc}")
            return None
        return Crossref.preprint_of(payload) if payload else None

    def _biorxiv_published(self, doi: str) -> str | None:
        if "biorxiv" in self._unreachable or not doi.startswith(PREPRINT_DOI_PREFIXES):
            return None
        try:
            details = self.biorxiv.details(doi)
        except HttpError as exc:
            self._unreachable.add("biorxiv")
            self.recorder.degrade(adapter_source("biorxiv"), f"published check unavailable: {exc}")
            return None
        return details.published_doi if details else None

    def _kinds_of(self, draft: Draft) -> list[str]:
        kinds = [draft.kinds.get(r, draft.records[r]["kind"]) for r in sorted(draft.records)]
        kinds += [c["kind"] for c in draft.candidate_records if c["id"] not in draft.records]
        return kinds

    def _preprint_only_drafts(self) -> list[Draft]:
        found: list[Draft] = []
        for _, draft in sorted(self.drafts.items()):
            kinds = self._kinds_of(draft)
            if kinds and all(kind == "preprint" for kind in kinds):
                found.append(draft)
        return found

    @staticmethod
    def _preprint_dois(draft: Draft) -> list[str]:
        dois = {str(r["ids"]["doi"]) for r in draft.records.values() if r["ids"].get("doi")}
        dois |= {str(c["ids"]["doi"]) for c in draft.candidate_records if c["ids"].get("doi")}
        return sorted(dois)

    def _create_published_records(self, published: Sequence[tuple[VersionMethod, dict[str, str]]]) -> None:
        """Stage 6 creates the article's record even though no channel nominated it.

        Its `fulltext` says `unavailable` with today as the recheck date, so the next run reads it
        like any other record. That is honest — we have not looked yet — and it avoids adding a
        "not checked" state to a frozen schema for something that resolves in a week.
        """
        wanted: dict[str, str] = {}  # article DOI -> the preprint DOI that named it
        for _, mapping in published:
            for preprint_doi, article_doi in sorted(mapping.items()):
                if f"doi:{article_doi}" not in self.aliases:
                    wanted.setdefault(article_doi, preprint_doi)
        if not wanted:
            return
        try:
            payloads = list(self.openalex.works_by_ids(sorted(wanted), key="doi"))
        except HttpError as exc:
            self.recorder.degrade(adapter_source("openalex"), f"published-version lookup failed: {exc}")
            return
        for payload in sorted(payloads, key=_openalex_order):
            doi = str(ids_from_openalex(payload).get("doi") or "")
            named_by = wanted.get(doi)
            work_id = self.aliases.get(f"doi:{named_by}") if named_by else None
            kind = kind_of(payload, self.config)
            if work_id is None or work_id not in self.drafts or kind not in INCLUDED_RECORD_KINDS:
                continue
            draft = self.drafts[work_id]
            known = set(draft.records)
            record_id = self._record_for(draft, payload)
            draft.payloads[record_id] = payload
            if record_id not in known:
                self._unread_text(draft, record_id)
            self._openalex_evidence(draft, record_id, payload)
            self.recorder.note(f"{draft.id}: journal version {doi} added by version linking")

    def _unread_text(self, draft: Draft, record_id: RecordId) -> None:
        """A record created in stage 6 has not been looked for, and needs no look (stage 6).

        Evidence applies to the whole work, so the article the preprint's relation named does not
        have to be read for the work to be included. It joins the ordinary 90-day recheck queue
        instead. Dating its recheck today would have it read on the very next run, which rewrites
        the record a second time and breaks the no-diff rule for one run (Phase 2 §15).
        """
        record = draft.records[record_id]
        draft.records[record_id] = cast(
            Record,
            {
                **record,
                "fulltext": {
                    "status": "unavailable",
                    "checked": self.context.date,
                    "recheck_after": recheck_after(
                        self.context.date, int(self.config.settings["recheck_days"])
                    ),
                    "cache": None,
                },
            },
        )

    def _version_records(self) -> list[versions.VersionRecord]:
        found: list[versions.VersionRecord] = []
        for _, draft in sorted(self.drafts.items()):
            for record_id in sorted(draft.records):
                record = draft.records[record_id]
                kind = draft.kinds.get(record_id, record["kind"])
                if kind not in VERSION_KINDS:
                    continue
                authors = record["authors"]
                found.append(
                    versions.VersionRecord(
                        record=record_id,
                        work=draft.id,
                        kind=kind,
                        doi=record["ids"].get("doi"),
                        title=record["title"],
                        first_author=authors[0]["name"] if authors else "",
                        year=record["year"] or None,
                    )
                )
            for candidate in draft.candidate_records:
                if candidate["id"] in draft.records or candidate["kind"] not in VERSION_KINDS:
                    continue
                found.append(
                    versions.VersionRecord(
                        record=candidate["id"],
                        work=draft.id,
                        kind=candidate["kind"],
                        doi=candidate["ids"].get("doi"),
                        title=candidate["title"],
                        first_author="",  # a candidate line keeps no authors, so no title fallback
                        year=candidate["year"],
                    )
                )
        return found

    def _location_dois(self) -> dict[RecordId, list[str]]:
        """The DOIs each record's OpenAlex locations point at — free, from metadata we hold."""
        found: dict[RecordId, list[str]] = {}
        for _, draft in sorted(self.drafts.items()):
            for record_id, payload in sorted(draft.payloads.items()):
                dois = dois_in_locations(payload)
                if dois:
                    found[record_id] = dois
        return found

    def _merge_drafts(self, into: WorkId, retired: WorkId) -> None:
        """Fold one work into another; the lower ID survives and the other becomes an alias.

        Everything the retired work carried moves across — its records, evidence (which is keyed
        by record, so nothing collides), discovery and signals — and anything that pointed at the
        retired ID is repointed, or the next validation would find a dangling reference.
        """
        survivor = self.drafts.get(into)
        gone = self.drafts.pop(retired, None)
        if survivor is None or gone is None:  # pragma: no cover - merges come from current drafts
            return
        survivor.records.update(gone.records)
        survivor.kinds.update(gone.kinds)
        survivor.stored_evidence.extend(gone.stored_evidence)
        survivor.derived_evidence.extend(gone.derived_evidence)
        survivor.discovery.update(gone.discovery)
        survivor.payloads.update(gone.payloads)
        survivor.texts.update(gone.texts)
        survivor.candidate_records.extend(
            record for record in gone.candidate_records if record["id"] not in survivor.records
        )
        survivor.signals |= gone.signals
        survivor.stored_signals = sorted({*survivor.stored_signals, *gone.stored_signals})
        survivor.created = min(filter(None, (survivor.created, gone.created)), default=survivor.created)
        survivor.first_seen = min(
            filter(None, (survivor.first_seen, gone.first_seen)), default=survivor.first_seen
        )
        sinces = [value for value in (survivor.since, gone.since) if value]
        survivor.since = min(sinces) if sinces else None
        survivor.on_official_list = survivor.on_official_list or gone.on_official_list
        survivor.is_new = survivor.is_new and gone.is_new
        survivor.evaluated = survivor.evaluated or gone.evaluated

        self.aliases = {key: (into if target == retired else target) for key, target in self.aliases.items()}
        self.aliases[retired_key(retired)] = into
        for key, entry in self.entries.items():
            if entry["work"] == retired:
                self.entries[key] = cast(ListEntry, {**entry, "work": into})
        acknowledged = self._acknowledged.pop(retired, set())
        if acknowledged:
            self._acknowledged.setdefault(into, set()).update(acknowledged)
        self.recorder.merged.append({"into": into, "retired": retired})

    def _apply_links(self, links: Sequence[versions.Link]) -> None:
        """Record on the preprint how it was tied to its article (docs/02 §5.2).

        The link is written only once both records sit in one work, because the validator requires
        a `version_link` to point inside the work that holds it.
        """
        owner = {record_id: draft for draft in self.drafts.values() for record_id in draft.records}
        for link in links:
            draft = owner.get(link.preprint)
            if draft is None or link.article not in draft.records:
                continue
            record = draft.records[link.preprint]
            draft.records[link.preprint] = cast(
                Record, {**record, "version_link": {"to": link.article, "method": link.method}}
            )

    # --- stages 7 and 8 --------------------------------------------------------------------

    def decide_status(self) -> tuple[list[Work], list[Candidate], list[MetricsLine]]:
        overrides = {
            str(o["target"]): str(o["action"]) for o in self.config.overrides if isinstance(o["target"], str)
        }
        merge_context = MergeContext(
            rule_version=self.config.rule_version,
            today=self.context.date,
            refresh_days=int(self.config.settings["last_seen_refresh_days"]),
            unevaluated_records=frozenset(self.unevaluated),
        )
        works: list[Work] = []
        candidates: list[Candidate] = []
        metrics: list[MetricsLine] = []

        for work_id, draft in sorted(self.drafts.items()):
            outcome = merge_evidence(draft.stored_evidence, draft.derived_evidence, merge_context)
            canonical = None
            year = None
            if draft.records:
                included = [r for r in draft.records.values() if draft.kinds[r["id"]] != "unknown"]
                canonical = canonical_record(included or list(draft.records.values()))
                year = draft.records[canonical]["year"] or None
            status = decide(
                StatusInput(
                    evidence=outcome.evidence,
                    record_kinds=[draft.kinds[r] for r in draft.records],
                    on_official_list=draft.on_official_list,
                    override=overrides.get(work_id),
                    year=year,
                    window_start=self.config.window_start,
                    since=draft.since,
                ),
                self.context.date,
            )
            if status.included and canonical and draft.on_official_list:
                canonical = self._storable_canonical(draft, canonical)
            if status.included and canonical:
                works.append(self._work_file(draft, outcome.evidence, canonical, status.since or ""))
                metrics.extend(self._metrics_for(draft))
                for entry in outcome.evidence:
                    if "superseded" not in entry:
                        self.recorder.rule_fired(entry["rule"], new=draft.is_new)
                if draft.is_new:
                    self._record_new_work(draft, canonical, outcome.evidence)
            else:
                candidates.append(self._candidate_line(draft, outcome.evidence, status))
                if not draft.is_new and work_id in (self.snapshot.works if self.snapshot else {}):
                    self.recorder.removed.append(
                        {"work": work_id, "reason": status.reason or "no_rule_fired"}
                    )
        return works, candidates, metrics

    def _storable_canonical(self, draft: Draft, canonical: RecordId) -> RecordId:
        """A listed work is included whatever its type (Phase 1 §6.0), but invariant 3 needs a
        canonical record of an included kind. Prefer one; otherwise record the substitution."""
        included = [r for r in draft.records if draft.kinds.get(r) in INCLUDED_RECORD_KINDS]
        if included:
            return canonical_record([draft.records[r] for r in included])
        kind = draft.kinds.get(canonical, "unknown")
        self.recorder.note(
            f"{draft.id} is on the official list but its record type is {kind}; "
            "stored as an article because R1 always wins"
        )
        draft.kinds[canonical] = "article"
        draft.records[canonical] = cast(Record, {**draft.records[canonical], "kind": "article"})
        return canonical

    def _work_file(self, draft: Draft, evidence: list[Evidence], canonical: RecordId, since: str) -> Work:
        records = io.sort_records(list(draft.records.values()))
        if draft.is_new:
            self.recorder.added.append(draft.id)
        return cast(
            Work,
            {
                "schema": 1,
                "id": draft.id,
                "aliases": sorted(
                    key.removeprefix("work:")
                    for key, target in self.aliases.items()
                    if key.startswith("work:") and target == draft.id
                ),
                "status": {"included": True, "since": since or self.context.date, "basis": "rules"},
                "canonical": canonical,
                "records": records,
                "evidence": io.sort_evidence(evidence),
                "discovery": io.sort_discovery(list(draft.discovery.values())),
                "rule_version": self.config.rule_version,
                "created": draft.created or self.context.date,
                "updated": self.context.date,
            },
        )

    def _candidate_line(self, draft: Draft, evidence: list[Evidence], status: Status) -> Candidate:
        line: dict[str, Any] = {
            "schema": 1,
            "id": draft.id,
            "records": self._candidate_records(draft),
            "reason": status.reason or "no_rule_fired",
            # §6.4: a work this run did not re-evaluate keeps the signals it already had.
            "signals": sorted(draft.signals) if draft.evaluated else draft.stored_signals,
            "channels": sorted({channel for channel, _ in draft.discovery}),
            "fulltext": self._candidate_fulltext(draft),
            "rule_version": self.config.rule_version,
            "first_seen": draft.first_seen or self.context.date,
            "last_seen": self.context.date,
        }
        if status.reason_detail:
            line["reason_detail"] = status.reason_detail
        if status.keeps_former_evidence and evidence:
            line["former_evidence"] = io.sort_evidence(evidence)
        return cast(Candidate, line)

    @staticmethod
    def _candidate_records(draft: Draft) -> list[CandidateRecord]:
        """This run's records, plus any the store held that nothing rebuilt (docs/02 §4).

        A candidate's records only re-enter the draft when a channel nominates them again, and
        stage 6 creates records no channel ever nominates. Replacing the stored list therefore
        dropped records — and a record ID, once minted, is permanent. Two consecutive runs and a
        diff are what showed this: the article vanished from the line on the second run.
        """
        rebuilt = [
            to_candidate_record(record, draft.kinds.get(record["id"])) for record in draft.records.values()
        ]
        known = {record["id"] for record in rebuilt}
        carried = [record for record in draft.candidate_records if record["id"] not in known]
        # Ordered so that the line does not depend on which records happened to be nominated.
        return sorted([*rebuilt, *carried], key=lambda r: (r["kind"] == "preprint", r["year"] or 0, r["id"]))

    def measure_recall(self, works: Sequence[Work]) -> None:
        """Phase 1 §4.2 and §11: the share of assessable list papers that R2-R7 reach.

        "Assessable" means a list paper with a readable body or award metadata — the papers where
        a rule could in principle fire. R1 is excluded from the numerator, because it is what the
        list already tells us, and R6's hits sit outside the denominator by the same logic: they
        are papers we cannot read (§4.2).
        """
        listed = {entry["work"] for entry in self.entries.values() if entry["work"]}
        assessable = 0
        with_evidence = 0
        for work in works:
            if work["id"] not in listed:
                continue
            readable = any(record["fulltext"]["status"] != "unavailable" for record in work["records"])
            active = [e for e in work["evidence"] if "superseded" not in e]
            metadata = any(e["rule"] == "R2" and e["section"] == "metadata" for e in active)
            if not (readable or metadata):
                continue
            assessable += 1
            if any(e["rule"] not in ("R1", "R6") for e in active):
                with_evidence += 1
        self.recorder.recall = {"assessable": assessable, "with_evidence": with_evidence}
        baseline = self.config.settings["recall_baseline"]
        if assessable and baseline["assessable"]:
            now = 100 * with_evidence / assessable
            was = 100 * int(baseline["with_evidence"]) / int(baseline["assessable"])
            if was - now > float(self.config.settings["recall_alert_points"]):
                self.recorder.alert(
                    f"recall on the official list is {now:.0f}%, more than "
                    f"{self.config.settings['recall_alert_points']} points below the {was:.0f}% baseline",
                    "check the text extractor and the rules before trusting this run",
                )

    def _candidate_fulltext(self, draft: Draft) -> FullText | None:
        """The canonical record's text status, so "no evidence" is distinct from "unreadable"."""
        for record_id in sorted(draft.records):
            return draft.records[record_id]["fulltext"]
        return None

    def _metrics_for(self, draft: Draft) -> list[MetricsLine]:
        return [
            metrics_line(draft.id, record_id, payload, self.context.date)
            for record_id, payload in sorted(draft.payloads.items())
        ]

    def _record_new_work(self, draft: Draft, canonical: RecordId, evidence: list[Evidence]) -> None:
        record = draft.records[canonical]
        doi = record["ids"].get("doi")
        self.recorder.new_works.append(
            NewWork(
                work=draft.id,
                title=record["title"],
                link=f"https://doi.org/{doi}" if doi else None,
                reasons=[(e["label"], e["excerpt"]) for e in evidence if "superseded" not in e],
            )
        )

    # --- stages 9 and 13 -------------------------------------------------------------------

    def stage_and_validate(
        self,
        works: Sequence[Work],
        candidates: Sequence[Candidate],
        metrics: Sequence[MetricsLine],
        staging: Path,
    ) -> None:
        if self.options.store.exists():
            shutil.copytree(self.options.store, staging, dirs_exist_ok=True)
        staged = StorePaths(staging)
        keep = {work["id"] for work in works}
        for path in staged.works.glob("W-??????.json"):
            if path.stem not in keep:
                path.unlink()
        for work in works:
            io.write_json(staged.work_file(work["id"]), work)
        io.write_jsonl(staged.candidates, io.sort_candidates(list(candidates)))
        io.write_jsonl(staged.entries, io.sort_entries([e for e in self.entries.values() if e["work"]]))
        io.write_json(staged.aliases, {"schema": 1, "aliases": dict(sorted(self.aliases.items()))})
        if metrics:
            sorted_metrics = io.sort_metrics(list(metrics))
            io.write_jsonl(staged.latest_metrics, sorted_metrics)
            monthly = staged.monthly_metrics(self.context.year_month)
            if not monthly.exists():
                io.write_jsonl(monthly, sorted_metrics)

        report = validate_store(staging, overrides_path=_overrides_path(self.config))
        if not report.ok:
            raise RunFailureError(
                "the new store does not validate, so nothing was written:\n  "
                + "\n  ".join(report.errors[:20])
            )
        self.recorder.counts = dict(report.counts)
        self.check_fixtures(staging)

    def check_fixtures(self, staging: Path) -> None:
        """The second half of the gate: the Phase 1 §12 papers must still behave (§12.2).

        This runs on the staged store, before anything is written, because a rule change that
        breaks a settled case should stop the run rather than be committed and reported.
        """
        results = evaluate(self.config.fixtures, read_store(staging))
        self.recorder.fixtures = {result.id: result.outcome for result in results}
        self.recorder.fixture_detail = [result.line() for result in results]
        self.recorder.good_news = [
            f"{result.id} was a known miss and now passes — {result.detail}"
            for result in results
            if result.good_news
        ]
        regressions = [result for result in results if result.regressed]
        if regressions:
            raise RunFailureError(
                "test papers regressed, so nothing was written:\n  "
                + "\n  ".join(result.line() for result in regressions)
            )

    def assess_run_quality(self) -> None:
        """The §9 checks that need the previous runs: trends, and a source failing repeatedly."""
        runs = self.snapshot.runs if self.snapshot else []
        if runs:
            channel_counts = {
                name: {"nominated": run["nominated"]} for name, run in self.recorder.channels.items()
            }
            self.recorder.trends = [
                *trends(self.recorder.rules, trailing_average(runs, "rules", "works"), "works"),
                *trends(channel_counts, trailing_average(runs, "channels", "nominated"), "nominated"),
            ]
        self._alert_on_repeated_degradation(runs)

    def _alert_on_repeated_degradation(self, runs: Sequence[Any]) -> None:
        """A source that has failed in three runs running needs a person, not another retry (§9).

        The `source` field comes from a controlled vocabulary precisely so that the same failure
        can be recognised across manifests.
        """
        limit = int(self.config.settings["degraded_to_alert_after"])
        if limit < MIN_RUNS_FOR_ALERT:
            return
        previous = sorted(runs, key=lambda run: str(run["run_id"]))[-(limit - 1) :]
        if len(previous) < limit - 1:
            return
        seen: set[str] = set()
        for degradation in self.recorder.degradations:
            source = degradation["source"]
            if source in seen:
                continue
            seen.add(source)
            if all(any(d["source"] == source for d in run["degradations"]) for run in previous):
                self.recorder.alert(
                    f"{source} has now failed in {limit} runs in a row",
                    "check the source: nothing has been removed, but its data is going stale",
                )

    def publish(self, staging: Path) -> None:
        """Stage 13: only work files that left are deleted; everything else is carried forward."""
        target = self.paths
        target.works.mkdir(parents=True, exist_ok=True)
        staged = StorePaths(staging)
        keep = {p.stem for p in staged.works.glob("W-??????.json")}
        for path in target.works.glob("W-??????.json"):
            if path.stem not in keep:
                path.unlink()
        for path in sorted(staging.rglob("*")):
            if path.is_dir():
                continue
            destination = target.root / path.relative_to(staging)
            destination.parent.mkdir(parents=True, exist_ok=True)
            io.write_bytes_atomic(destination, path.read_bytes())

    def commit(self) -> None:
        """The run's one bot commit (docs/03 §2 P3, C3). The update workflow pushes it.

        A store outside a git repository — every scratch store — is simply not committed. A
        commit that fails is an alert rather than a failure: the data is already written, and
        what needs a person is the repository, not the run.
        """
        store = self.options.store
        if not self.options.commits or not git.is_repository(store):
            return
        try:
            self.recorder.commit = git.commit([store], self.recorder.commit_message(), store)
        except subprocess.CalledProcessError as exc:
            self.recorder.alert(
                f"the data was written but could not be committed: {scrub(str(exc))}",
                "commit store/ by hand, then check the repository's state",
            )


def _openalex_order(work: Mapping[str, Any]) -> tuple[int, str]:
    """A total order over OpenAlex works: the numeric id, which is stable across runs."""
    identifier = str(ids_from_openalex(work).get("openalex") or "")
    digits = "".join(character for character in identifier if character.isdigit())
    return (int(digits) if digits else 0, identifier)


def _preferred(works: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    """The one record to use when a DOI or PMID resolves to more than one OpenAlex work.

    Any stable rule would do; the lowest id is the record OpenAlex minted first. What matters is
    that it is the same one every run — the API returns duplicates in no fixed order.
    """
    return min(works, key=_openalex_order) if works else None


def _overrides_path(config: Config) -> Path | None:
    """The overrides the run actually loaded, so the gate validates against the same file."""
    if config.overrides_path is not None:
        return config.overrides_path
    path = project_root() / "overrides.yaml"
    return path if path.exists() else None


def run_pipeline(config: Config, client: HttpClient, context: RunContext, options: RunOptions) -> RunResult:
    started = time.monotonic()
    pipeline = Pipeline(config, client, context, options)
    recorder = pipeline.recorder
    written = False
    staging = options.store.parent / f".staging-{context.run_id}"
    try:
        pipeline.precheck()
        pipeline.official_list()
        nominations = pipeline.discover()
        pipeline.resolve([*pipeline.list_nominations, *nominations])
        pipeline.refresh_stored_records()
        pipeline.attach_official_list()
        pipeline.fetch_text()
        pipeline.apply_rules()
        pipeline.link_versions()
        works, candidates, metrics = pipeline.decide_status()
        pipeline.measure_recall(works)
        pipeline.assess_run_quality()
        pipeline.stage_and_validate(works, candidates, metrics, staging)
        kb_stage.generate(works)  # Phase 4
        export_stage.write(works)  # Phase 5
        if not options.dry_run:
            pipeline.publish(staging)
            written = True
    except RunFailureError as exc:
        recorder.failure = str(exc)
    except HttpError as exc:
        recorder.failure = f"unrecoverable source error: {exc}"
    except Exception as exc:  # §9: nothing is written, and the report says what happened
        recorder.failure = f"unexpected error in {type(exc).__name__}: {scrub(str(exc))}"
        recorder.note("".join(traceback.format_exc()).splitlines()[-1])
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)

    duration = time.monotonic() - started
    spend = client.budget.spent_usd
    report = recorder.markdown(duration_seconds=duration, spend_usd=spend)
    status = "failed" if recorder.failure else recorder.status
    if written:
        api = {
            host: cast(Any, {"calls": use.calls, "cost_usd": use.cost_usd})
            for host, use in client.usage.items()
        }
        manifest = recorder.manifest(context.timestamp(dt.datetime.now(tz=dt.UTC)), api)
        io.write_json(pipeline.paths.run_manifest(context.run_id), manifest)
        io.write_text_atomic(pipeline.paths.run_report(context.run_id), report)
        pipeline.commit()  # last, so the manifest and the report are in the same commit
        status = recorder.status  # a commit that failed raises an alert
    if options.summary_out:
        io.write_text_atomic(options.summary_out, report)
    return RunResult(
        status=status,
        run_id=context.run_id,
        report=report,
        written=written,
        commit=recorder.commit,
        errors=[recorder.failure] if recorder.failure else [],
    )
