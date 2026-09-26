"""How `uwpr-pubs smoke` tells an outage from a problem (docs/03 §8, changed 2026-09-20 and -26).

The checks themselves are live and unreachable offline, but the decision they feed is not: it is
a function of one exception and one boolean, and it decides whether a week's run happens at all.
The first hand-triggered weekly run was skipped for two Europe PMC 503s, so this is the part
worth pinning down.
"""

from types import SimpleNamespace

import pytest

from uwpr_pubs import cli, smoke
from uwpr_pubs.http import BudgetExceededError, HttpError
from uwpr_pubs.smoke import Check, Outcome, blocked, classify, verdict


def failing(exc: Exception) -> Check:
    """A check whose source raised, run through the same path `run_smoke` uses."""

    def raise_it() -> tuple[bool, str]:
        raise exc

    return smoke._check("a source", raise_it)


def assertion(ok: bool) -> Check:
    return smoke._check("a source", lambda: (ok, "what it answered"))


# --- the classification -------------------------------------------------------------------


@pytest.mark.parametrize("status", [500, 502, 503, 504])
def test_a_server_error_is_an_outage(status: int) -> None:
    """The case that cost a run: Europe PMC answered 503, and the pipeline copes with that."""
    assert classify(HttpError(f"europepmc: HTTP {status}", status)) is Outcome.OUTAGE


def test_a_timeout_or_connection_failure_is_an_outage() -> None:
    """No answer ever arrived, so `status` is None (http.py). Nothing to tell a person about."""
    assert classify(HttpError("ncbi: ReadTimeout", None)) is Outcome.OUTAGE


@pytest.mark.parametrize("status", [401, 403])
def test_an_authentication_failure_is_a_problem(status: int) -> None:
    """A key that has expired or been revoked. The run would spend four minutes discovering it."""
    assert classify(HttpError(f"openalex: HTTP {status}", status)) is Outcome.PROBLEM


@pytest.mark.parametrize("status", [400, 404, 410, 422])
def test_any_other_4xx_is_a_problem(status: int) -> None:
    """The source answered, and refused the query: a query or a syntax we no longer share."""
    assert classify(HttpError(f"crossref: HTTP {status}", status)) is Outcome.PROBLEM


@pytest.mark.parametrize("exc", [ValueError("not JSON"), KeyError("pmcid")])
def test_a_reply_that_cannot_be_parsed_is_a_problem(exc: Exception) -> None:
    """The source's shape changed. Patience does not fix that."""
    assert classify(exc) is Outcome.PROBLEM


def test_the_budget_guard_is_a_problem_not_an_outage() -> None:
    """It has no status because nothing was sent, but no source is down: §9 calls it an alert.

    Without the carve-out it would read as a connection failure, and smoke would wave through a
    run whose OpenAlex searches are already out of budget.
    """
    assert classify(BudgetExceededError("OpenAlex budget guard: 1.0000 USD spent")) is Outcome.PROBLEM


def test_a_failed_content_assertion_is_a_problem() -> None:
    """Too few entries, or an unexpected identifier: the source answered with the wrong thing."""
    assert assertion(ok=False).outcome is Outcome.PROBLEM
    assert assertion(ok=True).outcome is Outcome.OK


def test_a_failure_keeps_its_exception_in_the_detail() -> None:
    check = failing(HttpError("https://www.ebi.ac.uk/…: HTTP 503", 503))
    assert check.outcome is Outcome.OUTAGE
    assert check.line().startswith("DOWN  a source: HttpError: ")


# --- a count below its floor, and the control that decides what it means ----------------


def floor_check(found: int | Exception, control: int | Exception, asked: list[str] | None = None) -> Check:
    """`_floor_check` against a floor of 100, with each answer either a count or a raise."""

    def answer(value: int | Exception, which: str) -> int:
        if asked is not None:
            asked.append(which)
        if isinstance(value, Exception):
            raise value
        return value

    return smoke._floor_check(
        "europe pmc search",
        lambda: answer(found, "count"),
        100,
        "results",
        lambda: answer(control, "control"),
    )


def test_a_count_at_its_floor_passes_without_asking_the_control() -> None:
    asked: list[str] = []
    check = floor_check(100, 0, asked)
    assert check.outcome is Outcome.OK
    assert check.detail == "100 results; expected at least 100"
    assert asked == ["count"]


def test_a_collapse_beside_a_healthy_control_is_a_problem() -> None:
    """The source answers everything else, so it is our query that has stopped matching.

    Europe PMC answers a field it does not know with a well-formed zero, so this is what a
    renamed field looks like, and it needs a person.
    """
    check = floor_check(0, 352_521)
    assert check.outcome is Outcome.PROBLEM
    assert "the control query found 352521, so the source is fine" in check.detail


def test_a_zero_beside_an_empty_control_is_an_outage() -> None:
    """The source is answering empty for everything: an index outage, which passes with time.

    The first scheduled run (2026-09-21) was blocked by a zero like this, from a source that
    answered 185 the day before and the day after.
    """
    check = floor_check(0, 0)
    assert check.outcome is Outcome.OUTAGE
    assert check.line().startswith("DOWN  europe pmc search: 0 results; expected at least 100;")


def test_a_dip_below_the_floor_still_asks_the_control() -> None:
    assert floor_check(99, 352_521).outcome is Outcome.PROBLEM
    assert floor_check(99, 12).outcome is Outcome.OUTAGE


