"""Loading config/*.yaml and the three fingerprints (docs/03 §10.4)."""

import shutil
from pathlib import Path
from typing import cast

import pytest

from uwpr_pubs.config import ConfigError, load_config, overrides_fingerprint
from uwpr_pubs.store.models import Override

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    shutil.copytree(ROOT / "config", tmp_path / "config")
    return tmp_path / "config"


def test_the_projects_config_loads() -> None:
    config = load_config()
    assert config.contact == "mriffle@uw.edu"
    assert config.window_start == 2006
    assert config.rule_version == "2026-09-26.1"
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
    """So the guard can tell 'rules changed' from 'version bumped' (docs/03 §10.4).

    It replaces whatever the version is: naming one went stale at the next bump, and the test
    then changed nothing and passed anyway.
    """
    before = load_config(config_dir)
    rules = config_dir / "rules.yaml"
    rules.write_text(
        rules.read_text(encoding="utf-8").replace(
            f'rule_version: "{before.rule_version}"', 'rule_version: "2099-01-01.1"'
        ),
        encoding="utf-8",
    )
    after = load_config(config_dir)
    assert after.rule_version == "2099-01-01.1"
    assert after.rules_fingerprint == before.rules_fingerprint


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


def test_only_a_work_override_moves_the_overrides_fingerprint(config_dir: Path, tmp_path: Path) -> None:
    """Stage 4 reads every record again when it moves (docs/03 §6.1 item 4), so nothing else may.

    Until 2026-09-26 stage 4 compared the config fingerprint instead, and an edit to
    `channels.yaml` read every text again (docs/08 §8 item 9).
    """
    before = load_config(config_dir)
    channels = config_dir / "channels.yaml"
    channels.write_text(
        channels.read_text(encoding="utf-8").replace("max_results: 3000", "max_results: 2500"),
        encoding="utf-8",
    )
    edited = load_config(config_dir)
    assert edited.config_fingerprint != before.config_fingerprint
    assert edited.overrides_fingerprint == before.overrides_fingerprint

    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        "- target: W-000001\n  action: exclude\n  reason: 'Not UWPR work.'\n"
        "  by: mriffle\n  date: 2026-09-26\n",
        encoding="utf-8",
    )
    excluded = load_config(config_dir, overrides_path=overrides)
    assert excluded.overrides_fingerprint != before.overrides_fingerprint

    overrides.write_text(
        "# reviewed by hand\n- {target: W-000001, action: exclude, reason: Not UWPR work., by: mriffle,"
        " date: '2026-09-26'}\n",
        encoding="utf-8",
    )
    reformatted = load_config(config_dir, overrides_path=overrides)
    assert reformatted.overrides_fingerprint == excluded.overrides_fingerprint


def test_an_override_of_another_kind_leaves_the_overrides_fingerprint_alone() -> None:
    """Include, exclude, merge and split decide which works exist, so only they re-read the text.

    A grant override (docs/09 §6.6) corrects what one string on one work is, and needs no text: it
    must not make every record worth reading again.
    """
    exclude = cast(
        Override,
        {
            "target": "W-000001",
            "action": "exclude",
            "reason": "Not UWPR work.",
            "by": "mriffle",
            "date": "2026-09-26",
        },
    )
    other = cast(Override, {**exclude, "action": "grant", "raw": "U19AG02312", "grant": "NIH:U19AG023122"})
    assert overrides_fingerprint([exclude, other]) == overrides_fingerprint([exclude])
    assert overrides_fingerprint([exclude]) != overrides_fingerprint([])


def test_a_grant_override_loads_and_moves_only_the_config_fingerprint(tmp_path: Path) -> None:
    """Recorded, so a run says what it ran with; but it re-reads nothing (docs/09 §8.5).

    Appendix E.1's shape, loaded as a run loads it: `grant` may be a key or null.
    """
    overrides = tmp_path / "overrides.yaml"
    exclude = (
        "- target: W-000001\n  action: exclude\n  reason: 'Not UWPR work.'\n"
        "  by: mriffle\n  date: 2026-09-26\n"
    )
    overrides.write_text(exclude, encoding="utf-8")
    before = load_config(overrides_path=overrides)

    overrides.write_text(
        exclude + "- target: W-000222\n  action: grant\n  raw: U19AG02312\n  grant: NIH:U19AG023122\n"
        "  reason: >-\n    The only RePORTER core one edit away.\n  by: mriffle\n  date: 2026-09-26\n"
        "- target: W-000270\n  action: grant\n  raw: PGT121\n  grant: null\n"
        "  reason: An HIV antibody.\n  by: mriffle\n  date: 2026-09-26\n",
        encoding="utf-8",
    )
    after = load_config(overrides_path=overrides)

    assert [o["action"] for o in after.overrides] == ["exclude", "grant", "grant"]
    assert after.overrides[1]["grant"] == "NIH:U19AG023122"
    assert after.overrides[2]["grant"] is None
    assert after.overrides_fingerprint == before.overrides_fingerprint
    assert after.config_fingerprint != before.config_fingerprint


def test_a_grant_override_needs_its_string_and_its_grant(tmp_path: Path) -> None:
    overrides = tmp_path / "overrides.yaml"
    overrides.write_text(
        "- target: W-000222\n  action: grant\n  grant: NIH:U19AG023122\n"
        "  reason: Checked.\n  by: mriffle\n  date: 2026-09-26\n",
        encoding="utf-8",
    )
    with pytest.raises(ConfigError, match=r"overrides\.yaml: schema: 0: 'raw' is a required property"):
        load_config(overrides_path=overrides)
