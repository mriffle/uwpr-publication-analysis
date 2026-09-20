import { describe, expect, it } from 'vitest';
import { distinct, exactSum, mean, median, round4 } from '../../src/aggregate/numeric';

describe('round4', () => {
  it('rounds the way Python does, which Math.round does not', () => {
    // The sample export's fwci median. Python writes 1.1967; Math.round(x * 1e4) / 1e4 gives
    // 1.1968, which would fail the summary cross-check on a value that is otherwise correct.
    expect(round4(1.19675)).toBe(1.1967);
    expect(Math.round(1.19675 * 1e4) / 1e4).toBe(1.1968);
  });

  it('leaves shorter values alone', () => {
    expect(round4(2.68)).toBe(2.68);
    expect(round4(0)).toBe(0);
    expect(round4(-1.23456)).toBe(-1.2346);
  });
});

describe('exactSum', () => {
  it('is exact where a naive fold is not', () => {
    const values = [0.1, 0.2, 0.3];
    expect(exactSum(values)).toBe(0.6);
    expect(values.reduce((a, b) => a + b, 0)).not.toBe(0.6);
  });

  it('sums an empty list to zero', () => {
    expect(exactSum([])).toBe(0);
  });

  it('survives a large value followed by small ones', () => {
    expect(exactSum([1e16, 1, 1, 1, 1])).toBe(1e16 + 4);
  });
});

describe('median', () => {
  it('is null for nothing', () => {
    expect(median([])).toBeNull();
  });

  it('takes the middle of an odd count', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values of an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('does not reorder its input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('mean', () => {
  it('is null for nothing', () => {
    expect(mean([])).toBeNull();
  });

  it('is the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('distinct', () => {
  it('counts distinct keys and skips absent ones', () => {
    const items = [{ k: 'a' }, { k: 'a' }, { k: 'b' }, { k: null }, { k: undefined }];
    expect(distinct(items, (item) => item.k)).toBe(2);
  });

  it('counts the empty string as a value, because the contract never writes one', () => {
    expect(distinct([{ k: '' }], (item) => item.k)).toBe(1);
  });
});
