/**
 * Automated accessibility assertions in component tests (docs/06 §9, §12.2).
 *
 * "Automated checks catch perhaps half of what matters and are not sufficient on their own" —
 * they are paired with querying by role and accessible name throughout, so a test fails when the
 * accessibility does, and with the keyboard walkthrough docs/06 §9 requires before release.
 */
import axe from 'axe-core';
import { expect } from 'vitest';

export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    // jsdom computes no colours, so a contrast result would be guesswork either way. Contrast is
    // asserted by hand against the tokens in styles.css and by the Playwright pass of a later
    // slice, where a real engine has resolved them.
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
