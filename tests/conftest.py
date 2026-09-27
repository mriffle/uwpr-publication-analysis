"""Shared test setup. Tests never touch the network (docs/03-retrieval-pipeline.md §12.1)."""

import re
import shutil
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


@pytest.fixture(scope="session")
def _config_switched_off(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The project's configuration, byte for byte, but for `enabled: false` in `funding.yaml`."""
    directory = tmp_path_factory.mktemp("project") / "config"
    shutil.copytree(config.default_config_dir(), directory)
    funding = directory / "funding.yaml"
    committed = funding.read_text(encoding="utf-8")
    text, found = re.subn(r"^enabled: (?:true|false)\b", "enabled: false", committed, count=1, flags=re.M)
    assert found == 1, "funding.yaml has no top-level `enabled:` line to switch off"
    funding.write_text(text, encoding="utf-8")
    return directory


@pytest.fixture(autouse=True)
def _no_project_funding(monkeypatch: pytest.MonkeyPatch, _config_switched_off: Path) -> None:
    """The project's `enabled: true` must not reach a test run, as its overrides must not.

    The fake sources answer no funding source, so once the seed switched funding on (docs/09 B9)
    every pipeline test that loads the project's configuration would degrade, far from the change
    that caused it. Tests run with a copy of the project's configuration that differs only in
    `enabled: false`; a test that wants funding enables it on its own copy, and a test of the
    committed files names `config/` itself.
    """
    monkeypatch.setattr(config, "default_config_dir", lambda: _config_switched_off)
