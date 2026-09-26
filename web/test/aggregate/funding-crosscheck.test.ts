/**
 * THE funding cross-check (docs/06 §12.1, docs/09 §11.6–11.7).
 *
 * The app's unfiltered funding figures must equal the exported `funding.summary`, which the
 * pipeline computes independently (`uwpr_pubs.funding.summary`), field for field — the
 * investigators and organisations with the same keys — and every grant's first year, recomputed
 * over the works, must equal its exported `first_year`. `summarizeFunding` is built from the
 * functions the views use, so this checks the definitions the page shows.
 *
 * Every expectation is read from whichever export is loaded, never hard-coded, so this holds
 * against the sample (whose funding is B5's synthetic block) and the real export alike. The
 * test builders' summaries are zeros (`support/funding.ts`), so they are no fixture for this.
 */
import { describe, expect, it } from 'vitest';
import {
  UNFILTERED,
  cumulativeDollars,
  firstYearDisagreements,
  fundingFigures,
  fundingScope,
  newGrantsByAgency,
  noFundingSummary,
  summarizeFunding,
  valueByAgency,
} from '../../src/aggregate/funding';
import { fundingOf } from '../../src/contract/funding';
import type { FundingSummary } from '../../src/contract/types';
import { isSampleExport, sampleExport } from '../support/fixture';
import { fundingDocument, legacyDocument, noFundingBlock } from '../support/funding';

const doc = sampleExport();
const index = fundingOf(doc);
const summary = doc.funding.summary;
const computed = summarizeFunding(doc.works, index);

describe('the app’s unfiltered funding figures equal funding.summary', () => {
  // A vacuous pass — no funding on either side — would be worse than no test at all. The sample
  // always has funding; a real export has none until the seed (docs/09 §17), and then agrees
  // with its zeros, which the no-data cases below also hold.
  it.skipIf(!isSampleExport && index === null)('reads an export with funding data', () => {
    expect(index).not.toBeNull();
    expect(summary.grants).toBeGreaterThan(0);
    expect(summary.works_with_listings).toBeGreaterThan(0);
  });

  it('agrees on every field at once', () => {
    expect(computed).toEqual(summary);
  });

  // Field by field as well, so a failure names the definition that drifted.
  const fields = Object.keys(summary) as (keyof FundingSummary)[];
  it.each(fields)('agrees on funding.summary.%s', (field) => {
    expect(computed[field]).toStrictEqual(summary[field]);
  });

  it('agrees on every year of by_first_year, the cumulative rule’s increments', () => {
    for (const [year, entry] of Object.entries(summary.by_first_year)) {
      expect(computed.by_first_year[year], year).toStrictEqual(entry);
    }
    expect(Object.keys(computed.by_first_year)).toEqual(Object.keys(summary.by_first_year));
  });
});

describe('every grant’s unfiltered first year is its exported first_year', () => {
  it('finds no disagreement', () => {
    expect(firstYearDisagreements(doc.works, index)).toEqual([]);
  });

  it('holds grant by grant', () => {
    const scope = fundingScope(doc.works, index, UNFILTERED);
    expect(scope.grants).toHaveLength(doc.funding.grants.length);
    for (const entry of scope.grants) {
      expect(entry.firstYear, entry.grant.key).toBe(entry.grant.first_year);
    }
  });
});

describe('the series the view draws agree with the summary', () => {
  const scope = fundingScope(doc.works, index, UNFILTERED);

  it('draws value over time ending at the headline total', () => {
    const series = cumulativeDollars(scope, doc.period);
    expect(series.points.at(-1)?.cumulative).toBe(summary.amount_usd);
    expect(series.amountUsd).toBe(fundingFigures(scope).amountUsd);
  });

  it('enters each year’s value as by_first_year does', () => {
    const series = cumulativeDollars(scope, doc.period);
    for (const point of series.points) {
      const entry = summary.by_first_year[String(point.year)];
      expect(point.count, String(point.year)).toBe(entry?.amount_usd ?? 0);
      expect(point.grants, String(point.year)).toBe(entry?.grants ?? 0);
    }
  });

  it('stacks value by agency to the headline total', () => {
    expect(valueByAgency(scope, doc.period).total).toBe(summary.amount_usd);
  });

  it('stacks new grants by agency to every grant, Miscellaneous included', () => {
    expect(newGrantsByAgency(scope, doc.period).total).toBe(summary.grants);
  });

  it('keeps every dollar figure a safe integer', () => {
    expect(Number.isSafeInteger(computed.amount_usd)).toBe(true);
    expect(Number.isSafeInteger(computed.amount_usd_institution_wide)).toBe(true);
    expect(Number.isSafeInteger(computed.amount_usd_nih)).toBe(true);
  });
});

describe('an export with no funding data', () => {
  it('returns the summary of none, without throwing, for a block with a null version', () => {
    const empty = fundingDocument({ funding: noFundingBlock() });
    const none = fundingOf(empty);
    expect(none).toBeNull();
    expect(summarizeFunding(empty.works, none)).toEqual(noFundingBlock().summary);
    expect(firstYearDisagreements(empty.works, none)).toEqual([]);
  });

  it('returns the summary of none for a 1.0 export with no funding block', () => {
    const legacy = legacyDocument();
    expect(summarizeFunding(legacy.works, fundingOf(legacy))).toEqual(noFundingSummary());
  });
});
