"""The run report's Funding section, and the total-drop alert's arithmetic (docs/09 §9.5, §9.6).

The section is written for the person who reads the weekly report: what the stage did, what the
grants now come to and how that moved, and — the part that needs a person — every new string
nothing resolved, with what RePORTER might have meant; the grant overrides that did not apply;
and the new entries on three review lists: OpenAlex disagreeing with an agency by more than 1%
(§7.1), an untagged award of $20M or more outside NIH's centre mechanisms (§6.15), and a grant
seen only beside another of its agency on the same works (§6.10). An entry stays on a review
list for as long as it qualifies, but it is *listed* only by the run that first finds it; later
runs count it, so a week with nothing new says so in one line rather than repeating itself.

Pure: the store's funding before the run, the stage's after it, the rules and the overrides in;
Markdown lines out.
"""

import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from uwpr_pubs.funding.amounts import openalex_amount
from uwpr_pubs.funding.classify import FundingRules
from uwpr_pubs.funding.currency import Rates
from uwpr_pubs.funding.numbers import clean, near_miss, parse_nih
from uwpr_pubs.funding.overrides import grant_overrides, override_match_key
from uwpr_pubs.funding.resolve import string_key
from uwpr_pubs.report import adapter_source, stage_source
from uwpr_pubs.store.ids import retired_key
from uwpr_pubs.store.models import (
    Date,
    Degradation,
    FundingMode,
    FundingString,
    Grant,
    GrantKey,
    Override,
    WorkId,
)
from uwpr_pubs.store.read import FundingSnapshot

MAX_LISTED = 50  # as the report's other lists
MAX_CANDIDATES = 5
MAX_WORKS_SHOWN = 3
EXCLUDED = (
    ("not_a_grant", "not grants"),
    ("resource_code", "the resource code"),
    ("facility_contract", "facility contracts"),
)
MODES: Mapping[FundingMode, str] = {
    "full": "full refresh",
    "incremental": "incremental",
    "deferred": "incremental: a full refresh is due, and waits for RePORTER's window",
    "skipped": "skipped",
}
# Only agencies whose numbers OpenAlex alone values: NIH's, NSF's and USAspending's are confirmed
# by the agency's own records, so two of them are two grants (§6.10).
BESIDE_FAMILIES = frozenset({"agency", "openalex_funder"})
# The degradations that silence the total-drop alert: funding's own — the stage's, and a source's
# whose cause the stage marked `funding:` (§9.5).
SOURCE_DEGRADATION = adapter_source("")
STAGE_DEGRADATION = stage_source("funding")
FUNDING_CAUSE = "funding:"  # how the funding stage begins a degradation's cause (stages/funding.py)
_CORE = re.compile(r"^([A-Z][A-Z0-9]{2})([A-Z]{2})([0-9]{6})$")


def usd(amount: int) -> str:
    return f"-${-amount:,}" if amount < 0 else f"${amount:,}"


def total_usd(funding: FundingSnapshot) -> int:
    """Every known US-dollar amount, as the manifest's `amount_usd` counts it."""
    known = (g["amount"]["usd"] for g in funding.grants.values() if g["amount"] is not None)
    return max(0, sum(amount for amount in known if amount is not None))


def drop_alert(
    runs: Iterable[Mapping[str, Any]],
    now: Mapping[str, Any] | None,
    degradations: Iterable[Degradation],
    threshold: float,
) -> str | None:
    """§9.5's alert, or None: the total fell by more than `threshold` since the last run.

    `now` is this run's manifest funding fields. The comparison is with the last manifest that
    records a funding `mode`, and only in a run where **funding** did not degrade (§9.5): neither
    the stage nor a source it asked, which the stage marks by the `funding:` its causes begin
    with. A stored grant is never dropped because a source is down (§9.4), so a fall in such a run
    could be either. A source that failed for discovery alone (bioRxiv, or OpenAlex's search) says
    nothing about funding, and silencing the alert for it would lose a real fall for good: the
    next run compares with this run's already lower total.
    """
    amount = (now or {}).get("amount_usd")
    degraded = any(
        item["source"] == STAGE_DEGRADATION
        or (item["source"].startswith(SOURCE_DEGRADATION) and item["cause"].startswith(FUNDING_CAUSE))
        for item in degradations
    )
    if amount is None or degraded:
        return None
    decided = [run for run in runs if (run.get("funding") or {}).get("mode")]
    if not decided:
        return None
    last = max(decided, key=lambda run: str(run["run_id"]))
    before = last["funding"].get("amount_usd")
    fallen = total_drop(before, amount, threshold) if isinstance(before, int) else None
    if fallen is None:
        return None
    return f"the funding total fell {fallen:.1%} since {last['run_id']}, from {usd(before)} to {usd(amount)}"


