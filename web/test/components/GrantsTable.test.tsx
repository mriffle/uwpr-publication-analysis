/**
 * The grants table (docs/09 §12.5 item 6): its sort, with unknown amounts last both ways; its
 * local search, which narrows the table and nothing else; its CSV, which must hold **exactly the
 * visible rows** — a test compares the two — and its states: normal, every amount unknown, empty
 * scope, no funding data, institution-wide excluded, and unmatched numbers present.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GrantsTable } from '../../src/components/GrantsTable';
import { UNFILTERED, fundingScope, type FundingScope } from '../../src/aggregate/funding';
import { CSV_LINE_END, CSV_MEDIA_TYPE } from '../../src/download/csv';
import { saveFile } from '../../src/download/saveFile';
import { expectNoAxeViolations } from '../support/axe';
import { WORLD, recordingLinks, worldIndex, worldScope } from '../support/fundingWorld';

vi.mock('../../src/download/saveFile', () => ({ saveFile: vi.fn() }));

const saved = vi.mocked(saveFile);

beforeEach(() => {
  saved.mockClear();
});

function show(scope: FundingScope = worldScope()) {
  const { links, opened } = recordingLinks();
  const view = render(<GrantsTable scope={scope} links={links} csvFilename="uwpr-grants.csv" />);
  return { ...view, opened };
}

const table = () => screen.getByRole('table');
/** The numbers in the rows' headers, top to bottom: what the reader sees, in order. */
const visibleNumbers = () =>
  within(table())
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);

/** The CSV the download button saved, as records of cells (the world has no comma in a cell). */
async function downloaded(): Promise<string[][]> {
  await userEvent.click(screen.getByRole('button', { name: /^Download / }));
  expect(saved).toHaveBeenCalledTimes(1);
  const [filename, content, type] = saved.mock.calls[0]!;
  expect(filename).toBe('uwpr-grants.csv');
  expect(type).toBe(CSV_MEDIA_TYPE);
  expect(typeof content).toBe('string');
  return (content as string)
    .replace('\ufeff', '')
    .split(CSV_LINE_END)
    .filter((line) => line !== '')
    .map((line) => line.split(','));
}

async function expectCsvMatchesTable(): Promise<void> {
  const [header = [], ...records] = await downloaded();
  const number = header.indexOf('Number');
  expect(records.map((record) => record[number])).toEqual(visibleNumbers());
}

