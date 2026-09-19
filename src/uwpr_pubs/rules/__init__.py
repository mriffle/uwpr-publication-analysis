"""One module per inclusion rule (Phase 1 §6). Each is a pure function returning evidence."""

from uwpr_pubs.rules.r1 import official_list_evidence
from uwpr_pubs.rules.r2 import (
    award_code_in_metadata,
    contains_award_code,
    normalise_award_text,
)

__all__ = [
    "award_code_in_metadata",
    "contains_award_code",
    "normalise_award_text",
    "official_list_evidence",
]