def total_drop(before: int, now: int, threshold: float) -> Decimal | None:
    """The share the total fell by, when that is more than `threshold`; else None (§9.5).

    Exact: the amounts are integers and the threshold is read as the decimal it is written as,
    so a fall of exactly 5% against a threshold of 0.05 is not more than it.
    """
    if before <= 0 or now >= before:
        return None
    fallen = Decimal(before - now) / Decimal(before)
    return fallen if fallen > Decimal(str(threshold)) else None


def _works(keys: Iterable[WorkId]) -> str:
    listed = sorted(set(keys))
    shown = ", ".join(listed[:MAX_WORKS_SHOWN])
    more = len(listed) - MAX_WORKS_SHOWN
    return f"{shown} and {more} more" if more > 0 else shown


def amount_text(grant: Grant) -> str:
    amount = grant["amount"]
    if amount is None:
        return "no amount"
    if amount["usd"] is None:
        return f"{amount['original']} {amount['currency']}, not converted"
    return usd(amount["usd"])


def _capped(lines: Sequence[str], noun: str) -> list[str]:
    """The first MAX_LISTED entries, each with its indented lines, and how many more there are."""
    entries = [i for i, line in enumerate(lines) if not line.startswith(" ")]
    if len(entries) <= MAX_LISTED:
        return list(lines)
    extra = len(entries) - MAX_LISTED
    return [*lines[: entries[MAX_LISTED]], f"- …and {extra} more {noun}"]


def listed_by(funding: FundingSnapshot) -> dict[GrantKey, set[WorkId]]:
    """The works that list each grant."""
    works: dict[GrantKey, set[WorkId]] = {}
    for line in funding.citations.values():
        for key in line["grants"]:
            works.setdefault(key, set()).add(line["work"])
    return works


# --- what RePORTER might have meant (§6.11) -------------------------------------------------------


def reporter_candidates(
    raw: str, work: WorkId, funding: FundingSnapshot, ics: frozenset[str]
) -> list[str] | None:
    """For an NIH-format string, the nearest cores the stage already knows; None for any other.

    Three things know a core: RePORTER's answer to an institute-and-serial probe (`split:` in
    `lookups.jsonl`), the cores NIH links to this work, and the grants the store holds. A core
    counts when its institute is the string's and its serial is the string's, or one edit from
    the digits written (§6.5's near-miss). Nothing is asked of RePORTER here.
    """
    numbers = parse_nih(clean(raw), ics)
    if not numbers:
        return None
    line = funding.citations.get(work)
    linked = {link["core"] for link in line["nih_links"]} if line else set()
    held = {
        core
        for key, grant in funding.grants.items()
        if "reporter" in grant["facts"] and _CORE.match(core := key.partition(":")[2])
    }
    found: dict[str, str] = {}
    for number in numbers:
        for serial in number.serials:
            lookup = funding.lookups.get(("reporter", f"split:{number.ic}:{serial}"))
            for core in lookup["found"] if lookup else ():
                found.setdefault(core, f"RePORTER holds it under {number.ic} {serial}")
        for core in sorted(linked | held):
            parts = _CORE.match(core)
            if parts is None or parts.group(2) != number.ic or core in found:
                continue
            if parts.group(3) in number.serials:
                why = "the same institute and serial"
            elif near_miss(number.written, parts.group(3)):
                why = "one edit from the digits written"
            else:
                continue
            where = "NIH links this paper to it" if core in linked else "the store holds it"
            found[core] = f"{why}; {where}"
    return [f"{core} ({how})" for core, how in sorted(found.items())][:MAX_CANDIDATES]


