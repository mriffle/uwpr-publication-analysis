"""Shared test setup. Tests never touch the network (docs/03-retrieval-pipeline.md §12.1)."""

import socket
from typing import NoReturn

import pytest


class NetworkBlockedError(RuntimeError):
    """Raised when a test tries to open a network connection."""


def _blocked(*_args: object, **_kwargs: object) -> NoReturn:
    raise NetworkBlockedError("network access is not allowed in tests (docs/03 §12.1)")


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket.socket, "connect", _blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", _blocked)
    monkeypatch.setattr(socket, "getaddrinfo", _blocked)
