/**
 * What each route is called, and what the way back from it says (docs/06 §3).
 *
 * Pure: the history entry's state in, a label or a title out.
 */
import { describe, expect, it } from 'vitest';
import {
  BACK_LABELS,
  backLabel,
  entryFrom,
  readBack,
  shellTitle,
  type BackKind,
} from '../../src/routing/navigation';
import type { Route } from '../../src/routing/route';

describe('the back labels', () => {
  it('name the page one press returns to', () => {
    expect(BACK_LABELS).toEqual({
      overview: 'Back to the publications',
      funding: 'Back to funding impact',
      agency: 'Back to the agency',
      grant: 'Back to the grant',
      publication: 'Back to the publication',
      lookup: 'Back to the lookup',
      method: 'Back to how this was assembled',
    });
    expect(backLabel('lookup')).toBe('Back to the lookup');
  });

  it('are all different, so no two pages claim the same way back', () => {
    const labels = Object.values(BACK_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the entry an open pushes', () => {
  it('records the kind of the route being left', () => {
    const kinds: BackKind[] = ['overview', 'funding', 'agency', 'grant', 'publication', 'lookup'];
    for (const kind of kinds) expect(entryFrom(kind)).toEqual({ back: kind });
  });

  it('records nothing from the address that is no route, which has nothing to come back to', () => {
    expect(entryFrom('unknown')).toBeNull();
  });
});

describe('reading an entry’s state', () => {
  it('reads what the app wrote', () => {
    expect(readBack({ back: 'lookup' })).toBe('lookup');
    expect(readBack(entryFrom('funding'))).toBe('funding');
  });

  it.each([
    ['null, as on an entry the browser made', null],
    ['undefined', undefined],
    ['a bare string', 'overview'],
    ['a number', 7],
    ['an object without a way back', { scroll: 120 }],
    ['a route kind that does not exist', { back: 'elsewhere' }],
    ['the address that is no route', { back: 'unknown' }],
    ['an inherited name rather than a kind', { back: 'toString' }],
    ['a non-string', { back: 1 }],
  ])('reads %s as cold', (_label, state) => {
    expect(readBack(state)).toBeNull();
  });
});

describe('the loading shell’s title', () => {
  it('is the name of the page the address asks for', () => {
    const cases: [Route, string][] = [
      [{ kind: 'overview' }, 'Publications'],
      [{ kind: 'publication', id: 'W-1' }, 'Publication'],
      [{ kind: 'method' }, 'How this was assembled'],
      [{ kind: 'lookup' }, 'Look up a publication'],
      [{ kind: 'funding' }, 'Funding impact'],
      [{ kind: 'agency', key: 'NIH' }, 'Funding agency'],
      [{ kind: 'grant', key: 'NIH:R01GM086688' }, 'Grant'],
      [{ kind: 'unknown', path: 'nowhere' }, 'Publications'],
    ];
    for (const [route, title] of cases) expect(shellTitle(route)).toBe(title);
  });
});
