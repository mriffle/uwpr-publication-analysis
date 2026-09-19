"""Loading, validating and fingerprinting `config/*.yaml` (docs/03-retrieval-pipeline.md §10).

Two fingerprints, with different consequences:
- the **rules fingerprint** covers `rules.yaml` (without its version) and `staff.yaml`. It may
  change only together with `rule_version`, and a change re-evaluates every work (§10.4).
- the **config fingerprint** covers every config file and `overrides.yaml`. A change to it alone
  re-evaluates nothing, except a change to the overrides, which re-evaluates the works they name.
Both ignore comments and formatting, because they hash the parsed content.
"""

import datetime as dt
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

from uwpr_pubs.schemas import project_root, schema_errors
from uwpr_pubs.store.models import CacheRef, Override, RuleVersion, StaffKey

CONFIG_FILES = ("settings", "staff", "channels", "rules", "fixtures")


class ConfigError(Exception):
    """Configuration that does not match its schema, or is missing."""


def _iso_dates(value: Any) -> Any:
    """YAML reads an unquoted 2026-09-20 as a date; the schemas expect the ISO string."""
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _iso_dates(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_iso_dates(v) for v in value]
    return value


def fingerprint(content: object) -> CacheRef:
    canonical = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load_yaml(path: Path) -> Any:
    if not path.is_file():
        raise ConfigError(f"{path} is missing")
    return _iso_dates(yaml.safe_load(path.read_text(encoding="utf-8")))


@dataclass(frozen=True)
class Config:
    settings: dict[str, Any]
    staff: list[dict[str, Any]]
    channels: list[dict[str, Any]]
    rules: dict[str, Any]
    fixtures: list[dict[str, Any]]
    overrides: list[Override]
    config_fingerprint: CacheRef
    rules_fingerprint: CacheRef

    @property
    def rule_version(self) -> RuleVersion:
        return cast(RuleVersion, self.rules["rule_version"])

    @property
    def contact(self) -> str:
        return cast(str, self.settings["contact"])

    @property
    def window_start(self) -> int:
        return cast(int, self.settings["window_start"])

    def staff_member(self, key: StaffKey) -> dict[str, Any]:
        for person in self.staff:
            if person["key"] == key:
                return person
        raise KeyError(key)

    def enabled_channels(self) -> list[dict[str, Any]]:
        return [channel for channel in self.channels if channel["enabled"]]


def load_config(config_dir: Path | None = None, overrides_path: Path | None = None) -> Config:
    root = project_root()
    directory = config_dir if config_dir is not None else root / "config"
    overrides_file = overrides_path if overrides_path is not None else root / "overrides.yaml"

    documents: dict[str, Any] = {}
    problems: list[str] = []
    for name in CONFIG_FILES:
        document = _load_yaml(directory / f"{name}.yaml")
        problems += [f"{name}.yaml: {message}" for message in schema_errors(f"config/{name}", document)]
        documents[name] = document

    overrides: list[Override] = []
    if overrides_file.is_file():
        loaded = _iso_dates(yaml.safe_load(overrides_file.read_text(encoding="utf-8"))) or []
        problems += [f"{overrides_file.name}: {message}" for message in schema_errors("overrides", loaded)]
        overrides = cast(list[Override], loaded)

    if problems:
        raise ConfigError("invalid configuration:\n  " + "\n  ".join(problems))

    rules = documents["rules"]
    rules_without_version = {k: v for k, v in rules.items() if k != "rule_version"}
    return Config(
        settings=documents["settings"],
        staff=documents["staff"]["staff"],
        channels=documents["channels"]["channels"],
        rules=rules,
        fixtures=documents["fixtures"]["fixtures"],
        overrides=overrides,
        config_fingerprint=fingerprint({**documents, "overrides": overrides}),
        rules_fingerprint=fingerprint({"rules": rules_without_version, "staff": documents["staff"]}),
    )
