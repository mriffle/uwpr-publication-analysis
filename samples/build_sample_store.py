"""Build the Phase 2 sample store (samples/store/) from samples/sample_works.yaml.

Fetches live metadata (OpenAlex singletons, Crossref, NCBI PMC, UWPR site) and assembles files in the
layout of docs/02-data-model.md. Evidence excerpts come from the definition file; the builder checks that
each PMC excerpt really occurs in the paper's text.

Run:  .venv/bin/python samples/build_sample_store.py
Needs OPEN_ALEX_API_KEY in the environment or in .env at the repository root.
"""
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
OUT = SAMPLES / "store"
CONTACT = "mriffle@uw.edu"
UA = {"User-Agent": f"uwpr-pubs-sample/0.1 (mailto:{CONTACT})"}
STAFF_IDS = {"A5011565192": "eng", "A5067746093": "riffle", "A5134114528": "riffle", "A5018903678": "hoopmann",
             "A5101918119": "sharma", "A5083225847": "vonhaller", "A5061349330": "vonhaller"}
STAFF_START = {"eng": 2006, "riffle": 2006, "sharma": 2006, "vonhaller": 2006, "hoopmann": 2024}
UWPR_PAGES = {"current": "https://proteomicsresource.washington.edu/publications/",
              "older": "https://proteomicsresource.washington.edu/publications/older/"}
LABELS = {  # plain-language labels; in the real pipeline these live in config/rules.yaml
    ("R1", None): "Listed on UWPR's publications page",
    ("R2", "metadata"): "UWPR award code (UWPR95794) in the publication's funding metadata",
    ("R2", "text"): "UWPR award code (UWPR95794) stated in the paper",
    ("R3", None): "The paper names the UW Proteomics Resource",
    ("R3d", None): "The paper's public dataset record says the work was done at the UW Proteomics Resource",
    ("R4", None): "The paper names UWPR's early-era facility (South Lake Union Mass Spec Facility)",
    ("R5", None): "An author's affiliation is the UW Proteomics Resource",
    ("R6", None): "Phrase found in OpenAlex's full-text index of the paper",
    ("R7", None): "A UWPR staff member is thanked for data-analysis or technical help",
}
KIND = {"article": "article", "review": "review", "letter": "letter", "preprint": "preprint",
        "data-paper": "data-paper", "book-chapter": "book-chapter"}
OA_SELECT = ("id,doi,ids,display_name,publication_date,publication_year,type,primary_location,authorships,topics,"
             "open_access,best_oa_location,is_retracted,cited_by_count,counts_by_year,fwci,"
             "citation_normalized_percentile,abstract_inverted_index")


def api_key():
    if os.environ.get("OPEN_ALEX_API_KEY"):
        return os.environ["OPEN_ALEX_API_KEY"]
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("OPEN_ALEX_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("OPEN_ALEX_API_KEY not set")


KEY = api_key()


def fetch(url, as_json=True, pause=0.35):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                body = r.read()
            time.sleep(pause)
            return json.loads(body) if as_json else body
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise RuntimeError(f"{url.split('api_key')[0]}: {e}")
            time.sleep(2 * (attempt + 1))


def sha(b):
    return "sha256:" + hashlib.sha256(b if isinstance(b, bytes) else b.encode()).hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, sort_keys=True, ensure_ascii=False) + "\n" for r in rows))


def norm_title(t):
    return re.sub(r"[^a-z0-9 ]", "", unicodedata.normalize("NFKC", t or "").lower()).strip()


# ---------------------------------------------------------------- sources
def openalex(ids):
    if ids.get("doi"):
        key = "doi:" + ids["doi"]
    elif ids.get("pmid"):
        key = "pmid:" + ids["pmid"]
    else:
        key = ids["openalex"]
    return fetch(f"https://api.openalex.org/works/{urllib.parse.quote(key, safe=':/')}"
                 f"?select={OA_SELECT}&api_key={KEY}&mailto={CONTACT}")


def pmc_xml(pmcid):
    return fetch(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmcid[3:]}"
                 f"&tool=uwpr-pubs&email={CONTACT}", as_json=False)


def xml_text(raw):
    root = ET.fromstring(re.sub(rb"<!DOCTYPE[^>]*>", b"", raw))
    for lab in list(root.iter("label")):
        lab.text = " "
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", " ".join(root.itertext())))


def crossref_preprint_link(preprint_doi):
    try:
        rel = fetch(f"https://api.crossref.org/works/{urllib.parse.quote(preprint_doi)}?mailto={CONTACT}")["message"].get("relation", {})
    except RuntimeError:
        return None
    return "crossref_relation" if rel.get("is-preprint-of") else None


