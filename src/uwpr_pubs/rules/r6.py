"""R6 — OpenAlex's full-text index as a proxy for text we cannot read (Phase 1 §6.5).

It applies only to records with no readable text of our own, which is known only after stage 4.
Two of its three phrases measured 100% precision against papers we *could* read; the two-phrase
query that measured 93% nominates candidates but never includes them.

There is no excerpt: we never see the text, only that OpenAlex's index matched. The evidence
records the phrase and the query date instead (Phase 1 §13, accepted 2026-09-19).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import quote

from uwpr_pubs.evidence import criterion_for
from uwpr_pubs.store.models import Date, Evidence, RecordId

WORKS = "https://api.openalex.org/works"


@dataclass(frozen=True)
class R6Rules:
    include_phrases: tuple[str, ...]
    nominate_only: tuple[str, ...]


def r6_rules(config: Mapping[str, Any]) -> R6Rules:
    return R6Rules(
        include_phrases=tuple(str(p) for p in config["include_phrases"]),
        nominate_only=tuple(str(p) for p in config["nominate_only"]),
    )


def phrase_label(phrase: str) -> str:
    """`rules.yaml` keeps the query's quotes; the stored evidence keeps only the phrase."""
    return phrase.strip('"')


def query_url(phrase: str, doi: str) -> str:
    return f"{WORKS}?filter=fulltext.search:{quote(phrase, safe='')},doi:{quote(doi, safe='')}"


def phrase_found(
    *,
    record: RecordId,
    doi: str,
    phrase: str,
    label: str,
    today: Date,
) -> Evidence:
    named = phrase_label(phrase)
    return cast(
        Evidence,
        {
            "rule": "R6",
            "criterion": criterion_for("R6", phrase=named),
            "label": label,
            "record": record,
            "source": {
                "name": "OpenAlex",
                "url": query_url(phrase, doi),
                "retrieved": today,
                "cache": None,
            },
            "section": "full-text index",
            "excerpt": None,
            "detail": {"phrase": named, "query_date": today},
            "rule_version": "",  # the merge stamps the run's version
            "first_seen": today,
            "last_seen": today,
        },
    )
