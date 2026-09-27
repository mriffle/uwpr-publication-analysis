/**
 * A small funding world for the component tests (docs/09 §12.5, §12.8), where every figure a
 * component shows can be worked out on paper.
 *
 * Built on `grants.ts`'s agencies and grants, with amounts that differ, so an order is visible:
 *
 * | grant        | agency      | amount                                   | tags                     |
 * |--------------|-------------|------------------------------------------|--------------------------|
 * | R01          | NIGMS → NIH | $1,000,000                               | active                   |
 * | P01          | NHLBI → NIH | $2,500,000                               | amounts from FY1985      |
 * | GRFP         | NSF         | $4,000,000                               | institution-wide         |
 * | NSF_PROJECT  | NSF         | not known                                |                          |
 * | FOREIGN      | foundation  | $750,000, converted from SEK 7,000,000   |                          |
 * | UNMATCHED    | MISC        | none (an unmatched number)               | unmatched number         |
 *
 * | work  | year | lists                          |
 * |-------|------|--------------------------------|
 * | W2019 | 2019 | R01, UNMATCHED                 |
 * | W2021 | 2021 | R01, P01, GRFP                 |
 * | W2022 | 2022 | NSF_PROJECT, FOREIGN           |
 * | W2023 | 2023 | nothing                        |
 */
import { fundingScope, UNFILTERED, type FundingScope } from '../../src/aggregate/funding';
import type { FundingIndex } from '../../src/contract/funding';
import type { Grant, Work } from '../../src/contract/types';
import type { GrantSelection } from '../../src/filter/funding';
import { grant } from './funding';
import {
  AGENCIES,
  FOUNDATION_GRANT,
  GRFP,
  NSF_PROJECT,
  P01,
  R01,
  UNMATCHED,
  grantsIndex,
  listings,
} from './grants';
import { work } from './works';

export const WORLD = {
  r01: grant({
    ...R01,
    amount_usd: 1_000_000,
    pis: [
      { name: 'Ada Investigator', id: '20000001' },
      { name: 'Émile Coinvestigator', id: null },
    ],
    flags: ['active'],
  }),
  p01: grant({
    ...P01,
    title: 'A PROGRAM PROJECT',
    category: 'center',
    amount_usd: 2_500_000,
    amount_original: 2_500_000,
    start_year: 1980,
    flags: ['starts_before_fy1985'],
  }),
  grfp: grant({ ...GRFP, amount_usd: 4_000_000, amount_original: 4_000_000 }),
  nsf: grant({
    ...NSF_PROJECT,
    title: null,
    pis: [],
    organization: null,
    start_year: null,
    end_year: null,
    amount_usd: null,
    amount_original: null,
    currency: null,
    amount_source: null,
    fiscal_years: null,
    url: 'https://www.nsf.gov/awardsearch/show-award/?AWD_ID=1443474',
    url_name: 'NSF award page',
    flags: ['amount_not_found'],
  }),
  foreign: grant({
    ...FOUNDATION_GRANT,
    title: 'Proteomes of the north',
    pis: [{ name: 'Åsa Forskare', id: null }],
    organization: 'Karolinska Institutet',
    amount_usd: 750_000,
    amount_original: 7_000_000,
    currency: 'SEK',
    rate_year: 2021,
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
  unmatched: UNMATCHED,
} satisfies Record<string, Grant>;

export const WORLD_GRANTS: Grant[] = Object.values(WORLD);

/** The world's index, or one over the given grants (AGENCIES throughout). */
export const worldIndex = (grants: Grant[] = WORLD_GRANTS): FundingIndex =>
  grantsIndex({ agencies: AGENCIES, grants });

/** The world's four works, their listings carrying each grant's chain. */
export function worldWorks(index: FundingIndex): Work[] {
  const listed = (year: number, ...grants: Grant[]): Work =>
    work({ id: `W-00${String(year)}`, year, grants: listings(index, ...grants) });
  return [
    listed(2019, WORLD.r01, WORLD.unmatched),
    listed(2021, WORLD.r01, WORLD.p01, WORLD.grfp),
    listed(2022, WORLD.nsf, WORLD.foreign),
    listed(2023),
  ];
}

/** The world's scope under a selection; unfiltered by default. */
export function worldScope(selection: Partial<GrantSelection> = {}): FundingScope {
  const index = worldIndex();
  return fundingScope(worldWorks(index), index, { ...UNFILTERED, ...selection });
}

/** Link builders that record what was opened in place. */
export function recordingLinks() {
  const opened: string[] = [];
  return {
    opened,
    links: {
      grantHref: (key: string) => `/funding/grant/${encodeURIComponent(key)}`,
      agencyHref: (code: string) => `/funding/agency/${encodeURIComponent(code)}`,
      onOpenGrant: (key: string) => {
        opened.push(`grant:${key}`);
      },
      onOpenAgency: (code: string) => {
        opened.push(`agency:${code}`);
      },
    },
  };
}
