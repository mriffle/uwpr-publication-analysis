/**
 * CSV for the downloads of docs/06 §7: "This audience writes reports and grant renewals; a page
 * they cannot get numbers out of will be retyped by hand, with errors."
 *
 * Pure (no React, no DOM), so what a reader's spreadsheet receives is pinned by unit tests:
 *
 * - **RFC 4180.** A field holding a comma, a double quote, a CR or an LF is quoted, and a quote
 *   inside it is doubled. Records end in CRLF, the last one included.
 * - **Formula injection is guarded.** A spreadsheet treats a cell starting with `=`, `+`, `-` or
 *   `@` as a formula, and some also a leading tab or CR. Titles, names and grant numbers come
 *   from third-party metadata, so a *string* cell starting with any of those gets a leading `'`,
 *   which the spreadsheet shows as text. (OWASP's "CSV Injection" guidance.) Numbers are written
 *   as numbers and never guarded, so `-5` stays a number: a numeric column must pass numbers,
 *   not pre-formatted strings — which is also what keeps "$1,234" out of a column meant to sum.
 * - **Unknown is empty, never zero.** `null` and `undefined` become an empty cell, as does a
 *   number that is not finite. The contract uses `null` for "known to be absent" throughout, and
 *   a zero in a download would be a false figure someone later adds up.
 */

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

export interface CsvOptions {
  /**
   * Start the file with a UTF-8 byte-order mark. Excel reads a CSV without one in the system's
   * legacy code page, which garbles every accented name; most other tools ignore the mark.
   */
  bom?: boolean;
}

/** The characters a spreadsheet may read as the start of a formula (OWASP). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Characters that force a field to be quoted (RFC 4180 §2.6). */
const NEEDS_QUOTES = /[",\r\n]/;

export const CSV_LINE_END = '\r\n';

export const CSV_MEDIA_TYPE = 'text/csv;charset=utf-8';

const BOM = '﻿';

/** One field, guarded and quoted as needed. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** A header row, then one record per row, each ending in CRLF. */
export function toCsv<T>(
  columns: readonly CsvColumn<T>[],
  rows: readonly T[],
  { bom = false }: CsvOptions = {},
): string {
  const lines = [
    columns.map((column) => csvField(column.header)),
    ...rows.map((row) => columns.map((column) => csvField(column.value(row)))),
  ];
  return (bom ? BOM : '') + lines.map((fields) => fields.join(',') + CSV_LINE_END).join('');
}
