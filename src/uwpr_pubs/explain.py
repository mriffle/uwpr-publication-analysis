"""Everything the store knows about one work (docs/03-retrieval-pipeline.md §8).

`uwpr-pubs explain` answers "why is this paper listed?" and, just as often, "why isn't it?". With
no human review, this is how a person checks a decision the pipeline made on its own, so it shows
the evidence and its excerpts, the channels that found the work, and — for a work that is not
included — the reason and the near-misses that deliberately did not count (docs/02 §6).

Pure: a snapshot and an identifier in, lines of text out.
"""

from collections.abc import Iterable

from uwpr_pubs.store.ids import normalise_doi, retired_key
from uwpr_pubs.store.models import Candidate, Evidence, Record, Work, WorkId
from uwpr_pubs.store.read import StoreSnapshot


def resolve(snapshot: StoreSnapshot, identifier: str) -> WorkId | None:
    """A work ID, a prefixed alias key, or a bare DOI, PMID, PMCID or OpenAlex ID."""
    wanted = identifier.strip()
    if wanted in snapshot.works or any(line["id"] == wanted for line in snapshot.candidates):
        return wanted
    keys = [wanted, retired_key(wanted)] if wanted.startswith("W-") else [wanted]
    keys += [
        f"doi:{normalise_doi(wanted)}",
        f"pmid:{wanted}",
        f"pmcid:{wanted}",
        f"openalex:{wanted}",
        f"pride:{wanted}",
    ]
    for key in keys:
        found = snapshot.aliases.get(key)
        if found:
            return found
    return None


def _record_lines(records: Iterable[Record]) -> list[str]:
    lines: list[str] = []
    for record in records:
        ids = record["ids"]
        named = " ".join(
            f"{name}:{value}"
            for name, value in sorted(ids.items())
            if value and name in ("doi", "pmid", "pmcid", "openalex")
        )
        lines.append(f"  {record['id']}  {record['kind']:<13} {record['year']}  {record['title']}")
        lines.append(f"      {named}")
        link = record["version_link"]
        if link:
            lines.append(f"      version of {link['to']} (linked by {link['method']})")
        text = record["fulltext"]
        lines.append(f"      text: {text['status']} (checked {text['checked']})")
    return lines


def _evidence_lines(evidence: Iterable[Evidence]) -> list[str]:
    lines: list[str] = []
    for entry in sorted(evidence, key=lambda e: (e["rule"], e["record"] or "", e["section"])):
        mark = " [superseded]" if "superseded" in entry else ""
        where = entry["record"] or "the whole work"
        lines.append(f"  {entry['rule']:<9} {entry['label']}{mark}")
        lines.append(f"      on {where}, in {entry['section']}, from {entry['source']['name']}")
        if entry["excerpt"]:
            lines.append(f'      "{entry["excerpt"]}"')
        if entry["source"]["url"]:
            lines.append(f"      {entry['source']['url']}")
        lines.append(f"      first seen {entry['first_seen']}, last seen {entry['last_seen']}")
    return lines


def _included(work: Work) -> list[str]:
    status = work["status"]
    lines = [
        f"{work['id']} — INCLUDED since {status['since']} (basis: {status['basis']})",
        f"canonical record: {work['canonical']}   rules {work['rule_version']}",
    ]
    if work["aliases"]:
        lines.append(f"merged from: {', '.join(work['aliases'])}")
    lines += ["", f"Records ({len(work['records'])})", *_record_lines(work["records"])]
    lines += ["", f"Evidence ({len(work['evidence'])})", *_evidence_lines(work["evidence"])]
    channels = sorted({entry["channel"] for entry in work["discovery"]})
    lines += ["", f"Found by channels: {', '.join(channels) or 'none'}"]
    return lines


def _not_included(line: Candidate) -> list[str]:
    detail = line.get("reason_detail")
    lines = [
        f"{line['id']} — NOT INCLUDED: {line['reason']}" + (f" ({detail})" if detail else ""),
        f"first seen {line['first_seen']}, last seen {line['last_seen']}, rules {line['rule_version']}",
        "",
        f"Records ({len(line['records'])})",
    ]
    for record in line["records"]:
        ids = " ".join(f"{k}:{v}" for k, v in sorted(record["ids"].items()) if v and k != "pride")
        lines.append(f"  {record['id']}  {record['kind']:<13} {record['year']}  {record['title']}")
        lines.append(f"      {ids}")
    text = line["fulltext"]
    if text:
        lines.append(f"      text: {text['status']} (checked {text['checked']})")
    lines += ["", f"Found by channels: {', '.join(line['channels']) or 'none'}"]
    if line["signals"]:
        # These are the near-misses Phase 1 decided are never enough on their own, so they are
        # exactly what someone asking "but surely this one counts?" needs to see.
        lines += ["", "Signals that deliberately do not count (docs/02 §6):"]
        lines += [f"  {signal}" for signal in line["signals"]]
    former = line.get("former_evidence")
    if former:
        lines += ["", f"Evidence it once had ({len(former)})", *_evidence_lines(former)]
    return lines


def explain(snapshot: StoreSnapshot, identifier: str) -> tuple[bool, str]:
    """(found, text). Not found is a real answer: nothing has ever nominated this paper."""
    work_id = resolve(snapshot, identifier)
    if work_id is None:
        return False, f"{identifier}: nothing in the store. No channel has ever nominated it."

    header = []
    if work_id != identifier.strip() and identifier.strip().startswith("W-"):
        header = [f"{identifier.strip()} was merged into {work_id}.", ""]

    work = snapshot.works.get(work_id)
    if work is not None:
        return True, "\n".join([*header, *_included(work)])
    line = next((entry for entry in snapshot.candidates if entry["id"] == work_id), None)
    if line is not None:
        return True, "\n".join([*header, *_not_included(line)])
    return False, f"{identifier}: resolves to {work_id}, which is in neither works/ nor candidates"
