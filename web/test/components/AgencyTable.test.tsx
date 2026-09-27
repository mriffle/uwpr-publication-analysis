/**
 * The agency table (docs/09 §12.5 item 4): each grant under its own agency with the parent
 * beside it, a known total that is never $0 for "not known", Miscellaneous as its own last row
 * outside the sort, and sortable headers with a caption — in every state a view can hand it.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgencyTable } from '../../src/components/AgencyTable';
import { UNFILTERED, fundingScope, type FundingScope } from '../../src/aggregate/funding';
import { expectNoAxeViolations } from '../support/axe';
import {
  WORLD,
  WORLD_GRANTS,
  recordingLinks,
  worldIndex,
  worldScope,
  worldWorks,
} from '../support/fundingWorld';

function show(scope: FundingScope = worldScope()) {
  const { links, opened } = recordingLinks();
  const view = render(<AgencyTable scope={scope} links={links} />);
  return { ...view, opened };
}

const table = () => screen.getByRole('table');
/** Each row's agency as it is labelled, less the full name beneath a short one. */
const agencies = () =>
  within(table())
    .getAllByRole('rowheader')
    .map((cell) =>
      cell.textContent.replace(cell.querySelector('.agency-name')?.textContent ?? '', '').trim(),
    );
const row = (name: string) =>
  within(table())
    .getAllByRole('rowheader')
    .find((cell) => cell.textContent.startsWith(name))
    ?.closest('tr') as HTMLElement;

describe('the normal state', () => {
  it('ranks each grant’s own agency by counted funding, Miscellaneous last and apart', () => {
    show();
    expect(agencies()).toEqual([
      'NSF',
      'NHLBI',
      'NIGMS',
      'SAMPLE Research Foundation',
      'Miscellaneous unmatched numbers',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Counted' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('shows the parent as a link, the country by name, and the counts', () => {
    show();
    const nigms = row('NIGMS');
    expect(within(nigms).getByRole('link', { name: 'NIH' })).toHaveAttribute(
      'href',
      '/funding/agency/NIH',
    );
    expect(nigms).toHaveTextContent('United States');
    const nsf = row('NSF');
    // GRFP and the NSF project: $4,000,000 counted, one without an amount, two publications.
    expect(
      within(nsf)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['—', 'United States', '2', '$4,000,000', '1', '2']);
    // What is counted, not the lifetime total: the foundation's $750,000 award counts $600,000.
    const foundation = row('SAMPLE Research Foundation');
    expect(foundation).toHaveTextContent('$600,000');
    expect(foundation).not.toHaveTextContent('$750,000');
  });

  it('gives an agency known by a short name its full name beneath it (R1b)', () => {
    show();
    const nigms = within(table()).getByRole('rowheader', {
      name: 'NIGMS National Institute of General Medical Sciences',
    });
    // The link still reads as the short name, which is what the chart and the filter call it.
    expect(within(nigms).getByRole('link')).toHaveAccessibleName('NIGMS');
    // An agency with no short name, and Miscellaneous, have nothing more to say.
    expect(row('SAMPLE Research Foundation').querySelector('.agency-name')).toBeNull();
    expect(row('Miscellaneous').querySelector('.agency-name')).toBeNull();
  });

  it('has a caption, and a sortable header for every column', () => {
    show();
    expect(table()).toHaveAccessibleName(
      /each grant under its own agency.*Counted is each agency’s grant funding counted for the publications shown; unknown totals are listed last.*unmatched numbers are kept apart in the last row/,
    );
    const headers = within(table()).getAllByRole('columnheader');
    expect(headers).toHaveLength(7);
    for (const header of headers) {
      expect(header).toHaveAttribute('scope', 'col');
      expect(within(header).getByRole('button')).toBeInTheDocument();
    }
  });

  it('opens an agency in place on a plain click', async () => {
    const { opened } = show();
    await userEvent.click(within(row('NHLBI')).getByRole('link', { name: 'NHLBI' }));
    expect(opened).toEqual(['agency:NHLBI']);
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});

describe('sorting', () => {
  it('re-sorts on any header, keeping Miscellaneous last', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Agency' }));
    expect(screen.getByRole('columnheader', { name: 'Agency' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(agencies()).toEqual([
      'NHLBI',
      'NIGMS',
      'NSF',
      'SAMPLE Research Foundation',
      'Miscellaneous unmatched numbers',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Agency' }));
    expect(agencies().at(-1)).toBe('Miscellaneous unmatched numbers');
  });

  it('keeps an agency with no known total last in both directions, and never shows $0', async () => {
    // Only the NSF project, whose amount is unknown, beside the other agencies' grants.
    const index = worldIndex(WORLD_GRANTS.filter((grant) => grant.key !== WORLD.grfp.key));
    show(fundingScope(worldWorks(index), index, UNFILTERED));
    expect(agencies()[3]).toBe('NSF');
    expect(row('NSF')).toHaveTextContent('not known');
    expect(row('NSF').textContent).not.toMatch(/\$0\b/);
    await userEvent.click(screen.getByRole('button', { name: 'Counted' }));
    expect(screen.getByRole('columnheader', { name: 'Counted' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(agencies()[3]).toBe('NSF');
  });
});

describe('every amount unknown', () => {
  const unknown = () => worldScope({ agencies: ['NSF'], institutionWide: 'exclude' });

  it('says "not known" for the total and counts the grant without an amount', () => {
    show(unknown());
    expect(agencies()).toEqual(['NSF']);
    expect(
      within(row('NSF'))
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['—', 'United States', '1', 'not known', '1', '1']);
  });

  it('passes axe', async () => {
    const { container } = show(unknown());
    await expectNoAxeViolations(container);
  });
});

describe('institution-wide awards excluded', () => {
  it('counts only the grants in scope', () => {
    show(worldScope({ institutionWide: 'exclude' }));
    expect(row('NSF')).toHaveTextContent('not known');
  });
});

describe('without Miscellaneous', () => {
  it('has no apart row, and its caption says nothing of one', () => {
    show(worldScope({ agencies: ['NIH'] }));
    expect(agencies()).toEqual(['NHLBI', 'NIGMS']);
    expect(table()).toHaveAccessibleName(/sorted\.$/);
  });
});

describe('an empty scope, and no funding data', () => {
  it('says no grant is listed', () => {
    show(fundingScope([], worldIndex(), UNFILTERED));
    expect(screen.getByText('No grant is listed on the publications shown.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
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