# --- the review lists ---------------------------------------------------------------------------


def disagreements(funding: FundingSnapshot) -> dict[GrantKey, Grant]:
    """Grants whose agency and OpenAlex amounts differ by more than 1% (§7.1)."""
    return {key: g for key, g in funding.grants.items() if "amounts_disagree" in g["flags"]}


def large_untagged(funding: FundingSnapshot, rules: FundingRules) -> dict[GrantKey, Grant]:
    """Project-scoped grants of `large_award_review_usd` or more, NIH's centre grants apart (§6.15)."""
    return {
        key: grant
        for key, grant in funding.grants.items()
        if grant["scope"] == "project"
        and grant["amount"] is not None
        and (grant["amount"]["usd"] or 0) >= rules.large_award_review_usd
        and not (grant["family"] == "reporter" and grant["category"] == "center")
    }


def only_beside(funding: FundingSnapshot) -> dict[tuple[GrantKey, GrantKey], set[WorkId]]:
    """(grant, other) of one agency, where every work listing the grant lists the other (§6.10).

    What no rule merges — one grant under a second identifier — shows as this. Two grants
    always seen together are one entry, named in key order.
    """
    works = listed_by(funding)
    by_agency: dict[str, list[GrantKey]] = {}
    for key, grant in funding.grants.items():
        if grant["family"] in BESIDE_FAMILIES:
            by_agency.setdefault(grant["agency"], []).append(key)
    found: dict[tuple[GrantKey, GrantKey], set[WorkId]] = {}
    for keys in by_agency.values():
        for one in sorted(keys):
            for other in sorted(keys):
                mine, theirs = works.get(one, set()), works.get(other, set())
                if one == other or not mine or not mine <= theirs:
                    continue
                if mine == theirs and other < one:
                    continue  # the same pair, already named the other way round
                found[(one, other)] = mine
    return found


# --- the section ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class Review:
    title: str
    noun: str  # "and N more <noun>", and the count of those still listed from earlier runs
    now: Mapping[GrantKey, Grant]
    then: Mapping[GrantKey, Grant]
    row: Callable[[Grant], str]


