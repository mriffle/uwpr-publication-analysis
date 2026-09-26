"""Canonical writing, ordering, ID minting and the owned-paths policy."""

import datetime as dt
import json
import random
import shutil
from pathlib import Path
from typing import Any

import pytest

from uwpr_pubs.context import RunContext
from uwpr_pubs.store import ids, io
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import FundingSnapshot, read_store

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "store"
FUNDING = Path(__file__).resolve().parent / "fixtures" / "funding"  # synthetic, over the sample's works


def sample_files() -> list[Path]:
    return sorted(p for p in SAMPLE.rglob("*") if p.suffix in {".json", ".jsonl"})


@pytest.mark.parametrize("path", sample_files(), ids=lambda p: str(p.relative_to(SAMPLE)))
def test_sample_store_round_trips_byte_identically(path: Path) -> None:
    """Reading and rewriting any store file must not change a byte (docs/02 §15)."""
    original = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl":
        assert io.canonical_jsonl(io.read_jsonl(path)) == original
    else:
        assert io.canonical_json(io.read_json(path)) == original


def test_sorting_reproduces_the_sample_order() -> None:
    for path in sorted(SAMPLE.glob("works/W-??????.json")):
        work = io.read_json(path)
        assert io.sort_records(work["records"]) == work["records"]
        assert io.sort_evidence(work["evidence"]) == work["evidence"]
        assert io.sort_discovery(work["discovery"]) == work["discovery"]
    assert io.sort_candidates(io.read_jsonl(SAMPLE / "candidates.jsonl")) == io.read_jsonl(
        SAMPLE / "candidates.jsonl"
    )
    entries = io.read_jsonl(SAMPLE / "official_list" / "entries.jsonl")
    assert io.sort_entries(entries) == entries
    metrics = io.read_jsonl(SAMPLE / "metrics" / "latest.jsonl")
    assert io.sort_metrics(metrics) == metrics


def test_write_is_atomic_and_leaves_no_temporary_file(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "work.json"
    io.write_json(target, {"b": 1, "a": 2})
    assert target.read_text(encoding="utf-8") == '{\n  "a": 2,\n  "b": 1\n}\n'
    assert [p.name for p in target.parent.iterdir()] == ["work.json"]


def test_failed_write_removes_the_temporary_file(tmp_path: Path) -> None:
    target = tmp_path / "work.json"
    with pytest.raises(TypeError):
        io.write_json(target, {"bad": object()})
    assert list(tmp_path.iterdir()) == []


def test_next_ids_continue_after_the_sample_store() -> None:
    minter = read_store(SAMPLE).minter()
    assert (minter.mint_work(), minter.mint_record()) == ("W-000022", "R-000023")


def test_retired_work_ids_are_never_reused() -> None:
    snapshot = read_store(SAMPLE)
    assert snapshot.is_retired("W-000005")
    minted = {snapshot.minter().mint_work() for _ in range(5)}
    assert "W-000005" not in minted


def test_minting_order_does_not_depend_on_arrival_order() -> None:
    nominations = [
        {"doi": "10.1/b", "pmid": None},
        {"pmid": "222"},
        {"doi": "10.1/a"},
        {"openalex": "W3"},
    ]
    forwards = [ids.mint_order(n) for n in sorted(nominations, key=ids.mint_order)]  # type: ignore[arg-type]
    backwards = [ids.mint_order(n) for n in sorted(reversed(nominations), key=ids.mint_order)]  # type: ignore[arg-type]
    assert forwards == backwards


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://doi.org/10.1021/ACS.X", "10.1021/acs.x"),
        ("doi:10.1021/Acs.X", "10.1021/acs.x"),
        ("  10.1021/acs.x  ", "10.1021/acs.x"),
    ],
)
def test_doi_normalisation(raw: str, expected: str) -> None:
    assert ids.normalise_doi(raw) == expected


