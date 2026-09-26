/**
 * A button that saves a file built from what the page is showing (docs/06 §7, "Downloads").
 *
 * The label is the button's text and so its accessible name, and it should say exactly what the
 * file holds — "Download these 41 grants as CSV" — because a reader deciding whether to press it
 * wants the count and the format before, not after. Its content is built on click, not on
 * render, so a large table costs nothing until someone asks for it.
 */
import { saveFile } from '../download/saveFile';

export interface DownloadButtonProps {
  /** The button's text and accessible name: "Download these 41 grants as CSV". */
  label: string;
  /** The saved file's name: "uwpr-grants-2026-09-26.csv". */
  filename: string;
  /** The file's contents, built when the button is pressed. */
  content: () => string;
  /** The media type; `CSV_MEDIA_TYPE` for a CSV. */
  type: string;
  disabled?: boolean;
}

export function DownloadButton({
  label,
  filename,
  content,
  type,
  disabled = false,
}: DownloadButtonProps) {
  return (
    <button
      type="button"
      className="download-button"
      disabled={disabled}
      onClick={() => {
        saveFile(filename, content(), type);
      }}
    >
      {label}
    </button>
  );
}
