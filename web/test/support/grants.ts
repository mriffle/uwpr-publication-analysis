/**
 * A small funding world for the filter tests (docs/09 §12.4): enough agencies and grants to vary
 * one clause of the predicate or the scope rule at a time, which the sample has too few of.
 *
 * Built from `funding.ts`'s builders, so every agency and grant here is one the schema accepts.
 * Listings carry their grant's chain, root first, as the pipeline writes them.
 */
import { buildFundingIndex, type FundingIndex } from '../../src/contract/funding';
import type { Agency, Grant, GrantListing } from '../../src/contract/types';
import {
  agency,
  fundingBlock,
  grant,
  listing,
  miscellaneous,
  nigms,
  unresolvedGrant,
} from './funding';

export const NHLBI = agency({
  code: 'NHLBI',
  name: 'National Heart, Lung, and Blood Institute',
  short_name: 'NHLBI',
  parent: 'NIH',
});
export const NSF = agency({
  code: 'NSF',
  name: 'U.S. National Science Foundation',
  short_name: 'NSF',
});
/** An agency learned from OpenAlex, with no short name. */
export const FOUNDATION = agency({
  code: 'F4399999999',
  name: 'SAMPLE Research Foundation',
  short_name: null,
  group: 'non_us',
  country: 'UA',
});

export const AGENCIES: Agency[] = [agency(), nigms(), NHLBI, NSF, FOUNDATION, miscellaneous()];

/** NIGMS, a project grant. */
export const R01 = grant();
/** NHLBI, a project grant. */
export const P01 = grant({ key: 'NIH:P01HL000002', agency: 'NHLBI', number: 'P01HL000002' });
/** NSF's GRFP award to a university: institution-wide (docs/09 Appendix B). */
export const GRFP = grant({
  key: 'NSF:0718124',
  agency: 'NSF',
  number: '0718124',
  category: 'training',
  scope: 'institution-wide',
  scope_reason: 'NSF GRFP institutional award',
});
/** NSF, a project grant. */
export const NSF_PROJECT = grant({ key: 'NSF:1443474', agency: 'NSF', number: '1443474' });
export const FOUNDATION_GRANT = grant({
  key: 'F4399999999:UA99001',
  agency: 'F4399999999',
  number: 'UA-99001',
});
/** An unmatched number, in Miscellaneous. */
export const UNMATCHED = unresolvedGrant();

export const GRANTS: Grant[] = [R01, P01, GRFP, NSF_PROJECT, FOUNDATION_GRANT, UNMATCHED];

export const RESOURCE = { identifier: 'UWPR95794' };

export const grantsIndex = (parts: { agencies?: Agency[]; grants?: Grant[] } = {}): FundingIndex =>
  buildFundingIndex(
    fundingBlock({ agencies: parts.agencies ?? AGENCIES, grants: parts.grants ?? GRANTS }),
    RESOURCE,
  );

/** The listings of the given grants, each with its chain as the index resolves it. */
export function listings(index: FundingIndex, ...grants: Grant[]): GrantListing[] {
  return grants.map((item) => {
    const chain = index.chains.get(item.agency) ?? [item.agency];
    const [root = item.agency, ...rest] = chain;
    return listing({ grant: item.key, agencies: [root, ...rest] });
  });
}