@pytest.mark.parametrize(
    ("status", "outcome"), [(503, Outcome.OUTAGE), (None, Outcome.OUTAGE), (401, Outcome.PROBLEM)]
)
def test_a_control_that_fails_is_classified_like_any_failure(status: int | None, outcome: Outcome) -> None:
    check = floor_check(0, HttpError(f"europepmc: HTTP {status}", status))
    assert check.outcome is outcome
    assert "the control query failed too: HttpError:" in check.detail


@pytest.mark.parametrize(
    ("exc", "outcome"),
    [
        (HttpError("europepmc: HTTP 503", 503), Outcome.OUTAGE),
        (HttpError("europepmc: the query is malformed (errCode 400)", 400), Outcome.PROBLEM),
        (KeyError("hitCount"), Outcome.PROBLEM),
    ],
)
def test_a_count_that_fails_outright_never_asks_the_control(exc: Exception, outcome: Outcome) -> None:
    """A failure already says what it is. The control is only for an answer that is too small."""
    asked: list[str] = []
    assert floor_check(exc, 352_521, asked).outcome is outcome
    assert asked == ["count"]


def test_each_floor_leaves_room_for_a_live_index_to_drift() -> None:
    """Two floors once equalled their live counts, so one withdrawn record would block a week.

    The figures are the counts measured on 2026-09-26. A floor catches a collapse, not a dip.
    """
    measured = {
        smoke.MIN_LIST_ENTRIES: 306,
        smoke.MIN_OPENALEX_AWARD: 139,
        smoke.MIN_CROSSREF_AWARD: 63,
        smoke.MIN_EUROPEPMC_IDENTIFIER: 185,
    }
    for floor, count in measured.items():
        assert 0.85 * count <= floor <= 0.92 * count


# --- what the three states look like ------------------------------------------------------


def test_each_state_has_its_own_marker() -> None:
    """PASS and FAIL keep their meaning; an outage is neither of them."""
    assert Check("s", Outcome.OK, "d").line() == "PASS  s: d"
    assert Check("s", Outcome.OUTAGE, "d").line() == "DOWN  s: d"
    assert Check("s", Outcome.PROBLEM, "d").line() == "FAIL  s: d"


def test_the_verdict_says_a_clean_run_may_proceed() -> None:
    line = verdict([Check("a", Outcome.OK, "d"), Check("b", Outcome.OK, "d")])
    assert line == "VERDICT  PROCEED: all 2 checks passed."


def test_the_verdict_names_the_sources_that_are_down_and_still_proceeds() -> None:
    line = verdict(
        [
            Check("europe pmc search", Outcome.OUTAGE, "d"),
            Check("europe pmc full text", Outcome.OUTAGE, "d"),
            Check("official list", Outcome.OK, "d"),
        ]
    )
    assert line.startswith("VERDICT  PROCEED: 2 sources are down (europe pmc search, europe pmc full text);")


def test_the_verdict_blocks_on_a_problem_and_still_mentions_an_outage() -> None:
    """One line, both facts: what needs a person, and what was merely down beside it."""
    line = verdict(
        [
            Check("ncbi id converter", Outcome.PROBLEM, "d"),
            Check("europe pmc search", Outcome.OUTAGE, "d"),
        ]
    )
    assert line == (
        "VERDICT  BLOCKED: 1 check needs a person (ncbi id converter); a key, a query or a source's "
        "shape has changed. 1 source is also down (europe pmc search), which alone would not have "
        "blocked the run."
    )


# --- the exit code the workflow reads -----------------------------------------------------


def smoke_exit(checks: list[Check], monkeypatch: pytest.MonkeyPatch) -> int:
    """`uwpr-pubs smoke` end to end, with the live half replaced."""
    client = SimpleNamespace(budget=SimpleNamespace(spent_usd=0.002), usage={"x": SimpleNamespace(calls=8)})
    monkeypatch.setattr(cli, "load_config", lambda *a, **k: object())
    monkeypatch.setattr(cli, "api_keys", lambda: (None, None))
    monkeypatch.setattr(cli, "build_client", lambda *a, **k: client)
    monkeypatch.setattr(cli, "run_smoke", lambda *a, **k: checks)
    return cli.main(["smoke"])


def test_all_passing_exits_zero(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    assert smoke_exit([Check("official list", Outcome.OK, "339 entries")], monkeypatch) == 0
    assert "PROCEED" in capsys.readouterr().out


def test_outages_alone_exit_zero_so_the_run_happens(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The whole point of the change: a 503 defers discovery, it does not cancel the week."""
    checks = [
        Check("official list", Outcome.OK, "339 entries"),
        Check("europe pmc search", Outcome.OUTAGE, "HttpError: HTTP 503"),
    ]
    assert smoke_exit(checks, monkeypatch) == 0
    out = capsys.readouterr().out
    assert "DOWN  europe pmc search" in out
    assert "VERDICT  PROCEED:" in out


def test_a_problem_exits_one_even_beside_an_outage(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    checks = [
        Check("europe pmc search", Outcome.OUTAGE, "HttpError: HTTP 503"),
        Check("ncbi id converter", Outcome.PROBLEM, "PMID 19070509 -> None"),
    ]
    assert smoke_exit(checks, monkeypatch) == 1
    assert "VERDICT  BLOCKED:" in capsys.readouterr().out


def test_blocked_is_the_exit_code_in_one_predicate() -> None:
    assert not blocked([Check("a", Outcome.OK, "d"), Check("b", Outcome.OUTAGE, "d")])
    assert blocked([Check("a", Outcome.OUTAGE, "d"), Check("b", Outcome.PROBLEM, "d")])