@dataclass(frozen=True)
class FundingReport:
    """What the section is written from: the stage's result beside the store it started from."""

    mode: FundingMode
    version: str
    before: FundingSnapshot  # the store's funding, as the last run left it
    after: FundingSnapshot
    rules: FundingRules
    rates: Rates
    overrides: Sequence[Override] = ()
    aliases: Mapping[str, WorkId] = field(default_factory=dict)
    requests: Mapping[str, int] = field(default_factory=dict)
    refreshed: Date | None = None  # the last full refresh

    def lines(self) -> list[str]:
        return [
            *self._summary(),
            *self._reviews(),
            *self._unresolved(),
            *self._overrides(),
            *self._grants(),
        ]

    def _moved(self, work: WorkId) -> WorkId:
        """A work's ID now: one merged since is found under its survivor."""
        return self.aliases.get(retired_key(work), work)

    # --- the figures ---

    def _summary(self) -> list[str]:
        after, before = self.after, self.before
        mode = MODES[self.mode]
        if self.mode != "full" and self.refreshed:
            mode += f"; the last full refresh was {self.refreshed}"
        lines = [f"- mode: {mode}; funding_version {self.version}"]
        unresolved = sum(1 for grant in after.grants.values() if grant["status"] == "unresolved")
        grants = f"- grants: {len(after.grants)}, {unresolved} of them unresolved"
        now = total_usd(after)
        if not before.present:
            lines += [f"{grants}; the first run to decide funding", f"- total: {usd(now)}"]
        else:
            new = len(after.grants.keys() - before.grants.keys())
            lost = len(before.grants.keys() - after.grants.keys())
            lines.append(f"{grants}; {new} new, {lost} no longer listed")
            lines.append(f"- total: {usd(now)}, {self._change(total_usd(before), now)} since the last run")
        excluded = dict.fromkeys((outcome for outcome, _ in EXCLUDED), 0)
        for line in after.citations.values():
            for string in line["strings"]:
                if string["outcome"] in excluded:
                    excluded[string["outcome"]] += 1
        lines.append(f"- strings excluded: {', '.join(f'{excluded[o]} {label}' for o, label in EXCLUDED)}")
        asked = ", ".join(f"{source} {count}" for source, count in sorted(self.requests.items()) if count)
        lines.append(f"- requests: {asked or 'none'}")
        return lines

    @staticmethod
    def _change(before: int, now: int) -> str:
        if now == before:
            return "unchanged"
        share = f" ({Decimal(now - before) * 100 / before:+.1f}%)" if before else ""
        return f"{'up' if now > before else 'down'} {usd(abs(now - before))}{share}"

    def _agency(self, grant: Grant) -> str:
        """The grant's agency, and its parent where it has one: `NIGMS (NIH)`."""
        code = grant["agency"]
        agency = self.after.agencies.get(code) or self.before.agencies.get(code)
        parent = agency["parent"] if agency is not None else None
        return f"{code} ({parent})" if parent else code

    # --- what needs a person ---

    def _unresolved(self) -> list[str]:
        """§6.11: every string newly unresolved on its work, and what RePORTER might have meant."""
        known = {
            (self._moved(line["work"]), string_key(string["raw"]))
            for line in self.before.citations.values()
            for string in line["strings"]
            if string["outcome"] == "unresolved"
        }
        found: list[tuple[WorkId, FundingString]] = [
            (line["work"], string)
            for line in self.after.citations.values()
            for string in line["strings"]
            if string["outcome"] == "unresolved" and (line["work"], string_key(string["raw"])) not in known
        ]
        if not found:
            return []
        rows: list[str] = []
        for work, string in sorted(found, key=lambda item: (item[0], item[1]["raw"])):
            funders = "; ".join(string["funders"]) or "none named"
            rows.append(
                f'- {work}: "{string["raw"]}" from {", ".join(string["sources"])}; funders: {funders}'
                f" → {', '.join(string['grants'])}"
            )
            candidates = reporter_candidates(string["raw"], work, self.after, self.rules.ics)
            if candidates is not None:
                rows.append(f"  - nearest in RePORTER: {', '.join(candidates) or 'none the stage knows of'}")
            if string["note"]:
                rows.append(f"  - {string['note']}")
        hint = "Each stays in Miscellaneous until a grant override says what it is (RUNBOOK §15)."
        return ["", f"### New unresolved strings ({len(found)})", "", hint, "", *_capped(rows, "strings")]

    def _overrides(self) -> list[str]:
        """Grant overrides that decided nothing this run: the string is not seen on the work."""
        rows: list[str] = []
        for override in grant_overrides(self.overrides):
            target = override["target"]
            if "raw" not in override or not isinstance(target, str):
                continue
            line = self.after.citations.get(self._moved(target))
            wanted = override_match_key(override["raw"])
            if line is not None and any(override_match_key(s["raw"]) == wanted for s in line["strings"]):
                continue
            why = "the string is not seen on it" if line is not None else "the work has no funding line"
            rows.append(f"- {target}: '{override['raw']}' → {override.get('grant')} — {why}")
        if not rows:
            return []
        return ["", f"### Grant overrides not applied ({len(rows)})", "", *_capped(rows, "overrides")]

    def _reviews(self) -> list[str]:
        lines: list[str] = []
        standing: list[str] = []
        reviews = (
            Review(
                "OpenAlex and the agency disagree by more than 1%",
                "disagreements",
                disagreements(self.after),
                disagreements(self.before),
                self._disagreement,
            ),
            Review(
                f"Untagged awards of {usd(self.rules.large_award_review_usd)} or more",
                "large untagged awards",
                large_untagged(self.after, self.rules),
                large_untagged(self.before, self.rules),
                self._large,
            ),
        )
        for review in reviews:
            new = sorted(review.now.keys() - review.then.keys())
            if new:
                rows = [review.row(self.after.grants[key]) for key in new]
                heading = f"### {review.title} ({len(new)} new, {len(review.now)} in all)"
                lines += ["", heading, "", *_capped(rows, review.noun)]
            elif review.now:
                standing.append(f"{len(review.now)} {review.noun}")
        pairs = only_beside(self.after)
        new_pairs = sorted(pairs.keys() - only_beside(self.before).keys())
        if new_pairs:
            rows = [
                f"- {one} only beside {other}, on {_works(pairs[one, other])}" for one, other in new_pairs
            ]
            counted = f"{len(new_pairs)} new, {len(pairs)} in all"
            heading = f"### Grants seen only beside another of their agency ({counted})"
            hint = "Where the two are one grant, a grant override on each work can say so (RUNBOOK §15)."
            lines += ["", heading, "", hint, "", *_capped(rows, "pairs")]
        elif pairs:
            standing.append(f"{len(pairs)} grants seen only beside another")
        if standing:
            lines = [f"- on the review lists from earlier runs, none new: {', '.join(standing)}", *lines]
        return lines

    def _disagreement(self, grant: Grant) -> str:
        start = grant["start"]
        first_year = int(start[:4]) if start and start[:4].isdigit() else None
        awards = grant["facts"].get("openalex", [])
        valued = openalex_amount(awards, self.rules, self.rates, first_year=first_year)
        theirs = valued.amount if valued is not None else None
        if theirs is None:
            openalex = "none"
        elif theirs["usd"] is None:
            openalex = f"{theirs['original']} {theirs['currency']}, not converted"
        else:
            openalex = usd(theirs["usd"])
        source = grant["amount"]["source"] if grant["amount"] else "the agency"
        return f"- {grant['key']} — {source}: {amount_text(grant)}; OpenAlex: {openalex}"

    def _large(self, grant: Grant) -> str:
        title = grant["title"] or "no title"
        return f"- {grant['key']} — {amount_text(grant)}, {self._agency(grant)}, {grant['category']}: {title}"

    # --- what moved ---

    def _grants(self) -> list[str]:
        new = sorted(self.after.grants.keys() - self.before.grants.keys())
        lost = sorted(self.before.grants.keys() - self.after.grants.keys())
        if not self.before.present:
            return self._by_agency()
        lines: list[str] = []
        if new:
            works = listed_by(self.after)
            rows = [
                f"| {key} | {self._agency(grant)} | {amount_text(grant)} | {_works(works.get(key, ()))} |"
                for key in new
                if (grant := self.after.grants[key])
            ]
            table = ["| grant | agency | amount | works |", "|---|---|---:|---|"]
            lines += ["", f"### New grants ({len(new)})", "", *table, *_capped(rows, "grants")]
        if lost:
            works = listed_by(self.before)
            rows = [
                f"- {key} — {amount_text(self.before.grants[key])}; listed by {_works(works.get(key, ()))}"
                for key in lost
            ]
            lines += ["", f"### Grants no longer listed ({len(lost)})", "", *_capped(rows, "grants")]
        return lines

    def _by_agency(self) -> list[str]:
        """A first run finds every grant new: it counts them by agency rather than list them."""
        counts: dict[str, tuple[Grant, list[int]]] = {}
        for grant in self.after.grants.values():
            _, count = counts.setdefault(grant["agency"], (grant, [0, 0, 0]))
            usd_amount = grant["amount"]["usd"] if grant["amount"] is not None else None
            count[0] += 1
            count[1] += usd_amount or 0
            count[2] += usd_amount is not None
        if not counts:
            return []
        ranked = sorted(counts.values(), key=lambda item: (-item[1][1], item[0]["agency"]))
        rows = [
            f"| {self._agency(grant)} | {number} | {usd(amount) if known else 'none known'} |"
            for grant, (number, amount, known) in ranked
        ]
        table = ["| agency | grants | known amounts |", "|---|---:|---:|"]
        return ["", "### Grants by agency", "", *table, *_capped(rows, "agencies")]


def disabled_line() -> str:
    return "funding: disabled (`enabled: false` in config/funding.yaml); nothing was asked"


def skipped_line(*, partial: bool, failed: bool) -> str:
    """The one line a run that decided no funding shows in place of the section (§9.1, §9.4)."""
    if failed:
        return "funding: the stage failed, so the stored funding was carried forward (see Alerts)"
    if partial:
        return (
            "funding: skipped, as every partial run (`--channels`) is; the stored funding was carried forward"
        )
    return "funding: skipped (`--funding skip`); the stored funding was carried forward"
