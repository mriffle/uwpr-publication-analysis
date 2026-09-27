"""The run report's Funding section and the total-drop alert, as arithmetic (docs/09 §9.5, §9.6).

Snapshots are built by hand, shaped as the stage writes them, so each case says exactly what
moved between the store a run started from and the funding it hands on.
"""

from collections.abc import Iterable, Sequence
from decimal import Decimal
from typing import Any, cast

from uwpr_pubs.config import load_config
from uwpr_pubs.funding.classify import FundingRules
from uwpr_pubs.funding.currency import Rates
from uwpr_pubs.funding.report import (
    MAX_LISTED,
    FundingReport,
    drop_alert,
    large_untagged,
    only_beside,
    reporter_candidates,
    total_drop,
)
from uwpr_pubs.store.models import (
    Degradation,
    FundingCitation,
    FundingLookup,
    FundingMode,
    FundingString,
    Grant,
    Override,
)
from uwpr_pubs.store.read import FundingSnapshot

CONFIG = load_config()
RULES = FundingRules.from_config(CONFIG.funding, str(CONFIG.rules["r2"]["code"]))
RATES = Rates.from_config(CONFIG.exchange_rates)
ICS = RULES.ics


def grant(key: str, usd: int | None = 1_000, **fields: Any) -> Grant:
    agency = fields.pop("agency", "NIGMS")
    amount = (
        None
        if usd is None
        else {
            "usd": usd,
            "original": str(usd),
            "currency": "USD",
            "rate": None,
            "rate_year": None,
            "basis": "reporter_fiscal_years",
            "source": "NIH RePORTER",
        }
    )
    return cast(
        Grant,
        {
            "schema": 1,
            "key": key,
            "agency": agency,
            "family": "reporter",
            "number": key.rsplit(":", 1)[-1],
            "activity": None,
            "category": "research",
            "status": "resolved",
            "scope": "project",
            "scope_reason": None,
            "title": None,
            "pis": [],
            "organization": None,
            "start": None,
            "end": None,
            "facts": {"reporter": {}},
            "amount": amount,
            "flags": [],
            "openalex_awards": [],
            "first_seen": "2026-10-03",
            "checked": "2026-10-03",
            **fields,
        },
    )


def string(raw: str, *grants: str, outcome: str = "grant", **fields: Any) -> FundingString:
    return cast(
        FundingString,
        {
            "raw": raw,
            "funders": ["National Institutes of Health"],
            "sources": ["openalex"],
            "first_seen": "2026-10-03",
            "last_seen": "2026-10-03",
            "outcome": outcome,
            "grants": list(grants),
            "method": "miscellaneous" if outcome == "unresolved" else "exact",
            "note": None,
            **fields,
        },
    )


def line(work: str, *strings: FundingString, links: Sequence[tuple[str, str]] = ()) -> FundingCitation:
    grants = sorted({key for s in strings for key in s["grants"]} | {key for _, key in links})
    nih_links = [
        {"core": core, "grant": key, "first_seen": "2026-10-03", "last_seen": "2026-10-03"}
        for core, key in links
    ]
    return cast(
        FundingCitation,
        {
            "schema": 1,
            "work": work,
            "funding_version": "2099-01-01.1",
            "strings": list(strings),
            "nih_links": nih_links,
            "jats_checked": {},
            "grants": grants,
        },
    )


def snapshot(
    lines: Iterable[FundingCitation], grants: Iterable[Grant], lookups: Iterable[FundingLookup] = ()
) -> FundingSnapshot:
    return FundingSnapshot(
        present=True,
        citations={entry["work"]: entry for entry in lines},
        grants={entry["key"]: entry for entry in grants},
        lookups={(entry["source"], entry["query"]): entry for entry in lookups},
    )