def test_external_keys_cover_every_identifier_type() -> None:
    keys = ids.external_keys(
        {
            "doi": "10.1/A",
            "pmid": "1",
            "pmcid": "PMC2",
            "openalex": "W3",
            "pride": ["PXD000002", "PXD000001"],
            "list": "list:2026:0123456789ab",
        }
    )
    assert keys == [
        "doi:10.1/a",
        "pmid:1",
        "pmcid:PMC2",
        "openalex:W3",
        "pride:PXD000001",
        "pride:PXD000002",
        "list:2026:0123456789ab",
    ]


def test_sample_alias_keys_match_what_the_code_would_write() -> None:
    snapshot = read_store(SAMPLE)
    for work_id, work in snapshot.works.items():
        for record in work["records"]:
            for key in ids.external_keys(record["ids"]):
                assert snapshot.aliases.get(key) == work_id, key


def test_carried_forward_lists_everything_a_run_must_not_delete() -> None:
    carried = {p.name for p in StorePaths(SAMPLE).carried_forward()}
    assert "W-000006.generated.json" in carried
    assert "2026-09.jsonl" in carried
    assert "2026-09-19T00-00-sample.json" in carried
    assert "latest.jsonl" not in carried


def test_run_context_derives_its_identity_from_the_injected_clock() -> None:
    started = dt.datetime(2026, 9, 21, 13, 17, 5, tzinfo=dt.UTC)
    ctx = RunContext(today=started.date(), started=started, mode="live", store=Path("store"))
    assert ctx.run_id == "2026-09-21T13-17-live"
    assert ctx.date == "2026-09-21"
    assert ctx.started_at == "2026-09-21T13:17:05Z"
    assert ctx.year_month == "2026-09"
    assert ctx.days_since("2026-08-24") == 28


def test_sample_store_reads_into_typed_snapshot() -> None:
    snapshot = read_store(SAMPLE)
    assert len(snapshot.works) == 13
    assert len(snapshot.candidates) == 7
    assert len(snapshot.entries) == 4
    latest = snapshot.latest_run()
    assert latest is not None
    assert latest["mode"] == "sample"
    assert json.loads(json.dumps(snapshot.aliases))["work:W-000005"] == "W-000004"


# --- store/funding/ (docs/09 §8) ----------------------------------------------------------------


def funded_sample(tmp_path: Path) -> Path:
    store = tmp_path / "store"
    shutil.copytree(SAMPLE, store)
    shutil.copytree(FUNDING, store / "funding")
    return store


SORTERS: dict[str, Any] = {
    "citations.jsonl": io.sort_funding_citations,
    "grants.jsonl": io.sort_grants,
    "lookups.jsonl": io.sort_funding_lookups,
    "agencies.jsonl": io.sort_agencies,
}


@pytest.mark.parametrize("name", sorted(SORTERS))
def test_the_funding_fixture_round_trips_byte_identically(name: str) -> None:
    """Read and write back, through the sorter the stage will write with (docs/02 §15)."""
    original = (FUNDING / name).read_text(encoding="utf-8")
    lines = io.read_jsonl(FUNDING / name)
    assert io.canonical_jsonl(lines) == original
    assert io.canonical_jsonl(SORTERS[name](lines)) == original


def write_funding(paths: StorePaths, funding: FundingSnapshot) -> None:
    io.write_jsonl(paths.funding_citations, io.sort_funding_citations(list(funding.citations.values())))
    io.write_jsonl(paths.funding_grants, io.sort_grants(list(funding.grants.values())))
    io.write_jsonl(paths.funding_lookups, io.sort_funding_lookups(list(funding.lookups.values())))
    io.write_jsonl(paths.funding_agencies, io.sort_agencies(list(funding.agencies.values())))


def test_funding_writes_then_reads_then_writes_the_same_bytes(tmp_path: Path) -> None:
    """Through the typed snapshot, as the stage will: its dicts must lose nothing and add nothing."""
    first = read_store(funded_sample(tmp_path)).funding
    assert first.present
    once = StorePaths(tmp_path / "once")
    write_funding(once, first)
    twice = StorePaths(tmp_path / "twice")
    write_funding(twice, read_store(once.root).funding)
    for name in SORTERS:
        assert (once.funding / name).read_bytes() == (FUNDING / name).read_bytes(), name
        assert (twice.funding / name).read_bytes() == (FUNDING / name).read_bytes(), name


