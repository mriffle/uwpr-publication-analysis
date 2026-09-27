/**
 * Every grant in view, as a table (docs/09 §12.5 item 6): number, title, agency, principal
 * investigators, institution, years, type and tags, counted, lifetime total, first listed and
 * publications. Reused by the Funding impact view and the agency page, each passing its own scope.
 *
 * - **Two amounts** (docs/09 F17). "Counted" is what the totals count of the grant for the
 *   publications shown — from 2006 through the latest of them listing it — so a filter moves it;
 *   an estimate (an amount spread evenly over its years) is tagged, and a grant that began after
 *   the latest publication listing it shows $0 with that reason. "Lifetime total" is the grant's
 *   own, whatever the filter.
 * - **Sorted by counted funding, largest first, with unknown amounts last in both directions**
 *   (`aggregate/fundingTables.ts`), so "not known" never reads as the smallest amount; any column
 *   header re-sorts. The sort and the search are this table's own state, out of the URL (§12.4).
 * - **The search narrows this table only.** It never touches the filter, the publications or a
 *   figure, and the page says so beside the box.
 * - **The first 50 rows are drawn, with a control to draw them all** (docs/09 R1b). The real
 *   export lists 755 grants: drawn at once they made `/funding` tens of thousands of pixels long,
 *   with the coverage section beyond every one of them. The count and the caption say how many
 *   are shown of how many, and in what order.
 * - **The CSV holds every row the search matches**, in the order shown, those beyond the first
 *   50 included: it is built from the array the rows are drawn from, before the cut
 *   (`download/grants.ts`), and its button names the count it holds.
 * - **A grant is one row** however many publications list it (§12.11 rule 7), and the count
 *   beneath says so. An unmatched number is no kind of award (docs/09 §4), so its type reads
 *   "not known", as the grant-types chart counts it under none; Miscellaneous's page calls its
 *   rows numbers, not grants. A total is never $0 for "not known" (rule 3); a converted one shows its
 *   original and rate year (rule 5); an active grant is tagged, its total still growing (rule 6);
 *   investigators are named as the funder publishes them, with no link (rule 9).
 *
 * Accessibility (§12.12): a caption, `th scope`, `aria-sort` on the sorted header via
 * `SortHeader`, the number as each row's header, and a labelled search box. Nothing here is a live
 * region; the filter bar is the page's only one.
 */
import { Fragment, useDeferredValue, useId, useMemo, useState } from 'react';
import { isSpread } from '../aggregate/counting';
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
import { countingOf, type FundingIndex } from '../contract/funding';
import type { CountedRule } from '../contract/types';
import { CSV_MEDIA_TYPE } from '../download/csv';
import { grantsCsv } from '../download/grants';
import {
  CATEGORY_LABELS,
  countedRuleText,
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
} from '../format/funding';
import { formatCount, formatUsd, pluralize } from '../format/number';
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
  /** How many rows are drawn until the reader asks for every one. */
  limit?: number;
  /** What a row is, in the count and the button: an unmatched number on Miscellaneous's page. */
  noun?: { one: string; many: string };
  /**
   * What the counted amount is counted over, beneath the "Counted" header: "for the publications
   * shown" by default, since a filter moves it.
   */
  countedNote?: string;
}

/** The rows drawn at first. The real export's 755 made a page no reader could get past. */
export const GRANT_ROW_LIMIT = 50;

const GRANT_NOUN = { one: 'grant', many: 'grants' };

/** The counted column's note by default: a filter moves what it counts. */
export const COUNTED_NOTE = 'for the publications shown';

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
  { key: 'counted', label: 'Counted', numeric: true },
  { key: 'lifetime', label: 'Lifetime total', numeric: true },
  { key: 'first', label: 'First listed', numeric: true },
  { key: 'publications', label: 'Publications', numeric: true },
];

const None = ({ children }: { children: string }) => <span className="cell-none">{children}</span>;

/**
 * A grant's counted amount as its cell shows it (docs/09 F17, §12.11 rule 3): "not known", never
 * $0, for an unknown amount; "$0" with its reason for a grant that began after the latest
 * publication listing it; an "estimate" tag on an amount spread evenly over its years.
 */
function CountedCell({
  entry,
  reasons,
}: {
  entry: ScopedGrant;
  reasons: Readonly<Record<CountedRule, string>> | null;
}) {
  const { usd, rule } = entry.counted;
  if (usd === null) return <None>not known</None>;
  return (
    <>
      {formatUsd(usd)}
      {isSpread(entry.grant) ? (
        <>
          {' '}
          <span className="badge">estimate</span>
        </>
      ) : null}
      {rule === 'began_after' && reasons !== null ? (
        <span className="cell-note">{reasons.began_after}</span>
      ) : null}
    </>
  );
}

/**
 * A number as written, free to break after each "/" and ":", where a browser otherwise will not:
 * "ANID/BASAL/FB210008" was one word, and it set the number column's width for every row (R1b).
 * `<wbr>` adds no text, so the link's name and a copied number are unchanged.
 */
