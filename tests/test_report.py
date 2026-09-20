"""The run report's quality machinery (docs/03 §9, §10.6)."""

import datetime as dt
from pathlib import Path
from typing import Any

from uwpr_pubs.context import RunContext
from uwpr_pubs.report import RunRecorder, Trend, trailing_average, trends


def recorder() -> RunRecorder:
    started = dt.datetime(2026, 9, 21, 9, 0, tzinfo=dt.UTC)
    context = RunContext(today=started.date(), started=started, mode="live", store=Path("store"))
    return RunRecorder(
        context=context,
        rule_version="2026-09-19.2",
        config_fingerprint="sha256:" + "0" * 64,
        rules_fingerprint="sha256:" + "1" * 64,
        code_version="m4",
    )


def run(run_id: str, **sections: Any) -> dict[str, Any]:
    return {"run_id": run_id, "degradations": [], **sections}


def test_the_average_covers_only_the_last_eight_runs() -> None:
    runs = [run(f"2026-09-{day:02d}T09-00-live", rules={"R3": {"works": day}}) for day in range(1, 13)]
    # Runs 5 to 12 inclusive: the trailing eight, whatever order they arrive in.
    assert trailing_average(list(reversed(runs)), "rules", "works") == {"R3": sum(range(5, 13)) / 8}


def test_a_rule_missing_from_some_runs_averages_over_the_ones_it_appears_in() -> None:
    runs = [
        run("2026-09-01T09-00-live", rules={"R3": {"works": 10}}),
        run("2026-09-02T09-00-live", rules={"R3": {"works": 20}, "R7": {"works": 4}}),
    ]
    assert trailing_average(runs, "rules", "works") == {"R3": 15.0, "R7": 4.0}


def test_a_sharp_change_is_flagged_and_a_small_one_is_not() -> None:
    assert Trend("R3", now=150, average=100.0).sharp
    assert Trend("R3", now=60, average=100.0).sharp
    assert not Trend("R3", now=110, average=100.0).sharp  # within a quarter
    assert not Trend("R7", now=4, average=2.0).sharp  # moves of fewer than three are noise


def test_a_rule_that_stops_firing_altogether_is_flagged() -> None:
    """A detector that breaks shows up as a count of zero, which no `now` value would report."""
    flagged = trends({}, {"R3": 150.0}, "works")
    assert [t.name for t in flagged] == ["R3"]
    assert flagged[0].now == 0
    assert "down from" in flagged[0].line()


def test_an_unchanged_count_produces_no_lines() -> None:
    assert trends({"R3": {"works": 100}}, {"R3": 100.0}, "works") == []


def test_the_commit_message_names_the_run_and_what_changed() -> None:
    entry = recorder()
    entry.counts = {"works": 342, "candidates": 453}
    entry.added = ["W-000001"]
    entry.merged = [{"into": "W-000001", "retired": "W-000002"}]
    message = entry.commit_message()
    assert message.startswith("Data update 2026-09-21T09-00-live")
    assert "342 works, 453 candidates" in message
    assert "1 added; 1 merged" in message
    assert "status ok" in message


def test_a_run_that_changed_nothing_says_so() -> None:
    entry = recorder()
    entry.counts = {"works": 342}
    assert "no change to the works" in entry.commit_message()


def test_the_report_shows_the_merges_the_fixtures_and_the_trends() -> None:
    entry = recorder()
    entry.counts = {"works": 2}
    entry.merged = [{"into": "W-000001", "retired": "W-000002"}]
    entry.fixtures = {"A": "pass", "B": "known_miss", "C": "fail"}
    entry.good_news = ["B was a known miss and now passes"]
    entry.trends = [Trend("R3", now=10, average=100.0)]
    text = entry.markdown(duration_seconds=12.0, spend_usd=0.011)
    assert "## Works merged (1)" in text
    assert "- W-000002 → W-000001" in text
    assert "1 as expected, 1 known misses, 1 failing (C)" in text
    assert "good news: B was a known miss" in text
    assert "R3: 10, down from a trailing average of 100.0" in text


def test_the_report_never_names_the_commit_it_is_part_of() -> None:
    """The commit is made after the report, because the report is one of the files it commits."""
    entry = recorder()
    entry.commit = "abcdef1234"
    assert "abcdef" not in entry.markdown(duration_seconds=1.0, spend_usd=0.0)
