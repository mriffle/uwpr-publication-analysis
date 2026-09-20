/**
 * Country codes as names.
 *
 * The contract carries ISO country codes (`"US"`, `"GB"`) and no names, because the store holds
 * what ROR publishes. `Intl.DisplayNames` is in the platform, so naming them costs no bundle and
 * no third-party request (docs/06 B10). The locale is fixed to English for the same reason the
 * number format is (docs/06 §8): a figure quoted from the page into a report should read the same
 * wherever it was copied from.
 */
const REGION: Intl.DisplayNames | null = (() => {
  try {
    // `fallback: 'code'` returns a well-formed but unassigned code unchanged rather than an
    // empty string, which is the honest answer for a code CLDR has no name for.
    return new Intl.DisplayNames(['en'], { type: 'region', fallback: 'code' });
  } catch {
    return null;
  }
})();

export function countryName(code: string): string {
  if (REGION === null) return code;
  try {
    return REGION.of(code) ?? code;
  } catch {
    // `of` throws on anything that is not a region subtag; the code itself is then the best name
    // available, and inventing one would be worse than showing what the data says.
    return code;
  }
}
