"""Everything the store knows about one work (docs/03-retrieval-pipeline.md §8).

`uwpr-pubs explain` answers "why is this paper listed?" and, just as often, "why isn't it?". With
no human review, this is how a person checks a decision the pipeline made on its own, so it shows
the evidence and its excerpts, the channels that found the work, and — for a work that is not
included — the reason and the near-misses that deliberately did not count (docs/02 §6).

It answers "which grants does this paper list, and how?" too (docs/09 §9.6). An included work's
Funding section shows each string its sources write, what it was decided to be and by which
method, its NIH links and its grants; and `explain <grant key>` shows one grant's facts, amount
and flags, and every work that lists it, with how.

Pure: a snapshot and an identifier in, lines of text out.
"""

import re
from collections.abc import Iterable

from uwpr_pubs.funding.report import amount_text, reporter_candidates
from uwpr_pubs.store.ids import normalise_doi, retired_key
from uwpr_pubs.store.models import Candidate, Evidence, Grant, Record, Work, WorkId
from uwpr_pubs.store.read import FundingSnapshot, StoreSnapshot

# docs/09 §8.2's grant key, in any case: `NIH:R01GM086688`, `NIH-contract:HHSN272201700059C`,
# `USA:NASA:NNX14AJ87G`. No work ID, DOI, PMID or OpenAlex ID looks like one.
GRANT_KEY = re.compile(r"^[A-Z][A-Z0-9-]*(?::[A-Z0-9]+){1,2}$", re.IGNORECASE)
NO_FUNDING = "Funding: this store has no funding/ yet, so nothing is known of its grants."


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


# --- funding (docs/09 §9.6) ------------------------------------------------------------------------


def _funding(funding: FundingSnapshot, work: WorkId, ics: frozenset[str]) -> list[str]:
    """An included work's Funding section: its strings, its NIH links and its grants."""
    if not funding.present:
        return ["", NO_FUNDING]
    line = funding.citations.get(work)
    if line is None:
        return ["", "Funding: none recorded. Its sources list no grant, or the stage has not decided it yet."]
    lines = [
        "",
        f"Funding (funding_version {line['funding_version']})",
        f"  Strings ({len(line['strings'])})",
    ]
    for string in line["strings"]:
        decided = string["outcome"] + (f", {string['method']}" if string["method"] else "")
        grants = f" → {', '.join(string['grants'])}" if string["grants"] else ""
        lines.append(f'    "{string["raw"]}"  {decided}{grants}')
        lines.append(
            f"        from {', '.join(string['sources'])}; funders: {'; '.join(string['funders']) or 'none'}"
        )
        if string["note"]:
            lines.append(f"        {string['note']}")
        candidates = (
            reporter_candidates(string["raw"], work, funding, ics)
            if string["outcome"] == "unresolved"
            else None
        )
        if candidates is not None:
            lines.append(f"        nearest in RePORTER: {', '.join(candidates) or 'none the stage knows of'}")
        lines.append(f"        first seen {string['first_seen']}, last seen {string['last_seen']}")
    if line["nih_links"]:
        lines.append(f"  NIH links ({len(line['nih_links'])})")
        for link in line["nih_links"]:
            seen = f"first seen {link['first_seen']}, last seen {link['last_seen']}"
            lines.append(f"    {link['core']} → {link['grant']}  ({seen})")
    lines.append(f"  Grants ({len(line['grants'])})")
    for key in line["grants"]:
        grant = funding.grants.get(key)
        held = (
            f"{grant['agency']}, {grant['category']}, {amount_text(grant)}"
            if grant
            else "not in grants.jsonl"
        )
        lines.append(f"    {key}  {held}")
    return lines


def _grant_facts(grant: Grant) -> list[str]:
    facts = grant["facts"]
    lines: list[str] = []
    reporter = facts.get("reporter")
    if reporter:
        years = ", ".join(
            f"{year} {'no amount' if amount is None else f'${amount:,}'}"
            for year, amount in sorted(reporter["fiscal_years"].items())
        )
        lines.append(f"  RePORTER fiscal years: {years or 'none'}")
        types = ", ".join(reporter["application_types"]) or "none"
        lines.append(
            f"      application types {types}; first support year {reporter['first_support_year']};"
            f" latest application {reporter['latest_appl_id']}"
        )
    nsf = facts.get("nsf")
    if nsf:
        lines.append(
            f"  NSF: estimated {nsf['estimated']}, obligated {nsf['obligated']}, expires {nsf['exp_date']},"
            f" programme {nsf['program']}, type {nsf.get('type')}"
        )
    usaspending = facts.get("usaspending")
    if usaspending:
        period = f"{usaspending['pop_start']} to {usaspending['pop_end']}"
        lines.append(
            f"  USAspending {usaspending['generated_id']}: total obligation"
            f" {usaspending['total_obligation']}, type {usaspending['type']}, {period}"
        )
    for award in facts.get("openalex", []):
        lines.append(
            f"  OpenAlex award {award['id']}: {award['amount']} {award['currency']}, provenance"
            f" {award['provenance']}, start year {award['start_year']}"
        )
    return lines