def split(ic: str, serial: str, *found: str) -> FundingLookup:
    return cast(
        FundingLookup,
        {
            "schema": 1,
            "source": "reporter",
            "query": f"split:{ic}:{serial}",
            "found": list(found),
            "checked": "2026-10-03",
            "recheck_after": None,
        },
    )


def section(
    before: FundingSnapshot,
    after: FundingSnapshot,
    mode: FundingMode = "incremental",
    overrides: Sequence[Override] = (),
    **fields: Any,
) -> list[str]:
    report = FundingReport(mode, "2099-01-01.1", before, after, RULES, RATES, overrides, **fields)
    return report.lines()


EXACT = grant("NIH:R01GM086688", 601_000)
BASE = snapshot([line("W-000001", string("R01 GM086688", "NIH:R01GM086688"))], [EXACT])


# --- the total-drop alert (§9.5) ---------------------------------------------------------------


def test_the_total_drop_counts_only_a_fall_of_more_than_the_threshold() -> None:
    assert total_drop(100, 94, 0.05) == Decimal("0.06")
    assert total_drop(100, 95, 0.05) is None  # exactly 5% is not more than 5%
    assert total_drop(1_000_000_000, 950_000_000, 0.05) is None
    assert total_drop(1_000_000_000, 949_999_999, 0.05) is not None
    assert total_drop(100, 120, 0.05) is None
    assert total_drop(0, 0, 0.05) is None


def manifest(run_id: str, amount: int | None = None, mode: str | None = "incremental") -> dict[str, Any]:
    funding: dict[str, Any] = {"version": "2099-01-01.1", "fingerprint": "sha256:0"}
    if mode is not None:
        funding |= {"mode": mode, "grants": 1, "amount_usd": amount}
    return {"run_id": run_id, "degradations": [], "funding": funding}


def test_the_alert_compares_with_the_last_run_that_decided_funding() -> None:
    runs = [manifest("2026-10-03T12-00-live", 1_000), manifest("2026-10-10T12-00-live", mode=None)]
    reason = drop_alert(runs, {"amount_usd": 900}, [], 0.05)
    assert reason == "the funding total fell 10.0% since 2026-10-03T12-00-live, from $1,000 to $900"
    assert drop_alert(runs, {"amount_usd": 950}, [], 0.05) is None
    later = [*runs, manifest("2026-10-17T12-00-live", 900, mode="skipped")]
    assert drop_alert(later, {"amount_usd": 900}, [], 0.05) is None  # a skipped run's total counts


def test_the_alert_is_silent_only_when_funding_degraded() -> None:
    runs = [manifest("2026-10-03T12-00-live", 1_000)]
    for source, cause in (
        ("source:reporter", "funding: HTTP 503"),
        ("source:openalex", "funding: awards failed"),
        ("stage:funding", "failed with KeyError"),
    ):
        degraded = [cast(Degradation, {"source": source, "cause": cause})]
        assert drop_alert(runs, {"amount_usd": 100}, degraded, 0.05) is None, source
    # A source that failed for discovery alone says nothing about funding: the fall is reported.
    for source, cause in (
        ("source:biorxiv", "details failed"),
        ("source:openalex", "ORCID check failed"),
        ("channel:B1", "down"),
    ):
        other = [cast(Degradation, {"source": source, "cause": cause})]
        assert drop_alert(runs, {"amount_usd": 100}, other, 0.05) is not None, source


def test_the_alert_needs_a_total_now_and_one_before() -> None:
    assert drop_alert([manifest("2026-10-03T12-00-live", mode=None)], {"amount_usd": 1}, [], 0.05) is None
    assert drop_alert([manifest("2026-10-03T12-00-live", 1_000)], None, [], 0.05) is None  # disabled
    assert drop_alert([], {"amount_usd": 1}, [], 0.05) is None


# --- the section's figures ----------------------------------------------------------------------


