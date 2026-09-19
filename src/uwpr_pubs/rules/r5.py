"""R5 — an author's affiliation is the resource (Phase 1 §6.4).

Two provenance paths, both criterion 3: a JATS `<aff>` element, which needs text, and OpenAlex's
raw affiliation strings, which do not and so are refreshed every run (Phase 3 §6.1). R5 needs no
tenure check — the affiliation itself names the resource, whoever the author is.

Fred Hutch has its own "Proteomics Resource" in Seattle, which is why the other-organisation
exclusions of §6.3 apply here too.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from uwpr_pubs.evidence import criterion_for
from uwpr_pubs.rules.common import TextSource, text_evidence
from uwpr_pubs.rules.r3 import R3Rules
from uwpr_pubs.store.models import Date, Evidence, RecordId

OTHER_ORG = "other_org"


@dataclass(frozen=True)
class R5Rules:
    university: str


def r5_rules(config: dict[str, str]) -> R5Rules:
    return R5Rules(university=config["university"])


def is_resource_affiliation(affiliation: str, *, rules: R5Rules, r3: R3Rules) -> bool:
    """The string names the resource and the university, and no other organisation."""
    if rules.university.casefold() not in affiliation.casefold():
        return False
    if not r3.resource.search(affiliation):
        return False
    lowered = affiliation.casefold()
    for bucket, terms in r3.exclusions:
        if bucket == OTHER_ORG and any(term in lowered for term in terms):
            return False
    return True


def affiliation_is_resource(  # noqa: PLR0913 - a rule needs its text, record, source and config
    affiliations: Iterable[str],
    *,
    record: RecordId,
    source: TextSource,
    rules: R5Rules,
    r3: R3Rules,
    label: str,
    today: Date,
) -> list[Evidence]:
    """One entry per distinct qualifying affiliation string, in the order they appear."""
    found: list[Evidence] = []
    seen: set[str] = set()
    for affiliation in affiliations:
        cleaned = affiliation.strip()
        if not cleaned or cleaned in seen:
            continue
        if not is_resource_affiliation(cleaned, rules=rules, r3=r3):
            continue
        seen.add(cleaned)
        found.append(
            text_evidence(
                "R5",
                criterion=criterion_for("R5"),
                label=label,
                record=record,
                source=source,
                section="affiliation",
                excerpt=cleaned,
                detail={},
                today=today,
            )
        )
    return found


def openalex_affiliations(payload: dict[str, object]) -> Sequence[str]:
    """Every raw affiliation string OpenAlex holds for a work's authors."""
    strings: list[str] = []
    authorships = payload.get("authorships")
    if not isinstance(authorships, list):
        return strings
    for authorship in authorships:
        if not isinstance(authorship, dict):
            continue
        raw = authorship.get("raw_affiliation_strings")
        if isinstance(raw, list):
            strings.extend(str(value) for value in raw)
        single = authorship.get("raw_affiliation_string")
        if isinstance(single, str):
            strings.append(single)
    return strings