describe('the normal state', () => {
  it('shows every grant once, sorted by total, largest first, unknown amounts last', () => {
    show();
    expect(visibleNumbers()).toEqual([
      WORLD.grfp.number,
      WORLD.p01.number,
      WORLD.r01.number,
      WORLD.foreign.number,
      WORLD.unmatched.number,
      WORLD.nsf.number,
    ]);
    expect(screen.getByRole('columnheader', { name: 'Total' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(
      screen.getByText('6 grants, each listed once however many publications list it.'),
    ).toBeInTheDocument();
  });

  it('has a caption saying unknown amounts are last, and a header cell for every column', () => {
    show();
    expect(table()).toHaveAccessibleName(
      /Every grant listed on the publications shown\. Grants with no known amount are listed last/,
    );
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent.replace(/[↑↓]/g, '').trim());
    expect(headers).toEqual([
      'Number',
      'Title',
      'Agency',
      'Principal investigators',
      'Institution',
      'Years',
      'Type',
      'Total',
      'First listed',
      'Publications',
    ]);
    for (const cell of within(table()).getAllByRole('columnheader')) {
      expect(cell).toHaveAttribute('scope', 'col');
    }
  });

  it('shows each row’s facts: links, tags, not known, the original of a converted amount', () => {
    show();
    const row = (number: string) =>
      within(table()).getByRole('rowheader', { name: number }).closest('tr') as HTMLElement;

    const r01 = row(WORLD.r01.number);
    expect(within(r01).getByRole('link', { name: 'NIGMS' })).toHaveAttribute(
      'href',
      '/funding/agency/NIGMS',
    );
    expect(r01).toHaveTextContent('Ada Investigator; Émile Coinvestigator');
    expect(r01).toHaveTextContent('active');
    expect(r01).toHaveTextContent('$1,000,000');

    const nsf = row(WORLD.nsf.number);
    expect(nsf).toHaveTextContent('not known');
    expect(nsf).toHaveTextContent('No title recorded');
    expect(nsf.textContent).not.toMatch(/\$0\b/);

    // `\s`: Intl puts a no-break space between the code and the amount.
    expect(row(WORLD.foreign.number)).toHaveTextContent(
      /\$750,000converted from SEK\s7,000,000 at the 2021 rate/,
    );
    expect(row(WORLD.grfp.number)).toHaveTextContent('institution-wide');
    expect(row(WORLD.p01.number)).toHaveTextContent('Centre or programme');
    expect(row(WORLD.p01.number)).toHaveTextContent('amounts from FY1985');
  });

  it('lists an unmatched number as its own row, tagged, with no amount', () => {
    show();
    const row = within(table())
      .getByRole('rowheader', { name: WORLD.unmatched.number })
      .closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('unmatched number');
    expect(within(row).getByRole('link', { name: 'Miscellaneous' })).toBeInTheDocument();
    expect(row).toHaveTextContent('not known');
  });

  it('opens a grant or an agency in place on a plain click, and leaves a modified click alone', async () => {
    const { opened } = show();
    await userEvent.click(within(table()).getByRole('link', { name: WORLD.p01.number }));
    await userEvent.click(within(table()).getAllByRole('link', { name: 'NSF' })[0]!);
    expect(opened).toEqual([`grant:${WORLD.p01.key}`, 'agency:NSF']);

    const link = within(table()).getByRole('link', { name: WORLD.r01.number });
    expect(link).toHaveAttribute('href', `/funding/grant/${encodeURIComponent(WORLD.r01.key)}`);
    // jsdom cannot open a new tab; stop it trying, after the app has declined the click.
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    fireEvent.click(link, { metaKey: true });
    expect(opened).toHaveLength(2);
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});

describe('sorting (docs/09 §12.5 item 6)', () => {
  it('keeps unknown amounts last when the total runs smallest first', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    expect(screen.getByRole('columnheader', { name: 'Total' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(visibleNumbers()).toEqual([
      WORLD.foreign.number,
      WORLD.r01.number,
      WORLD.p01.number,
      WORLD.grfp.number,
      WORLD.unmatched.number,
      WORLD.nsf.number,
    ]);
  });

  it('moves aria-sort to the column pressed, which starts in its natural direction', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'Total' })).not.toHaveAttribute('aria-sort');
    // The untitled grants last.
    expect(visibleNumbers().slice(-2).sort()).toEqual(
      [WORLD.nsf.number, WORLD.unmatched.number].sort(),
    );
  });

  it('writes the CSV in the order shown', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Publications' }));
    await expectCsvMatchesTable();
  });
});

describe('the local search', () => {
  it('narrows the table, says how many match, and the CSV holds exactly those rows', async () => {
    show();
    await userEvent.type(
      screen.getByRole('searchbox', {
        name: 'Search number, title, agency, investigator or institution',
      }),
      'NIH',
    );
    expect(visibleNumbers()).toEqual([WORLD.p01.number, WORLD.r01.number]);
    expect(screen.getByText('2 of 6 grants match the search.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download these 2 grants as CSV' }),
    ).toBeInTheDocument();
    await expectCsvMatchesTable();
  });

  it('says it narrows this table only, and is described so', () => {
    show();
    expect(screen.getByRole('searchbox')).toHaveAccessibleDescription(
      'The search narrows this table only, not the publications or the figures above.',
    );
  });

  it('names one grant in the singular', async () => {
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'karolinska');
    expect(screen.getByRole('button', { name: 'Download this grant as CSV' })).toBeEnabled();
  });

  it('says when nothing matches, and offers no empty download', async () => {
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'no such grant');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No grant here matches “no such grant”.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download these 0 grants as CSV' })).toBeDisabled();
  });

  it('passes axe while narrowed', async () => {
    const { container } = show();
    await userEvent.type(screen.getByRole('searchbox'), 'NSF');
    await expectNoAxeViolations(container);
  });
});

describe('the CSV of the whole table', () => {
  it('holds exactly the visible rows, with an empty cell — never 0 — for an unknown total', async () => {
    show();
    const [header = [], ...records] = await downloaded();
    expect(records.map((record) => record[header.indexOf('Number')])).toEqual(visibleNumbers());
    const totals = records.map((record) => record[header.indexOf('Total (USD)')]);
    expect(totals).toEqual(['4000000', '2500000', '1000000', '750000', '', '']);
  });
});

/*
 * R1b: the real export lists 755 grants, and drawing every one made `/funding` tens of thousands
 * of pixels long. The table draws the first `limit` in the order chosen, says so in its count and
 * its caption, and offers the rest; the CSV holds every row the search matches.
 */