def uwpr_pages():
    out = {}
    for page, url in UWPR_PAGES.items():
        raw = fetch(url, as_json=False)
        out[page] = raw
    return out


def list_entries(pages):
    entries = []
    for page, raw in pages.items():
        for m in re.finditer(r"<li>\s*<b>(.*?)</b>(.*?)</li>", raw.decode("utf-8", "replace"), re.S):
            title = html.unescape(re.sub(r"<.*?>", "", m.group(1))).strip()
            rest = m.group(2)
            venue = re.search(r"<i>(.*?)</i>", rest, re.S)
            authors = html.unescape(re.sub(r"<.*?>", "", rest.split("<i>")[0])).strip()
            pm = re.search(r"pubmed[^\"]*?/(\d+)", rest)
            entries.append({"page": page, "title": title, "authors_text": authors,
                            "venue_text": html.unescape(re.sub(r"<.*?>", "", venue.group(1))).strip() if venue else "",
                            "pmid": pm.group(1) if pm else None, "links": re.findall(r'href="([^"]+)"', rest),
                            "key": f"list:{page}:{hashlib.sha1(norm_title(title).encode()).hexdigest()[:12]}"})
    return entries


# ---------------------------------------------------------------- builders
class Minter:
    def __init__(self):
        self.r = 0

    def record(self):
        self.r += 1
        return f"R-{self.r:06d}"


def abstract_text(w):
    inv = w.get("abstract_inverted_index")
    if not inv:
        return None
    pos = sorted((p, word) for word, ps in inv.items() for p in ps)
    return " ".join(word for _, word in pos)


def build_record(rid, w, pmcid, observed, xml_raw):
    loc = (w.get("primary_location") or {}).get("source") or {}
    authors = []
    for a in w.get("authorships") or []:
        aid = ((a.get("author") or {}).get("id") or "").rsplit("/", 1)[-1] or None
        staff = STAFF_IDS.get(aid)
        if staff and (w.get("publication_year") or 0) < STAFF_START[staff]:
            staff = None
        insts = {i.get("id"): i for i in a.get("institutions") or []}
        affs = []
        for af in a.get("affiliations") or []:
            inst = next((insts.get(i) for i in af.get("institution_ids") or [] if insts.get(i)), None) or {}
            affs.append({"raw": af.get("raw_affiliation_string") or "",
                         "ror": (inst.get("ror") or "").rsplit("/", 1)[-1] or None,
                         "name": inst.get("display_name"), "country": inst.get("country_code")})
        orcid = ((a.get("author") or {}).get("orcid") or "").rsplit("/", 1)[-1] or None
        authors.append({"name": (a.get("author") or {}).get("display_name") or a.get("raw_author_name") or "?",
                        "orcid": orcid, "openalex": aid, "staff": staff,
                        "corresponding": bool(a.get("is_corresponding")), "affiliations": affs})
    topics = [{"domain": t["domain"]["display_name"], "field": t["field"]["display_name"],
               "subfield": t["subfield"]["display_name"], "topic": t["display_name"], "score": round(t["score"], 4)}
              for t in (w.get("topics") or [])[:3]]
    has_body = bool(xml_raw) and b"<body" in xml_raw
    status = "pmc_xml" if has_body else ("abstract_only" if pmcid else "unavailable")
    recheck = None if status == "pmc_xml" else (dt.date.fromisoformat(observed) + dt.timedelta(days=90)).isoformat()
    ab = abstract_text(w)
    ids = w.get("ids") or {}
    oa = w.get("open_access") or {}
    return {
        "id": rid,
        "kind": KIND[w["type"]],
        "ids": {"doi": (w.get("doi") or "").replace("https://doi.org/", "").lower() or None,
                "pmid": (ids.get("pmid") or "").rsplit("/", 1)[-1] or None,
                "pmcid": pmcid,
                "openalex": w["id"].rsplit("/", 1)[-1]},
        "title": w["display_name"],
        "published": w.get("publication_date"),
        "year": w["publication_year"],
        "venue": {"name": loc.get("display_name"), "issn_l": loc.get("issn_l"),
                  "publisher": loc.get("host_organization_name")} if loc.get("display_name") else None,
        "authors": authors,
        "topics": topics,
        "oa": {"status": oa.get("oa_status") or "unknown", "url": oa.get("oa_url"),
               "license": (w.get("best_oa_location") or {}).get("license")},
        "retracted": bool(w.get("is_retracted")),
        "fulltext": {"status": status, "checked": observed, "recheck_after": recheck,
                     "cache": sha(xml_raw) if xml_raw else None},
        "abstract": {"cache": sha(ab)} if ab else None,
        "version_link": None,
        "sources": {"openalex": observed, **({"pmc": observed} if pmcid else {})},
    }


