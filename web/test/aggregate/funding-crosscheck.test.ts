/**
 * THE funding cross-check (docs/06 §12.1, docs/09 §11.6–11.7).
 *
 * The app's unfiltered funding figures must equal the exported `funding.summary`, which the
 * pipeline computes independently (`uwpr_pubs.funding.summary`), field for field — the
 * investigators and organisations with the same keys — and every grant's first year, recomputed
 * over the works, must equal its exported `first_year`; since contract 1.2, its last year,
 * counted amount and rule too (F17), and the counted funding year by award year.
 * `summarizeFunding` is built from the functions the views use, so this checks the definitions
 * the page shows.
 *
 * Every expectation is read from whichever export is loaded, never hard-coded, so this holds
 * against the sample and the real export alike: 755 grants on the real one at its seed. The
 * test builders' summaries are zeros (`support/funding.ts`), so they are no fixture for this.
 */
import { describe, expect, it } from 'vitest';
import {
  UNFILTERED,
  countedByAgency,
  countedOverTime,
  firstYearDisagreements,
  fundingFigures,
  fundingScope,
  newGrantsByAgency,
  noFundingSummary,
  summarizeFunding,
} from '../../src/aggregate/funding';
import { countingOf, fundingOf } from '../../src/contract/funding';
import type { FundingSummary } from '../../src/contract/types';
import { sampleExport } from '../support/fixture';
import {
  fundingDocument,
  legacyDocument,
  noFundingBlock,
  uncountedBlock,
} from '../support/funding';

const doc = sampleExport();
const index = fundingOf(doc);
const summary = doc.funding.summary;
const computed = summarizeFunding(doc.works, index);

describe('the app’s unfiltered funding figures equal funding.summary', () => {
  // A vacuous pass — no funding on either side — would be worse than no test at all. The sample
  // always has funding, and so has the real export since the seed of 2026-09-27 (docs/09 B9),
  // which CI checks on every push (R1a). An export with none agrees with its zeros, which the
  // no-data cases below hold.
  it('reads an export with funding data', () => {
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

  it('adds by_first_year up to the lifetime total and the grants listed', () => {
    const years = Object.values(computed.by_first_year);
    expect(years.reduce((sum, entry) => sum + entry.amount_usd, 0)).toBe(summary.amount_usd);
    expect(years.reduce((sum, entry) => sum + entry.grants, 0)).toBe(summary.grants_resolved);
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

  it('stacks new grants by agency to every grant, Miscellaneous included', () => {
    expect(newGrantsByAgency(scope, doc.period).total).toBe(summary.grants);
  });

  it('keeps every dollar figure a safe integer', () => {
    expect(Number.isSafeInteger(computed.amount_usd)).toBe(true);
    expect(Number.isSafeInteger(computed.amount_usd_institution_wide)).toBe(true);
    expect(Number.isSafeInteger(computed.amount_usd_nih)).toBe(true);
    expect(Number.isSafeInteger(computed.counted_usd)).toBe(true);
    expect(Number.isSafeInteger(computed.counted_usd_institution_wide)).toBe(true);
    expect(Number.isSafeInteger(computed.counted_usd_nih)).toBe(true);
  });
});

/*
 * The counting rule (docs/09 F17, §7.4): the app counts each grant under the filter from the
 * exported rows, and the pipeline counted it unfiltered, independently (`funding/counting.py`).
 * Unfiltered, the two must agree grant by grant, year by year and in total.
 */
describe('every grant’s unfiltered counted amount is the pipeline’s', () => {
  const scope = fundingScope(doc.works, index, UNFILTERED);

  it('reads the counting rule the export states', () => {
    expect(countingOf(index)).toEqual(doc.funding.counting);
  });

  it('agrees on each grant’s last year, counted amount and rule', () => {
    expect(scope.grants).toHaveLength(doc.funding.grants.length);
    const disagreements = scope.grants
      .filter(
        (entry) =>
          entry.lastYear !== entry.grant.last_listed_year ||
          entry.counted.usd !== entry.grant.counted_usd ||
          entry.counted.rule !== entry.grant.counted_rule,
      )
      .map((entry) => ({
        key: entry.grant.key,
        exported: [entry.grant.last_listed_year, entry.grant.counted_usd, entry.grant.counted_rule],
        computed: [entry.lastYear, entry.counted.usd, entry.counted.rule],
      }));
    expect(disagreements).toEqual([]);
  });

  it('allocates each grant’s counted amount to award years that add up to it', () => {
    for (const entry of scope.grants) {
      const allocated = [...entry.counted.byYear.values()].reduce((sum, usd) => sum + usd, 0);
      expect(allocated, entry.grant.key).toBe(entry.counted.usd ?? 0);
    }
  });
});

describe('the counted series agree with the summary', () => {
  const scope = fundingScope(doc.works, index, UNFILTERED);
  const counting = countingOf(index);
  const over = countedOverTime(scope, doc.period, counting);

  it('draws the counted funding by award year ending at the counted total', () => {
    expect(over.points.at(-1)?.cumulative).toBe(summary.counted_usd);
    expect(over.countedUsd).toBe(summary.counted_usd);
    expect(fundingFigures(scope).countedUsd).toBe(summary.counted_usd);
  });

  it('starts at 2006, before the first publication, whatever the export', () => {
    expect(over.points[0]?.year).toBe(
      Math.min(doc.funding.counting.from_year, doc.period.first_year),
    );
  });

  it('adds each award year’s dollars as counted_by_year does, and vice versa', () => {
    for (const point of over.points) {
      const entry = summary.counted_by_year[String(point.year)];
      if (point.count === 0) {
        expect(entry, String(point.year)).toBeUndefined();
      } else {
        expect(entry, String(point.year)).toStrictEqual({
          counted_usd: point.count,
          counted_usd_institution_wide: point.institutionWide,
        });
      }
    }
    const drawn = new Set(over.points.filter((point) => point.count !== 0).map((p) => p.year));
    for (const year of Object.keys(summary.counted_by_year)) {
      expect(drawn.has(Number(year)), year).toBe(true);
    }
  });

  it('counts the began-after grants as grants_by_counted_rule does', () => {
    expect(over.beganAfter).toBe(summary.grants_by_counted_rule.began_after ?? 0);
  });

  it('stacks counted funding by agency to the counted total', () => {
    expect(countedByAgency(scope, doc.period, counting).total).toBe(summary.counted_usd);
  });

  it('counts the institution-wide awards apart, as the exclusion leaves them out', () => {
    const without = fundingFigures(
      fundingScope(doc.works, index, { ...UNFILTERED, institutionWide: 'exclude' }),
    );
    expect(without.countedUsd).toBe(summary.counted_usd - summary.counted_usd_institution_wide);
    expect(without.institutionWide.countedUsd).toBe(summary.counted_usd_institution_wide);
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

  it('returns the summary of none for a 1.1 export, which states no counting rule', () => {
    const old = fundingDocument({ funding: uncountedBlock() });
    expect(fundingOf(old)).toBeNull();
    expect(summarizeFunding(old.works, fundingOf(old))).toEqual(noFundingSummary());
    expect(firstYearDisagreements(old.works, fundingOf(old))).toEqual([]);
  });
});
