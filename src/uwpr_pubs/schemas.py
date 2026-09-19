"""Locating and loading the JSON Schemas (docs/02-data-model.md §18).

The schemas live at the repository root, beside the store they describe, and are part of the
frozen Phase 2 spec. They are found by walking up from the working directory, so the package works
from a subdirectory, with the package's own location as the fallback.
"""

import json
import os
from functools import cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMA_BASE = "https://uwpr-pubs.local/schemas/"
STORE_SCHEMAS = ("work", "candidate", "list-entry", "generated", "metrics", "run", "overrides", "aliases")
CONFIG_SCHEMAS = ("settings", "staff", "channels", "rules", "fixtures")


@cache
def project_root() -> Path:
    override = os.environ.get("UWPR_PUBS_ROOT")
    candidates = [Path(override)] if override else []
    candidates += [Path.cwd(), *Path.cwd().parents, Path(__file__).resolve().parents[2]]
    for base in candidates:
        if (base / "schemas" / "common.schema.json").is_file():
            return base
    raise FileNotFoundError("cannot find schemas/common.schema.json; set UWPR_PUBS_ROOT")


@cache
def registry() -> Registry[Any]:
    resources = []
    for path in sorted((project_root() / "schemas").rglob("*.schema.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        resources.append((document["$id"], Resource.from_contents(document)))
    return Registry().with_resources(resources)


@cache
def validator(name: str) -> Draft202012Validator:
    """`name` is a schema stem, e.g. "work" or "config/settings"."""
    store = registry()
    return Draft202012Validator(store.contents(f"{SCHEMA_BASE}{name}.schema.json"), registry=store)


def schema_errors(name: str, instance: object) -> list[str]:
    """Human-readable schema errors, in document order."""
    errors = sorted(validator(name).iter_errors(instance), key=lambda e: list(e.absolute_path))
    return [
        f"schema: {'/'.join(str(p) for p in error.absolute_path) or '(root)'}: {error.message[:200]}"
        for error in errors
    ]