def criterion(e):
    return {"R1": 1, "R2": 2, "R3d": 4, "R4": 4, "R5": 3, "R7": 3, "override": None}.get(
        e["rule"], 3 if e.get("staff") else (2 if e.get("phrase") == "UWPR95794" else 4))


def build_evidence(e, rec, observed, rule_version, list_entry=None, page_url=None):
    rule = e["rule"]
    base = {"rule": rule, "criterion": criterion(e), "record": rec["id"], "rule_version": e.get("rule_version", rule_version),
            "first_seen": observed, "last_seen": observed, "detail": {}}
    if rule == "R1":
        seen = e.get("synthetic_removed") or {"first_seen": observed, "last_seen": observed}
        base.update(label=LABELS[("R1", None)], section="official list", excerpt=None,
                    source={"name": "UWPR website", "url": page_url, "retrieved": seen["last_seen"], "cache": None},
                    detail={"page": list_entry["page"], "list_key": list_entry["key"], **seen},
                    first_seen=seen["first_seen"], last_seen=seen["last_seen"])
    elif rule == "R6":
        q = e["phrase"]
        qq = f'"{q}"' if " " in q else q
        base.update(label=LABELS[("R6", None)], section="full-text index", excerpt=None,
                    source={"name": "OpenAlex", "retrieved": observed, "cache": None,
                            "url": "https://api.openalex.org/works?filter=" + urllib.parse.quote(
                                f"fulltext.search:{qq},doi:{rec['ids']['doi']}", safe=":,")},
                    detail={"phrase": q, "query_date": observed})
    elif rule == "override":
        base.update(label=e["reason"], section="override", excerpt=None, record=None,
                    source={"name": "overrides.yaml", "url": None, "retrieved": observed, "cache": None})
    elif rule == "R2" and e.get("source") == "OpenAlex":
        base.update(label=LABELS[("R2", "metadata")], section="metadata", excerpt=e["excerpt"], detail=e["detail"],
                    source={"name": "OpenAlex", "url": f"https://api.openalex.org/works/{rec['ids']['openalex']}",
                            "retrieved": observed, "cache": None})
    elif rule == "R3d":
        acc = e["dataset"]
        base.update(label=LABELS[("R3d", None)], section="dataset description", excerpt=e["excerpt"],
                    detail={"dataset": acc},
                    source={"name": "PRIDE", "url": f"https://www.ebi.ac.uk/pride/archive/projects/{acc}",
                            "retrieved": observed, "cache": None})
    else:  # text evidence from PMC
        label = LABELS[("R2", "text")] if rule == "R2" else LABELS[(rule, None)]
        detail = dict(e.get("detail") or {})
        if e.get("staff"):
            detail["staff"] = e["staff"]
        base.update(label=label, section=e["section"], excerpt=e["excerpt"], detail=detail,
                    source={"name": "PMC", "url": f"https://pmc.ncbi.nlm.nih.gov/articles/{rec['ids']['pmcid']}/",
                            "retrieved": observed, "cache": rec["fulltext"]["cache"]})
    if e.get("superseded_by"):
        base["superseded"] = {"by_rule_version": e["superseded_by"], "date": observed}
    return base


def check_excerpt(excerpt, text, where):
    probe = re.sub(r"\s+", " ", excerpt.strip("…").strip())[:80]
    if probe not in text:
        raise SystemExit(f"excerpt not found in {where}: {probe!r}")


