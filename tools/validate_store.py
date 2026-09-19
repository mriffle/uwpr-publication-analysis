"""Validate a publication store against schemas/ and the invariants of docs/02-data-model.md §14.

Usage:  .venv/bin/python tools/validate_store.py [STORE_DIR] [--overrides PATH]
        default STORE_DIR = store ; default overrides = STORE_DIR/../overrides.yaml
Exit status 1 if any error is found. Warnings do not fail the run.
"""
import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"
INCLUDED_KINDS = {"article", "review", "letter", "data-paper", "book-chapter", "preprint"}


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def load_schemas():
    resources = []
    for p in SCHEMAS.glob("*.schema.json"):
        doc = json.loads(p.read_text())
        resources.append((doc["$id"], Resource.from_contents(doc)))
    registry = Registry().with_resources(resources)
    base = "https://uwpr-pubs.local/schemas/"

    def validator(name):
        return Draft202012Validator(registry.contents(base + name), registry=registry)
    return {n: validator(f"{n}.schema.json") for n in
            ("work", "candidate", "list-entry", "generated", "metrics", "run", "overrides", "aliases")}


def check_schema(v, obj, where, rep):
    for err in sorted(v.iter_errors(obj), key=lambda e: list(e.absolute_path)):
        path = "/".join(str(p) for p in err.absolute_path) or "(root)"
        rep.error(where, f"schema: {path}: {err.message[:200]}")


