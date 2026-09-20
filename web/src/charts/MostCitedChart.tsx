/**
 * The most cited publications (docs/05 §7.10, docs/06 §4.7).
 *
 * > Ranked list or lollipop, top 10–20, **each row linking to its detail**.
 *
 * The spec offers a list or a lollipop and the list is what is built, because every row has to be
 * a link and a real `<a>` inside an ordered list is keyboard-operable, focusable, middle-clickable
 * and copyable in a way an SVG mark standing in for a link is not. The proportional bar behind
 * each row is decoration over the number, never the only place the number appears.
 */
import { mostCited } from '../aggregate/citations';
import type { Work } from '../contract/types';
import { formatCount, pluralize } from '../format/number';
import { ChartTable } from './ChartTable';

export interface MostCitedListProps {
  works: readonly Work[];
  limit?: number;
  /** The route each row links to (docs/06 §3: `/publication/<work id>`). */
  href: (work: Work) => string;
  onOpen?: (work: Work) => void;
}

export function MostCitedList({ works, limit = 15, href, onOpen }: MostCitedListProps) {
  const rows = mostCited(works, limit);
  const highest = Math.max(1, ...rows.map((work) => work.citations.total));

  return (
    <ol className="ranked-list" aria-label="Most cited publications, most cited first">
      {rows.map((work, index) => (
        <li key={work.id}>
          <span className="ranked-list-rank" aria-hidden="true">
            {index + 1}
          </span>
          <span className="ranked-list-body">
            <a
              href={href(work)}
              onClick={(event) => {
                if (onOpen && !event.metaKey && !event.ctrlKey && event.button === 0) {
                  event.preventDefault();
                  onOpen(work);
                }
              }}
            >
              {/* Rendered as stored: docs/06 §5 — one work's title is a filename and stays one. */}
              {work.title}
            </a>
            <span className="ranked-list-meta">
              {work.venue?.name ?? 'No venue recorded'} · {work.year}
              {work.is_preprint ? ' · preprint' : ''}
              {work.retracted ? ' · retracted' : ''}
            </span>
            <span
              className="ranked-list-bar"
              style={{ width: `${String((work.citations.total / highest) * 100)}%` }}
              aria-hidden="true"
            />
          </span>
          <span className="ranked-list-value">
            {formatCount(work.citations.total)}
            <span className="visually-hidden"> {pluralize(work.citations.total, 'citation')}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MostCitedTable({ works, limit = 15 }: { works: readonly Work[]; limit?: number }) {
  return (
    <ChartTable<Work>
      caption="The most cited publications under the current filter, with the citation count OpenAlex reports."
      rows={mostCited(works, limit)}
      rowKey={(work) => work.id}
      columns={[
        { key: 'title', header: 'Publication', value: (work) => work.title },
        { key: 'venue', header: 'Venue', value: (work) => work.venue?.name ?? '—' },
        { key: 'year', header: 'Year', numeric: true, value: (work) => String(work.year) },
        {
          key: 'citations',
          header: 'Citations',
          numeric: true,
          value: (work) => formatCount(work.citations.total),
        },
      ]}
    />
  );
}
