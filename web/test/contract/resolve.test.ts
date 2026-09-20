import { describe, expect, it } from 'vitest';
import { buildWorkIndex, isRetiredId, resolveWork } from '../../src/contract/resolve';
import { sampleExport } from '../support/fixture';
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
