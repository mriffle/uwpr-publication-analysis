/**
 * The frame every chart sits in: heading, description, the table control, and the loading and
 * empty states (docs/06 §11.2 — the shared kit is "built once and used by every chart").
 *
 * docs/06 §9 requires each chart to have an accessible name, a short text description of what it
 * shows, and the table alternative of §7. All three are structural here rather than left to each
 * chart to remember.
 */
import { useId, useState, type ReactNode } from 'react';

export interface ChartCardProps {
  title: string;
  /** What the chart shows, in one sentence. Read out with the chart, not only shown. */
  description: string;
  /** Honesty constraints — a partial period, a window that starts late, a proxy (docs/05 §11). */
  note?: ReactNode;
  loading?: boolean;
  /** Rendered instead of the chart when the current filter selects nothing (docs/06 §6). */
  empty?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
}

export function ChartCard({
  title,
  description,
  note,
  loading = false,
  empty,
  chart,
  table,
}: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const headingId = useId();
  const descriptionId = useId();
  const bodyId = useId();

  return (
    <section className="chart-card" aria-labelledby={headingId} aria-describedby={descriptionId}>
      <div className="chart-card-head">
        <h3 id={headingId}>{title}</h3>
        <button
          type="button"
          className="chart-card-toggle"
          aria-expanded={asTable}
          aria-controls={bodyId}
          onClick={() => {
            setAsTable((value) => !value);
          }}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>
      <p className="chart-card-description" id={descriptionId}>
        {description}
      </p>
      {note ? <p className="chart-card-note">{note}</p> : null}
      <div className="chart-card-body" id={bodyId}>
        {loading ? (
          <div className="chart-skeleton" role="status">
            Loading {title.toLowerCase()}…
          </div>
        ) : empty ? (
          empty
        ) : asTable ? (
          table
        ) : (
          chart
        )}
      </div>
    </section>
  );
}
