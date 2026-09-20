/**
 * Loading the export, and the `schema_version` check (docs/06 §7, docs/05 §12).
 *
 * Nothing here throws. Every outcome the spec names — loaded, unreachable, unparseable, or a
 * major schema version the app does not know — is a value the caller renders as a designed
 * state, because "a wrong render is worse than none".
 */
import type { ExportDocument, LookupIndexDocument } from './types';

/**
 * The major version of the contract this build understands.
 *
 * docs/05 §12: "Additive changes bump the minor version; renames and removals bump the major
 * version." A newer minor is therefore additive and safe; a different major is not, and the app
 * refuses to render rather than guessing at renamed fields.
 */
export const SUPPORTED_SCHEMA_MAJOR = 1;

export type LoadFailure =
  | { kind: 'unreachable'; file: string; detail: string }
  | { kind: 'unparseable'; file: string; detail: string }
  | { kind: 'schema-version'; file: string; found: string; expected: string };

export type LoadResult<T> = { ok: true; data: T } | { ok: false; failure: LoadFailure };

export type Fetcher = (input: string) => Promise<Response>;

function majorOf(version: string): number | null {
  const match = /^(\d+)\.\d+$/.exec(version);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** A human-readable sentence for a failure, naming the file (docs/06 §7). */
export function describeFailure(failure: LoadFailure): string {
  switch (failure.kind) {
    case 'unreachable':
      return `The data file ${failure.file} could not be loaded. ${failure.detail}`;
    case 'unparseable':
      return `The data file ${failure.file} was reached but could not be read as JSON. ${failure.detail}`;
    case 'schema-version':
      return (
        `The data file ${failure.file} is version ${failure.found}. ` +
        `This page understands version ${failure.expected}. Nothing is shown rather than ` +
        `showing figures that may be wrong.`
      );
  }
}

async function fetchJson(url: string, fetcher: Fetcher): Promise<LoadResult<unknown>> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch (error) {
    return {
      ok: false,
      failure: { kind: 'unreachable', file: url, detail: String(error) },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        kind: 'unreachable',
        file: url,
        detail: `The server answered ${String(response.status)}.`,
      },
    };
  }
  try {
    return { ok: true, data: (await response.json()) as unknown };
  } catch (error) {
    return { ok: false, failure: { kind: 'unparseable', file: url, detail: String(error) } };
  }
}

function checkVersion<T>(url: string, data: unknown): LoadResult<T> {
  const version = (data as { schema_version?: unknown }).schema_version;
  const found = typeof version === 'string' ? version : String(version);
  const major = typeof version === 'string' ? majorOf(version) : null;
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    return {
      ok: false,
      failure: {
        kind: 'schema-version',
        file: url,
        found,
        expected: `${String(SUPPORTED_SCHEMA_MAJOR)}.x`,
      },
    };
  }
  return { ok: true, data: data as T };
}

export async function loadExport(
  url: string,
  fetcher: Fetcher,
): Promise<LoadResult<ExportDocument>> {
  const result = await fetchJson(url, fetcher);
  return result.ok ? checkVersion<ExportDocument>(url, result.data) : result;
}

export async function loadLookupIndex(
  url: string,
  fetcher: Fetcher,
): Promise<LoadResult<LookupIndexDocument>> {
  const result = await fetchJson(url, fetcher);
  return result.ok ? checkVersion<LookupIndexDocument>(url, result.data) : result;
}
