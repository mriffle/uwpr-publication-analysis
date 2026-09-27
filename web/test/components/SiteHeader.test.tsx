/**
 * The shared header and its view switch (docs/06 §4.1, §9; docs/09).
 *
 * The switch is navigation between two pages, so it is a `<nav>` of links with `aria-current`,
 * not ARIA tabs; and because they are real links, a modified click must reach the browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageFooter } from '../../src/components/PageFooter';
import { SiteHeader, type SiteHeaderProps, type SiteView } from '../../src/components/SiteHeader';
import { formatDate } from '../../src/format/date';
import { expectNoAxeViolations } from '../support/axe';
import { sampleExport } from '../support/fixture';

const doc = sampleExport();

const show = (props: Partial<SiteHeaderProps> = {}) => {
  const onSwitch = vi.fn<(view: SiteView) => void>();
  const onOpenMethod = vi.fn();
  const onOpenLookup = vi.fn();
  const rendered = render(
    <main>
      <SiteHeader
        title="A title"
        lead="A lead."
        current="publications"
        doc={doc}
        methodHref="/method"
        onOpenMethod={onOpenMethod}
        lookupHref="/lookup"
        onOpenLookup={onOpenLookup}
        views={{ hrefs: { publications: '/?year=2020', funding: '/funding?year=2020' }, onSwitch }}
        {...props}
      />
    </main>,
  );
  return { ...rendered, onSwitch, onOpenMethod, onOpenLookup };
};

/**
 * What the app itself did with a click, read before anything else can cancel it — and then
 * cancelled, because jsdom cannot follow a link and says so on the console when asked to.
 */
let preventedByApp: boolean | null = null;
const guard = (event: Event) => {
  preventedByApp = event.defaultPrevented;
  event.preventDefault();
};

beforeEach(() => {
  preventedByApp = null;
  document.addEventListener('click', guard);
});

afterEach(() => {
  document.removeEventListener('click', guard);
});

describe('the header', () => {
  it('carries the one h1, the lead, the data dates and the resource’s own link', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A title');
    expect(screen.getByText('A lead.')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Data generated ${formatDate(doc.generated_at)}`))).toBe(
      screen.getByText(new RegExp(`as of ${formatDate(doc.sources.citations.as_of)}`)),
    );
    expect(screen.getByRole('link', { name: doc.resource.short_name })).toHaveAttribute(
      'href',
      doc.resource.url,
    );
  });

  it('opens the method page and the lookup in the app on a plain click', async () => {
    const { onOpenMethod, onOpenLookup } = show();
    await userEvent.click(screen.getByRole('link', { name: 'How this was assembled' }));
    await userEvent.click(screen.getByRole('link', { name: 'Why is a paper not here?' }));
    expect(onOpenMethod).toHaveBeenCalledTimes(1);
    expect(onOpenLookup).toHaveBeenCalledTimes(1);
  });

  it('leaves a modified click on those links to the browser', () => {
    const { onOpenMethod } = show();
    fireEvent.click(screen.getByRole('link', { name: 'How this was assembled' }), {
      shiftKey: true,
    });
    expect(onOpenMethod).not.toHaveBeenCalled();
    expect(preventedByApp).toBe(false);
  });

  it('does not take focus on its own, unless asked to', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex');
  });

  it('moves focus to the heading when asked to', () => {
    show({ focusHeading: true });
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('the view switch', () => {
  it('is a nav named "Views" holding two links, not tabs', () => {
    show();
    const nav = screen.getByRole('navigation', { name: 'Views' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it.each([
    ['publications', 'Publications', 'Funding impact'],
    ['funding', 'Funding impact', 'Publications'],
  ] as const)('marks %s as the current page and only that', (current, on, off) => {
    show({ current });
    expect(screen.getByRole('link', { name: on })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: off })).not.toHaveAttribute('aria-current');
  });

  it('switches in the app on a plain click', async () => {
    const { onSwitch } = show();
    await userEvent.click(screen.getByRole('link', { name: 'Funding impact' }));
    expect(onSwitch).toHaveBeenCalledWith('funding');
    expect(preventedByApp).toBe(true);
  });

  it('does nothing but stay put when the current view is picked', async () => {
    const { onSwitch } = show();
    await userEvent.click(screen.getByRole('link', { name: 'Publications' }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(preventedByApp).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])(
    'leaves a modified click (%o) to the browser',
    (modifier) => {
      const { onSwitch } = show();
      fireEvent.click(screen.getByRole('link', { name: 'Funding impact' }), modifier);
      expect(onSwitch).not.toHaveBeenCalled();
      expect(preventedByApp).toBe(false);
    },
  );

  it('leaves a middle click to the browser', () => {
    const { onSwitch } = show();
    fireEvent.click(screen.getByRole('link', { name: 'Funding impact' }), { button: 1 });
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});

describe('the footer', () => {
  it('names the run, the pipeline and the rules that produced the data', () => {
    render(<PageFooter doc={doc} />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(doc.run_id);
    expect(footer).toHaveTextContent(`pipeline ${doc.pipeline_version}`);
    expect(footer).toHaveTextContent(`rules ${doc.rule_version}`);
  });
});
