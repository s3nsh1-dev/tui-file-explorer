import { describe, expect, it } from 'vitest';
import { clamp, isPresent, pluralise } from '../src/core/util.js';

describe('clamp', () => {
  it('returns the value when it is already inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('pulls values back to the nearest bound', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('lets the low bound win when the range is inverted', () => {
    // A viewport can end up with high < low (height 0 on an empty list).
    // Returning `low` is arbitrary but defined; returning `high` would hand
    // callers a value below their own minimum.
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('handles a zero-width range', () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe('pluralise', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralise(1, 'item')).toBe('1 item');
  });

  it('uses the plural for zero and for many', () => {
    expect(pluralise(0, 'item')).toBe('0 items');
    expect(pluralise(42, 'item')).toBe('42 items');
  });

  it('accepts an irregular plural', () => {
    expect(pluralise(2, 'match', 'matches')).toBe('2 matches');
  });
});

describe('isPresent', () => {
  it('removes null and undefined', () => {
    expect([1, null, 2, undefined, 3].filter(isPresent)).toEqual([1, 2, 3]);
  });

  it('KEEPS falsy values that are not nullish', () => {
    // This is the whole reason it exists instead of `.filter(Boolean)`, which
    // would silently drop 0 and the empty string.
    expect([0, '', false, null].filter(isPresent)).toEqual([0, '', false]);
  });

  it('narrows the element type', () => {
    const mixed: (string | null)[] = ['a', null, 'b'];
    const narrowed: string[] = mixed.filter(isPresent);
    expect(narrowed).toEqual(['a', 'b']);
  });
});
