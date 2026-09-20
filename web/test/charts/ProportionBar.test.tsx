/**
 * The proportion bar (docs/06 §7, §8, §9).
 *
 * Rendered directly at a fixed width, which is the reason docs/06 §11.2 chose visx: the SVG is
 * deterministic and the assertions are about real geometry rather than a mock.
 *
 * What is asserted is what the shape can get wrong: a segment whose width does not match its
 * share, a segment whose exact number is only available to a reader who can see it, and parts
 * that exceed their stated whole and quietly rescale to look right.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ProportionBar,
  ProportionTable,
  segmentLabel,
  share,
} from '../../src/charts/ProportionBar';
import { expectNoAxeViolations } from '../support/axe';

const SEGMENTS = [
  {
    key: 'confirmed',
    label: 'Evidence found in the publication',
    value: 215,
    colour: 'var(--chart-1)',
  },
  { key: 'read', label: 'Full text read, no mention found', value: 44, colour: 'var(--chart-2)' },
  {
    key: 'unreadable',
    label: 'Full text could not be read',
    value: 47,
    colour: 'var(--chart-other)',
    meaning: 'No machine-readable full text was available.',
  },
];
const TOTAL = 306;
const UNIT = { one: 'publication', many: 'publications' };

const draw = (segments = SEGMENTS, total = TOTAL) =>
  render(
    <ProportionBar
      segments={segments}
      total={total}
      width={600}
      label="Publications on the list, by what else was found"
      unit={UNIT}
    />,
  );

describe('the bar', () => {
  it('has an accessible name (docs/06 §9)', () => {
    draw();
    expect(
      screen.getByRole('group', { name: 'Publications on the list, by what else was found' }),
    ).toBeInTheDocument();
  });

  it('gives each segment a width proportional to its value', () => {
    const { container } = draw();
    for (const segment of SEGMENTS) {
      const rect = container.querySelector(`[data-testid="segment-${segment.key}"]`);
      expect(Number(rect?.getAttribute('width'))).toBeCloseTo((segment.value / TOTAL) * 600, 6);
    }
  });

  it('lays the segments end to end, in the order given', () => {
    const { container } = draw();
    let offset = 0;
    for (const segment of SEGMENTS) {
      const rect = container.querySelector(`[data-testid="segment-${segment.key}"]`);
      expect(Number(rect?.getAttribute('x'))).toBeCloseTo((offset / TOTAL) * 600, 6);
      offset += segment.value;
    }
  });

  it('carries every segment’s exact count and its share in its accessible name', () => {
    draw();
    for (const segment of SEGMENTS) {
      const mark = screen.getByRole('img', {
        name: new RegExp(
          `^${segment.label}: ${String(segment.value)} of 306 publications, \\d+%\\.$`,
        ),
      });
      expect(mark).toBeInTheDocument();
    }
  });

  it('repeats the count and the share in the legend, beside the segment’s name', () => {
    draw();
    const legend = within(
      screen.getByRole('list', { name: 'Publications on the list, by what else was found: parts' }),
    );
    expect(legend.getByText('Full text could not be read')).toBeInTheDocument();
    expect(legend.getByText('47 · 15%')).toBeInTheDocument();
  });

  it('labels a segment in place only when it is wide enough to be legible', () => {
    // 3 of 306 is under a percent, which at 600px is 6px wide: the number goes to the legend.
    const { container } = draw([...SEGMENTS.slice(0, 2), { ...SEGMENTS[2]!, value: 3 }], TOTAL);
    const narrow = container.querySelector('[data-testid="segment-unreadable"]')?.parentElement;
    expect(within(narrow as HTMLElement).queryByText('3')).not.toBeInTheDocument();
    // …and its exact value is still in the accessible name and the legend, so nothing is lost.
    expect(
      screen.getByRole('img', { name: /Full text could not be read: 3 of 306/ }),
    ).toBeVisible();
  });

  it('draws nothing over a zero total rather than dividing by it', () => {
    draw([{ key: 'none', label: 'Nothing', value: 0, colour: 'var(--chart-1)' }], 0);
    expect(screen.getByRole('img', { name: 'Nothing: 0 of 0 publications, 0%.' })).toBeVisible();
  });

  it('keeps parts that exceed their stated whole inside the frame (docs/05 §11.3)', () => {
    // A contract whose parts outgrew its total would otherwise draw a bar running off the chart,
    // or one rescaled to look correct. The scale takes the larger, so the overflow is visible as
    // a bar that does not fill its frame and the accessible name still states the real total.
    const { container } = draw(SEGMENTS, 100);
    const widths = SEGMENTS.map((segment) =>
      Number(
        container.querySelector(`[data-testid="segment-${segment.key}"]`)?.getAttribute('width'),
      ),
    );
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(600, 5);
  });

  it('passes axe', async () => {
    const { container } = draw();
    await expectNoAxeViolations(container);
  });
});

describe('the table alternative (docs/06 §7)', () => {
  it('states each part’s exact count, its share and what it is', () => {
    render(
      <ProportionTable
        segments={SEGMENTS}
        total={TOTAL}
        caption="Publications on the list, by what else was found."
        categoryHeader="What was found"
        valueHeader="Publications"
      />,
    );
    const row = screen.getByRole('row', { name: /Full text could not be read/ });
    expect(within(row).getByText('47')).toBeInTheDocument();
    expect(within(row).getByText('15%')).toBeInTheDocument();
    expect(
      within(row).getByText('No machine-readable full text was available.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Share of 306' })).toBeInTheDocument();
  });

  it('leaves out the meaning column when no segment has one', () => {
    render(
      <ProportionTable
        segments={SEGMENTS.slice(0, 2)}
        total={TOTAL}
        caption="Two parts."
        categoryHeader="What was found"
        valueHeader="Publications"
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'What it is' })).not.toBeInTheDocument();
  });
});

describe('the pure helpers', () => {
  it('computes a share, and calls a zero denominator zero rather than NaN', () => {
    expect(share(44, 306)).toBeCloseTo(0.1438, 4);
    expect(share(3, 0)).toBe(0);
  });

  it('formats a segment with its exact count before its share', () => {
    expect(segmentLabel(SEGMENTS[1]!, TOTAL, UNIT)).toBe(
      'Full text read, no mention found: 44 of 306 publications, 14%.',
    );
  });

  it('says "publication" in the singular', () => {
    expect(segmentLabel({ ...SEGMENTS[0]!, value: 1 }, 1, UNIT)).toBe(
      'Evidence found in the publication: 1 of 1 publication, 100%.',
    );
  });
});
