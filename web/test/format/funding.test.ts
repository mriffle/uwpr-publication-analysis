/**
 * A grant in words (`format/funding.ts`; docs/09 §11.4, §12.11): the strings the grants table,
 * the publication's Funding section and the CSV share, each pinned so an honesty rule cannot slip
 * in one place and hold in another.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  COUNTED_LABEL,
  countInWords,
  countedDefinition,
  countedRuleText,
  countedRulesSentence,
  estimatedLine,
  fundingLead,
  grantAmount,
  grantTags,
  grantYears,
  investigatorNames,
  originalAmount,
  unknownAmountReason,
} from '../../src/format/funding';
import { COUNTED_RULES } from '../../src/aggregate/counting';
import { GRANT_CATEGORIES } from '../../src/aggregate/funding';
import { counting, grant, unresolvedGrant } from '../support/funding';

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

/*
 * The counting register (docs/09 F17): the headline's name and definition, the estimated line,
 * the page's lead and each rule's reason, every year and count taken from `funding.counting`.
 */
describe('what the totals count, in words', () => {
  it('names the headline, and defines it from the export’s first year', () => {
    expect(COUNTED_LABEL).toBe('Grant funding counted');
    expect(countedDefinition(counting(), 'UWPR')).toBe(
      'The funding of the grants listed on these publications, from 2006, when UWPR began, through the year of the latest publication listing each grant. Not money spent on this work.',
    );
    expect(countedDefinition(counting({ from_year: 2004 }), 'X')).toMatch(
      /from 2004, when X began,/,
    );
  });

  it('states the estimated part, and nothing when none is', () => {
    expect(estimatedLine(418_540_466)).toBe(
      '$418,540,466 of it is estimated: other funders’ awards spread evenly over their years.',
    );
    expect(estimatedLine(0)).toBeNull();
  });

  it('leads the page with the rule, or without one when there is no funding data', () => {
    expect(fundingLead(counting(), 'UWPR')).toBe(
      'The grants the publications here list as their funding. The totals count each grant’s funding from 2006, when UWPR began, through the year of the latest publication listing it: not money spent on the work that lists it.',
    );
    expect(fundingLead(null, 'UWPR')).toMatch(/not money spent on the work that lists it\.$/);
    expect(fundingLead(null, 'UWPR')).not.toMatch(/2006/);
  });

  it('gives each rule its reason, the year and the count of years the export’s', () => {
    expect(countedRuleText(counting())).toEqual({
      window: 'from 2006 to its latest listing publication',
      began_after: 'began after its latest listing publication: nothing counted',
      full_amount: 'an instrument grant: counted in full',
      ended_before: 'ended before 2006: its last five years counted',
      undated: 'no yearly breakdown: counted whole',
    });
    const other = countedRuleText(
      counting({ from_year: 2010, last_years: 1, full_amount_categories: ['contract', 'center'] }),
    );
    expect(other.window).toBe('from 2010 to its latest listing publication');
    expect(other.ended_before).toBe('ended before 2010: its last year counted');
    expect(other.full_amount).toBe('a contract or centre or programme grant: counted in full');
    expect(Object.keys(countedRuleText(counting())).sort()).toEqual([...COUNTED_RULES].sort());
  });

  it('writes a small count in words and a large one in digits', () => {
    expect(countInWords(5)).toBe('five');
    expect(countInWords(0)).toBe('zero');
    expect(countInWords(12)).toBe('12');
    expect(countInWords(1234)).toBe('1,234');
  });

  it('says how the grants with a known amount are counted, rule by rule, and the estimates', () => {
    expect(
      countedRulesSentence(
        { full_amount: 15, undated: 10, ended_before: 6, began_after: 5, window: 581 },
        125,
        counting(),
      ),
    ).toBe(
      'Of the 617 grants with a known amount, 581 are counted from 2006 through the year of the latest publication listing each; 15 are instrument grants, counted in full; 6 ended before 2006 and count their last five years; 10 have no yearly breakdown and count whole; 5 began after the latest publication listing them and count nothing. 125 of these amounts are estimates: other funders’ awards spread evenly over their years.',
    );
    expect(
      countedRulesSentence(
        { full_amount: 1, undated: 1, ended_before: 1, began_after: 1, window: 1 },
        1,
        counting(),
      ),
    ).toBe(
      'Of the 5 grants with a known amount, 1 is counted from 2006 through the year of the latest publication listing it; 1 is an instrument grant, counted in full; 1 ended before 2006 and counts its last five years; 1 has no yearly breakdown and counts whole; 1 began after the latest publication listing it and counts nothing. 1 of these amounts is an estimate: other funders’ awards spread evenly over their years.',
    );
    expect(countedRulesSentence({ window: 1 }, 0, counting())).toBe(
      'The one grant with a known amount is counted from 2006 through the year of the latest publication listing it.',
    );
    expect(countedRulesSentence({ began_after: 1 }, 1, counting())).toBe(
      'The one grant with a known amount began after the latest publication listing it and counts nothing. Its amount is an estimate: other funders’ awards spread evenly over their years.',
    );
    expect(countedRulesSentence({}, 0, counting())).toBe(
      'No grant listed has a known amount, so none is counted.',
    );
  });
});
