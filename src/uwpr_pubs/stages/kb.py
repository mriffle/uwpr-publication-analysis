"""Stage 10 — knowledge-base pages (Phase 4).

A no-op until Phase 4 is specified. It exists so the stage order, and the rule that a run never
deletes what it did not generate, are already in place.
"""

from collections.abc import Sequence

from uwpr_pubs.store.models import Work


def generate(works: Sequence[Work]) -> int:
    """Returns the number of pages written; none until Phase 4."""
    return 0
