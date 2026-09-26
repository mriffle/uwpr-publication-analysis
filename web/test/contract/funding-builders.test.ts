/**
 * The funding test builders validate against the contract (docs/09 §11; docs/06 §12.1).
 *
 * The committed sample is held to the schema by `schema.test.ts`. Hand-built fixtures need the
 * same check or they become a second, private contract: a test that passes against a grant the
 * pipeline could never write proves nothing about the page. Each builder is checked against its
 * own definition in `export.schema.json`, and a whole built document against the file's root.
 */
import { describe, expect, it } from 'vitest';
import {
  agency,
  fundingBlock,
  fundingDocument,
  grant,
  legacyDocument,
  listing,
  miscellaneous,
  nigms,
  noFundingBlock,
  reporterSource,
  unresolvedGrant,
  zeroSummary,
} from '../support/funding';
import { report, validator } from '../support/schema';

const definition = (name: string) => validator(`export.schema.json#/$defs/${name}`);

const expectValid = (entry: ReturnType<typeof validator>, value: unknown) => {
  const valid = entry(value);
  expect(report(entry)).toEqual([]);
  expect(valid).toBe(true);
};

describe('every funding builder writes what the schema accepts', () => {
  it.each([
    ['agency', agency()],
    ['agency', nigms()],
    ['agency', miscellaneous()],
    ['grant', grant()],
    ['grant', unresolvedGrant()],
    [
      'grant',
      grant({
        key: 'ANID:1599A0001',
        agency: 'ANID',
        number: '1599A0001',
        scope: 'institution-wide',
        scope_reason: 'A national research centre programme',
        amount_usd: 2_522_936,
        amount_original: 2_000_000_000,
        currency: 'CLP',
        rate_year: 2020,
        amount_source: {
          name: 'OpenAlex',
          url: null,
          as_of: '2026-09-26',
          basis: 'openalex_amount',
        },
        fiscal_years: null,
        url: null,
        url_name: null,
        flags: ['amount_from_openalex'],
      }),
    ],
    ['grantListing', listing()],
    [
      'grantListing',
      listing({
        how: 'override',
        cited_as: ['R01GM00000'],
        override: { reason: 'A digit short', by: 'mriffle', date: '2026-09-26' },
      }),
    ],
    ['fundingSource', reporterSource()],
    ['fundingSummary', zeroSummary()],
    ['funding', fundingBlock()],
    ['funding', noFundingBlock()],
  ])('%s', (name, value) => {
    expectValid(definition(name), value);
  });

  it('a whole built document', () => {
    expectValid(validator('export.schema.json'), fundingDocument());
  });

  it('a whole built document with no funding data', () => {
    expectValid(validator('export.schema.json'), fundingDocument({ funding: noFundingBlock() }));
  });

  it('proves the check has teeth: a key off the grammar and a 1.0 document both fail', () => {
    expect(definition('grant')(grant({ key: 'NIH:R01 GM000001' }))).toBe(false);
    expect(definition('grantListing')(listing({ agencies: [] as unknown as ['NIH'] }))).toBe(false);
    expect(validator('export.schema.json')(legacyDocument())).toBe(false);
  });

  it('writes agencies and grants sorted, as the export does (docs/09 §11.1)', () => {
    const block = fundingBlock({
      agencies: [miscellaneous(), nigms(), agency()],
      grants: [unresolvedGrant(), grant({ key: 'NIH:P01HL000001', number: 'P01HL000001' })],
    });
    expect(block.agencies.map((entry) => entry.code)).toEqual(['MISC', 'NIGMS', 'NIH']);
    expect(block.grants.map((entry) => entry.key)).toEqual(['MISC:R01GM999999', 'NIH:P01HL000001']);
  });
});
