/**
 * The Funding impact routes as they stand before any funding data exists (docs/09): the view,
 * with the switch between it and the publications, and the agency and grant pages.
 *
 * Every export is one with no funding data until the pipeline writes it, and the app will meet
 * such an export again after any rollback of the data (docs/07 O2), so the no-data state is a
 * designed state and is tested as one. Rendered through `Router`, because the switch and the
 * way back cross the URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from '../../src/App';
import { fundingOf } from '../../src/contract/funding';
import type { ExportDocument } from '../../src/contract/types';
import { formatDate } from '../../src/format/date';
import { Agency } from '../../src/views/Agency';
import { Grant } from '../../src/views/Grant';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';

/**
 * The sample as an export with no funding data, which is what the pipeline writes while the store
 * holds none (docs/09 §11.1): the block is there and its `version` is null.
 */
const withoutFunding = (): ExportDocument => {
  const sample = sampleExport();
  return {
    ...sample,
    funding: {
      ...sample.funding,
      version: null,
      as_of: null,
      sources: [],
      agencies: [],
      grants: [],
    },
    works: sample.works.map((work) => ({ ...work, grants: [] })),
  };
};

const doc = withoutFunding();
const year = String(doc.period.last_year);

/** The committed sample carries funding data (docs/09 §11.8); `FundingImpact.test.tsx` draws it. */
const withFunding = (): ExportDocument => sampleExport();

const at = (path: string, state: unknown = null, document_: ExportDocument = doc) => {
  window.history.replaceState(state, '', path);
  return render(
    <Router
      doc={document_}
      fetcher={() => Promise.reject(new Error('the funding routes need no second fetch'))}
      lookupHref="/data/lookup_index.json"
      now={new Date(doc.generated_at)}
      searchDebounceMs={0}
    />,
  );
};

const views = () => screen.getByRole('navigation', { name: 'Views' });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the accessor', () => {
  it('finds no funding data in an export whose block has a null version, or has no block', () => {
    expect(fundingOf(doc)).toBeNull();
    expect(fundingOf({ ...doc, funding: null } as unknown as ExportDocument)).toBeNull();
    const legacy: Partial<ExportDocument> = withFunding();
    delete legacy.funding; // a 1.0 export, as after a rollback of the data (docs/07 O2)
    expect(fundingOf(legacy as ExportDocument)).toBeNull();
    expect(fundingOf(withFunding())?.funding).toEqual(sampleExport().funding);
  });
});

