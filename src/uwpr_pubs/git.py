"""The small amount of git the pipeline needs (docs/03 §5 stages 0 and 13).

Stage 0 refuses to run on a dirty store, because a run interrupted during stage 13 leaves files
that would otherwise be read back as though they were committed. `git checkout` alone is not
enough: a crashed run can leave an *untracked* work file, which checkout will not remove.
"""

import subprocess
from collections.abc import Sequence
from pathlib import Path


def _git(args: Sequence[str], cwd: Path) -> str:
    result = subprocess.run(  # noqa: S603 - fixed argument list, no shell
        ["git", *args],  # noqa: S607 - git is expected on PATH, as in CI
        cwd=cwd,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def is_repository(path: Path) -> bool:
    try:
        _git(["rev-parse", "--git-dir"], path)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False
    return True


def status(paths: Sequence[Path], cwd: Path) -> list[str]:
    """Porcelain status lines for the given paths, tracked and untracked alike."""
    existing = [str(p) for p in paths]
    if not existing:
        return []
    output = _git(["status", "--porcelain", "--", *existing], cwd)
    return [line for line in output.splitlines() if line.strip()]


def untracked(paths: Sequence[Path], cwd: Path) -> list[str]:
    return [line[3:] for line in status(paths, cwd) if line.startswith("??")]


def is_clean(paths: Sequence[Path], cwd: Path) -> bool:
    return not status(paths, cwd)


def reset(paths: Sequence[Path], cwd: Path) -> None:
    """Undo a half-finished run: restore tracked files and delete untracked ones."""
    existing = [str(p) for p in paths if p.exists()]
    if existing:
        _git(["checkout", "--", *existing], cwd)
        _git(["clean", "-fd", "--", *existing], cwd)


def commit(paths: Sequence[Path], message: str, cwd: Path) -> str | None:
    """Commit the run's data, or return None when it changed nothing (docs/03 §5 stage 13).

    Only the given paths are staged and committed, so a run can never sweep up unrelated work
    that happened to be staged. `git add` on a pathspec records deletions too, which matters
    because a merged work's file is removed rather than rewritten.
    """
    existing = [str(path) for path in paths if path.exists()]
    if not existing:
        return None
    _git(["add", "--", *existing], cwd)
    if not _git(["diff", "--cached", "--name-only", "--", *existing], cwd).split():
        return None
    _git(["commit", "-m", message, "--", *existing], cwd)
    return _git(["rev-parse", "HEAD"], cwd).strip()
