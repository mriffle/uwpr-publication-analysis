/**
 * Every grant in view, as a table (docs/09 §12.5 item 6): number, title, agency, principal
 * investigators, institution, years, type and tags, total, first listed and publications.
 * Reused by the Funding impact view and the agency page, each passing its own scope.
 *
 * - **Sorted by total, largest first, with unknown amounts last in both directions**
 *   (`aggregate/fundingTables.ts`), so "not known" never reads as the smallest amount; any column
 *   header re-sorts. The sort and the search are this table's own state, out of the URL (§12.4).
 * - **The search narrows this table only.** It never touches the filter, the publications or a
 *   figure, and the page says so beside the box.
 * - **The CSV holds exactly the visible rows**, searched and sorted, because it is built from the
 *   very array the table renders (`download/grants.ts`).
 * - **A grant is one row** however many publications list it (§12.11 rule 7), and the count
 *   beneath says so. A total is never $0 for "not known" (rule 3); a converted one shows its
 *   original and rate year (rule 5); an active grant is tagged, its total still growing (rule 6);
 *   investigators are named as the funder publishes them, with no link (rule 9).
 *
 * Accessibility (§12.12): a caption, `th scope`, `aria-sort` on the sorted header via
 * `SortHeader`, the number as each row's header, and a labelled search box. Nothing here is a live
 * region; the filter bar is the page's only one.
 */
import { useDeferredValue, useId, useMemo, useState } from 'react';
import type { FundingScope, ScopedGrant } from '../aggregate/funding';
import {
  DEFAULT_GRANT_SORT,
  searchGrants,
  sortGrants,
  toggleGrantSort,
  type GrantSort,
  type GrantSortKey,
} from '../aggregate/fundingTables';
import { agencyLabel } from '../aggregate/funding';
import type { FundingIndex } from '../contract/funding';
import { CSV_MEDIA_TYPE } from '../download/csv';
import { grantsCsv } from '../download/grants';
import {
  CATEGORY_LABELS,
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
} from '../format/funding';
import { formatCount, pluralize } from '../format/number';
import { DownloadButton } from './DownloadButton';
import { AgencyLink, GrantLink, type FundingLinks } from './FundingLinks';
import { SortHeader } from './SortHeader';

export interface GrantsTableProps {
  /** The view's scope (`fundingScope`): its `grants` are the rows. */
  scope: FundingScope;
  links: FundingLinks;
  /** The downloaded file's name: "uwpr-grants-2026-09-26.csv". */
  csvFilename: string;
  /** What the rows are, for the caption: "Every grant listed on the publications shown". */
  caption?: string;
}

const COLUMNS: {
  key: GrantSortKey | null;
  label: string;
  numeric?: boolean;
}[] = [
  { key: 'number', label: 'Number' },
  { key: 'title', label: 'Title' },
  { key: 'agency', label: 'Agency' },
  { key: null, label: 'Principal investigators' },
  { key: null, label: 'Institution' },
  { key: null, label: 'Years' },
  { key: null, label: 'Type' },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'first', label: 'First listed', numeric: true },
  { key: 'publications', label: 'Publications', numeric: true },
];

const None = ({ children }: { children: string }) => <span className="cell-none">{children}</span>;

function GrantRow({
  entry,
  index,
  links,
}: {
  entry: ScopedGrant;
  index: FundingIndex;
  links: FundingLinks;
}) {
  const grant = entry.grant;
  const amount = grantAmount(grant);
  const original = originalAmount(grant);
  const years = grantYears(grant);
  const people = investigatorNames(grant);
  const tags = grantTags(grant, entry.miscellaneous);
  return (
    <tr>
      <th scope="row">
        <GrantLink links={links} grantKey={grant.key}>
          {grant.number}
        </GrantLink>
      </th>
      <td>{grant.title ?? <None>No title recorded</None>}</td>
      <td>
        <AgencyLink links={links} code={grant.agency}>
          {agencyLabel(index, grant.agency)}
        </AgencyLink>
      </td>
      <td>{people ?? <None>None recorded</None>}</td>
      <td>{grant.organization ?? <None>Not recorded</None>}</td>
      <td className="cell-nowrap">{years ?? <None>Not recorded</None>}</td>
      <td>
        {CATEGORY_LABELS[grant.category]}
        {tags.map((tag) => (
          <span key={tag}>
            {' '}
            <span className="badge">{tag}</span>
          </span>
        ))}
      </td>
      <td className="numeric">
        {amount ?? <None>not known</None>}
        {original === null ? null : <span className="cell-note">{original}</span>}
      </td>
      <td className="numeric">{entry.firstYear}</td>
      <td className="numeric">{formatCount(entry.works.length)}</td>
    </tr>
  );
}

export function GrantsTable({
  scope,
  links,
  csvFilename,
  caption = 'Every grant listed on the publications shown',
}: GrantsTableProps) {
  const searchId = useId();
  const noteId = useId();
  const [sort, setSort] = useState<GrantSort>(DEFAULT_GRANT_SORT);
  const [query, setQuery] = useState('');
  // The rows follow the box a beat behind on a large table, so typing never waits on them.
  const deferredQuery = useDeferredValue(query);
  const index = scope.index;
  const rows = useMemo(
    () => sortGrants(searchGrants(scope.grants, deferredQuery, index), sort, index),
    [scope.grants, deferredQuery, index, sort],
  );

  if (index === null) return null;
  if (scope.grants.length === 0) {
    return <p className="chart-card-description">No grant is listed on the publications shown.</p>;
  }

  const all = scope.grants.length;
  const count =
    deferredQuery.trim() === ''
      ? `${pluralize(all, 'grant')}, each listed once however many publications list it.`
      : `${formatCount(rows.length)} of ${pluralize(all, 'grant')} match the search.`;

  return (
    <div className="grants-table">
      <div className="table-controls">
        <div className="table-search">
          <label htmlFor={searchId}>
            Search number, title, agency, investigator or institution
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            aria-describedby={noteId}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <p id={noteId} className="table-search-note">
            The search narrows this table only, not the publications or the figures above.
          </p>
        </div>
        <DownloadButton
          label={`Download ${rows.length === 1 ? 'this grant' : `these ${formatCount(rows.length)} grants`} as CSV`}
          filename={csvFilename}
          type={CSV_MEDIA_TYPE}
          disabled={rows.length === 0}
          content={() => grantsCsv(rows, index)}
        />
      </div>

      <p className="table-count">{count}</p>

      {rows.length === 0 ? (
        <p className="table-empty">No grant here matches “{deferredQuery.trim()}”.</p>
      ) : (
        <div className="table-scroll">
          <table className="chart-table funding-table">
            <caption>
              {caption}. Grants with no known amount are listed last, whichever way the table is
              sorted.
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) =>
                  column.key === null ? (
                    <th key={column.label} scope="col">
                      {column.label}
                    </th>
                  ) : (
                    <SortHeader
                      key={column.label}
                      label={column.label}
                      direction={sort.key === column.key ? sort.direction : null}
                      numeric={column.numeric ?? false}
                      onSort={() => {
                        const key = column.key;
                        if (key !== null) setSort((current) => toggleGrantSort(current, key));
                      }}
                    />
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <GrantRow key={entry.grant.key} entry={entry} index={index} links={links} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
