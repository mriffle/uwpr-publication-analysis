import { describe, expect, it } from 'vitest';
import {
  aliasKey,
  buildWorkIndex,
  isRetiredId,
  resolveFromExport,
  resolveFromLookup,
  resolveWork,
} from '../../src/contract/resolve';
import { sampleExport, sampleLookup } from '../support/fixture';
import { work } from '../support/works';

describe('resolving a work by identifier (docs/06 §7)', () => {
  it('finds a work by its own ID', () => {
    const doc = sampleExport();
    const index = buildWorkIndex(doc);
    const first = doc.works[0];
    expect(first).toBeDefined();
    expect(resolveWork(index, first?.id ?? '')?.id).toBe(first?.id);
    expect(isRetiredId(index, first?.id ?? '')).toBe(false);
  });

  it('opens a retired identifier on the work it merged into — docs/05 §13 requires one in the sample', () => {
    const doc = sampleExport();
    const withAlias = doc.works.find((candidate) => candidate.aliases.length > 0);
    expect(withAlias, 'the sample export must carry a retired work ID').toBeDefined();
    const alias = withAlias?.aliases[0] ?? '';
    const index = buildWorkIndex(doc);
    expect(resolveWork(index, alias)?.id).toBe(withAlias?.id);
    expect(isRetiredId(index, alias)).toBe(true);
  });

  it('returns null for an identifier nothing knows, so the app can show not-found', () => {
    const index = buildWorkIndex(sampleExport());
    expect(resolveWork(index, 'W-999999')).toBeNull();
    expect(isRetiredId(index, 'W-999999')).toBe(false);
  });

  it('lets a live ID win over the same string used as an alias elsewhere', () => {
    const live = work({ id: 'W-000100', aliases: [] });
    const other = work({ id: 'W-000200', aliases: ['W-000100'] });
    const index = buildWorkIndex({ works: [other, live] });
    expect(resolveWork(index, 'W-000100')?.id).toBe('W-000100');
  });
});

describe('normalising an identifier to the lookup index’s key (docs/05 §8)', () => {
  it('recognises the five type prefixes the file is keyed by', () => {
    expect(aliasKey('doi:10.1021/X')).toBe('doi:10.1021/x');
    expect(aliasKey('pmid:12345')).toBe('pmid:12345');
    expect(aliasKey('pmcid:PMC1')).toBe('pmcid:PMC1');
    expect(aliasKey('openalex:W1')).toBe('openalex:W1');
    expect(aliasKey('work:W-000735')).toBe('work:W-000735');
  });

  it('recognises a bare identifier in whatever form a reader pastes it', () => {
    expect(aliasKey('10.1021/acs.jproteome.5c00706')).toBe('doi:10.1021/acs.jproteome.5c00706');
    expect(aliasKey('https://doi.org/10.1021/ABC')).toBe('doi:10.1021/abc');
    expect(aliasKey('http://dx.doi.org/10.1021/abc')).toBe('doi:10.1021/abc');
    expect(aliasKey('W-000735')).toBe('work:W-000735');
    expect(aliasKey('PMC13505420')).toBe('pmcid:PMC13505420');
    expect(aliasKey('W2755950973')).toBe('openalex:W2755950973');
    expect(aliasKey('https://openalex.org/W2755950973')).toBe('openalex:W2755950973');
    expect(aliasKey('https://api.openalex.org/works/W2755950973')).toBe('openalex:W2755950973');
    expect(aliasKey('12345678')).toBe('pmid:12345678');
  });

  it('lower-cases a DOI, because DOIs are case-insensitive and the file is lower-cased', () => {
    expect(aliasKey('10.1021/ACS.JPROTEOME')).toBe('doi:10.1021/acs.jproteome');
  });

  it('returns null for something that is no identifier at all', () => {
    expect(aliasKey('')).toBeNull();
    expect(aliasKey('   ')).toBeNull();
    expect(aliasKey('not an identifier')).toBeNull();
  });
});

describe('the two maps, in the order docs/06 §7 requires', () => {
  const doc = sampleExport();
  const lookup = sampleLookup();
  const index = buildWorkIndex(doc);

  it('answers from the export alone where it can, so no fetch is needed', () => {
    const first = doc.works[0];
    expect(resolveFromExport(index, first?.id ?? '')).toEqual({
      status: 'found',
      work: first,
      retiredId: null,
    });
  });

  it('answers a retired work ID from the export alone, and says which ID was followed', () => {
    const withAlias = doc.works.find((candidate) => candidate.aliases.length > 0);
    const alias = withAlias?.aliases[0] ?? '';
    expect(resolveFromExport(index, alias)).toEqual({
      status: 'found',
      work: withAlias,
      retiredId: alias,
    });
  });

  it('says "ask the lookup index" rather than "unknown" for anything else', () => {
    // Returning null is what stops a caller skipping the fetch the spec requires before a
    // not-found state.
    expect(resolveFromExport(index, '10.1021/whatever')).toBeNull();
  });

  it('resolves a DOI through the lookup index — the permalink that must work from cold', () => {
    const target = doc.works.find((candidate) => candidate.ids.doi !== null);
    const doi = target?.ids.doi ?? '';
    expect(lookup.aliases[`doi:${doi.toLowerCase()}`]).toBe(target?.id);
    expect(resolveFromLookup(index, lookup, doi)).toEqual({
      status: 'found',
      work: target,
      retiredId: doi,
    });
  });

  it('resolves a PMID and an OpenAlex ID the same way', () => {
    const target = doc.works.find((candidate) => candidate.ids.pmid !== null);
    if (target) {
      expect(resolveFromLookup(index, lookup, target.ids.pmid ?? '')).toMatchObject({
        status: 'found',
        work: target,
      });
    }
    const byOpenAlex = doc.works.find((candidate) => candidate.ids.openalex !== null);
    if (byOpenAlex) {
      expect(resolveFromLookup(index, lookup, byOpenAlex.ids.openalex ?? '')).toMatchObject({
        status: 'found',
        work: byOpenAlex,
      });
    }
  });

  it('reports a paper that was considered and not included, with its reason', () => {
    const rejected = lookup.not_included[0];
    expect(rejected).toBeDefined();
    const resolution = resolveFromLookup(index, lookup, rejected?.id ?? '');
    expect(resolution.status).toBe('not-included');
    if (resolution.status === 'not-included') {
      expect(resolution.row.reason_label).not.toBe('');
    }
  });

  it('reports "not found at all" last, which says nothing about the paper', () => {
    expect(resolveFromLookup(index, lookup, '10.9999/nothing-here')).toEqual({ status: 'unknown' });
    expect(resolveFromLookup(index, lookup, 'not an identifier')).toEqual({ status: 'unknown' });
  });
});
