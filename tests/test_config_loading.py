"""Loading config/*.yaml and the two fingerprints (docs/03 §10.4)."""

import shutil
from pathlib import Path

import pytest

from uwpr_pubs.config import ConfigError, load_config

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    shutil.copytree(ROOT / "config", tmp_path / "config")
    return tmp_path / "config"


def test_the_projects_config_loads() -> None:
    config = load_config()
    assert config.contact == "mriffle@uw.edu"
    assert config.window_start == 2006
    assert config.rule_version == "2026-09-20.1"
    assert {person["key"] for person in config.staff} == {
        "eng",
        "riffle",
        "hoopmann",
        "sharma",
        "vonhaller",
    }
    assert config.staff_member("hoopmann")["tenure"]["start"] == 2024
    assert len(config.enabled_channels()) == len(config.channels)


def test_fingerprints_ignore_comments_and_formatting(config_dir: Path) -> None:
    before = load_config(config_dir)
    rules = config_dir / "rules.yaml"
    rules.write_text("# an added comment\n\n" + rules.read_text(encoding="utf-8"), encoding="utf-8")
    after = load_config(config_dir)
    assert after.rules_fingerprint == before.rules_fingerprint
    assert after.config_fingerprint == before.config_fingerprint


def test_a_channel_change_moves_only_the_config_fingerprint(config_dir: Path) -> None:
    before = load_config(config_dir)
    channels = config_dir / "channels.yaml"
    channels.write_text(
        channels.read_text(encoding="utf-8").replace("max_results: 3000", "max_results: 2500"),
        encoding="utf-8",
    )
    after = load_config(config_dir)
    assert after.config_fingerprint != before.config_fingerprint
    assert after.rules_fingerprint == before.rules_fingerprint


@pytest.mark.parametrize("name", ["rules", "staff"])
def test_a_rule_or_staff_change_moves_both_fingerprints(config_dir: Path, name: str) -> None:
    before = load_config(config_dir)
    path = config_dir / f"{name}.yaml"
    replacement = {
        "rules": ("merge_within: 20", "merge_within: 25"),
        "staff": ("tenure: {start: 2024, end: null}", "tenure: {start: 2023, end: null}"),
    }[name]
    path.write_text(path.read_text(encoding="utf-8").replace(*replacement), encoding="utf-8")
    after = load_config(config_dir)
    assert after.rules_fingerprint != before.rules_fingerprint
    assert after.config_fingerprint != before.config_fingerprint


def test_the_rule_version_is_outside_the_rules_fingerprint(config_dir: Path) -> None:
    """So the guard can tell 'rules changed' from 'version bumped' (docs/03 §10.4)."""
    before = load_config(config_dir)
    rules = config_dir / "rules.yaml"
    rules.write_text(
        rules.read_text(encoding="utf-8").replace(
            'rule_version: "2026-09-19.2"', 'rule_version: "2026-09-20.1"'
        ),
        encoding="utf-8",
    )
    after = load_config(config_dir)
    assert after.rules_fingerprint == before.rules_fingerprint
    assert after.rule_version == "2026-09-20.1"


def test_invalid_config_is_rejected_with_every_problem(config_dir: Path) -> None:
    settings = config_dir / "settings.yaml"
    settings.write_text(
        settings.read_text(encoding="utf-8").replace("contact: mriffle@uw.edu", "contact: someone@else.org"),
        encoding="utf-8",
    )
    with pytest.raises(ConfigError, match=r"settings\.yaml"):
        load_config(config_dir)


def test_missing_config_is_reported(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="missing"):
        load_config(tmp_path / "config")


def test_the_projects_overrides_load() -> None:
    config = load_config(overrides_path=ROOT / "overrides.yaml")
    assert [override["action"] for override in config.overrides] == ["merge", "exclude"]


@pytest.mark.parametrize(
    ("action", "target"),
    [
        ("exclude", "10.1021/acs.jproteome.5c00706"),
        ("include", "'38665238'"),
        ("merge", "[W-000329, 10.1101/2023.04.01.535000]"),
    ],
    ids=["doi", "pmid", "merge naming a doi"],
)
def test_an_override_must_name_work_ids(tmp_path: Path, action: str, target: str) -> None:
    """The pipeline matches overrides by work ID alone, so any other target would do nothing.

    Until 2026-09-26 the schema accepted a DOI or PMID, and such an entry was loaded, validated
    and then silently ignored (docs/08 §8 item 2). Now the run stops before it starts.
    """
    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        f"- target: {target}\n  action: {action}\n  reason: 'Checked by hand.'\n"
        "  by: mriffle\n  date: 2026-09-26\n",
        encoding="utf-8",
    )
    with pytest.raises(ConfigError, match=r"overrides\.yaml: schema: 0/target.*does not match"):
        load_config(overrides_path=overrides)
