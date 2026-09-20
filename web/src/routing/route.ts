/**
 * Routes, as pure functions over a pathname (docs/06 §3).
 *
 * | `/` | Overview |
 * | `/publication/<work id>` | Publication detail |
 * | `/lookup` | "Why is a paper not here?" |
 *
 * "Routing uses the History API with a build-time base path, and ships a `404.html` copy of
 * `index.html` so a deep link resolves on static hosts that have no rewrite rules." The base
 * path is therefore a parameter of every function here rather than a constant, so the same
 * source serves a root deployment, a sub-path or a different host (docs/06 §13).
 *
 * The publication segment is everything after `publication/`, **including any slashes**, because
 * a permalink may carry a DOI (`/publication/10.1021/acs.jproteome.5c00706`) as well as a work
 * ID. docs/06 §7 requires such a link to resolve, and a DOI's slash is not a path separator.
 */

export type Route =
  | { kind: 'overview' }
  | { kind: 'publication'; id: string }
  | { kind: 'method' }
  | { kind: 'lookup' }
  | { kind: 'unknown'; path: string };

const PUBLICATION = 'publication/';
const METHOD = 'method';
const LOOKUP = 'lookup';

/** A hand-edited or double-encoded URL is a normal thing to receive; it is never an exception. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The pathname with the build-time base path removed, and no leading or trailing slash. */
export function stripBase(pathname: string, base: string): string {
  const normalizedBase = `/${base.replace(/^\/+|\/+$/g, '')}`;
  let rest = pathname;
  if (
    normalizedBase !== '/' &&
    (rest === normalizedBase || rest.startsWith(`${normalizedBase}/`))
  ) {
    rest = rest.slice(normalizedBase.length);
  }
  return rest.replace(/^\/+|\/+$/g, '');
}

export function parseRoute(pathname: string, base = '/'): Route {
  const rest = stripBase(pathname, base);
  if (rest === '') return { kind: 'overview' };
  if (rest === METHOD) return { kind: 'method' };
  if (rest === LOOKUP) return { kind: 'lookup' };
  if (rest.startsWith(PUBLICATION)) {
    const id = safeDecode(rest.slice(PUBLICATION.length));
    return id === '' ? { kind: 'unknown', path: rest } : { kind: 'publication', id };
  }
  return { kind: 'unknown', path: rest };
}

function withBase(base: string, rest: string): string {
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');
  return `${prefix}/${rest}`;
}

export const overviewPath = (base = '/'): string => withBase(base, '');

/**
 * The permalink for a work. Work IDs need no escaping, so this reads as `/publication/W-000457`;
 * the encoding is here for the identifiers that do.
 */
export const publicationPath = (id: string, base = '/'): string =>
  withBase(base, `${PUBLICATION}${encodeURIComponent(id)}`);

/** `/method` — "How this was assembled" (docs/06 §3, §10). */
export const methodPath = (base = '/'): string => withBase(base, METHOD);

/** `/lookup` — "Why is a paper not here?" (docs/06 §3; docs/05 §8). */
export const lookupPath = (base = '/'): string => withBase(base, LOOKUP);

export function routePath(route: Route, base = '/'): string {
  switch (route.kind) {
    case 'overview':
      return overviewPath(base);
    case 'publication':
      return publicationPath(route.id, base);
    case 'method':
      return methodPath(base);
    case 'lookup':
      return lookupPath(base);
    case 'unknown':
      return withBase(base, route.path);
  }
}
