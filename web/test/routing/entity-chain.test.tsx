/**
 * The agency and grant pages through the whole Router (docs/09 §12.3, §12.6–12.8): the chain
 * funding → agency → grant → publication, and back three times, each step labelled with the page
 * it returns to; a cold arrival on each; the agency page's two ways into a view; and the
 * publication's Funding section opening a grant that goes back to the publication.
 *
 * One flag could not unwind this chain, which is why the way back moved into `history.state`
 * (docs/06 §3); these hold the Router to it with the real pages in place of W1's placeholders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { fundingOf } from '../../src/contract/funding';
import { isSampleExport, sampleExport } from '../support/fixture';

const doc = sampleExport();
const index = fundingOf(doc);

const at = (path: string, state: unknown = null) => {
  window.history.replaceState(state, '', path);
  return render(
    <Router
      doc={doc}
      fetcher={() => Promise.reject(new Error('the funding routes need no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const h1 = () => screen.getByRole('heading', { level: 1 });
const where = () => `${window.location.pathname}${window.location.search}`;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe.runIf(isSampleExport && index !== null)('the chain, and back three times', () => {
  // NIH's P30DK017047 on W-000007: an agency with a page, a grant on it, a publication listing it.
  const grant = index!.grants.get('NIH:P30DK017047')!;
  const agency = index!.agencies.get(grant.agency)!;
  const work = doc.works.find((entry) => entry.id === 'W-000007')!;

  it('opens each page in place and returns to each, filter and all', async () => {
    at(`/funding?year=${String(work.year)}`);
    const agencies = screen.getByRole('table', { name: /The agencies of the grants listed/ });
    await userEvent.click(within(agencies).getByRole('link', { name: agency.short_name! }));
    expect(where()).toBe(`/funding/agency/${agency.code}?year=${String(work.year)}`);
    expect(h1()).toHaveTextContent(agency.name);
    expect(h1()).toHaveFocus();

    const grants = screen.getByRole('table', { name: /Every grant of/ });
    await userEvent.click(within(grants).getByRole('link', { name: grant.number }));
    expect(where()).toBe(
      `/funding/grant/${encodeURIComponent(grant.key)}?year=${String(work.year)}`,
    );
    expect(h1()).toHaveTextContent(grant.title!);
    expect(screen.getByRole('button', { name: 'Back to the agency' })).toBeInTheDocument();

    const listing = screen.getByRole('list', { name: 'Publications listing this grant' });
    await userEvent.click(within(listing).getByRole('link', { name: work.title }));
    expect(where()).toBe(`/publication/${work.id}?year=${String(work.year)}`);
    expect(h1()).toHaveTextContent(work.title);

    await userEvent.click(screen.getByRole('button', { name: 'Back to the grant' }));
    await waitFor(() => {
      expect(h1()).toHaveTextContent(grant.title!);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Back to the agency' }));
    await waitFor(() => {
      expect(h1()).toHaveTextContent(agency.name);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Back to funding impact' }));
    await waitFor(() => {
      expect(where()).toBe(`/funding?year=${String(work.year)}`);
    });
    expect(h1()).toHaveTextContent('funding impact');
  });

  it('opens a grant from the publication’s Funding section, which goes back to it', async () => {
    at(`/publication/${work.id}`);
    const section = screen.getByRole('region', { name: 'Funding listed in this publication' });
    await userEvent.click(within(section).getByRole('link', { name: grant.number }));
    expect(where()).toBe(`/funding/grant/${encodeURIComponent(grant.key)}`);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the publication' }));
    await waitFor(() => {
      expect(where()).toBe(`/publication/${work.id}`);
    });
  });

  it('arrives cold on an agency and on a grant, each linking to the funding view', () => {
    const cold = at(`/funding/agency/${agency.code}?year=2020`);
    expect(h1()).toHaveTextContent(agency.name);
    expect(screen.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
      'href',
      '/funding?year=2020',
    );
    cold.unmount();
    at(`/funding/grant/${encodeURIComponent(grant.key)}`);
    expect(h1()).toHaveTextContent(grant.title!);
    expect(screen.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
      'href',
      '/funding',
    );
  });

  it('adds the agency to the reader’s filter, and the publications view takes focus', async () => {
    at(`/funding/agency/${agency.code}?year=${String(work.year)}&sort=citations`);
    const link = screen.getByRole('link', { name: 'Filter the publications by this agency' });
    expect(link).toHaveAttribute(
      'href',
      `/?year=${String(work.year)}&agency=${agency.code}&sort=citations`,
    );
    await userEvent.click(link);
    expect(where()).toBe(`/?year=${String(work.year)}&agency=${agency.code}&sort=citations`);
    expect(screen.getByRole('status')).toHaveTextContent(`Funding agency: ${agency.name}`);
    expect(h1()).toHaveFocus();
  });

  it('keeps an agency already in the filter once, and opens funding impact for it', async () => {
    at(`/funding/agency/${agency.code}?agency=${agency.code}`);
    await userEvent.click(screen.getByRole('link', { name: 'See funding impact for this agency' }));
    expect(where()).toBe(`/funding?agency=${agency.code}`);
    expect(h1()).toHaveTextContent('funding impact');
  });

  it('moving from one agency to another starts the page afresh', async () => {
    at(`/funding/agency/${agency.code}`);
    const search = screen.getByRole('searchbox');
    await userEvent.type(search, 'P30');
    const parent = screen.getByText('Part of', { selector: 'dt' }).nextElementSibling!;
    await userEvent.click(within(parent as HTMLElement).getByRole('link'));
    expect(window.location.pathname).toBe(`/funding/agency/${agency.parent!}`);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(h1()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Back to the agency' })).toBeInTheDocument();
  });
});
