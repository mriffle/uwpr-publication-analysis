/**
 * The in-app links to a grant's page and an agency's page (docs/09 §12.1, §12.3): real links
 * that the app takes over only on a plain left click, and only when the view gave it a way to
 * open the page in place.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgencyLink, GrantLink, type FundingLinks } from '../../src/components/FundingLinks';

const hrefs = {
  grantHref: (key: string) => `/funding/grant/${encodeURIComponent(key)}`,
  agencyHref: (code: string) => `/funding/agency/${encodeURIComponent(code)}`,
};

function show(links: FundingLinks) {
  render(
    <p>
      <GrantLink links={links} grantKey="NIH:R01GM000001">
        R01GM000001
      </GrantLink>{' '}
      <AgencyLink links={links} code="NIGMS">
        NIGMS
      </AgencyLink>
    </p>,
  );
}

/**
 * Click a link and report whether the app kept the browser from following it. Read on `window`,
 * after React's own listener has run; the click is then stopped there either way, since jsdom
 * cannot follow a link.
 */
function click(name: string, init: MouseEventInit = {}): boolean {
  let prevented = false;
  const settle = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', settle);
  fireEvent.click(screen.getByRole('link', { name }), { button: 0, ...init });
  window.removeEventListener('click', settle);
  return prevented;
}

describe('GrantLink and AgencyLink', () => {
  it('link to the pages by key, escaped', () => {
    show(hrefs);
    expect(screen.getByRole('link', { name: 'R01GM000001' })).toHaveAttribute(
      'href',
      '/funding/grant/NIH%3AR01GM000001',
    );
    expect(screen.getByRole('link', { name: 'NIGMS' })).toHaveAttribute(
      'href',
      '/funding/agency/NIGMS',
    );
  });

  it('open in place on a plain left click', () => {
    const onOpenGrant = vi.fn();
    const onOpenAgency = vi.fn();
    show({ ...hrefs, onOpenGrant, onOpenAgency });
    expect(click('R01GM000001')).toBe(true);
    expect(click('NIGMS')).toBe(true);
    expect(onOpenGrant).toHaveBeenCalledWith('NIH:R01GM000001');
    expect(onOpenAgency).toHaveBeenCalledWith('NIGMS');
  });

  it('leave a modified click to the browser', () => {
    const onOpenGrant = vi.fn();
    show({ ...hrefs, onOpenGrant });
    expect(click('R01GM000001', { ctrlKey: true })).toBe(false);
    expect(click('R01GM000001', { metaKey: true })).toBe(false);
    expect(onOpenGrant).not.toHaveBeenCalled();
  });

  it('are plain links when the view gives no way to open in place', () => {
    show(hrefs);
    expect(click('R01GM000001')).toBe(false);
    expect(click('NIGMS')).toBe(false);
  });
});