def test_a_first_run_counts_its_grants_by_agency_rather_than_list_them_as_new() -> None:
    after = snapshot(
        [
            line(
                "W-000001",
                string("R01 GM086688", "NIH:R01GM086688"),
                string("X1", "MISC:X1", outcome="unresolved"),
            )
        ],
        [EXACT, grant("MISC:X1", None, agency="MISC", family="miscellaneous", status="unresolved")],
    )
    lines = section(FundingSnapshot(), after, mode="full")
    assert lines[:3] == [
        "- mode: full refresh; funding_version 2099-01-01.1",
        "- grants: 2, 1 of them unresolved; the first run to decide funding",
        "- total: $601,000",
    ]
    assert "### Grants by agency" in lines
    assert "| NIGMS | 1 | $601,000 |" in lines
    assert "| MISC | 1 | none known |" in lines
    assert not [entry for entry in lines if entry.startswith("### New grants")]


def test_an_unchanged_run_says_so_and_lists_nothing() -> None:
    lines = section(BASE, BASE, refreshed="2026-10-03", requests={"reporter": 2, "nsf": 0})
    assert lines == [
        "- mode: incremental; the last full refresh was 2026-10-03; funding_version 2099-01-01.1",
        "- grants: 1, 0 of them unresolved; 0 new, 0 no longer listed",
        "- total: $601,000, unchanged since the last run",
        "- strings excluded: 0 not grants, 0 the resource code, 0 facility contracts",
        "- requests: reporter 2",
    ]


def test_a_run_adding_and_losing_grants_lists_both_and_the_change() -> None:
    before = snapshot(
        [BASE.citations["W-000001"], line("W-000002", string("R21 AI123456", "NIH:R21AI123456"))],
        [EXACT, grant("NIH:R21AI123456", 400_000, agency="NIAID")],
    )
    after = snapshot(
        [line("W-000001", string("R01 GM086688", "NIH:R01GM086688"), string("R35 GM1", "NIH:R35GM000001"))],
        [EXACT, grant("NIH:R35GM000001", 100_000)],
    )
    lines = section(before, after)
    assert "- grants: 2, 0 of them unresolved; 1 new, 1 no longer listed" in lines
    assert "- total: $701,000, down $300,000 (-30.0%) since the last run" in lines
    assert "### New grants (1)" in lines
    assert "| NIH:R35GM000001 | NIGMS | $100,000 | W-000001 |" in lines
    assert "### Grants no longer listed (1)" in lines
    assert "- NIH:R21AI123456 — $400,000; listed by W-000002" in lines


def test_the_deferred_mode_says_what_it_waits_for() -> None:
    lines = section(BASE, BASE, mode="deferred", refreshed="2026-09-05")
    assert lines[0] == (
        "- mode: incremental: a full refresh is due, and waits for RePORTER's window;"
        " the last full refresh was 2026-09-05; funding_version 2099-01-01.1"
    )


def test_strings_excluded_are_counted_by_kind() -> None:
    after = snapshot(
        [
            line(
                "W-000001",
                string("UWPR95794", outcome="resource_code", method=None),
                string("PGT121", outcome="not_a_grant", method=None),
                string("CAREER", outcome="not_a_grant", method=None),
                string("DE-AC05-76RL01830", outcome="facility_contract", method=None),
            )
        ],
        [],
    )
    assert "- strings excluded: 2 not grants, 1 the resource code, 1 facility contracts" in section(
        BASE, after
    )


# --- what needs a person ---------------------------------------------------------------------------


