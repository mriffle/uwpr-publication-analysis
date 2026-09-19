"""The stage machine (docs/03-retrieval-pipeline.md §5).

This milestone runs stages 0-3, 5 (R1 and the R2 metadata arm), 7, 8, 9, 12 and 13. Text, the
remaining rules, version linking and the commit step arrive with later milestones; the stage
order and the gate are already the final ones.

Nothing reaches the real store until stage 9 has validated a complete copy of it.
"""

import datetime as dt
import shutil
import time
import traceback
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from uwpr_pubs import git
from uwpr_pubs.channels import IDENTIFIER_CHANNELS, ChannelRunner, Nomination
from uwpr_pubs.config import Config
from uwpr_pubs.context import RunContext
from uwpr_pubs.evidence import MergeContext, merge_evidence
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
    ids_from_openalex,
    kind_of,
    record_from_list_entry,
    record_from_openalex,
    to_candidate_record,
    year_from_text,
)
from uwpr_pubs.report import NewWork, RunRecorder, adapter_source, channel_source, stage_source
from uwpr_pubs.rules.r1 import official_list_evidence
from uwpr_pubs.rules.r2 import award_code_in_metadata
from uwpr_pubs.runtime import api_keys
from uwpr_pubs.schemas import project_root
from uwpr_pubs.secrets import scrub
from uwpr_pubs.sources.crossref import Crossref
from uwpr_pubs.sources.europepmc import EuropePmc
from uwpr_pubs.sources.openalex import OpenAlex
from uwpr_pubs.sources.uwpr_site import UwprSite
from uwpr_pubs.stages import export as export_stage
from uwpr_pubs.stages import kb as kb_stage
from uwpr_pubs.status import Status, StatusInput, decide
from uwpr_pubs.store import io
from uwpr_pubs.store.ids import Minter, external_keys, mint_order
from uwpr_pubs.store.models import (
    Candidate,
    CandidateRecord,
    ChannelRun,
    Discovery,
    Evidence,
    Ids,
    IncludedKind,
    ListEntry,
    MetricsLine,
    Record,
    RecordId,
    Work,
    WorkId,
)
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import StoreSnapshot, read_store
from uwpr_pubs.validate import validate_store

CODE_VERSION = "m2"
INCLUDED_RECORD_KINDS: frozenset[str] = frozenset(IncludedKind.__args__)  # type: ignore[attr-defined]


class RunFailureError(Exception):
    """A condition that stops the run before anything is written (§9)."""


@dataclass
class RunOptions:
    store: Path
    mode: Mode = Mode.LIVE
    dry_run: bool = False
    channels: tuple[str, ...] = IDENTIFIER_CHANNELS
    summary_out: Path | None = None
    check_clean: bool = True


@dataclass
class RunResult:
    status: str
    run_id: str
    report: str
    written: bool
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
    created: str = ""
    since: str | None = None
    first_seen: str = ""
    on_official_list: bool = False
    is_new: bool = False

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
        self.openalex = OpenAlex(client, config.contact, api_keys()[0])
        self.crossref = Crossref(client, config.contact)
        self.europepmc = EuropePmc(client, config.contact)
        self.drafts: dict[WorkId, Draft] = {}
        self.aliases: dict[str, WorkId] = {}
        self.entries: dict[str, ListEntry] = {}
        self.entry_pages: dict[str, str] = {}
        self.snapshot: StoreSnapshot | None = None
        self.minter = Minter()
        self.list_nominations: list[Nomination] = []

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
        runner = ChannelRunner(self.config, self.openalex, self.crossref, self.europepmc)
        nominations: list[Nomination] = []
        for result in runner.run(self.options.channels):
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
            nominations.extend(result.nominations)
        return nominations

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
            payload = next((n.payload for n in group if n.source == "openalex"), None)
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
        for work in fetched:
            for identity in external_keys(ids_from_openalex(work)):
                payloads.setdefault(identity, work)
        return payloads

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
            record["fulltext"] = draft.records[existing]["fulltext"]  # M3 owns the text
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
            source_url=f"https://api.openalex.org/works/{payload.get('id', '').rsplit('/', 1)[-1]}",
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

    # --- stages 7 and 8 --------------------------------------------------------------------

    def decide_status(self) -> tuple[list[Work], list[Candidate], list[MetricsLine]]:
        overrides = {
            str(o["target"]): str(o["action"]) for o in self.config.overrides if isinstance(o["target"], str)
        }
        merge_context = MergeContext(
            rule_version=self.config.rule_version,
            today=self.context.date,
            refresh_days=int(self.config.settings["last_seen_refresh_days"]),
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
            "records": [
                to_candidate_record(record, draft.kinds.get(record["id"]))
                for record in io.sort_records(list(draft.records.values()))
            ]
            or draft.candidate_records,
            "reason": status.reason or "no_rule_fired",
            "signals": [],
            "channels": sorted({channel for channel, _ in draft.discovery}),
            "fulltext": None,
            "rule_version": self.config.rule_version,
            "first_seen": draft.first_seen or self.context.date,
            "last_seen": self.context.date,
        }
        if status.reason_detail:
            line["reason_detail"] = status.reason_detail
        if status.keeps_former_evidence and evidence:
            line["former_evidence"] = io.sort_evidence(evidence)
        return cast(Candidate, line)

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


def _overrides_path(config: Config) -> Path | None:
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
        works, candidates, metrics = pipeline.decide_status()
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
    if options.summary_out:
        io.write_text_atomic(options.summary_out, report)
    return RunResult(
        status=status,
        run_id=context.run_id,
        report=report,
        written=written,
        errors=[recorder.failure] if recorder.failure else [],
    )
