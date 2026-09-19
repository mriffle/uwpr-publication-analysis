"""R1 — the work is on UWPR's publications page, which always wins (Phase 1 §6.0).

There is no excerpt: the reason is the listing itself, so the detail carries the page, the entry
key and the dates the entry was first and last seen.
"""

from typing import cast

from uwpr_pubs.store.models import Date, EvidenceR1, ListEntry, RecordId


def official_list_evidence(
    entry: ListEntry, record: RecordId, page_url: str, label: str, today: Date
) -> EvidenceR1:
    return cast(
        EvidenceR1,
        {
            "rule": "R1",
            "criterion": 1,
            "label": label,
            "record": record,
            "source": {
                "name": "UWPR website",
                "url": page_url,
                "retrieved": today,
                "cache": None,
            },
            "section": "official list",
            "excerpt": None,
            "detail": {
                "page": entry["page"],
                "list_key": entry["key"],
                "first_seen": entry["first_seen"],
                "last_seen": entry["last_seen"],
            },
            "rule_version": "",  # the merge stamps the run's version
            "first_seen": entry["first_seen"],
            "last_seen": entry["last_seen"],
        },
    )
