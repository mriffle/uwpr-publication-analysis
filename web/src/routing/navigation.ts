/**
 * What each route is called, and how a reader gets back from it (docs/06 §3).
 *
 * **The way back belongs to the history entry, not to the app.** An in-app open pushes its entry
 * with `{ back: <the kind of route being left> }` in `history.state`; a page offers "Back to …"
 * — which pops that entry, so the reader returns to exactly the view they left, filter and all —
 * only when its own entry says where back is. Arriving any other way (a pasted link, a new tab,
 * a middle-click) there is nothing behind the page to return to, so it offers a link to its
 * parent instead.
 *
 * The browser keeps `history.state` with the entry, so this survives reload, back and forward,
 * which a flag in memory could not: it was lost on reload, and it could not tell a publication
 * opened from `/lookup` from one opened from the overview, so the first said "Back to the
 * publications" and went back to the lookup.
 *
 * Pure: `useLocation` owns the History API, and this module only reads and writes the value.
 */
import type { Route } from './route';

/** Every route a reader can be sent back to: all of them but the address that is no route. */
export type BackKind = Exclude<Route['kind'], 'unknown'>;

/** What the app stores in `history.state` with an entry it opened. */
export interface EntryState {
  back: BackKind;
}

/**
 * The back control's label, by the route it returns to. It names the page, not the direction,
 * so a reader deep in a chain knows which of several pages one press will reach.
 */
export const BACK_LABELS: Readonly<Record<BackKind, string>> = {
  overview: 'Back to the publications',
  funding: 'Back to funding impact',
  agency: 'Back to the agency',
  grant: 'Back to the grant',
  publication: 'Back to the publication',
  lookup: 'Back to the lookup',
  method: 'Back to how this was assembled',
};

const isBackKind = (value: unknown): value is BackKind =>
  typeof value === 'string' && Object.hasOwn(BACK_LABELS, value);

/**
 * The state to push when opening a page from `kind`, or null from a route that is none: the
 * designed "no page at this address" state has nothing to come back to.
 */
export const entryFrom = (kind: Route['kind']): EntryState | null =>
  kind === 'unknown' ? null : { back: kind };

/**
 * Where this entry goes back to, or null when it was not opened in the app.
 *
 * `history.state` is anything at all — null on an entry the browser made, and whatever an older
 * build or an extension left — so it is read defensively and anything unrecognised is "cold".
 */
export function readBack(state: unknown): BackKind | null {
  if (typeof state !== 'object' || state === null || !('back' in state)) return null;
  const { back } = state;
  return isBackKind(back) ? back : null;
}

export const backLabel = (kind: BackKind): string => BACK_LABELS[kind];

/**
 * The `h1` of the shell shown while the data loads or fails to (docs/06 §7), by route.
 *
 * The app parses the address before the data arrives, so a reader who followed a link to the
 * method page is not told they are on the publications page while it loads. The words are each
 * page's own name — the same the page's heading or back control uses — and not the full title,
 * which needs the resource's name from the data that has not arrived yet.
 */
export function shellTitle(route: Route): string {
  switch (route.kind) {
    case 'overview':
    case 'unknown':
      return 'Publications';
    case 'publication':
      return 'Publication';
    case 'method':
      return 'How this was assembled';
    case 'lookup':
      return 'Look up a publication';
    case 'funding':
      return 'Funding impact';
    case 'agency':
      return 'Funding agency';
    case 'grant':
      return 'Grant';
  }
}
