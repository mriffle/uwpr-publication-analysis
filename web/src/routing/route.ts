/**
 * Routes, as pure functions over a pathname (docs/06 §3).
 *
 * | `/` | Overview |
 * | `/publication/<work id>` | Publication detail |
 * | `/method` | "How this was assembled" |
 * | `/lookup` | "Why is a paper not here?" |
 * | `/funding` | Funding impact (docs/09) |
 * | `/funding/agency/<key>` | One funding agency |
 * | `/funding/grant/<key>` | One grant |
 *
 * "Routing uses the History API with a build-time base path, and ships a `404.html` copy of
 * `index.html` so a deep link resolves on static hosts that have no rewrite rules." The base
 * path is therefore a parameter of every function here rather than a constant, so the same
 * source serves a root deployment, a sub-path or a different host (docs/06 §13).
 *
 * The publication segment is everything after `publication/`, **including any slashes**, because
 * a permalink may carry a DOI (`/publication/10.1021/acs.jproteome.5c00706`) as well as a work
 * ID. docs/06 §7 requires such a link to resolve, and a DOI's slash is not a path separator.
 *
 * The agency and grant segments follow the same rule, for the same reason: a key is the
 * pipeline's own grammar (`NIH:R01GM086688`, `NIH-contract:HHSN272201700036I:75N93020F00001`,
 * `MISC:<as written>`), and a key written as a paper printed it can carry a slash or a space.
 */

export type Route =
  | { kind: 'overview' }
  | { kind: 'publication'; id: string }
  | { kind: 'method' }
  | { kind: 'lookup' }
  | { kind: 'funding' }
  | { kind: 'agency'; key: string }
  | { kind: 'grant'; key: string }
  | { kind: 'unknown'; path: string };

const PUBLICATION = 'publication/';
const METHOD = 'method';
const LOOKUP = 'lookup';
const FUNDING = 'funding';
const AGENCY = 'funding/agency/';
const GRANT = 'funding/grant/';

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
  // The two prefixes before the exact match, and each before anything shorter: `funding` alone
  // is the view, and `funding/agency` with no key is no route rather than an empty agency.
  for (const [prefix, kind] of [
    [AGENCY, 'agency'],
    [GRANT, 'grant'],
  ] as const) {
    if (rest.startsWith(prefix)) {
      const key = safeDecode(rest.slice(prefix.length));
      return key === '' ? { kind: 'unknown', path: rest } : { kind, key };
    }
  }
  if (rest === FUNDING) return { kind: 'funding' };
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

/** `/funding` — the Funding impact view (docs/09). */
export const fundingPath = (base = '/'): string => withBase(base, FUNDING);

/** One agency. Its key's colons and anything else outside a path segment's safe set are escaped. */
export const agencyPath = (key: string, base = '/'): string =>
  withBase(base, `${AGENCY}${encodeURIComponent(key)}`);

/** One grant, by its key (`NIH:R01GM086688`), escaped the same way. */
export const grantPath = (key: string, base = '/'): string =>
  withBase(base, `${GRANT}${encodeURIComponent(key)}`);

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
    case 'funding':
      return fundingPath(base);
    case 'agency':
      return agencyPath(route.key, base);
    case 'grant':
      return grantPath(route.key, base);
    case 'unknown':
      return withBase(base, route.path);
  }
}
