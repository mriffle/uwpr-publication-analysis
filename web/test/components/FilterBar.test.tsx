/**
 * The sticky filter bar (docs/06 §6): chips that are always visible, removable, with the
 * resulting count beside them and a control that clears them all.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../../src/components/FilterBar';
import { describeFilter, filterSentence } from '../../src/filter/describe';
import { EMPTY_FILTER, type FilterState } from '../../src/filter/state';
import { expectNoAxeViolations } from '../support/axe';

const filter: FilterState = { ...EMPTY_FILTER, year: [2019], country: ['DE'] };

const show = (state = filter, count = 3) => {
  const onChange = vi.fn();
  const onClearAll = vi.fn();
  const result = render(
    <FilterBar
      chips={describeFilter(state)}
      sentence={filterSentence(state, count)}
      onChange={onChange}
      onClearAll={onClearAll}
    />,
  );
  return { ...result, onChange, onClearAll };
};

describe('the bar', () => {
  it('states the active filter in words, with the resulting count, in a live region', () => {
    show();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 publications matching Year: 2019; Country: DE.');
  });

  it('shows one removable chip per selection', () => {
    show();
    const chips = within(screen.getByRole('list', { name: 'Active filters' })).getAllByRole(
      'button',
    );
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveAccessibleName(/Year: 2019.*Remove this filter/s);
  });

  it('removes exactly the selection whose chip was activated', async () => {
    const { onChange } = show();
    await userEvent.click(screen.getByRole('button', { name: /Year: 2019/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ year: [], country: ['DE'] }));
  });

  it('clears everything at once', async () => {
    const { onClearAll } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it('offers nothing to remove when nothing is selected, and still states the count', () => {
    show(EMPTY_FILTER, 339);
    expect(screen.getByRole('status')).toHaveTextContent('339 publications, no filter applied.');
    expect(screen.queryByRole('list', { name: 'Active filters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('keeps the clear control out of the live region, so it is not read on every change', () => {
    show();
    expect(
      within(screen.getByRole('status')).queryByRole('button', { name: 'Clear all filters' }),
    ).not.toBeInTheDocument();
  });

  it('passes axe', async () => {
    const { container } = show();
    await expectNoAxeViolations(container);
  });
});
