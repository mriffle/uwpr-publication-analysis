/**
 * A sortable column header (WAI-ARIA Authoring Practices, "sortable table"): `aria-sort` on the
 * sorted column's `<th>` only, and a real button inside it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortHeader, type SortHeaderProps } from '../../src/components/SortHeader';
import { expectNoAxeViolations } from '../support/axe';

const table = (headers: SortHeaderProps[]) =>
  render(
    <table>
      <caption>Grants</caption>
      <thead>
        <tr>
          {headers.map((props) => (
            <SortHeader key={props.label} {...props} />
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>R01 GM1</td>
          <td>$100</td>
        </tr>
      </tbody>
    </table>,
  );

describe('SortHeader', () => {
  it('says the sorted column is ascending or descending, and nothing on the others', () => {
    const { rerender } = table([
      { label: 'Number', direction: null, onSort: vi.fn() },
      { label: 'Total', direction: 'desc', onSort: vi.fn(), numeric: true },
    ]);
    const number = screen.getByRole('columnheader', { name: 'Number' });
    const total = screen.getByRole('columnheader', { name: 'Total' });
    expect(number).not.toHaveAttribute('aria-sort');
    expect(total).toHaveAttribute('aria-sort', 'descending');

    rerender(
      <table>
        <thead>
          <tr>
            <SortHeader label="Number" direction="asc" onSort={vi.fn()} />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Number' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('is a column header holding a button named by the column alone', () => {
    table([{ label: 'Total', direction: 'asc', onSort: vi.fn() }]);
    const header = screen.getByRole('columnheader', { name: 'Total' });
    expect(header).toHaveAttribute('scope', 'col');
    // The arrow is decoration; the state is announced from aria-sort.
    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument();
    expect(header.textContent).toContain('↑');
  });

  it('shows a descending arrow, and none when unsorted', () => {
    const { container } = table([
      { label: 'Total', direction: 'desc', onSort: vi.fn() },
      { label: 'Number', direction: null, onSort: vi.fn() },
    ]);
    const arrows = [...container.querySelectorAll('.sort-header-arrow')].map((a) => a.textContent);
    expect(arrows).toEqual([' ↓', '']);
  });

  it('right-aligns a numeric column like the numbers beneath it', () => {
    table([
      { label: 'Total', direction: null, onSort: vi.fn(), numeric: true },
      { label: 'Number', direction: null, onSort: vi.fn() },
    ]);
    expect(screen.getByRole('columnheader', { name: 'Total' })).toHaveClass('numeric');
    expect(screen.getByRole('columnheader', { name: 'Number' })).not.toHaveClass('numeric');
  });

  it('asks the caller to sort, from a click or the keyboard', async () => {
    const onSort = vi.fn();
    table([{ label: 'Total', direction: null, onSort }]);
    const button = screen.getByRole('button', { name: 'Total' });
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledTimes(2);
  });

  it('passes axe', async () => {
    const { container } = table([
      { label: 'Number', direction: 'asc', onSort: vi.fn() },
      { label: 'Total', direction: null, onSort: vi.fn(), numeric: true },
    ]);
    await expectNoAxeViolations(container);
  });
});
