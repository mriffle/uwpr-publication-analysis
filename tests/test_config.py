"""The config files validate and agree with the frozen specs (docs/03-retrieval-pipeline.md §10).

Stands in for `uwpr_pubs.config` until that module exists.
"""

import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
CONFIG_NAMES = ["settings", "staff", "channels", "rules", "fixtures"]


def load_config(name: str) -> Any:
    return yaml.safe_load((ROOT / "config" / f"{name}.yaml").read_text(encoding="utf-8"))


def schema_registry() -> Registry[Any]:
    resources = []
    for path in sorted((ROOT / "schemas").rglob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        resources.append((schema["$id"], Resource.from_contents(schema)))
    return Registry().with_resources(resources)


@pytest.mark.parametrize("name", CONFIG_NAMES)
def test_config_matches_its_schema(name: str) -> None:
    schema = json.loads((ROOT / "schemas" / "config" / f"{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, registry=schema_registry())
    errors = [f"{list(e.absolute_path)}: {e.message}" for e in validator.iter_errors(load_config(name))]
    assert errors == []


def rule_patterns(rules: Any) -> list[str]:
    """Every regex in rules.yaml (the plain-substring lists are not regexes)."""
    types = rules["record_types"]
    text = rules["text"]
    r3 = rules["r3"]
    r7 = rules["r7"]
    work = [p for item in r7["work"] for p in (item["all"] if isinstance(item, dict) else [item])]
    return [
        *(entry["pattern"] for entry in types["exclude_doi_patterns"]),
        types["exclude_title_pattern"]["pattern"],
        text["sentence_end"],
        text["methods_title_pattern"],
        rules["r2"]["near_miss_pattern"],
        r3["uw"],
        r3["resource"],
        r3["acronym"],
        rules["r4"]["pattern"],
        rules["r5"]["university"],
        r7["thanks"],
        *work,
        *r7["disqualifiers"].values(),
        *rules["signals"]["cores"].values(),
    ]


def test_every_pattern_compiles() -> None:
    staff_patterns = [p for person in load_config("staff")["staff"] for p in person["name_patterns"]]
    for pattern in [*rule_patterns(load_config("rules")), *staff_patterns]:
        re.compile(pattern)


# Phase 1 §6.6 full-name forms, plus the fixture I misspelling (Phase 1 §12).
STAFF_FORMS = {
    "eng": ["Jimmy Eng", "Jimmy K. Eng", "J. K. Eng"],
    "riffle": ["Michael Riffle", "Mike Riffle"],
    "hoopmann": ["Michael Hoopmann", "Michael R. Hoopmann"],
    "sharma": ["Vagisha Sharma"],
    "vonhaller": [
        "Priska von Haller",
        "Priska Van Haller",
        "P. von Haller",
        "P. D. von Haller",
        "Dr. von Haller",
        "Dr. Priska von Haler",
    ],
}
NOT_STAFF_FORMS = ["Eng", "Dr. Eng", "Riffle", "M. Riffle", "Hoopmann", "Sharma", "von Haller", "Haller"]


def staff_matching(text: str) -> set[str]:
    staff = load_config("staff")["staff"]
    return {p["key"] for p in staff if any(re.search(pat, text) for pat in p["name_patterns"])}


@pytest.mark.parametrize(("key", "form"), [(k, f) for k, forms in STAFF_FORMS.items() for f in forms])
def test_staff_name_forms_match_only_their_person(key: str, form: str) -> None:
    assert staff_matching(f"We thank {form} for technical assistance.") == {key}


@pytest.mark.parametrize("form", NOT_STAFF_FORMS)
def test_bare_surnames_do_not_match(form: str) -> None:
    assert staff_matching(f"We thank {form} for technical assistance.") == set()


def test_staff_keys_and_ids_are_unique() -> None:
    staff = load_config("staff")["staff"]
    keys = [p["key"] for p in staff]
    ids = [i for p in staff for i in p["openalex"]]
    assert len(keys) == len(set(keys))
    assert len(ids) == len(set(ids))
    assert set(keys) == set(STAFF_FORMS)


def test_every_phase1_channel_is_configured_once_per_source() -> None:
    channels = load_config("channels")["channels"]
    pairs = [(c["id"], c["source"]) for c in channels]
    assert len(pairs) == len(set(pairs))
    common = json.loads((ROOT / "schemas" / "common.schema.json").read_text(encoding="utf-8"))
    assert {c["id"] for c in channels} == set(common["$defs"]["channel"]["enum"])


def test_r6_phrases_are_queried_by_openalex_channels() -> None:
    r6 = load_config("rules")["r6"]
    openalex = [c for c in load_config("channels")["channels"] if c["source"] == "openalex"]
    queries = {q for c in openalex for q in c["queries"]}
    for phrase in [*r6["include_phrases"], *r6["nominate_only"]]:
        assert f"fulltext.search:{phrase}" in queries


def test_labels_match_the_sample_store() -> None:
    labels = load_config("rules")["labels"]
    for path in sorted((ROOT / "samples" / "store" / "works").glob("W-??????.json")):
        for evidence in json.loads(path.read_text(encoding="utf-8"))["evidence"]:
            key = evidence["rule"]
            if key == "override":
                continue
            if key == "R2":
                key = "R2.metadata" if evidence["section"] == "metadata" else "R2.text"
            assert evidence["label"] == labels[key], path.name


def test_fixture_ids_are_unique() -> None:
    ids = [f["id"] for f in load_config("fixtures")["fixtures"]]
    assert len(ids) == len(set(ids))