def main():
    spec = yaml.safe_load((SAMPLES / "sample_works.yaml").read_text())
    observed, rule_version = spec["observed"], spec["rule_version"]
    if OUT.exists():
        shutil.rmtree(OUT)
    mint = Minter()
    pages = uwpr_pages()
    entries = list_entries(pages)
    by_pmid = {e["pmid"]: e for e in entries if e["pmid"]}
    aliases, metrics, list_lines, used_pages = {}, [], [], set()
    included_ids = []

    def alias_ids(ids, wid):
        for k in ("doi", "pmid", "pmcid", "openalex"):
            if ids.get(k):
                aliases[f"{k}:{ids[k]}"] = wid
        for p in ids.get("pride") or []:
            aliases[f"pride:{p}"] = wid

    for wdef in spec["works"]:
        wid = wdef["id"]
        records, xml_texts, discovery = [], [], []
        for rdef in wdef["records"]:
            w = openalex(rdef["ids"])
            pmcid = rdef["ids"].get("pmcid")
            raw = pmc_xml(pmcid) if pmcid else None
            rec = build_record(mint.record(), w, pmcid, observed, raw)
            if rdef["ids"].get("pride"):
                rec["ids"]["pride"] = rdef["ids"]["pride"]
                rec["sources"]["pride"] = observed
            records.append(rec)
            xml_texts.append(xml_text(raw) if raw else None)
            discovery += [{"channel": ch, "record": rec["id"], "first_seen": observed, "last_seen": observed}
                          for ch in rdef["channels"]]
            metrics.append({"schema": 1, "work": wid, "record": rec["id"], "date": observed, "source": "OpenAlex",
                            "cited_by": w.get("cited_by_count") or 0,
                            "cites_by_year": {str(c["year"]): c["cited_by_count"] for c in w.get("counts_by_year") or []},
                            "fwci": w.get("fwci"),
                            "citation_percentile": (w.get("citation_normalized_percentile") or {}).get("value")})
            alias_ids(rec["ids"], wid)
        for i, rdef in enumerate(wdef["records"]):
            link = rdef.get("version_link")
            if link:
                method = link["method"]
                if method == "auto":
                    method = crossref_preprint_link(records[i]["ids"]["doi"]) or "title_author"
                records[i]["version_link"] = {"to": records[link["to_index"]]["id"], "method": method}
        evidence = []
        for e in wdef["evidence"]:
            rec = records[e.get("record_index", 0)]
            entry = page_url = None
            if e["rule"] == "R1":
                entry = by_pmid[rec["ids"]["pmid"]]
                page_url = UWPR_PAGES[entry["page"]]
                used_pages.add(entry["page"])
                seen = e.get("synthetic_removed") or {"first_seen": observed, "last_seen": observed}
                list_lines.append({"schema": 1, **{k: entry[k] for k in ("key", "page", "title", "authors_text",
                                                                         "venue_text", "pmid", "links")},
                                   "work": wid, **seen})
                aliases[entry["key"]] = wid
            if e.get("source") == "PMC":
                check_excerpt(e["excerpt"], xml_texts[e.get("record_index", 0)], f"{wid} {e['rule']}")
            evidence.append(build_evidence(e, rec, observed, rule_version, entry, page_url))
        journal = [r for r in records if r["kind"] != "preprint"]
        canonical = (journal or sorted(records, key=lambda r: r["published"] or ""))[-1 if not journal else 0]["id"]
        basis = "override" if any(e["rule"] == "override" for e in evidence) else "rules"
        work = {"schema": 1, "id": wid, "aliases": wdef.get("retired", []),
                "status": {"included": True, "since": observed, "basis": basis},
                "canonical": canonical,
                "records": sorted(records, key=lambda r: (r["kind"] == "preprint", r["published"] or "")),
                "evidence": sorted(evidence, key=lambda e: (e["rule"], e["record"] or "", e["section"])),
                "discovery": sorted(discovery, key=lambda d: (d["channel"], d["record"])),
                "rule_version": rule_version, "created": observed, "updated": observed}
        write_json(OUT / "works" / f"{wid}.json", work)
        for retired in wdef.get("retired", []):
            aliases[f"work:{retired}"] = wid
        included_ids.append(wid)

    cand_lines = []
    for cdef in spec["candidates"]:
        wid = cdef["id"]
        recs, xml_raw, ft = [], None, None
        for rdef in cdef["records"]:
            w = openalex(rdef["ids"])
            pmcid = rdef["ids"].get("pmcid") or ((w.get("ids") or {}).get("pmcid") or "").rsplit("/", 1)[-1] or None
            xml_raw = pmc_xml(pmcid) if pmcid else None
            rid = mint.record()
            ids = {"doi": (w.get("doi") or "").replace("https://doi.org/", "").lower() or None,
                   "pmid": (w.get("ids", {}).get("pmid") or "").rsplit("/", 1)[-1] or None,
                   "pmcid": pmcid, "openalex": w["id"].rsplit("/", 1)[-1]}
            recs.append({"id": rid, "kind": w["type"], "ids": ids, "title": w["display_name"], "year": w.get("publication_year")})
            alias_ids(ids, wid)
            has_body = bool(xml_raw) and b"<body" in xml_raw
            status = "pmc_xml" if has_body else ("abstract_only" if pmcid else "unavailable")
            ft = {"status": status, "checked": observed, "cache": sha(xml_raw) if xml_raw else None,
                  "recheck_after": None if has_body else (dt.date.fromisoformat(observed) + dt.timedelta(days=90)).isoformat()}
        line = {"schema": 1, "id": wid, "records": recs, "reason": cdef["reason"], "signals": cdef.get("signals", []),
                "channels": cdef["records"][0]["channels"], "fulltext": ft, "rule_version": rule_version,
                "first_seen": observed, "last_seen": observed}
        if cdef.get("reason_detail"):
            line["reason_detail"] = cdef["reason_detail"]
        if cdef.get("former_evidence"):
            rec = {"id": recs[0]["id"], "ids": recs[0]["ids"], "fulltext": ft}
            line["former_evidence"] = []
            for e in cdef["former_evidence"]:
                check_excerpt(e["excerpt"], xml_text(xml_raw), f"{wid} former {e['rule']}")
                line["former_evidence"].append(build_evidence(e, rec, observed, rule_version))
        cand_lines.append(line)

    write_jsonl(OUT / "candidates.jsonl", sorted(cand_lines, key=lambda l: l["id"]))
    write_jsonl(OUT / "official_list" / "entries.jsonl", sorted(list_lines, key=lambda l: l["key"]))
    for page in sorted(used_pages):
        p = OUT / "official_list" / "pages" / observed / f"{page}.html"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(pages[page])
    write_json(OUT / "aliases.json", {"schema": 1, "aliases": dict(sorted(aliases.items()))})
    metrics.sort(key=lambda m: (m["work"], m["record"]))
    write_jsonl(OUT / "metrics" / "latest.jsonl", metrics)
    write_jsonl(OUT / "metrics" / f"{observed[:7]}.jsonl", metrics)

    # one generated-content envelope, to exercise the schema (content is defined in Phase 4)
    w6 = json.loads((OUT / "works" / "W-000006.json").read_text())
    inputs = [r["abstract"]["cache"] for r in w6["records"] if r["abstract"]] + [e["label"] for e in w6["evidence"]]
    write_json(OUT / "works" / "W-000006.generated.json",
               {"schema": 1, "work": "W-000006",
                "inputs": {"fingerprint": sha("\n".join(inputs)), "parts": ["canonical abstract", "evidence"]},
                "generator": {"name": "placeholder (Phase 4 not yet specified)", "version": "0", "date": observed},
                "content": {}})

    overrides = [
        {"target": "W-000014", "action": "include",
         "reason": "SAMPLE ONLY: illustrates an include override; not a real decision.", "by": "sample", "date": observed},
        {"target": ["W-000004", "W-000005"], "action": "merge",
         "reason": "Preprint and article of the same study; titles differ too much to link automatically.",
         "by": "sample", "date": observed},
    ]
    (SAMPLES / "overrides.yaml").write_text(
        "# Sample overrides for the Phase 2 sample store (docs/02-data-model.md §9).\n"
        + yaml.safe_dump(overrides, sort_keys=False, allow_unicode=True))

    rules_count = {}
    for f in (OUT / "works").glob("W-??????.json"):
        for r in {e["rule"] for e in json.loads(f.read_text())["evidence"] if "superseded" not in e}:
            rules_count[r] = rules_count.get(r, 0) + 1
    write_json(OUT / "runs" / f"{observed}T00-00-sample.json", {
        "schema": 1, "run_id": f"{observed}T00-00-sample", "mode": "sample",
        "started": f"{observed}T00:00:00Z", "ended": f"{observed}T00:00:00Z", "code_version": "samples/build_sample_store.py",
        "config_fingerprint": sha((SAMPLES / "sample_works.yaml").read_bytes()), "rule_version": rule_version,
        "note": "Sample run manifest: counts describe the sample store, not a real pipeline run.",
        "channels": {}, "rules": {r: {"works": n, "new": n} for r, n in sorted(rules_count.items())},
        "official_list_recall": {"assessable": 0, "with_evidence": 0}, "fixtures": {},
        "changes": {"added": sorted(included_ids), "removed": [{"work": "W-000015", "reason": "no_longer_meets_rules"}],
                    "merged": [{"into": "W-000004", "retired": "W-000005"}], "list_appeared": [],
                    "list_disappeared": [l["key"] for l in list_lines if l["last_seen"] != observed]},
        "api": {}})
    print(f"built {len(included_ids)} works, {len(cand_lines)} candidates, {len(list_lines)} list entries -> {OUT}")


if __name__ == "__main__":
    main()
