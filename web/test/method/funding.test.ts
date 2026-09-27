/**
 * The facts the method page's funding section states (docs/09 §12.9), as arithmetic.
 *
 * Each count about the grants is held to `funding.summary`, which the pipeline computed on its
 * own (§11.6), wherever the summary has the same figure: so the section cannot state a number
 * the Funding impact view and the pipeline disagree with. The rest are held to the rows.
 */
import { describe, expect, it } from 'vitest';
import type { Grant } from '../../src/contract/types';
import { fundingMethodFacts, sourceById } from '../../src/method/funding';
import { sampleExport } from '../support/fixture';
import { legacyDocument, noFundingBlock } from '../support/funding';

const doc = sampleExport();
const facts = fundingMethodFacts(doc);
const summary = doc.funding.summary;
const resolved = doc.funding.grants.filter((grant) => grant.status === 'resolved');

describe('fundingMethodFacts', () => {
  it('is null with no funding data, in both of its shapes (§12.10)', () => {
    expect(fundingMethodFacts({ ...doc, funding: noFundingBlock() })).toBeNull();
    expect(fundingMethodFacts(legacyDocument())).toBeNull();
  });

  it('counts the grants listed as funding.summary does', () => {
    expect(facts).not.toBeNull();
    expect(facts?.grants.listed).toBe(summary.grants_resolved);
    expect(facts?.grants.withAmount).toBe(summary.grants_with_amount);
    expect(facts?.grants.withoutAmount).toBe(summary.grants_resolved - summary.grants_with_amount);
    expect(facts?.grants.unconverted).toBe(summary.grants_unconverted);
    expect(facts?.miscellaneous.grants).toBe(summary.grants - summary.grants_resolved);
  });

  it('counts the institution-wide awards, included, as funding.summary does', () => {
    expect(facts?.institutionWide.included).toBe(true);
    expect(facts?.institutionWide.grants).toBe(summary.grants_institution_wide);
    expect(facts?.institutionWide.amountUsd).toBe(summary.amount_usd_institution_wide);
  });

  it('counts each flag and each basis over the grants listed', () => {
    const flagged = (flag: Grant['flags'][number]) =>
      resolved.filter((grant) => grant.flags.includes(flag));
    expect(facts?.grants.active).toBe(flagged('active').length);
    expect(facts?.grants.startsBeforeFy1985).toBe(flagged('starts_before_fy1985').length);
    expect(facts?.startsBeforeFy2008).toBe(flagged('starts_before_fy2008').length);

    const withSource = resolved.filter((grant) => grant.amount_source !== null);
    const byBasis = [...(facts?.byBasis.values() ?? [])].reduce((sum, count) => sum + count, 0);
    expect(byBasis).toBe(withSource.length);
    for (const [basis, count] of facts?.byBasis ?? []) {
      expect(count).toBe(withSource.filter((grant) => grant.amount_source?.basis === basis).length);
    }

    const converted = resolved.filter(
      (grant) => grant.amount_usd !== null && grant.currency !== null && grant.currency !== 'USD',
    );
    expect(facts?.converted).toBe(converted.length);
    expect(facts?.rateYearEstimated).toBe(
      converted.filter((grant) => grant.flags.includes('rate_year_estimated')).length,
    );
  });

  it('carries the method block, and totals its strings over every outcome', () => {
    expect(facts?.method).toEqual(doc.funding.method);
    expect(facts?.strings).toBe(
      Object.values(doc.funding.method.strings).reduce((sum, count) => sum + count, 0),
    );
  });

  it('keeps the export’s sources and rate sources, in its order, and finds a source by id', () => {
    expect(facts?.sources).toEqual(doc.funding.sources);
    expect(facts?.exchangeRates).toEqual(doc.funding.exchange_rates);
    expect(facts?.asOf).toBe(doc.funding.as_of);
    if (facts === null) return;
    expect(sourceById(facts, 'reporter')?.id).toBe('reporter');
    expect(sourceById({ sources: [] }, 'reporter')).toBeUndefined();
  });
});
