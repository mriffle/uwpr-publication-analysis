"""Grant overrides (docs/09 §6.6, §8.5): a person's word on what one string on one work is.

An `overrides.yaml` entry with `action: grant` names a work, the string as the work writes it, and
the grant it is, or `null` for "not a grant". The string is matched on a key that forgives what
the sources disagree about — case, spaces, dashes — so `U19 AG02312`, `u19ag02312` and
`U19-AG02312`, with any of the dashes below, are one string. Nothing else is forgiven: a digit
that differs is a different string, which is the point of an override.

Pure: overrides in, a mapping out. The stage applies it at step 4 of §6.1; the validator uses the
same key to say when an override's string is not seen on its work.
"""

import unicodedata
from collections.abc import Iterable, Mapping

from uwpr_pubs.store.ids import retired_key
from uwpr_pubs.store.models import GrantKey, Override, WorkId

# The hyphen-minus, U+2010-U+2015 (hyphen, non-breaking hyphen, figure dash, en dash, em dash,
# horizontal bar) and U+2212 (minus sign).
DASHES = frozenset({"-", *map(chr, range(0x2010, 0x2016)), chr(0x2212)})


def override_match_key(raw: str) -> str:
    """NFKC, upper case, and every whitespace character and dash removed."""
    folded = unicodedata.normalize("NFKC", raw).upper()
    return "".join(ch for ch in folded if not ch.isspace() and ch not in DASHES)


def grant_overrides(overrides: Iterable[Override]) -> list[Override]:
    """The `grant` entries, in the file's order. No other action concerns funding."""
    return [override for override in overrides if override["action"] == "grant"]


def applies_to(override: Override, work_id: WorkId, aliases: Mapping[str, WorkId] | None = None) -> bool:
    """Whether the override names this work, directly or by an ID a merge has since retired."""
    target = override["target"]
    if not isinstance(target, str):
        return False
    return target == work_id or (aliases or {}).get(retired_key(target)) == work_id


def grant_overrides_for(
    overrides: Iterable[Override], work_id: WorkId, aliases: Mapping[str, WorkId] | None = None
) -> dict[str, GrantKey | None]:
    """One work's grant overrides, as {match key: grant key, or None for "not a grant"}.

    Two entries for one string on one work that disagree are an error the validator reports; if
    one gets this far anyway, the later entry in the file wins, so the answer is at least stable.
    """
    return {
        override_match_key(override["raw"]): override["grant"]
        for override in grant_overrides(overrides)
        if applies_to(override, work_id, aliases) and "raw" in override and "grant" in override
    }


def grant_override_for(
    overrides: Iterable[Override], work_id: WorkId, raw: str, aliases: Mapping[str, WorkId] | None = None
) -> Override | None:
    """The `grant` entry that decides this string on this work, or None when none does.

    The entry itself rather than only its grant, so the export can say who decided and why
    (docs/09 §11.2). The same entry `grant_overrides_for` takes: of two for one string, the later.
    """
    key = override_match_key(raw)
    found: Override | None = None
    for override in grant_overrides(overrides):
        if "raw" not in override or "grant" not in override:
            continue
        if applies_to(override, work_id, aliases) and override_match_key(override["raw"]) == key:
            found = override
    return found
