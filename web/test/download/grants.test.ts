/**
 * The grants CSV (`download/grants.ts`; docs/09 §12.5 item 6, docs/06 §7): the rows given, in
 * the order given, with a byte-order mark, and an unknown value — above all an unknown total —
 * as an empty cell, never 0.
 */
import { describe, expect, it } from 'vitest';
import { CSV_LINE_END } from '../../src/download/csv';
import { grantCsvColumns, grantsCsv } from '../../src/download/grants';
import { grant } from '../support/funding';
import { WORLD, worldScope } from '../support/fundingWorld';

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

  it('writes an unknown total as an empty cell, never 0, and a known one as a number', () => {
    const totals = new Map(
      scope.grants.map((row, position) => [
        row.grant.key,
        column(grantsCsv(scope.grants, scope.index), 'Total (USD)')[position],
      ]),
    );
    expect(totals.get(WORLD.nsf.key)).toBe('');
    expect(totals.get(WORLD.unmatched.key)).toBe('');
    expect(totals.get(WORLD.p01.key)).toBe('2500000');
    expect([...totals.values()]).not.toContain('0');
  });

  it('keeps a converted amount’s original, currency and rate year beside it', () => {
    const csv = grantsCsv(
      scope.grants.filter((row) => row.grant.key === WORLD.foreign.key),
      scope.index,
    );
    expect(column(csv, 'Total (USD)')).toEqual(['750000']);
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
  });
});
