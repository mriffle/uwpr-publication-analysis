"""Canonical writing, ordering, ID minting and the owned-paths policy."""

import datetime as dt
import json
from pathlib import Path

import pytest

from uwpr_pubs.context import RunContext
from uwpr_pubs.store import ids, io
from uwpr_pubs.store.paths import StorePaths
from uwpr_pubs.store.read import read_store

SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "store"


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
