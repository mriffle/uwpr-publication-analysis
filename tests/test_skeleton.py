"""Checks on the package skeleton and the shared test setup."""

import socket
from importlib.metadata import version

import pytest

from uwpr_pubs import __version__, cli


def test_version_matches_package_metadata() -> None:
    assert __version__ == version("uwpr-pubs")


def test_cli_version(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        cli.main(["--version"])
    assert exc.value.code == 0
    assert capsys.readouterr().out.strip() == f"uwpr-pubs {__version__}"


def test_cli_without_arguments_prints_help(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main([]) == 0
    assert "usage: uwpr-pubs" in capsys.readouterr().out


def test_network_is_blocked() -> None:
    with pytest.raises(RuntimeError, match="network access is not allowed"):
        socket.create_connection(("example.org", 443), timeout=1)