def shuffled(value: Any, rng: random.Random) -> Any:
    """Every list at every depth in another order, as a stage building lines in any order gives."""
    if isinstance(value, list):
        items = [shuffled(item, rng) for item in value]
        rng.shuffle(items)
        return items
    if isinstance(value, dict):
        return {key: shuffled(item, rng) for key, item in value.items()}
    return value


@pytest.mark.parametrize("seed", range(5))
def test_the_funding_sorters_put_everything_back_in_order(seed: int) -> None:
    rng = random.Random(seed)  # noqa: S311 - a shuffle, not a secret
    for name, sort in SORTERS.items():
        lines = io.read_jsonl(FUNDING / name)
        assert io.canonical_jsonl(sort(shuffled(lines, rng))) == (FUNDING / name).read_text(encoding="utf-8")


def test_the_fixture_covers_what_the_store_must_hold() -> None:
    """Every family of docs/09 §8.2, and every outcome and method of §8.3.

    So a shape the resolver or the stage produces that this fixture never showed the schemas
    fails where the fixture is, not in a weekly run.
    """
    grants = io.read_jsonl(FUNDING / "grants.jsonl")
    strings = [s for line in io.read_jsonl(FUNDING / "citations.jsonl") for s in line["strings"]]
    assert {g["family"] for g in grants} == {
        "reporter",
        "nih_contract",
        "nih_task_order",
        "nsf",
        "us_federal",
        "agency",
        "openalex_funder",
        "miscellaneous",
    }
    assert {s["outcome"] for s in strings} == {
        "grant",
        "unresolved",
        "not_a_grant",
        "resource_code",
        "facility_contract",
    }
    assert {s["method"] for s in strings} == {
        "exact",
        "normalised",
        "corrected",
        "override",
        "agency_number",
        "openalex_award",
        "miscellaneous",
        None,
    }
    assert {g["key"].split(":")[0] for g in grants} >= {"NIH", "VA", "NIH-contract", "NSF", "USA", "MISC"}
    assert any(g["key"].count(":") == 2 and g["family"] == "nih_task_order" for g in grants)
    assert any(g["scope"] == "institution-wide" for g in grants)
    assert any(g["amount"] is None for g in grants)
    assert any(g["amount"] and g["amount"]["usd"] is None for g in grants)  # an unconverted currency
    assert any(None in g["facts"].get("reporter", {}).get("fiscal_years", {}).values() for g in grants)
    agencies = {a["code"]: a for a in io.read_jsonl(FUNDING / "agencies.jsonl")}
    assert agencies["NIGMS"]["parent"] == "NIH"
    assert agencies["NIH"]["parent"] is None


def test_a_store_without_funding_reads_as_empty() -> None:
    funding = read_store(SAMPLE).funding
    assert funding == FundingSnapshot()
    assert not funding.present


def test_a_funded_store_reads_into_its_snapshot(tmp_path: Path) -> None:
    funding = read_store(funded_sample(tmp_path)).funding
    assert funding.present
    assert len(funding.citations) == 12
    assert funding.citations["W-000007"]["grants"] == ["NIH:P01HL092969", "NIH:P30DK017047"]
    assert funding.grants["NIH:P30DK017047"]["amount"] is not None
    assert funding.agencies["NIDDK"]["parent"] == "NIH"
    assert ("reporter", "serial:094352") in funding.lookups


def test_funding_files_are_carried_forward(tmp_path: Path) -> None:
    """Until the funding stage exists to rewrite them, a run must not delete them (stage 13)."""
    store = funded_sample(tmp_path)
    carried = {path.relative_to(store) for path in StorePaths(store).carried_forward()}
    assert {Path("funding") / name for name in SORTERS} <= carried
