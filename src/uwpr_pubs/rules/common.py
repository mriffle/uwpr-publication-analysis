"""Shared pieces of the text rules (Phase 1 §6).

Every text rule produces the same evidence shape, differing only in its rule tag, criterion,
section and detail. Building it in one place keeps the `detail` conventions of `samples/store/`
(R2 text carries `{"match": "text"}`, R3/R4/R7 carry `{"staff": …}` when a name is in the
sentence) in a single readable spot.
"""

from dataclasses import dataclass
from typing import Any, cast

from uwpr_pubs.evidence import truncate_excerpt
from uwpr_pubs.store.models import CacheRef, Date, Evidence, RecordId, Section, SourceName


@dataclass(frozen=True)
class TextSource:
    """Where a piece of text came from, as evidence records it."""

    name: SourceName
    url: str | None
    cache: CacheRef | None


def text_evidence(  # noqa: PLR0913 - evidence needs every one of these to stand on its own
    rule: str,
    *,
    criterion: int | None,
    label: str,
    record: RecordId,
    source: TextSource,
    section: Section,
    excerpt: str,
    detail: dict[str, str],
    today: Date,
) -> Evidence:
    return cast(
        Evidence,
        {
            "rule": rule,
            "criterion": criterion,
            "label": label,
            "record": record,
            "source": {
                "name": source.name,
                "url": source.url,
                "retrieved": today,
                "cache": source.cache,
            },
            "section": section,
            "excerpt": truncate_excerpt(excerpt),
            "detail": cast(dict[str, Any], detail),
            "rule_version": "",  # the merge stamps the run's version
            "first_seen": today,
            "last_seen": today,
        },
    )