def test_every_new_unresolved_string_is_listed_with_what_reporter_holds_nearby() -> None:
    unresolved = string(
        "R01 GM12345",
        "MISC:R01GM12345",
        outcome="unresolved",
        sources=["openalex", "pubmed"],
        funders=["NIGMS NIH HHS", "National Institutes of Health"],
        note="an NIH-format number RePORTER does not hold",
    )
    foreign = string("SFE-2018-0099", "MISC:SFE20180099", outcome="unresolved", funders=["Sample Foundation"])
    after = snapshot(
        [
            line("W-000001", string("R01 GM086688", "NIH:R01GM086688"), unresolved, foreign),
            line("W-000002", links=[("R01GM123456", "NIH:R01GM123456")]),
        ],
        [EXACT, grant("NIH:R01GM012346"), grant("NIH:R01GM123456"), grant("MISC:R01GM12345", None)],
        [split("GM", "012345", "R35GM012345")],
    )
    lines = section(BASE, after)
    at = lines.index("### New unresolved strings (2)")
    assert lines[at + 4 : at + 8] == [
        '- W-000001: "R01 GM12345" from openalex, pubmed;'
        " funders: NIGMS NIH HHS; National Institutes of Health → MISC:R01GM12345",
        "  - nearest in RePORTER: R01GM012346 (one edit from the digits written; the store holds it),"
        " R01GM123456 (one edit from the digits written; the store holds it),"
        " R35GM012345 (RePORTER holds it under GM 012345)",
        "  - an NIH-format number RePORTER does not hold",
        '- W-000001: "SFE-2018-0099" from openalex; funders: Sample Foundation → MISC:SFE20180099',
    ]


def test_a_core_nih_links_to_the_work_is_named_as_such() -> None:
    work = line("W-000001", links=[("P01HL092969", "NIH:P01HL092969")])
    after = snapshot([work], [grant("NIH:P01HL092969")])
    assert reporter_candidates("P01 HL09296", "W-000001", after, ICS) == [
        "P01HL092969 (one edit from the digits written; NIH links this paper to it)"
    ]
    assert reporter_candidates("SFE-2018-0099", "W-000001", after, ICS) is None
    assert reporter_candidates("R01 CA999999", "W-000001", after, ICS) == []


def test_a_string_already_unresolved_is_not_listed_again_even_after_a_merge() -> None:
    old = line("W-000009", string("R01 GM12345", "MISC:R01GM12345", outcome="unresolved"))
    before = snapshot([old], [grant("MISC:R01GM12345", None)])
    moved = line("W-000001", string("R01-GM12345", "MISC:R01GM12345", outcome="unresolved"))
    after = snapshot([moved], [grant("MISC:R01GM12345", None)])
    lines = section(before, after, aliases={"work:W-000009": "W-000001"})
    assert not [entry for entry in lines if "unresolved strings" in entry]


def test_each_list_is_capped_by_entries_not_lines() -> None:
    count = MAX_LISTED + 7
    strings = [
        string(f"R01 GM{n:06d}X", f"MISC:R01GM{n:06d}X", outcome="unresolved", note="a note")
        for n in range(count)
    ]
    grants = [grant(f"NIH:R01GM{n:06d}", n) for n in range(count)]
    after = snapshot([line("W-000001", *strings)], grants)
    lines = section(snapshot([], []), after)
    new = lines[lines.index(f"### New grants ({count})") :]
    assert len([entry for entry in new if entry.startswith("| NIH:")]) == MAX_LISTED
    assert "- …and 7 more grants" in new
    unresolved = lines[
        lines.index(f"### New unresolved strings ({count})") : lines.index(f"### New grants ({count})")
    ]
    assert len([entry for entry in unresolved if entry.startswith("- W-")]) == MAX_LISTED
    assert unresolved[-2:] == ["- …and 7 more strings", ""]


def test_a_grant_override_that_decided_nothing_is_listed() -> None:
    def override(target: str, raw: str, key: str) -> Override:
        return cast(
            Override,
            {
                "target": target,
                "action": "grant",
                "raw": raw,
                "grant": key,
                "reason": "r",
                "by": "m",
                "date": "d",
            },
        )

    after = snapshot([line("W-000001", string("U19AG02312", "NIH:U19AG023122", method="override"))], [])
    overrides = [
        override("W-000001", "u19-ag02312", "NIH:U19AG023122"),  # applied: case and dashes forgiven
        override("W-000001", "U19 AG023120", "NIH:U19AG023122"),
        override("W-000005", "R01 X", "NIH:R01GM086688"),
        override("W-000009", "U19AG02312", "NIH:U19AG023122"),  # merged into W-000001: applied
    ]
    lines = section(after, after, overrides=overrides, aliases={"work:W-000009": "W-000001"})
    at = lines.index("### Grant overrides not applied (2)")
    assert lines[at + 2 :] == [
        "- W-000001: 'U19 AG023120' → NIH:U19AG023122 — the string is not seen on it",
        "- W-000005: 'R01 X' → NIH:R01GM086688 — the work has no funding line",
    ]


