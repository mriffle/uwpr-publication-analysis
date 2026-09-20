/**
 * Staff identifiers as names.
 *
 * `authors[].staff` and `staff_authors` carry an identifier — `"riffle"`, `"eng"` — and nothing
 * else in a work names the person behind it. `resource.staff` is the join: each entry carries
 * the same `id` alongside the name (docs/05 §4.2), so the app can say who without holding a
 * list of the facility's people, which docs/05 §1.1 principle 5 forbids.
 *
 * An identifier the resource block cannot name is shown as it is stored rather than dropped or
 * guessed at: it means the two halves of the file disagree, and hiding that would hide a
 * pipeline bug.
 *
 * `Intl.ListFormat` is in the platform, so joining the names costs no bundle and no third-party
 * request (docs/06 B10); the locale is fixed to English for the same reason the number and
 * country formats are (docs/06 §8).
 */
import type { Person } from '../contract/types';

const LIST: Intl.ListFormat | null = (() => {
  try {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
  } catch {
    return null;
  }
})();

export type StaffIndex = ReadonlyMap<string, string>;

/** `resource.staff` as a lookup from staff identifier to name. */
export const staffIndex = (staff: readonly Person[]): StaffIndex =>
  new Map(staff.map((person) => [person.id, person.name]));

/** The names behind `ids`, in the order given. */
export const staffNames = (index: StaffIndex, ids: readonly string[]): string[] =>
  ids.map((id) => index.get(id) ?? id);

/** "Jimmy K. Eng and Michael Riffle" — the names in one phrase, or `null` for none. */
export function staffPhrase(index: StaffIndex, ids: readonly string[]): string | null {
  const names = staffNames(index, ids);
  if (names.length === 0) return null;
  return LIST === null ? names.join(', ') : LIST.format(names);
}
