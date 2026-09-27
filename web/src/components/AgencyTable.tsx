/**
 * The agencies of the grants in view, as a table (docs/09 §12.5 item 4): agency, parent, country,
 * grants, counted funding (F17, under the filter), without an amount, and publications.
 *
 * Each grant is counted under its own agency, the most specific one, with the parent beside it
 * (`rankAgencies` at `level: 'agency'`: NIGMS, parent NIH), so the table says which institute
 * awarded what while the ranked bar chart above it counts root agencies. An agency known by a
 * short name has its full name beneath it (`AgencyFullName`). **Miscellaneous is its
 * own last row, outside the sort**: its unmatched numbers are not known to be any agency's
 * grants, and have no amount to rank (docs/09 §4).
 *
 * A counted total is shown only through `knownCounted` — "not known", never $0, for an agency
 * whose every amount is unknown (§12.11 rule 3) — with the count without an amount in its own
 * column beside it, and **unknown totals sort last in both directions**. The sort is this table's
 * own state, out of the URL (§12.4). A caption, `th scope` and `aria-sort` via `SortHeader`
 * (§12.12).
 */
import { useState } from 'react';
import {
  knownCounted,
  rankAgencies,
  type AgencyRow,
  type FundingScope,
} from '../aggregate/funding';
import {
  DEFAULT_AGENCY_SORT,
  sortAgencies,
  toggleAgencySort,
  type AgencySort,
  type AgencySortKey,
} from '../aggregate/fundingTables';
import { agencyLabel } from '../aggregate/funding';
import type { FundingIndex } from '../contract/funding';
import type { Agency as AgencyRecord } from '../contract/types';
import { countryName } from '../format/country';
import { formatCount, formatUsd } from '../format/number';
import { AgencyLink, type FundingLinks } from './FundingLinks';
import { SortHeader } from './SortHeader';

export interface AgencyTableProps {
  /** The view's scope (`fundingScope`). */
  scope: FundingScope;
  links: FundingLinks;
  /** What the rows are, for the caption. */
  caption?: string;
}

const COLUMNS: { key: AgencySortKey; label: string; numeric?: boolean }[] = [
  { key: 'agency', label: 'Agency' },
  { key: 'parent', label: 'Parent' },
  { key: 'country', label: 'Country' },
  { key: 'grants', label: 'Grants', numeric: true },
  { key: 'counted', label: 'Counted', numeric: true },
  { key: 'unknown', label: 'Without an amount', numeric: true },
  { key: 'publications', label: 'Publications', numeric: true },
];

const None = ({ children }: { children: string }) => <span className="cell-none">{children}</span>;

/**
 * An agency's full name beneath the short name a table row is labelled by — "NCRR", then
 * "National Center for Research Resources" — or nothing when it has no other name. The real
 * export has 98 agencies, most known by an acronym a reader cannot expand (VR, SSF, OD, DOI),
 * and a table of them said nothing more (docs/09 R1b).
 */
export function AgencyFullName({
  agency,
}: {
  agency: Pick<AgencyRecord, 'name' | 'short_name'> | undefined;
}) {
  if (agency === undefined || agency.short_name === null || agency.short_name === agency.name) {
    return null;
  }
  return (
    <>
      {' '}
      <span className="agency-name">{agency.name}</span>
    </>
  );
}

function Row({
  row,
  index,
  links,
  miscellaneous = false,
}: {
  row: AgencyRow;
  index: FundingIndex;
  links: FundingLinks;
  miscellaneous?: boolean;
}) {
  const known = knownCounted(row);
  return (
    <tr className={miscellaneous ? 'funding-table-apart' : undefined}>
      <th scope="row">
        <AgencyLink links={links} code={row.code}>
          {row.label}
        </AgencyLink>
        {miscellaneous ? (
          <>
            {' '}
            <span className="badge">unmatched numbers</span>
          </>
        ) : null}
        <AgencyFullName agency={index.agencies.get(row.code)} />
      </th>
      <td>
        {row.parent === null ? (
          <None>—</None>
        ) : (
          <AgencyLink links={links} code={row.parent}>
            {agencyLabel(index, row.parent)}
          </AgencyLink>
        )}
      </td>
      <td>{row.country === null ? <None>—</None> : countryName(row.country)}</td>
      <td className="numeric">{formatCount(row.grants)}</td>
      <td className="numeric">{known === null ? <None>not known</None> : formatUsd(known)}</td>
      <td className="numeric">{formatCount(row.withoutAmount)}</td>
      <td className="numeric">{formatCount(row.publications)}</td>
    </tr>
  );
}

export function AgencyTable({
  scope,
  links,
  caption = 'The agencies of the grants listed, each grant under its own agency with the parent beside it',
}: AgencyTableProps) {
  const [sort, setSort] = useState<AgencySort>(DEFAULT_AGENCY_SORT);
  const index = scope.index;
  if (index === null) return null;

  const ranking = rankAgencies(scope, { level: 'agency', limit: Infinity });
  if (ranking.items.length === 0 && ranking.miscellaneous === null) {
    return <p className="chart-card-description">No grant is listed on the publications shown.</p>;
  }
  const rows = sortAgencies(ranking.items, sort, index);

  return (
    <div className="table-scroll">
      <table className="chart-table funding-table">
        <caption>
          {caption}. Counted is each agency’s grant funding counted for the publications shown;
          unknown totals are listed last, whichever way the table is sorted
          {ranking.miscellaneous === null
            ? '.'
            : '; unmatched numbers are kept apart in the last row, and are not an agency’s grants.'}
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <SortHeader
                key={column.key}
                label={column.label}
                direction={sort.key === column.key ? sort.direction : null}
                numeric={column.numeric ?? false}
                onSort={() => {
                  setSort((current) => toggleAgencySort(current, column.key));
                }}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.code} row={row} index={index} links={links} />
          ))}
          {ranking.miscellaneous === null ? null : (
            <Row row={ranking.miscellaneous} index={index} links={links} miscellaneous />
          )}
        </tbody>
      </table>
    </div>
  );
}
