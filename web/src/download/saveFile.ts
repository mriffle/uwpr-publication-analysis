/**
 * Hand the reader a file built in the page.
 *
 * Entirely local: a `Blob`, an object URL for it and a click on a temporary anchor with a
 * `download` attribute. Nothing is sent anywhere, so it is consistent with docs/06 B10, which
 * forbids third-party requests. No React here, so the view layer only decides *what* to save.
 *
 * The object URL is revoked after a delay rather than at once: a browser may still be reading
 * the blob when `click()` returns, and a revoked URL then yields an empty or failed download.
 */

/** Long enough for any browser to have started reading the blob; the memory is small. */
export const REVOKE_AFTER_MS = 10_000;

export function saveFile(filename: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_AFTER_MS);
  }
}
