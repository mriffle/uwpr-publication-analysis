/**
 * The publication explorer (docs/06 §4.8).
 *
 * > Every publication under the current filter, as a list. At 339 rows — growing 30–50 a year —
 * > **no virtualisation is needed**; a plain list is simpler, prints properly and is accessible
 * > by default.
 * >
 * > Each row: title, authors abbreviated with the full count, venue, year, citation count, and
 * > marks for preprint-only, open access and retraction. Sortable by year, citations and title.
 * > A free-text search box filters on title, author and venue.
 *
 * The search box is **debounced** (docs/06 §10: "the risk is not throughput but redrawing
 * everything on every keystroke … the search box is debounced"), and it writes into the one
 * filter state, so a search narrows every figure and every chart on the page and appears as a
 * chip like any other selection.
 */
import { useEffect, useId, useState } from 'react';
import { sortWorks, type Sort, type SortKey } from '../aggregate/explorer';
import type { Work } from '../contract/types';
import { formatCount, pluralize } from '../format/number';

/** Enough of the author list to recognise the paper, with the true count always stated. */
export function abbreviatedAuthors(work: Work, shown = 3): string {
  const names = work.authors.slice(0, shown).map((author) => author.name);
  if (work.author_count <= names.length) return names.join(', ');
  return `${names.join(', ')} and ${String(work.author_count - names.length)} more`;
}

export interface PublicationExplorerProps {
  works: readonly Work[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  /** The current free-text term, which lives in the filter state. */
  search: string;
  onSearch: (term: string) => void;
  href: (work: Work) => string;
  onOpen?: (work: Work) => void;
  /** Milliseconds; 0 in tests so a keystroke does not need a timer to land. */
  debounceMs?: number;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'year', label: 'Year' },
  { key: 'citations', label: 'Citations' },
  { key: 'title', label: 'Title' },
];

export function PublicationExplorer({
  works,
  sort,
  onSort,
  search,
  onSearch,
  href,
  onOpen,
  debounceMs = 200,
}: PublicationExplorerProps) {
  const searchId = useId();
  const [draft, setDraft] = useState(search);

  // The box follows the filter when the filter changes from elsewhere — a chip removed, the back
  // button, a shared link — without fighting the reader's own typing. It is adjusted while
  // rendering, as React recommends for state that follows a prop, rather than in an effect that
  // would first render the stale draft (react-hooks/set-state-in-effect).
  const [followed, setFollowed] = useState(search);
  if (search !== followed) {
    setFollowed(search);
    setDraft(search);
  }

  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      onSearch(draft);
    }, debounceMs);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, search, onSearch, debounceMs]);

  const rows = sortWorks(works, sort);

  return (
    <div className="explorer">
      <div className="explorer-controls">
        <div className="explorer-search">
          <label htmlFor={searchId}>Search title, author or venue</label>
          <input
            id={searchId}
            type="search"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        </div>
        <div className="explorer-sort" role="group" aria-label="Sort the publications">
          <span aria-hidden="true">Sort by</span>
          {COLUMNS.map((column) => {
            const active = sort.key === column.key;
            const direction = active ? sort.direction : null;
            return (
              <button
                key={column.key}
                type="button"
                className={`explorer-sort-button${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  onSort(column.key);
                }}
              >
                {column.label}
                {direction === null ? null : (
                  <span aria-hidden="true">{direction === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
                <span className="visually-hidden">
                  {direction === null
                    ? ''
                    : direction === 'asc'
                      ? ', sorted ascending'
                      : ', sorted descending'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="explorer-empty" role="status">
          No publications match the current filter.
        </p>
      ) : (
        <ol className="explorer-list" aria-label="Publications under the current filter">
          {rows.map((work) => (
            <li key={work.id} className="explorer-row">
              <a
                className="explorer-title"
                href={href(work)}
                onClick={(event) => {
                  if (onOpen && !event.metaKey && !event.ctrlKey && event.button === 0) {
                    event.preventDefault();
                    onOpen(work);
                  }
                }}
              >
                {/* As stored (docs/06 §5): one title in the corpus is a filename, and stays one. */}
                {work.title}
              </a>
              <p className="explorer-authors">{abbreviatedAuthors(work)}</p>
              <p className="explorer-meta">
                <span>{work.venue?.name ?? 'No venue recorded'}</span>
                <span>{work.year}</span>
                <span>{pluralize(work.citations.total, 'citation')}</span>
                {work.is_preprint ? <span className="badge badge-preprint">preprint</span> : null}
                {work.oa.status === 'closed' ? null : (
                  <span className="badge badge-oa">open access</span>
                )}
                {work.retracted ? <span className="badge badge-retracted">retracted</span> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="explorer-count">
        {formatCount(rows.length)} shown. Select a publication to see its authors, its topics and
        the evidence for why it is counted.
      </p>
    </div>
  );
}
