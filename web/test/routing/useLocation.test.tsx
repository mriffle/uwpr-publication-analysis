/**
 * The location hook's handling of `history.state` (docs/06 §3, §6).
 *
 * The way back lives in the entry's state, so the hook has to write it on a push, keep it on a
 * replace that does not say otherwise, and read it back on `popstate` — the three ways an entry
 * comes to be on screen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocation } from '../../src/routing/useLocation';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('navigate', () => {
  it('pushes the state it is given, and exposes it', () => {
    const { result } = renderHook(() => useLocation());
    const before = window.history.length;
    act(() => {
      result.current.navigate({ pathname: '/method', search: '' }, { state: { back: 'overview' } });
    });
    expect(window.history.length).toBe(before + 1);
    expect(window.history.state).toEqual({ back: 'overview' });
    expect(result.current.state).toEqual({ back: 'overview' });
    expect(result.current.pathname).toBe('/method');
  });

  it('pushes null when it is given no state, so a peer step offers no way back', () => {
    window.history.replaceState({ back: 'overview' }, '', '/method');
    const { result } = renderHook(() => useLocation());
    act(() => {
      result.current.navigate({ search: '?year=2020' });
    });
    expect(window.history.state).toBeNull();
    expect(result.current.state).toBeNull();
    // The half of the location it was not given is kept.
    expect(`${result.current.pathname}${result.current.search}`).toBe('/method?year=2020');
  });

  it('keeps the entry’s own state on a replace that does not say otherwise', () => {
    window.history.replaceState({ back: 'lookup' }, '', '/publication/W-1');
    const { result } = renderHook(() => useLocation());
    const before = window.history.length;
    act(() => {
      result.current.navigate({ search: '?year=2020' }, { replace: true });
    });
    expect(window.history.length).toBe(before);
    expect(window.history.state).toEqual({ back: 'lookup' });
    expect(result.current.state).toEqual({ back: 'lookup' });
  });

  it('replaces the state on a replace that does', () => {
    window.history.replaceState({ back: 'lookup' }, '', '/publication/W-1');
    const { result } = renderHook(() => useLocation());
    act(() => {
      result.current.navigate({}, { replace: true, state: null });
    });
    expect(window.history.state).toBeNull();
    expect(result.current.state).toBeNull();
  });

  it('keeps a fragment, which is the browser’s and not the route’s', () => {
    window.history.replaceState(null, '', '/method#research-groups');
    const { result } = renderHook(() => useLocation());
    act(() => {
      result.current.navigate({ search: '?x=1' });
    });
    expect(window.location.hash).toBe('#research-groups');
  });
});

describe('popstate', () => {
  it('reads the state of the entry the browser moved to', () => {
    const { result } = renderHook(() => useLocation());
    act(() => {
      window.history.pushState({ back: 'funding' }, '', '/funding/grant/NIH%3AR01');
      window.dispatchEvent(new PopStateEvent('popstate', { state: { back: 'funding' } }));
    });
    expect(result.current.pathname).toBe('/funding/grant/NIH%3AR01');
    expect(result.current.state).toEqual({ back: 'funding' });
  });

  it('starts from the entry on screen, so a reload keeps its way back', () => {
    window.history.replaceState({ back: 'overview' }, '', '/publication/W-1?year=2020');
    const { result } = renderHook(() => useLocation());
    expect(result.current.state).toEqual({ back: 'overview' });
    expect(result.current.search).toBe('?year=2020');
  });
});
