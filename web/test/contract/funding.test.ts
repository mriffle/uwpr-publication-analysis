/**
 * Reading the export's funding (docs/09 §11, §12.10): the accessor, the index, and the guards
 * that must do nothing on valid data.
 *
 * Nothing here hard-codes the sample's figures. Where the sample is read, every expectation comes
 * from the document itself — the listings' own denormalised chains check the index's — so the
 * same tests hold against a real export.
 */
import { describe, expect, it } from 'vitest';
import { buildFundingIndex, fundingOf, listingsOf } from '../../src/contract/funding';
import type { Agency, ExportDocument } from '../../src/contract/types';
import { sampleExport } from '../support/fixture';
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
  unresolvedGrant,
} from '../support/funding';

const RESOURCE = { identifier: 'UWPR95794' };

const indexOf = (agencies: Agency[]) =>
  buildFundingIndex(fundingBlock({ agencies, grants: [] }), RESOURCE);

describe('fundingOf: no funding data is one state, whatever its shape (docs/09 §12.10)', () => {
  it('is null for a 1.0 export, with no block at all', () => {
    expect(fundingOf(legacyDocument())).toBeNull();
  });

  it('is null for a 1.1 export whose block has a null version', () => {
    expect(fundingOf(fundingDocument({ funding: noFundingBlock() }))).toBeNull();
    // The version alone decides: a null version with lists in it is still no funding data.
    expect(fundingOf(fundingDocument({ funding: { ...fundingBlock(), version: null } }))).toBe(
      null,
    );
  });

  it.each(['grants', 'agencies'])('is null for a block without its %s', (field) => {
    const funding: Record<string, unknown> = { ...fundingBlock() };
    delete funding[field];
    expect(fundingOf(fundingDocument({ funding: funding as never }))).toBeNull();
  });

  it('is null for a block that is not an object', () => {
    expect(fundingOf({ ...sampleExport(), funding: null } as unknown as ExportDocument)).toBe(null);
  });

  it('indexes the committed sample', () => {
    const doc = sampleExport();
    const index = fundingOf(doc);
    expect(index).not.toBeNull();
    expect(index?.funding).toEqual(doc.funding);
    expect([...(index?.grants.keys() ?? [])]).toEqual(doc.funding.grants.map((g) => g.key));
    expect([...(index?.agencies.keys() ?? [])]).toEqual(doc.funding.agencies.map((a) => a.code));
  });

  it('indexes a built document', () => {
    const index = fundingOf(fundingDocument());
    expect([...(index?.grants.keys() ?? [])]).toEqual(['MISC:R01GM999999', 'NIH:R01GM000001']);
    expect(index?.chains.get('NIGMS')).toEqual(['NIH', 'NIGMS']);
    expect(index?.miscellaneous?.code).toBe('MISC');
  });

  it('builds once per document, so every caller shares one index', () => {
    const doc = sampleExport();
    expect(fundingOf(doc)).toBe(fundingOf(doc));
    expect(fundingOf(sampleExport())).not.toBe(fundingOf(doc));
    const legacy = legacyDocument();
    expect(fundingOf(legacy)).toBeNull();
    expect(fundingOf(legacy)).toBeNull();
  });
});

describe('the index over the committed sample agrees with the export’s own denormalisation', () => {
  const doc = sampleExport();
  const index = fundingOf(doc);

  it('gives every listing’s grant the chain the listing carries (docs/09 §11.2)', () => {
    const listings = doc.works.flatMap((work) => listingsOf(work, index));
    expect(listings.length).toBe(doc.works.reduce((n, work) => n + work.grants.length, 0));
    for (const entry of listings) {
      const owner = index?.grants.get(entry.grant);
      expect(owner).toBeDefined();
      expect(index?.chains.get(owner?.agency ?? '')).toEqual(entry.agencies);
    }
  });

  it('starts every chain at a root and ends it at the agency, each link a parent', () => {
    for (const [code, chain] of index?.chains ?? []) {
      expect(chain.at(-1)).toBe(code);
      expect(index?.agencies.get(chain[0] ?? '')?.parent).toBeNull();
      chain.slice(1).forEach((link, position) => {
        expect(index?.agencies.get(link)?.parent).toBe(chain[position]);
      });
    }
  });

  it('lists each agency under its parent', () => {
    for (const entry of doc.funding.agencies) {
      if (entry.parent !== null) expect(index?.children.get(entry.parent)).toContain(entry.code);
    }
  });

  it('finds Miscellaneous by its group', () => {
    const expected = doc.funding.agencies.filter((entry) => entry.group === 'miscellaneous');
    expect(index?.miscellaneous ?? null).toEqual(expected[0] ?? null);
  });

  it('drops nothing: the identifier guard is a no-op on valid data', () => {
    expect(index?.dropped).toEqual([]);
    expect(index?.grants.size).toBe(doc.funding.grants.length);
  });
});

