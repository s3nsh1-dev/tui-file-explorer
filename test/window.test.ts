import { describe, expect, it } from 'vitest';
import { nextOffset, windowSlice } from '../src/state/selectors.js';

const MARGIN = 2;
const offset = (previous: number, cursor: number, height: number, total: number): number =>
  nextOffset(previous, cursor, height, total, MARGIN);

describe('nextOffset', () => {
  it('stays at zero while the whole list fits', () => {
    expect(offset(0, 0, 24, 5)).toBe(0);
    expect(offset(0, 4, 24, 5)).toBe(0);
  });

  it('does not scroll while the cursor is inside the margins', () => {
    expect(offset(0, 5, 10, 100)).toBe(0);
  });

  it('scrolls down only once the cursor reaches the bottom margin', () => {
    // height 10 → last visible row is index 9; margin 2 → scroll from index 8.
    expect(offset(0, 7, 10, 100)).toBe(0);
    expect(offset(0, 8, 10, 100)).toBe(1);
    expect(offset(0, 9, 10, 100)).toBe(2);
  });

  it('scrolls up when the cursor reaches the top margin', () => {
    expect(offset(10, 12, 10, 100)).toBe(10);
    expect(offset(10, 11, 10, 100)).toBe(9);
  });

  it('never scrolls past the end of the list', () => {
    expect(offset(0, 99, 10, 100)).toBe(90);
    expect(offset(95, 99, 10, 100)).toBe(90);
  });

  it('never produces a negative offset', () => {
    expect(offset(5, 0, 10, 100)).toBe(0);
  });

  /**
   * Stage 3 adversary A5 arrives early: margin arithmetic must degrade when the
   * viewport is shorter than twice the margin, or the window oscillates.
   */
  it('survives a viewport shorter than twice the margin', () => {
    expect(offset(0, 0, 1, 100)).toBe(0);
    expect(offset(0, 50, 1, 100)).toBe(50);
    expect(offset(0, 3, 4, 100)).toBe(1);
    expect(offset(0, 99, 1, 100)).toBe(99);
  });

  it('handles a zero-height viewport without throwing or going negative', () => {
    expect(offset(0, 0, 0, 100)).toBe(0);
    expect(offset(0, 50, 0, 100)).toBeGreaterThanOrEqual(0);
  });

  it('handles an empty list', () => {
    expect(offset(0, -1, 10, 0)).toBe(0);
  });

  it('is idempotent — re-applying with the same inputs changes nothing', () => {
    // React can render twice; the offset is derived during render, so applying
    // the function to its own output must be a no-op.
    const once = offset(0, 50, 10, 100);
    expect(offset(once, 50, 10, 100)).toBe(once);
  });
});

describe('windowSlice', () => {
  const list = Array.from({ length: 100 }, (_, i) => i);

  it('returns exactly the viewport height', () => {
    expect(windowSlice(list, 0, 10)).toHaveLength(10);
    expect(windowSlice(list, 90, 10)).toHaveLength(10);
  });

  it('slices from the offset', () => {
    expect(windowSlice(list, 5, 3)).toEqual([5, 6, 7]);
  });

  it('returns fewer rows when the list is shorter than the viewport', () => {
    expect(windowSlice([1, 2], 0, 10)).toEqual([1, 2]);
  });

  it('returns nothing for a zero or negative height', () => {
    expect(windowSlice(list, 0, 0)).toEqual([]);
    expect(windowSlice(list, 0, -5)).toEqual([]);
  });
});
