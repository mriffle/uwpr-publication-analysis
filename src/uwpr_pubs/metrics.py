"""Citation figures, kept apart from the work files (docs/02-data-model.md §10).

The numbers come from the same OpenAlex refresh that stage 3 already made, so this costs nothing
extra. Weekly citation changes rewrite only `metrics/latest.jsonl`, never a work file.
"""

from collections.abc import Mapping
from typing import Any, cast

from uwpr_pubs.store.models import Date, MetricsLine, RecordId, WorkId


def metrics_line(work: WorkId, record: RecordId, payload: Mapping[str, Any], today: Date) -> MetricsLine:
    percentile = payload.get("citation_normalized_percentile") or {}
    counts = {
        str(entry["year"]): int(entry["cited_by_count"])
        for entry in payload.get("counts_by_year") or []
        if entry.get("cited_by_count")
    }
    return cast(
        MetricsLine,
        {
            "schema": 1,
            "work": work,
            "record": record,
            "date": today,
            "source": "OpenAlex",
            "cited_by": int(payload.get("cited_by_count") or 0),
            "cites_by_year": counts,
            "fwci": payload.get("fwci"),
            "citation_percentile": percentile.get("value"),
        },
    )
