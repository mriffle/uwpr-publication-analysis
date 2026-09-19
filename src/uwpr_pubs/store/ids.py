"""Identifiers and the alias index (docs/02-data-model.md §4).

Work IDs are permanent and never reused, so the order the first run mints them in is fixed
forever. `mint_order` therefore imposes a total order on new works that does not depend on the
order channels happened to return them in.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from uwpr_pubs.store.models import Ids, RecordId, WorkId

WORK_ID = re.compile(r"^W-([0-9]{6})$")
RECORD_ID = re.compile(r"^R-([0-9]{6})$")
_DOI_PREFIXES = ("https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/", "doi:")


def work_id(number: int) -> WorkId:
    return f"W-{number:06d}"


def record_id(number: int) -> RecordId:
    return f"R-{number:06d}"


def _number(value: str, pattern: re.Pattern[str]) -> int:
    match = pattern.match(value)
    if match is None:
        raise ValueError(f"not an identifier of the expected form: {value!r}")
    return int(match.group(1))


def normalise_doi(value: str) -> str:
    """Lower-case, no resolver prefix (docs/02 §4)."""
    doi = value.strip()
    lowered = doi.lower()
    for prefix in _DOI_PREFIXES:
        if lowered.startswith(prefix):
            doi = doi[len(prefix) :]
            break
    return doi.lower()


def external_keys(ids: Ids) -> list[str]:
    """The `aliases.json` keys for one record's identifiers, in a stable order."""
    keys: list[str] = []
    doi = ids.get("doi")
    if doi:
        keys.append(f"doi:{normalise_doi(doi)}")
    pmid = ids.get("pmid")
    if pmid:
        keys.append(f"pmid:{pmid}")
    pmcid = ids.get("pmcid")
    if pmcid:
        keys.append(f"pmcid:{pmcid}")
    openalex = ids.get("openalex")
    if openalex:
        keys.append(f"openalex:{openalex}")
    for accession in sorted(ids.get("pride") or []):
        keys.append(f"pride:{accession}")
    list_key = ids.get("list")
    if list_key:
        keys.append(list_key)  # already carries its own "list:" prefix
    return keys


def retired_key(retired: WorkId) -> str:
    return f"work:{retired}"


def mint_order(ids: Ids) -> tuple[str, str, str, str]:
    """Total order for minting, independent of the order channels returned things in."""
    doi = ids.get("doi")
    return (
        normalise_doi(doi) if doi else "",
        ids.get("pmid") or "",
        ids.get("pmcid") or "",
        ids.get("openalex") or ids.get("list") or "",
    )


@dataclass
class Minter:
    """Hands out the next free ID. Never reuses one, including retired work IDs."""

    next_work: int = 1
    next_record: int = 1
    _minted_works: list[WorkId] = field(default_factory=list)

    @classmethod
    def from_store(
        cls,
        work_ids: Iterable[WorkId],
        record_ids: Iterable[RecordId],
        retired_ids: Iterable[WorkId] = (),
    ) -> "Minter":
        works = [_number(w, WORK_ID) for w in [*work_ids, *retired_ids]]
        records = [_number(r, RECORD_ID) for r in record_ids]
        return cls(next_work=max(works, default=0) + 1, next_record=max(records, default=0) + 1)

    def mint_work(self) -> WorkId:
        minted = work_id(self.next_work)
        self.next_work += 1
        self._minted_works.append(minted)
        return minted

    def mint_record(self) -> RecordId:
        minted = record_id(self.next_record)
        self.next_record += 1
        return minted

    @property
    def minted_works(self) -> list[WorkId]:
        return list(self._minted_works)
