"""Shared test setup. Tests never touch the network (docs/03-retrieval-pipeline.md §12.1)."""

import socket
from pathlib import Path
from typing import NoReturn

import pytest

from uwpr_pubs import config


class NetworkBlockedError(RuntimeError):
    """Raised when a test tries to open a network connection."""


def _blocked(*_args: object, **_kwargs: object) -> NoReturn:
    raise NetworkBlockedError("network access is not allowed in tests (docs/03 §12.1)")


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket.socket, "connect", _blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", _blocked)
    monkeypatch.setattr(socket, "getaddrinfo", _blocked)


@pytest.fixture(autouse=True)
def _no_project_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """The project's own `overrides.yaml` must not reach a test store.

    Overrides name work IDs from the real store. A test store has none of them, so every test
    that validates would fail on a target that cannot resolve — and the failure would appear the
    day the first override is written, far from the change that caused it. Tests that want
    overrides pass their own path.
    """
    monkeypatch.setattr(config, "default_overrides_path", lambda: tmp_path / "no-overrides.yaml")
