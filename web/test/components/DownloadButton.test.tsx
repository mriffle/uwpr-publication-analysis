/**
 * The download button and the local save it performs (docs/06 §7 "Downloads", B10: no
 * third-party requests — the file is built and handed over in the page).
 *
 * jsdom has no `URL.createObjectURL` and does not download, so both are stubbed: the tests
 * assert what was put in the Blob, the file name on the anchor, and that the URL is revoked.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DownloadButton } from '../../src/components/DownloadButton';
import { CSV_MEDIA_TYPE, toCsv } from '../../src/download/csv';
import { REVOKE_AFTER_MS, saveFile } from '../../src/download/saveFile';
import { expectNoAxeViolations } from '../support/axe';

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test/1');
const revokeObjectURL = vi.fn<(url: string) => void>();
let clicked: { href: string; download: string; attached: boolean }[] = [];
let click: MockInstance<(this: HTMLAnchorElement) => void>;

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  clicked = [];
  // A URL with the two static methods jsdom lacks, restored by unstubAllGlobals.
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const blobText = async (): Promise<string> => {
  const blob = createObjectURL.mock.calls[0]?.[0];
  expect(blob).toBeInstanceOf(Blob);
  return blob!.text();
};

describe('saveFile', () => {
  it('clicks an attached anchor carrying the object URL and the file name, then removes it', () => {
    saveFile('grants.csv', 'a,b\r\n', CSV_MEDIA_TYPE);
    expect(clicked).toEqual([{ href: 'blob:test/1', download: 'grants.csv', attached: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('puts the content in a Blob of the given type', async () => {
    saveFile('grants.csv', 'a,b\r\n', CSV_MEDIA_TYPE);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe(CSV_MEDIA_TYPE);
    expect(await blobText()).toBe('a,b\r\n');
  });

  it('revokes the object URL once the browser has had time to read it', () => {
    vi.useFakeTimers();
    saveFile('grants.csv', 'x', 'text/plain');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });

  it('removes the anchor and still revokes the URL when the click throws', () => {
    vi.useFakeTimers();
    click.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => {
      saveFile('grants.csv', 'x', 'text/plain');
    }).toThrow('blocked');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});

describe('DownloadButton', () => {
  const rows = [
    { number: 'R01 GM1', amount: 100 },
    { number: '=cmd', amount: null },
  ];
  const content = vi.fn(() =>
    toCsv(
      [
        { header: 'Number', value: (row: (typeof rows)[number]) => row.number },
        { header: 'Total (USD)', value: (row: (typeof rows)[number]) => row.amount },
      ],
      rows,
    ),
  );

  const draw = (disabled = false) =>
    render(
      <DownloadButton
        label="Download these 2 grants as CSV"
        filename="uwpr-grants-2026-09-26.csv"
        content={content}
        type={CSV_MEDIA_TYPE}
        disabled={disabled}
      />,
    );

  beforeEach(() => {
    content.mockClear();
  });

  it('says what the file holds in its accessible name', () => {
    draw();
    expect(
      screen.getByRole('button', { name: 'Download these 2 grants as CSV' }),
    ).toBeInTheDocument();
  });

  it('builds the content only when pressed, not on render', () => {
    draw();
    expect(content).not.toHaveBeenCalled();
  });

  it('saves the CSV under the given file name when pressed', async () => {
    draw();
    await userEvent.click(screen.getByRole('button', { name: /Download these 2 grants/ }));
    expect(content).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([
      { href: 'blob:test/1', download: 'uwpr-grants-2026-09-26.csv', attached: true },
    ]);
    expect(await blobText()).toBe("Number,Total (USD)\r\nR01 GM1,100\r\n'=cmd,\r\n");
  });

  it('does nothing while disabled', async () => {
    draw(true);
    const button = screen.getByRole('button', { name: /Download/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(content).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});
