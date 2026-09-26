/**
 * The CSV every download writes (docs/06 §7). What a reader's spreadsheet receives is decided
 * here, so each rule is pinned as a string: RFC 4180 quoting, CRLF, the formula-injection guard,
 * and "unknown" as an empty cell rather than a zero.
 */
import { describe, expect, it } from 'vitest';
import {
  CSV_LINE_END,
  CSV_MEDIA_TYPE,
  csvField,
  toCsv,
  type CsvColumn,
} from '../../src/download/csv';

interface Grant {
  number: string;
  title: string | null;
  amount: number | null;
}

const columns: CsvColumn<Grant>[] = [
  { header: 'Number', value: (grant) => grant.number },
  { header: 'Title', value: (grant) => grant.title },
  { header: 'Total (USD)', value: (grant) => grant.amount },
];

describe('toCsv', () => {
  it('writes a header row, then one record per row, each ending in CRLF', () => {
    expect(
      toCsv(columns, [
        { number: 'R01 GM123456', title: 'Proteomics', amount: 1234567 },
        { number: 'P41 GM103533', title: 'Mass spectrometry', amount: 0 },
      ]),
    ).toBe(
      'Number,Title,Total (USD)\r\n' +
        'R01 GM123456,Proteomics,1234567\r\n' +
        'P41 GM103533,Mass spectrometry,0\r\n',
    );
    expect(CSV_LINE_END).toBe('\r\n');
  });

  it('writes only the header for no rows', () => {
    expect(toCsv(columns, [])).toBe('Number,Title,Total (USD)\r\n');
  });

  it('writes an unknown amount as an empty cell, never as 0', () => {
    expect(toCsv(columns, [{ number: 'X1', title: null, amount: null }])).toBe(
      'Number,Title,Total (USD)\r\nX1,,\r\n',
    );
  });

  it('starts with a byte-order mark only when asked', () => {
    expect(toCsv(columns, []).startsWith('﻿')).toBe(false);
    expect(toCsv(columns, [], { bom: true })).toBe('﻿Number,Title,Total (USD)\r\n');
  });

  it('writes numbers raw, with no grouping, so a spreadsheet can sum them', () => {
    expect(toCsv([{ header: 'n', value: (n: number) => n }], [6219845123, -5, 0.25])).toBe(
      'n\r\n6219845123\r\n-5\r\n0.25\r\n',
    );
  });

  it('is served as UTF-8 CSV', () => {
    expect(CSV_MEDIA_TYPE).toBe('text/csv;charset=utf-8');
  });
});

describe('csvField: RFC 4180 quoting', () => {
  it('leaves a plain field alone', () => {
    expect(csvField('Proteomics of yeast')).toBe('Proteomics of yeast');
    expect(csvField('')).toBe('');
  });

  it('quotes a field holding a comma', () => {
    expect(csvField('Smith, J.')).toBe('"Smith, J."');
  });

  it('quotes a field holding a double quote, and doubles the quote', () => {
    expect(csvField('the "UWPR" facility')).toBe('"the ""UWPR"" facility"');
  });

  it('quotes a field holding a line feed, a CR, or both', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('line one\r\nline two')).toBe('"line one\r\nline two"');
    expect(csvField('a\rb')).toBe('"a\rb"');
  });

  it('keeps leading and trailing spaces, which are part of the field', () => {
    expect(csvField('  padded  ')).toBe('  padded  ');
  });

  it('keeps non-ASCII text as it is', () => {
    expect(csvField('Müller, Zoë')).toBe('"Müller, Zoë"');
  });
});

describe('csvField: the formula-injection guard', () => {
  it.each(['=', '+', '-', '@', '\t'])(
    'prefixes a string starting with %j with a quote mark',
    (c) => {
      expect(csvField(`${c}SUM(A1:A9)`)).toBe(`'${c}SUM(A1:A9)`);
    },
  );

  it('guards a leading CR, and then quotes the field because it holds one', () => {
    expect(csvField('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('guards and quotes a field that needs both', () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvField('-1,5')).toBe(`"'-1,5"`);
  });

  it('guards a string that looks like a negative number, which is why numbers go as numbers', () => {
    expect(csvField('-5')).toBe("'-5");
    expect(csvField(-5)).toBe('-5');
  });

  it('does not guard a formula character that is not at the start', () => {
    expect(csvField('a=b')).toBe('a=b');
    expect(csvField('R01-GM1')).toBe('R01-GM1');
  });

  it('guards the header row as well', () => {
    expect(toCsv([{ header: '=cmd', value: () => 1 }], [])).toBe("'=cmd\r\n");
  });
});

describe('csvField: values that are not strings', () => {
  it('writes null and undefined as an empty cell, never 0', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('writes zero as zero, which is a known value', () => {
    expect(csvField(0)).toBe('0');
  });

  it('writes a number that is not finite as empty rather than as "NaN"', () => {
    expect(csvField(Number.NaN)).toBe('');
    expect(csvField(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('writes booleans as words', () => {
    expect(csvField(true)).toBe('true');
    expect(csvField(false)).toBe('false');
  });
});
