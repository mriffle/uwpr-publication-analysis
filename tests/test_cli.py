"""The command line's contract with the update workflow (docs/03 §8, §11.3).

`update.yml` decides whether to push, and what to scan for a leaked key, from what `run` writes
to `$GITHUB_OUTPUT`. Nothing else tells it, so these three lines are load-bearing.
"""

from pathlib import Path

import pytest

from uwpr_pubs import cli
from uwpr_pubs.pipeline import RunResult


def outputs(text: str) -> dict[str, str]:
    return dict(line.split("=", 1) for line in text.splitlines() if line)


@pytest.fixture
def github_output(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "github-output"
    path.touch()
    monkeypatch.setenv("GITHUB_OUTPUT", str(path))
    monkeypatch.setattr(cli, "load_config", lambda *a, **k: object())
    monkeypatch.setattr(cli, "api_keys", lambda: (None, None))
    monkeypatch.setattr(cli, "build_client", lambda *a, **k: object())
    return path


def run_with(result: RunResult, monkeypatch: pytest.MonkeyPatch, store: Path) -> int:
    monkeypatch.setattr(cli, "run_pipeline", lambda *a, **k: result)
    return cli.main(["run", "--store", str(store)])


def test_a_run_that_committed_reports_the_commit_to_push(
    github_output: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    result = RunResult(status="ok", run_id="2026-09-21T09-00-live", report="", written=True, commit="abc123")
    assert run_with(result, monkeypatch, tmp_path) == 0
    assert outputs(github_output.read_text()) == {
        "status": "ok",
        "run_id": "2026-09-21T09-00-live",
        "commit": "abc123",
    }


def test_a_run_that_changed_nothing_reports_an_empty_commit(
    github_output: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The workflow skips the scan and the push on this, rather than pushing nothing."""
    result = RunResult(status="ok", run_id="r", report="", written=True, commit=None)
    assert run_with(result, monkeypatch, tmp_path) == 0
    assert outputs(github_output.read_text())["commit"] == ""


def test_an_alerting_run_still_exits_zero_so_the_data_is_pushed(
    github_output: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """§9: an alert is written and committed as usual; the workflow fails *after* pushing."""
    result = RunResult(status="alert", run_id="r", report="", written=True, commit="def456")
    assert run_with(result, monkeypatch, tmp_path) == 0
    assert outputs(github_output.read_text())["status"] == "alert"


def test_a_failed_run_exits_non_zero_and_names_no_commit(
    github_output: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    result = RunResult(status="failed", run_id="r", report="", written=False, commit=None)
    assert run_with(result, monkeypatch, tmp_path) == 1
    assert outputs(github_output.read_text())["commit"] == ""


def test_nothing_is_written_when_the_workflow_variable_is_absent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A local run must not need GITHUB_OUTPUT to exist."""
    monkeypatch.delenv("GITHUB_OUTPUT", raising=False)
    monkeypatch.setattr(cli, "load_config", lambda *a, **k: object())
    monkeypatch.setattr(cli, "api_keys", lambda: (None, None))
    monkeypatch.setattr(cli, "build_client", lambda *a, **k: object())
    result = RunResult(status="ok", run_id="r", report="", written=True, commit="abc")
    assert run_with(result, monkeypatch, tmp_path) == 0
