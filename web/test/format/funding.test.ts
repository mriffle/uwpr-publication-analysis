/**
 * A grant in words (`format/funding.ts`; docs/09 §11.4, §12.11): the strings the grants table,
 * the publication's Funding section and the CSV share, each pinned so an honesty rule cannot slip
 * in one place and hold in another.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
  unknownAmountReason,
} from '../../src/format/funding';
import { GRANT_CATEGORIES } from '../../src/aggregate/funding';
import { grant, unresolvedGrant } from '../support/funding';

describe('grantTags', () => {
  it('names every tag in words, in a fixed order', () => {
    const tagged = grant({
      scope: 'institution-wide',
      scope_reason: 'A consortium',
      flags: [
        'unconverted_currency',
        'starts_before_fy2008',
        'starts_before_fy1985',
        'active',
        'amount_from_openalex',
      ],
    });
    expect(grantTags(tagged, true)).toEqual([
      'unmatched number',
      'institution-wide',
      'active',
      'amounts from FY1985',
      'amounts from FY2008',
      'not converted',
    ]);
  });

  it('gives a plain project grant no tag', () => {
    expect(grantTags(grant(), false)).toEqual([]);
  });
});

describe('grantYears', () => {
  it('reads a span, one year, an open end and nothing', () => {
    expect(grantYears({ start_year: 2019, end_year: 2023 })).toBe('2019–2023');
    expect(grantYears({ start_year: 2020, end_year: 2020 })).toBe('2020');
    expect(grantYears({ start_year: 2019, end_year: null })).toBe('from 2019');
    expect(grantYears({ start_year: null, end_year: 2023 })).toBe('until 2023');
    expect(grantYears({ start_year: null, end_year: null })).toBeNull();
  });
});

describe('amounts (§12.11 rules 3 and 5)', () => {
  it('formats a known amount exactly, and gives null — never $0 — for an unknown one', () => {
    expect(grantAmount({ amount_usd: 1_234_567 })).toBe('$1,234,567');
    expect(grantAmount({ amount_usd: null })).toBeNull();
  });

  it('shows a converted amount’s original and its rate year', () => {
    const converted = grant({
      amount_usd: 750_000,
      amount_original: 7_000_000,
      currency: 'SEK',
      rate_year: 2021,
    });
    expect(originalAmount(converted)).toBe('converted from SEK\u00a07,000,000 at the 2021 rate');
    expect(originalAmount({ ...converted, flags: ['rate_year_estimated'] })).toBe(
      'converted from SEK\u00a07,000,000 at the 2021 rate (the rate year estimated)',
    );
    expect(originalAmount({ ...converted, rate_year: null })).toBe(
      'converted from SEK\u00a07,000,000',
    );
  });

  it('says an amount no rate covers was not converted, rather than showing it as dollars', () => {
    const unconverted = grant({
      amount_usd: null,
      amount_original: 1_000,
      currency: 'XYZ',
      rate_year: null,
      flags: ['unconverted_currency'],
    });
    expect(originalAmount(unconverted)).toBe('XYZ\u00a01,000, not converted to US dollars');
    expect(unknownAmountReason(unconverted)).toBe('no exchange rate covers its currency');
  });

  it('has nothing to add for an amount in US dollars, or for no amount', () => {
    expect(originalAmount(grant())).toBeNull();
    expect(originalAmount(grant({ currency: 'usd' }))).toBeNull();
    expect(originalAmount(unresolvedGrant())).toBeNull();
  });

  it('says why an amount is not known', () => {
    expect(unknownAmountReason(unresolvedGrant())).toBe('no funder’s record matched this number');
    expect(unknownAmountReason(grant({ flags: ['no_amount_reported'] }))).toBe(
      'the funder’s record holds the grant but reports no amount',
    );
    expect(unknownAmountReason(grant({ flags: ['amount_not_found'] }))).toBe(
      'no source read here reports an amount for it',
    );
  });
});

describe('names and categories', () => {
  it('lists investigators as the funder publishes them, or null for none (rule 9)', () => {
    expect(
      investigatorNames(
        grant({
          pis: [
            { name: 'SMITH, JANE', id: '1' },
            { name: 'Émile Zola', id: null },
          ],
        }),
      ),
    ).toBe('SMITH, JANE; Émile Zola');
    expect(investigatorNames(grant({ pis: [] }))).toBeNull();
  });

  it('labels every category the contract has', () => {
    for (const category of GRANT_CATEGORIES) expect(CATEGORY_LABELS[category]).toMatch(/^[A-Z]/);
  });
});
