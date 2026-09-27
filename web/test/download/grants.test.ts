/**
 * The grants CSV (`download/grants.ts`; docs/09 §12.5 item 6, docs/06 §7): the rows given, in
 * the order given, with a byte-order mark, and an unknown value — above all an unknown amount —
 * as an empty cell, never 0. Two amounts, as the table has them (F17): counted for the
 * publications shown, how and whether as an estimate, and the lifetime total.
 */
import { describe, expect, it } from 'vitest';
import { CSV_LINE_END } from '../../src/download/csv';
import { grantCsvColumns, grantsCsv } from '../../src/download/grants';
import { UNFILTERED, fundingScope } from '../../src/aggregate/funding';
import { grant } from '../support/funding';
import { WORLD, WORLD_GRANTS, worldIndex, worldScope, worldWorks } from '../support/fundingWorld';

const scope = worldScope();
const BOM = '\ufeff';

/** A CSV's records, split naively: the world's fields hold no comma, quote or line break. */
const records = (csv: string): string[][] =>
  csv
    .replace(BOM, '')
    .split(CSV_LINE_END)
    .filter((line) => line !== '')
    .map((line) => line.split(','));

const column = (csv: string, header: string): string[] => {
  const [head = [], ...rows] = records(csv);
  const at = head.indexOf(header);
  return rows.map((row) => row[at] ?? '');
};

describe('grantsCsv', () => {
  it('starts with a byte-order mark and ends every record in CRLF', () => {
    const csv = grantsCsv(scope.grants, scope.index);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith(CSV_LINE_END)).toBe(true);
  });

  it('writes one record per row given, in the order given', () => {
    const rows = [...scope.grants].reverse();
    expect(column(grantsCsv(rows, scope.index), 'Key')).toEqual(rows.map((row) => row.grant.key));
    expect(records(grantsCsv([], scope.index))).toHaveLength(1);
  });

  it('writes an unknown amount as an empty cell, never 0, and a known one as a number', () => {
    const csv = grantsCsv(scope.grants, scope.index);
    for (const header of ['Counted (USD)', 'Lifetime total (USD)']) {
      const amounts = new Map(
        scope.grants.map((row, position) => [row.grant.key, column(csv, header)[position]]),
      );
      expect(amounts.get(WORLD.nsf.key), header).toBe('');
      expect(amounts.get(WORLD.unmatched.key), header).toBe('');
      expect(amounts.get(WORLD.p01.key), header).toBe('2500000');
      expect([...amounts.values()], header).not.toContain('0');
    }
  });

  it('writes the counted amount, how it was counted and whether it is an estimate', () => {
    const csv = grantsCsv(scope.grants, scope.index);
    const at = (key: string) => scope.grants.findIndex((row) => row.grant.key === key);
    const foreign = at(WORLD.foreign.key);
    expect(column(csv, 'Counted (USD)')[foreign]).toBe('600000');
    expect(column(csv, 'Lifetime total (USD)')[foreign]).toBe('750000');
    expect(column(csv, 'How counted')[foreign]).toBe('from 2006 to its latest listing publication');
    expect(column(csv, 'Estimate')[foreign]).toBe('yes');
    const r01 = at(WORLD.r01.key);
    expect(column(csv, 'Estimate')[r01]).toBe('');
    const nsf = at(WORLD.nsf.key);
    expect(column(csv, 'How counted')[nsf]).toBe('');
    expect(column(csv, 'Estimate')[nsf]).toBe('');
    const [head = []] = records(csv);
    expect(head.slice(head.indexOf('Tags') + 1, head.indexOf('Original amount'))).toEqual([
      'Counted (USD)',
      'How counted',
      'Estimate',
      'Lifetime total (USD)',
    ]);
    expect(head).not.toContain('Total (USD)');
  });

  it('writes a began-after grant’s known zero as 0, with its reason', () => {
    const later = { ...WORLD.p01, fiscal_years: { '2022': 1_000_000, '2023': 1_500_000 } };
    const index = worldIndex(
      WORLD_GRANTS.map((entry) => (entry.key === later.key ? later : entry)),
    );
    const rows = fundingScope(worldWorks(index), index, UNFILTERED).grants.filter(
      (row) => row.grant.key === later.key,
    );
    const csv = grantsCsv(rows, index);
    expect(column(csv, 'Counted (USD)')).toEqual(['0']);
    expect(column(csv, 'How counted')).toEqual([
      'began after its latest listing publication: nothing counted',
    ]);
    expect(column(csv, 'Lifetime total (USD)')).toEqual(['2500000']);
  });

  it('keeps a converted amount’s original, currency and rate year beside it', () => {
    const csv = grantsCsv(
      scope.grants.filter((row) => row.grant.key === WORLD.foreign.key),
      scope.index,
    );
    expect(column(csv, 'Lifetime total (USD)')).toEqual(['750000']);
    expect(column(csv, 'Original amount')).toEqual(['7000000']);
    expect(column(csv, 'Original currency')).toEqual(['SEK']);
    expect(column(csv, 'Exchange rate year')).toEqual(['2021']);
    expect(column(csv, 'Amount source')).toEqual(['OpenAlex']);
  });

  it('carries the view’s facts: first listed, publications, tags and the agency chain', () => {
    const csv = grantsCsv(scope.grants, scope.index);
    const at = scope.grants.findIndex((row) => row.grant.key === WORLD.r01.key);
    expect(column(csv, 'First listed')[at]).toBe('2019');
    expect(column(csv, 'Publications')[at]).toBe('2');
    expect(column(csv, 'Tags')[at]).toBe('active');
    expect(column(csv, 'Agency')[at]).toBe('NIGMS');
    expect(column(csv, 'Top-level agency')[at]).toBe('NIH');
    const unmatched = scope.grants.findIndex((row) => row.grant.key === WORLD.unmatched.key);
    expect(column(csv, 'Tags')[unmatched]).toBe('unmatched number');
    expect(column(csv, 'Principal investigators')[unmatched]).toBe('');
  });

  it('guards a cell a spreadsheet would run as a formula', () => {
    const hostile = grant({ key: 'NIH:R01GM000009', title: '=HYPERLINK("x")' });
    const [entry] = scope.grants;
    const csv = grantsCsv([{ ...entry!, grant: hostile }], scope.index);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('names its columns once, for any index', () => {
    const headers = grantCsvColumns(null).map((entry) => entry.header);
    expect(new Set(headers).size).toBe(headers.length);
    // With no index there is no rule to say how a row was counted.
    const [how] = grantCsvColumns(null).filter((entry) => entry.header === 'How counted');
    expect(how?.value(scope.grants[0]!)).toBeNull();
  });
});