function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[/:])/);
  return (
    <>
      {parts.map((part, at) => (
        <Fragment key={at}>
          {at === 0 ? null : <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function GrantRow({
  entry,
  index,
  links,
  reasons,
}: {
  entry: ScopedGrant;
  index: FundingIndex;
  links: FundingLinks;
  reasons: Readonly<Record<CountedRule, string>>;
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
          <Breakable text={grant.number} />
        </GrantLink>
      </th>
      <td className="grants-title">{grant.title ?? <None>No title recorded</None>}</td>
      <td className="grants-agency">
        <AgencyLink links={links} code={grant.agency}>
          {agencyLabel(index, grant.agency)}
        </AgencyLink>
      </td>
      <td className="grants-people">{people ?? <None>None recorded</None>}</td>
      <td className="grants-organisation">{grant.organization ?? <None>Not recorded</None>}</td>
      <td>
        {years === null ? <None>Not recorded</None> : <span className="cell-nowrap">{years}</span>}
      </td>
      <td>
        {entry.miscellaneous ? <None>not known</None> : CATEGORY_LABELS[grant.category]}
        {tags.map((tag) => (
          <span key={tag}>
            {' '}
            <span className="badge">{tag}</span>
          </span>
        ))}
      </td>
      <td className="numeric">
        <CountedCell entry={entry} reasons={reasons} />
      </td>
      <td className="numeric">
        {amount ?? <None>not known</None>}
        {original === null ? null : (
          // Intl joins a currency code to its figure with a no-break space, so "CLP 4,500,000,000"
          // was one word that widened the column for every row (R1b); it may break there.
          <span className="cell-note">{original.replace(/\u00a0/g, ' ')}</span>
        )}
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
  limit = GRANT_ROW_LIMIT,
  noun = GRANT_NOUN,
  countedNote = COUNTED_NOTE,
}: GrantsTableProps) {
  const searchId = useId();
  const noteId = useId();
  const tableId = useId();
  const [sort, setSort] = useState<GrantSort>(DEFAULT_GRANT_SORT);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  // The rows follow the box a beat behind on a large table, so typing never waits on them.
  const deferredQuery = useDeferredValue(query);
  const index = scope.index;
  // Every row the search matches, in order: what the CSV holds. The table draws the first `limit`.
  const rows = useMemo(
    () => sortGrants(searchGrants(scope.grants, deferredQuery, index), sort, index),
    [scope.grants, deferredQuery, index, sort],
  );

  if (index === null) return null;
  if (scope.grants.length === 0) {
    return <p className="chart-card-description">No grant is listed on the publications shown.</p>;
  }

  const reasons = countedRuleText(countingOf(index));
  const counted = (n: number) => pluralize(n, noun.one, noun.many);
  const all = scope.grants.length;
  const long = rows.length > limit;
  const shown = long && !showAll ? rows.slice(0, limit) : rows;
  const cut = shown.length < rows.length;
  const count =
    deferredQuery.trim() === ''
      ? `${counted(all)}, each listed once however many publications list it.`
      : `${formatCount(rows.length)} of ${counted(all)} match the search.`;
  const drawn = cut
    ? ` The first ${formatCount(shown.length)}, in the order chosen, are shown; the download holds all ${formatCount(rows.length)}.`
    : '';

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
          label={`Download ${rows.length === 1 ? `this ${noun.one}` : `these ${counted(rows.length)}`} as CSV`}
          filename={csvFilename}
          type={CSV_MEDIA_TYPE}
          disabled={rows.length === 0}
          content={() => grantsCsv(rows, index)}
        />
      </div>

      <p className="table-count">
        {count}
        {drawn}
      </p>

      {rows.length === 0 ? (
        <p className="table-empty">
          No {noun.one} here matches “{deferredQuery.trim()}”.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="chart-table funding-table" id={tableId}>
            <caption>
              {caption}
              {cut
                ? `: the first ${formatCount(shown.length)} of ${formatCount(rows.length)}, in the order chosen`
                : ''}
              . Counted is the grant funding the totals count, {countedNote}: from{' '}
              {String(countingOf(index).from_year)} through the year of the latest of them listing
              the grant; the lifetime total is the grant’s own. Grants with no known amount are
              listed last, whichever way the table is sorted.
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
                      {...(column.key === 'counted' ? { note: countedNote } : {})}
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
              {shown.map((entry) => (
                <GrantRow
                  key={entry.grant.key}
                  entry={entry}
                  index={index}
                  links={links}
                  reasons={reasons}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {long ? (
        <button
          type="button"
          className="table-more"
          aria-controls={tableId}
          onClick={() => {
            setShowAll((value) => !value);
          }}
        >
          {showAll
            ? `Show only the first ${formatCount(limit)}`
            : `Show all ${counted(rows.length)}`}
        </button>
      ) : null}
    </div>
  );
}
