"""Near-miss signals for works the rules deliberately do not include (Phase 2 §6, Phase 3 §6.4).

Everything here is something that looks like evidence and is not: a staff co-author (D2), a staff
member thanked outside R7's cases, one of the two excluded cores (D1a, D1b), a mention of UWPR
software or hardware or an online tool (C6), or an identifier that resembles the award code.

They exist to answer "why isn't paper X on the list?" without re-running anything.
"""

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from uwpr_pubs.rules.r2 import near_misses
from uwpr_pubs.rules.r3 import R3Rules, mentions
from uwpr_pubs.store.models import StaffKey
from uwpr_pubs.text import Document

NEAR_MISS_IDENTIFIER = "near_miss_identifier"


@dataclass(frozen=True)
class SignalRules:
    cores: tuple[tuple[str, re.Pattern[str]], ...]
    exclusion_signals: Mapping[str, str | None]
    near_miss: re.Pattern[str]
    code: str


def signal_rules(rules: Mapping[str, Any]) -> SignalRules:
    signals = rules["signals"]
    return SignalRules(
        cores=tuple((name, re.compile(p)) for name, p in signals["cores"].items()),
        exclusion_signals=dict(signals["exclusion_signals"]),
        near_miss=re.compile(rules["r2"]["near_miss_pattern"]),
        code=str(rules["r2"]["code"]),
    )


def text_signals(document: Document, *, rules: SignalRules, r3: R3Rules) -> set[str]:
    """Signals that can only be seen in the paper's text."""
    found: set[str] = set()
    whole = document.text
    for name, pattern in rules.cores:
        if pattern.search(whole):
            found.add(f"core_named:{name}")
    if near_misses(whole, rules.near_miss.pattern, rules.code):
        found.add(NEAR_MISS_IDENTIFIER)
    for sentence in document.sentences:
        for mention in mentions(sentence.text, r3):
            if mention.excluded_by is None:
                continue
            signal = rules.exclusion_signals.get(mention.excluded_by)
            if signal:
                found.add(signal)
    return found


def signals_for(
    *,
    text: Iterable[str] = (),
    staff_authors: Sequence[StaffKey] = (),
    acknowledged: Iterable[StaffKey] = (),
) -> list[str]:
    """The final, sorted signal list for one work (the schema requires unique values)."""
    found = set(text)
    found.update(f"staff_coauthor:{key}" for key in staff_authors)
    found.update(f"staff_ack_other:{key}" for key in acknowledged)
    return sorted(found)