def read_jsonl(path, rep):
    rows = []
    if not path.exists():
        return rows
    for n, line in enumerate(path.read_text().splitlines(), 1):
        if line.strip():
            try:
                rows.append((n, json.loads(line)))
            except json.JSONDecodeError as e:
                rep.error(f"{path.name}:{n}", f"invalid JSON: {e}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("store", nargs="?", default="store")
    ap.add_argument("--overrides")
    args = ap.parse_args()
    store = Path(args.store)
    overrides_path = Path(args.overrides) if args.overrides else store.parent / "overrides.yaml"
    rep = Report()
    V = load_schemas()

    # ---- load and schema-check every file (invariant 8)
    works = {}
    for p in sorted((store / "works").glob("W-??????.json")):
        w = json.loads(p.read_text())
        check_schema(V["work"], w, p.name, rep)
        if w.get("id") != p.stem:
            rep.error(p.name, f"file name does not match id {w.get('id')}")
        works[w.get("id")] = w
    generated = {}
    for p in sorted((store / "works").glob("W-??????.generated.json")):
        g = json.loads(p.read_text())
        check_schema(V["generated"], g, p.name, rep)
        generated[g.get("work")] = g
    cands = {}
    for n, c in read_jsonl(store / "candidates.jsonl", rep):
        check_schema(V["candidate"], c, f"candidates.jsonl:{n}", rep)
        cands[c.get("id")] = c
    entries = []
    for n, e in read_jsonl(store / "official_list" / "entries.jsonl", rep):
        check_schema(V["list-entry"], e, f"entries.jsonl:{n}", rep)
        entries.append(e)
    metrics = []
    for p in sorted((store / "metrics").glob("*.jsonl")):
        for n, m in read_jsonl(p, rep):
            check_schema(V["metrics"], m, f"{p.name}:{n}", rep)
            metrics.append((p.name, m))
    for p in sorted((store / "runs").glob("*.json")):
        check_schema(V["run"], json.loads(p.read_text()), p.name, rep)
    aliases = {}
    ap_ = store / "aliases.json"
    if ap_.exists():
        a = json.loads(ap_.read_text())
        check_schema(V["aliases"], a, "aliases.json", rep)
        aliases = a.get("aliases", {})
    else:
        rep.error("aliases.json", "missing")
    overrides = []
    if overrides_path.exists():
        # Hand-written YAML: an unquoted 2026-09-20 loads as a date object; treat it as the ISO string.
        overrides = [{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in o.items()}
                     for o in (yaml.safe_load(overrides_path.read_text()) or [])]
        check_schema(V["overrides"], overrides, overrides_path.name, rep)

    # ---- invariant 1: every work ID in exactly one place
    for wid in set(works) & set(cands):
        rep.error(wid, "present in both works/ and candidates.jsonl")
    all_ids = set(works) | set(cands)
    retired = {k.split(":", 1)[1]: v for k, v in aliases.items() if k.startswith("work:")}
    for old, new in retired.items():
        if old in all_ids:
            rep.error(old, f"retired ID still in use (aliased to {new})")

    # ---- invariant 2: records unique; external IDs resolve to exactly one work
    rec_owner, ext_owner = {}, {}
    def own_ids(wid, rec):
        if rec["id"] in rec_owner:
            rep.error(rec["id"], f"record in both {rec_owner[rec['id']]} and {wid}")
        rec_owner[rec["id"]] = wid
        ids = rec.get("ids", {})
        keys = [f"{k}:{ids[k]}" for k in ("doi", "pmid", "pmcid", "openalex") if ids.get(k)]
        keys += [f"pride:{p}" for p in ids.get("pride") or []]
        for k in keys:
            if k in ext_owner and ext_owner[k] != wid:
                rep.error(k, f"external ID claimed by {ext_owner[k]} and {wid}")
            ext_owner[k] = wid
            if aliases.get(k) != wid:
                rep.error(wid, f"aliases.json does not map {k} to {wid} (maps to {aliases.get(k)})")
    for wid, w in works.items():
        for r in w.get("records", []):
            own_ids(wid, r)
    for wid, c in cands.items():
        for r in c.get("records", []):
            own_ids(wid, r)
    for k, target in aliases.items():
        if target not in all_ids:
            rep.error("aliases.json", f"{k} -> {target}, which is not a current work")

    list_work_ids = {e.get("work") for e in entries}
    include_overrides = {o["target"] for o in overrides if o.get("action") == "include" and isinstance(o.get("target"), str)}

    for wid, w in works.items():
        recs = {r["id"]: r for r in w.get("records", [])}
        # invariant 3: canonical record exists and is an included kind
        canon = recs.get(w.get("canonical"))
        if not canon:
            rep.error(wid, "canonical record not among its records")
        elif canon["kind"] not in INCLUDED_KINDS:
            rep.error(wid, f"canonical record kind {canon['kind']} is not an included type")
        elif canon["kind"] == "preprint" and any(r["kind"] != "preprint" for r in recs.values()):
            rep.error(wid, "canonical is a preprint although a journal version exists")
        # references inside the work
        for e in w.get("evidence", []):
            if e.get("record") and e["record"] not in recs:
                rep.error(wid, f"evidence {e['rule']} points to unknown record {e['record']}")
        for d in w.get("discovery", []):
            if d["record"] not in recs:
                rep.error(wid, f"discovery points to unknown record {d['record']}")
        for r in recs.values():
            vl = r.get("version_link")
            if vl and vl["to"] not in recs:
                rep.error(wid, f"{r['id']} version_link to record outside the work")
            if r["fulltext"]["status"] != "pmc_xml" and not r["fulltext"]["recheck_after"]:
                rep.warn(wid, f"{r['id']} has unreadable text but no recheck_after date")
        # invariant 4: active evidence, or listed, or include override
        active = [e for e in w.get("evidence", []) if "superseded" not in e]
        if not (active or wid in list_work_ids or wid in include_overrides):
            rep.error(wid, "included without active evidence, list entry or include override")
        if any(e["rule"] == "R1" for e in active) and wid not in list_work_ids:
            rep.error(wid, "has R1 evidence but no official-list entry")
        if w["status"]["basis"] == "override" and wid not in include_overrides:
            rep.error(wid, "status basis is override but no include override targets it")
        if any(e["rule"] == "override" for e in active) and wid not in include_overrides:
            rep.error(wid, "override evidence without a matching include override")

    # invariant 5: every list entry maps to an included work, with R1 evidence
    for e in entries:
        w = works.get(e.get("work"))
        if not w:
            rep.error(e.get("key"), f"list entry maps to {e.get('work')}, which is not an included work")
        elif not any(ev["rule"] == "R1" and ev["detail"].get("list_key") == e["key"] for ev in w["evidence"]):
            rep.error(e.get("key"), f"{w['id']} lacks R1 evidence for this entry")

    # candidates: reason-specific checks
    for wid, c in cands.items():
        if c["reason"] == "override_exclude" and not any(
                o.get("action") == "exclude" and o.get("target") == wid for o in overrides):
            rep.error(wid, "reason override_exclude but no exclude override targets it")
        if wid in list_work_ids:
            rep.error(wid, "on the official list but not included (R1 always wins)")

    # invariant 6: cache references (warning only; the cache is not part of the store)
    cache_refs = sum(1 for w in works.values() for r in w["records"] if r["fulltext"]["cache"]) + \
        sum(1 for w in works.values() for e in w["evidence"] if e["source"]["cache"])
    cache_index = store.parent / "cache" / "index.jsonl"
    if cache_refs and not cache_index.exists():
        rep.warn("cache", f"{cache_refs} cache references not checked: no cache/index.jsonl beside the store")

    # invariant 7: override targets resolve
    for o in overrides:
        targets = o["target"] if isinstance(o["target"], list) else [o["target"]]
        for t in targets:
            if t.startswith("W-"):
                if t not in all_ids and t not in retired:
                    rep.error("overrides", f"{o['action']} target {t} does not resolve")
                if o["action"] == "merge" and t != targets[0] and t not in retired:
                    rep.error("overrides", f"merge: {t} should be retired and aliased to {targets[0]}")
            elif f"doi:{t}" not in aliases and f"pmid:{t}" not in aliases:
                rep.warn("overrides", f"{o['action']} target {t} not yet in the store")

    # metrics and generated content refer to included works and their records
    for name, m in metrics:
        w = works.get(m["work"])
        if not w:
            rep.error(name, f"metrics for {m['work']}, which is not an included work")
        elif m["record"] not in {r["id"] for r in w["records"]}:
            rep.error(name, f"metrics record {m['record']} not in {m['work']}")
    for wid in generated:
        if wid not in works:
            rep.error(f"{wid}.generated.json", "generated content for a work that is not included")

    print(f"store: {store}  works: {len(works)}  candidates: {len(cands)}  list entries: {len(entries)}  "
          f"metrics lines: {len(metrics)}  overrides: {len(overrides)}")
    for w in rep.warnings:
        print("WARN ", w)
    for e in rep.errors:
        print("ERROR", e)
    print(f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    sys.exit(1 if rep.errors else 0)


if __name__ == "__main__":
    main()