describe('buildFundingIndex', () => {
  it('resolves a chain root first, through every generation', () => {
    const index = indexOf([
      agency({ code: 'HHS', name: 'Health and Human Services' }),
      agency({ parent: 'HHS' }),
      nigms(),
    ]);
    expect(index.chains.get('NIGMS')).toEqual(['HHS', 'NIH', 'NIGMS']);
    expect(index.chains.get('NIH')).toEqual(['HHS', 'NIH']);
    expect(index.chains.get('HHS')).toEqual(['HHS']);
  });

  it('keeps each agency’s children, sorted, and an empty list for a leaf', () => {
    const index = indexOf([
      agency(),
      nigms(),
      agency({ code: 'NHLBI', name: 'National Heart, Lung, and Blood Institute', parent: 'NIH' }),
    ]);
    expect(index.children.get('NIH')).toEqual(['NHLBI', 'NIGMS']);
    expect(index.children.get('NIGMS')).toEqual([]);
    expect(index.children.has('NHGRI')).toBe(false);
  });

  it('survives a cycle among parents: no hang, no throw, each chain stops before repeating', () => {
    const index = indexOf([
      agency({ code: 'A', name: 'A', parent: 'C' }),
      agency({ code: 'B', name: 'B', parent: 'A' }),
      agency({ code: 'C', name: 'C', parent: 'B' }),
      agency({ code: 'S', name: 'Self', parent: 'S' }),
    ]);
    expect(index.chains.get('A')).toEqual(['B', 'C', 'A']);
    expect(index.chains.get('C')).toEqual(['A', 'B', 'C']);
    expect(index.chains.get('S')).toEqual(['S']);
    expect(index.children.get('A')).toEqual(['B']);
    expect(index.children.get('S')).toEqual(['S']);
  });

  it('survives a parent the block does not have: the chain stops below it', () => {
    const index = indexOf([nigms({ parent: 'GONE' }), agency({ code: 'X', parent: 'NIGMS' })]);
    expect(index.chains.get('NIGMS')).toEqual(['NIGMS']);
    expect(index.chains.get('X')).toEqual(['NIGMS', 'X']);
    expect(index.children.has('GONE')).toBe(false);
  });

  it('finds Miscellaneous by group, never by its code', () => {
    expect(indexOf([agency(), miscellaneous({ code: 'UNSORTED' })]).miscellaneous?.code).toBe(
      'UNSORTED',
    );
    expect(indexOf([agency(), agency({ code: 'MISC', group: 'non_us' })]).miscellaneous).toBe(null);
  });

  it('does nothing to valid built data', () => {
    const funding = fundingBlock();
    const index = buildFundingIndex(funding, RESOURCE);
    expect(index.dropped).toEqual([]);
    expect(index.funding).toEqual(funding);
  });

  it('drops a planted grant carrying the resource code, in its key or its number', () => {
    const planted = [
      unresolvedGrant({ key: 'MISC:UWPR95794', number: 'UWPR95794' }),
      unresolvedGrant({ key: 'MISC:P41UWPR95794' }),
      unresolvedGrant({ key: 'MISC:R01GM000002', number: 'uwpr 95794' }),
      unresolvedGrant({ key: 'MISC:R01GM000003', number: 'UWPR–95794' }),
    ];
    const kept = [grant(), unresolvedGrant()];
    const index = buildFundingIndex(fundingBlock({ grants: [...kept, ...planted] }), RESOURCE);
    expect([...index.dropped].sort()).toEqual(planted.map((entry) => entry.key).sort());
    expect([...index.grants.keys()]).toEqual(kept.map((entry) => entry.key).sort());
    expect(index.funding.grants.map((entry) => entry.key)).toEqual([...index.grants.keys()]);
  });

  it('drops nothing for a resource with no identifier to guard', () => {
    const index = buildFundingIndex(fundingBlock(), { identifier: '' });
    expect(index.dropped).toEqual([]);
  });
});

describe('listingsOf', () => {
  const firstWork = (doc: ExportDocument) => {
    const [first] = doc.works;
    if (first === undefined) throw new Error('the sample has works');
    return first;
  };

  it('is empty without funding data, and for a 1.0 work with no grants', () => {
    const legacy = firstWork(legacyDocument());
    expect(listingsOf(legacy, null)).toEqual([]);
    expect(listingsOf(legacy, fundingOf(fundingDocument()))).toEqual([]);
  });

  it('is the work’s own listings when every grant is known', () => {
    const doc = fundingDocument();
    const listed = firstWork(doc);
    expect(listed.grants).toHaveLength(2);
    expect(listingsOf(listed, fundingOf(doc))).toEqual(listed.grants);
  });

  it('leaves out a listing whose grant the guard dropped', () => {
    const planted = unresolvedGrant({ key: 'MISC:UWPR95794', number: 'UWPR95794' });
    const doc = fundingDocument({ funding: fundingBlock({ grants: [grant(), planted] }) });
    const listed = { ...firstWork(doc), grants: [listing({ grant: planted.key }), listing()] };
    expect(listingsOf(listed, fundingOf(doc))).toEqual([listing()]);
  });
});
