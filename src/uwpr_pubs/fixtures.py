"""Checking the Phase 1 §12 test papers against a store (docs/03 §5 stage 9, §8, §12.2).

These are the papers whose outcome was settled by hand during calibration, so they are the one
thing that can tell an unattended run it has broken a rule. Stage 9 evaluates them against the
staged store before anything is written: a positive fixture that stops being included fails the
run (§9), because that is a regression, not news.

Pure: a store snapshot and the fixture definitions in, a verdict per fixture out. The identifiers
are resolved the same way any other lookup is, through `aliases.json`.

A known miss that starts passing is **good news**, not a failure (Phase 1 §12). It means a source
began carrying text we could not read before, and the report says so.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from uwpr_pubs.evidence import active
from uwpr_pubs.store.ids import normalise_doi
from uwpr_pubs.store.models import WorkId
from uwpr_pubs.store.read import StoreSnapshot

Outcome = Literal["pass", "fail", "known_miss"]
# A fixture with no identifier is a synthetic document (docs/03 §10.5): the rule unit tests own
# it, because there is no real paper in the store to look up.
SYNTHETIC = "synthetic: no identifier, covered by the rule tests"


@dataclass(frozen=True)
class FixtureResult:
    id: str
    expected: str
    outcome: Outcome
    detail: str
    work: WorkId | None = None
    present: bool = True

    @property
    def regressed(self) -> bool:
        """A failure that must stop the run (§9).

        §12.2 says the positive test papers **present in the store** must still be included, and
        the qualifier matters: a paper no channel has nominated at all has not regressed, it has
        simply never been found — which is the state of every fixture on a first run into an
        empty store. A paper that is present but has stopped being included is the real thing.
        """
        return self.outcome == "fail" and self.present

    @property
    def good_news(self) -> bool:
        return self.expected == "known_miss" and self.outcome == "pass"

    def line(self) -> str:
        mark = {"pass": "✔", "fail": "✘", "known_miss": "-"}[self.outcome]
        return f"{mark} {self.id:<18} {self.expected:<11} {self.detail}"


def alias_keys(ids: Mapping[str, Any]) -> list[str]:
    """The `aliases.json` keys a fixture's identifiers map to, most specific first."""
    keys: list[str] = []
    if ids.get("doi"):
        keys.append(f"doi:{normalise_doi(str(ids['doi']))}")
    if ids.get("pmid"):
        keys.append(f"pmid:{ids['pmid']}")
    if ids.get("pmcid"):
        keys.append(f"pmcid:{ids['pmcid']}")
    if ids.get("pride"):
        keys.append(f"pride:{ids['pride']}")
    for member in ids.get("family") or []:
        keys.append(f"doi:{normalise_doi(str(member))}")
    return keys


def _rules_on(snapshot: StoreSnapshot, work: WorkId) -> set[str]:
    stored = snapshot.works.get(work)
    return {str(entry["rule"]) for entry in active(stored["evidence"])} if stored else set()


def _evaluate_include(
    fixture: Mapping[str, Any], snapshot: StoreSnapshot, work: WorkId | None
) -> tuple[Outcome, str]:
    if work is None:
        return "fail", "not in this store"
    if work not in snapshot.works:
        return "fail", f"{work} is in the store but not included"
    fired = _rules_on(snapshot, work)
    missing = sorted(set(fixture.get("rules") or []) - fired)
    present = sorted(set(fixture.get("rules_absent") or []) & fired)
    if missing:
        return "fail", f"{work}: {', '.join(missing)} did not fire (found {', '.join(sorted(fired))})"
    if present:
        return "fail", f"{work}: {', '.join(present)} fired but should not have"
    return "pass", f"{work}: {', '.join(sorted(fired))}"


def evaluate_one(fixture: Mapping[str, Any], snapshot: StoreSnapshot) -> FixtureResult:
    identifier = fixture.get("ids") or {}
    keys = alias_keys(identifier)
    expected = str(fixture["expected"])
    if not keys:
        return FixtureResult(str(fixture["id"]), expected, "pass", SYNTHETIC)

    work = next((snapshot.aliases[key] for key in keys if key in snapshot.aliases), None)
    included = work is not None and work in snapshot.works

    if expected == "include":
        outcome, detail = _evaluate_include(fixture, snapshot, work)
        return FixtureResult(str(fixture["id"]), expected, outcome, detail, work, present=work is not None)
    if expected == "exclude":
        if included:
            fired = ", ".join(sorted(_rules_on(snapshot, str(work))))
            return FixtureResult(str(fixture["id"]), expected, "fail", f"{work} is included: {fired}", work)
        return FixtureResult(str(fixture["id"]), expected, "pass", "not included, as expected", work)
    # known_miss: still missed is the expected outcome; found is good news (Phase 1 §12).
    if included:
        fired = ", ".join(sorted(_rules_on(snapshot, str(work))))
        return FixtureResult(str(fixture["id"]), expected, "pass", f"now found by {fired}", work)
    return FixtureResult(str(fixture["id"]), expected, "known_miss", "still not reachable", work)


def evaluate(fixtures: Sequence[Mapping[str, Any]], snapshot: StoreSnapshot) -> list[FixtureResult]:
    return [evaluate_one(fixture, snapshot) for fixture in fixtures]
