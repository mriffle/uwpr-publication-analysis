"""Stage 11 — the app's JSON (Phase 5).

A no-op until Phase 5 is specified; see the note on stages/kb.py.
"""

from collections.abc import Sequence

from uwpr_pubs.store.models import Work


def write(works: Sequence[Work]) -> int:
    """Returns the number of files written; none until Phase 5."""
    return 0