def _grant(snapshot: StoreSnapshot, grant: Grant, ics: frozenset[str]) -> list[str]:
    """`explain <grant key>`: the grant, and every work that lists it, with how."""
    funding = snapshot.funding
    key = grant["key"]
    agency = funding.agencies.get(grant["agency"])
    named = f"{grant['agency']} ({agency['name']})" if agency else grant["agency"]
    parent = f", under {agency['parent']}" if agency and agency["parent"] else ""
    lines = [
        f"{key} — {grant['status'].upper()}, {named}{parent}",
        f"number {grant['number']}"
        + (f", activity {grant['activity']}" if grant["activity"] else "")
        + f", category {grant['category']}, family {grant['family']}",
        f"scope: {grant['scope']}" + (f" ({grant['scope_reason']})" if grant["scope_reason"] else ""),
    ]
    if grant["title"]:
        lines.append(f"title: {grant['title']}")
    people = ", ".join(p["name"] + (f" ({p['id']})" if p["id"] else "") for p in grant["pis"])
    lines.append(f"investigators: {people or 'none recorded'}; organisation: {grant['organization']}")
    lines.append(f"start {grant['start']}, end {grant['end']}")
    amount = grant["amount"]
    if amount is None:
        lines.append("amount: none known")
    else:
        rate = (
            f" at {amount['rate']} ({amount['rate_year']})"
            if amount["rate"] and amount["currency"] != "USD"
            else ""
        )
        lines.append(
            f"amount: {amount_text(grant)} — {amount['original']} {amount['currency']}{rate},"
            f" basis {amount['basis']}, from {amount['source']}"
        )
    lines.append(f"flags: {', '.join(grant['flags']) or 'none'}")
    lines += _grant_facts(grant)
    lines.append(f"first seen {grant['first_seen']}, checked {grant['checked']}")
    listing = [line for line in funding.citations.values() if key in line["grants"]]
    lines += ["", f"Listed by {len(listing)} work(s)"]
    for line in listing:
        lines.append(f"  {line['work']}")
        for string in line["strings"]:
            if key in string["grants"]:
                sources = ", ".join(string["sources"])
                lines.append(f'      as "{string["raw"]}" ({string["method"]}; from {sources})')
                if string["note"]:
                    lines.append(f"          {string['note']}")
                candidates = reporter_candidates(string["raw"], line["work"], funding, ics)
                if grant["status"] == "unresolved" and candidates is not None:
                    lines.append(
                        f"          nearest in RePORTER: {', '.join(candidates) or 'none the stage knows of'}"
                    )
        lines += [f"      NIH link {link['core']}" for link in line["nih_links"] if link["grant"] == key]
    return lines


def explain_grant(
    snapshot: StoreSnapshot, identifier: str, ics: frozenset[str] = frozenset()
) -> tuple[bool, str]:
    """(found, text) for a grant key, in any case."""
    wanted = identifier.strip()
    if not snapshot.funding.present:
        return False, f"{wanted}: {NO_FUNDING}"
    keys = {key.casefold(): key for key in snapshot.funding.grants}
    key = keys.get(wanted.casefold())
    if key is None:
        return False, f"{wanted}: no grant with this key in the store. No work lists it."
    return True, "\n".join(_grant(snapshot, snapshot.funding.grants[key], ics))


def explain(
    snapshot: StoreSnapshot, identifier: str, *, ics: frozenset[str] = frozenset()
) -> tuple[bool, str]:
    """(found, text). Not found is a real answer: nothing has ever nominated this paper.

    `ics` are NIH's institute codes (`config/funding.yaml`), which let an unresolved NIH-format
    string show the nearest cores RePORTER holds; without them, those lines are left out.
    """
    work_id = resolve(snapshot, identifier)
    if work_id is None and GRANT_KEY.match(identifier.strip()):
        return explain_grant(snapshot, identifier, ics)
    if work_id is None:
        return False, f"{identifier}: nothing in the store. No channel has ever nominated it."

    header = []
    if work_id != identifier.strip() and identifier.strip().startswith("W-"):
        header = [f"{identifier.strip()} was merged into {work_id}.", ""]

    work = snapshot.works.get(work_id)
    if work is not None:
        return True, "\n".join([*header, *_included(work), *_funding(snapshot.funding, work_id, ics)])
    line = next((entry for entry in snapshot.candidates if entry["id"] == work_id), None)
    if line is not None:
        return True, "\n".join([*header, *_not_included(line)])
    return False, f"{identifier}: resolves to {work_id}, which is in neither works/ nor candidates"