# --- the review lists -------------------------------------------------------------------------------


def disputed(key: str) -> Grant:
    award = {"id": "G1", "amount": "500000", "currency": "USD", "provenance": "nih", "start_year": 2020}
    return grant(key, 601_000, flags=["amounts_disagree"], facts={"reporter": {}, "openalex": [award]})


def test_a_new_disagreement_is_listed_and_an_old_one_counted() -> None:
    after = snapshot(BASE.citations.values(), [disputed("NIH:R01GM086688")])
    lines = section(BASE, after)
    assert lines[
        lines.index("### OpenAlex and the agency disagree by more than 1% (1 new, 1 in all)") + 2
    ] == ("- NIH:R01GM086688 — NIH RePORTER: $601,000; OpenAlex: $500,000")
    again = section(after, after)
    assert "- on the review lists from earlier runs, none new: 1 disagreements" in again
    assert not [entry for entry in again if entry.startswith("### OpenAlex")]


def test_large_untagged_awards_leave_out_nih_centres_and_tagged_awards() -> None:
    big = RULES.large_award_review_usd
    grants = [
        grant("EU:101001", big, agency="EU", family="agency", title="A consortium"),
        grant("EU:101002", big - 1, agency="EU", family="agency"),
        grant("EU:101003", big * 2, agency="EU", family="agency", scope="institution-wide"),
        grant("NIH:P41GM103533", big * 3, category="center"),
        grant("NIH-contract:HHSN272201700059C", big, family="nih_contract", category="contract"),
    ]
    assert sorted(large_untagged(snapshot([], grants), RULES)) == [
        "EU:101001",
        "NIH-contract:HHSN272201700059C",
    ]
    lines = section(snapshot([], []), snapshot([], grants[:1]))
    assert "### Untagged awards of $20,000,000 or more (1 new, 1 in all)" in lines
    assert "- EU:101001 — $20,000,000, EU, research: A consortium" in lines


def test_a_grant_seen_only_beside_another_of_its_agency_is_listed() -> None:
    def dfg(number: str) -> Grant:
        return grant(f"DFG:{number}", None, agency="DFG", family="agency")

    lines = [
        line("W-000001", string("GRK 2098", "DFG:GRK2098"), string("123456", "DFG:123456")),
        line("W-000002", string("123456", "DFG:123456"), string("A1", "DFG:A1"), string("B1", "DFG:B1")),
        line("W-000003", string("R01 GM086688", "NIH:R01GM086688"), string("P41 GM1", "NIH:P41GM000001")),
    ]
    after = snapshot(
        lines, [dfg("GRK2098"), dfg("123456"), dfg("A1"), dfg("B1"), EXACT, grant("NIH:P41GM000001")]
    )
    assert only_beside(after) == {
        ("DFG:A1", "DFG:123456"): {"W-000002"},
        ("DFG:A1", "DFG:B1"): {"W-000002"},  # always together: named once, in key order
        ("DFG:B1", "DFG:123456"): {"W-000002"},
        ("DFG:GRK2098", "DFG:123456"): {"W-000001"},
    }
    text = section(snapshot([], []), after)
    assert "### Grants seen only beside another of their agency (4 new, 4 in all)" in text
    assert "- DFG:GRK2098 only beside DFG:123456, on W-000001" in text