describe('the funding view', () => {
  it('opens on /funding under one h1, which takes focus (docs/06 §9)', () => {
    at('/funding');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(`${doc.resource.name} — funding impact`);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveFocus();
  });

  it('says what a grant’s value is, and what it is not (docs/05 §11)', () => {
    at('/funding');
    expect(screen.getByText(/not money spent on the work that lists it/)).toBeInTheDocument();
  });

  it('says plainly that this export has no funding data, rather than drawing empty charts', () => {
    at('/funding');
    const state = screen.getByRole('region', { name: 'No funding data in this export' });
    expect(state).toHaveTextContent(formatDate(doc.generated_at));
    expect(state).toHaveTextContent('not a finding that the publications list no funding');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the view, not the notice, when the export does carry funding data', () => {
    at('/funding', null, withFunding());
    expect(
      screen.queryByRole('region', { name: 'No funding data in this export' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Funding figures' })).toBeInTheDocument();
  });

  it('carries the header links and the footer the publications view has', () => {
    at('/funding');
    expect(screen.getByRole('link', { name: 'How this was assembled' })).toHaveAttribute(
      'href',
      '/method',
    );
    expect(screen.getByRole('link', { name: 'Why is a paper not here?' })).toHaveAttribute(
      'href',
      '/lookup',
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent(doc.run_id);
  });

  it('passes axe', async () => {
    const { container } = at(`/funding?year=${year}`);
    await expectNoAxeViolations(container);
  }, 30_000);
});

describe('the switch between the views (docs/09; docs/06 §9)', () => {
  it('is a nav of two links, marking the page being read', () => {
    at('/');
    const links = within(views()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Publications', 'Funding impact']);
    expect(within(views()).getByRole('link', { name: 'Publications' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(views()).getByRole('link', { name: 'Funding impact' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks the funding view on /funding', () => {
    at('/funding');
    expect(within(views()).getByRole('link', { name: 'Funding impact' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('carries the query string on both links, so a middle-click keeps the filter', () => {
    at(`/?year=${year}&sort=citations`);
    expect(within(views()).getByRole('link', { name: 'Funding impact' })).toHaveAttribute(
      'href',
      `/funding?year=${year}&sort=citations`,
    );
    expect(within(views()).getByRole('link', { name: 'Publications' })).toHaveAttribute(
      'href',
      `/?year=${year}&sort=citations`,
    );
  });

  it('keeps the filter both ways, and back and forward retrace the switches', async () => {
    at(`/?year=${year}`);
    const start = window.history.length;

    await userEvent.click(within(views()).getByRole('link', { name: 'Funding impact' }));
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/funding?year=${year}`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('funding impact');
    expect(window.history.length).toBe(start + 1);

    await userEvent.click(within(views()).getByRole('link', { name: 'Publications' }));
    expect(`${window.location.pathname}${window.location.search}`).toBe(`/?year=${year}`);
    expect(screen.getByText(new RegExp(`matching Year: ${year}`))).toBeInTheDocument();

    window.history.back();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('funding impact');
    });
    window.history.forward();
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`matching Year: ${year}`))).toBeInTheDocument();
    });
  });

  it('pushes nothing when the reader picks the view already on screen', async () => {
    at('/funding');
    const start = window.history.length;
    await userEvent.click(within(views()).getByRole('link', { name: 'Funding impact' }));
    expect(window.history.length).toBe(start);
    expect(window.location.pathname).toBe('/funding');
  });
});

describe('an agency or grant the export does not have', () => {
  it.each([
    ['agency', '/funding/agency/NIH', 'Funding agency not found', 'NIH'],
    ['grant', '/funding/grant/NIH%3AR01GM086688', 'Grant not found', 'NIH:R01GM086688'],
    ['grant', '/funding/grant/MISC%3AP01%20HL0996%2F2', 'Grant not found', 'MISC:P01 HL0996/2'],
  ])(
    'is a designed %s not-found state naming the key, under one focused h1',
    (_, path, h1, key) => {
      at(path);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(h1);
      expect(heading).toHaveFocus();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByText(key)).toBeInTheDocument();
    },
  );

  it('says the export has no funding data at all, which says nothing about the key', () => {
    at('/funding/grant/NIH%3AR01GM086688');
    expect(screen.getByText(/This export has no funding data at all/)).toBeInTheDocument();
  });

  it('says only that nothing has the key when the export has funding data', () => {
    at('/funding/grant/NIH%3AR01GM086688', null, withFunding());
    expect(screen.queryByText(/no funding data at all/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing listed on the publications here/)).toBeInTheDocument();
  });

  it('reached cold, links to the funding view with the reader’s query', () => {
    at(`/funding/agency/NIH?year=${year}`);
    expect(screen.getByRole('link', { name: 'See funding impact' })).toHaveAttribute(
      'href',
      `/funding?year=${year}`,
    );
    expect(screen.queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('opened in the app, goes back to the page named in its entry', async () => {
    at('/funding/grant/NIH%3AR01GM086688', { back: 'agency' });
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the agency' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('passes axe, cold and opened in the app', async () => {
    const cold = at('/funding/agency/NIH');
    await expectNoAxeViolations(cold.container);
    cold.unmount();
    const opened = at('/funding/grant/NIH%3AR01GM086688', { back: 'funding' });
    await expectNoAxeViolations(opened.container);
  }, 30_000);
});

/** What the Router gives an entity page beside its key, which a not-found page never uses. */
const entity = {
  fundingHref: '/funding',
  links: { grantHref: () => '/funding/grant/X', agencyHref: () => '/funding/agency/X' },
  publicationHref: () => '/publication/X',
};
const agencyProps = {
  ...entity,
  withAgency: {
    hrefs: { publications: '/?agency=NIH', funding: '/funding?agency=NIH' },
    onSwitch: () => undefined,
  },
  methodHref: '/method',
};

describe('closing an agency or grant page on Escape', () => {
  it('closes only when it opened over another page', async () => {
    const onClose = vi.fn();
    render(<Agency doc={doc} agencyKey="NIH" {...agencyProps} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Back to funding impact' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Escape when reached cold, with nowhere in the site to go back to', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<Grant doc={doc} grantKey="NIH:R01GM086688" {...entity} />);
    await userEvent.keyboard('{Escape}');
    expect(back).not.toHaveBeenCalled();
  });

  it('takes the label it is given', () => {
    render(
      <Grant
        doc={doc}
        grantKey="NIH:R01GM086688"
        {...entity}
        onClose={() => undefined}
        backLabel="Back to the publication"
      />,
    );
    expect(screen.getByRole('button', { name: 'Back to the publication' })).toBeInTheDocument();
  });
});