describe('the first rows only, until the reader asks for all (R1b)', () => {
  function showFirst(limit = 3) {
    const { links } = recordingLinks();
    render(
      <GrantsTable
        scope={worldScope()}
        links={links}
        csvFilename="uwpr-grants.csv"
        limit={limit}
      />,
    );
  }

  it('draws the first rows in the order chosen, and says how many of how many', () => {
    showFirst();
    expect(visibleNumbers()).toEqual([WORLD.grfp.number, WORLD.p01.number, WORLD.r01.number]);
    expect(
      screen.getByText(
        '6 grants, each listed once however many publications list it. The first 3, in the order chosen, are shown; the download holds all 6.',
      ),
    ).toBeInTheDocument();
    expect(table()).toHaveAccessibleName(
      /^Every grant listed on the publications shown: the first 3 of 6, in the order chosen\. /,
    );
  });

  it('downloads every row, not only the rows drawn, and its button says so', async () => {
    showFirst();
    expect(screen.getByRole('button', { name: 'Download these 6 grants as CSV' })).toBeEnabled();
    const [header = [], ...records] = await downloaded();
    expect(records.map((record) => record[header.indexOf('Number')])).toEqual([
      WORLD.grfp.number,
      WORLD.p01.number,
      WORLD.r01.number,
      WORLD.foreign.number,
      WORLD.unmatched.number,
      WORLD.nsf.number,
    ]);
  });

  it('draws them all on request, and goes back to the first rows', async () => {
    showFirst();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 6 grants' }));
    expect(visibleNumbers()).toHaveLength(6);
    expect(table()).toHaveAccessibleName(/^Every grant listed on the publications shown\. /);
    expect(
      screen.getByText('6 grants, each listed once however many publications list it.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show only the first 3' }));
    expect(visibleNumbers()).toHaveLength(3);
  });

  it('takes the first rows of a new order, and of a search', async () => {
    showFirst();
    await userEvent.click(screen.getByRole('button', { name: 'Total' }));
    expect(visibleNumbers()).toEqual([WORLD.foreign.number, WORLD.r01.number, WORLD.p01.number]);
    await userEvent.type(screen.getByRole('searchbox'), 'NIH');
    // Two match, fewer than the limit: all are drawn, and nothing more is offered.
    expect(visibleNumbers()).toEqual([WORLD.r01.number, WORLD.p01.number]);
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
    expect(screen.getByText('2 of 6 grants match the search.')).toBeInTheDocument();
  });

  it('offers nothing more when every row fits', () => {
    show();
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull();
  });

  it('passes axe with the rest held back', async () => {
    const { links } = recordingLinks();
    const { container } = render(
      <GrantsTable scope={worldScope()} links={links} csvFilename="uwpr-grants.csv" limit={3} />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('unmatched numbers', () => {
  it('give an unmatched number no type: it is no kind of award (R1b)', async () => {
    show();
    const row = within(table())
      .getByRole('rowheader', { name: WORLD.unmatched.number })
      .closest('tr') as HTMLElement;
    const type = within(row).getAllByRole('cell')[5]!;
    expect(type).toHaveTextContent(/^not known unmatched number$/);
    const [header = [], ...records] = await downloaded();
    const unmatched = records.find(
      (record) => record[header.indexOf('Number')] === WORLD.unmatched.number,
    )!;
    expect(unmatched[header.indexOf('Type')]).toBe('');
  });

  it('are called numbers, not grants, on a table of them alone', () => {
    const { links } = recordingLinks();
    render(
      <GrantsTable
        scope={worldScope({ agencies: ['MISC'] })}
        links={links}
        csvFilename="misc.csv"
        noun={{ one: 'unmatched number', many: 'unmatched numbers' }}
      />,
    );
    expect(
      screen.getByText('1 unmatched number, each listed once however many publications list it.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download this unmatched number as CSV' }),
    ).toBeEnabled();
  });
});

describe('every amount unknown', () => {
  it('shows "not known" for each and never $0', () => {
    show(worldScope({ agencies: ['NSF'], institutionWide: 'exclude' }));
    expect(visibleNumbers()).toEqual([WORLD.nsf.number]);
    expect(table()).toHaveTextContent('not known');
    expect(table().textContent).not.toMatch(/\$0\b/);
  });
});

describe('institution-wide awards excluded', () => {
  it('leaves them out of the rows', () => {
    show(worldScope({ institutionWide: 'exclude' }));
    expect(visibleNumbers()).not.toContain(WORLD.grfp.number);
    expect(visibleNumbers()).toHaveLength(5);
  });
});

describe('an empty scope, and no funding data', () => {
  it('says no grant is listed, with no table and no download', () => {
    show(fundingScope([], worldIndex(), UNFILTERED));
    expect(screen.getByText('No grant is listed on the publications shown.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing with no funding data', () => {
    const { container } = show(fundingScope([], null, UNFILTERED));
    expect(container).toBeEmptyDOMElement();
  });

  it('passes axe when empty', async () => {
    const { container } = show(fundingScope([], worldIndex(), UNFILTERED));
    await expectNoAxeViolations(container);
  });
});

describe('reused on an agency page', () => {
  it('takes its own caption', () => {
    const { links } = recordingLinks();
    render(
      <GrantsTable
        scope={worldScope({ agencies: ['NSF'] })}
        links={links}
        csvFilename="nsf.csv"
        caption="The grants of NSF"
      />,
    );
    expect(table()).toHaveAccessibleName(/^The grants of NSF\. /);
  });
});
