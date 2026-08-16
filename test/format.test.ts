import { describe, expect, it } from 'vitest';
import { formatSize } from '../src/core/format.js';

describe('formatSize', () => {
  it('shows plain bytes below 1 KiB', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(124)).toBe('124 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('switches to KB at 1 KiB with one decimal', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(3174)).toBe('3.1 KB');
  });

  it('scales through MB, GB and TB', () => {
    expect(formatSize(1024 ** 2)).toBe('1.0 MB');
    expect(formatSize(1024 ** 3)).toBe('1.0 GB');
    expect(formatSize(1024 ** 4)).toBe('1.0 TB');
  });

  it('drops the decimal once the number is wide, to keep the column narrow', () => {
    expect(formatSize(999 * 1024)).toBe('999 KB');
  });

  it('never returns something absurd for a negative or non-finite size', () => {
    expect(formatSize(-1)).toBe('0 B');
    expect(formatSize(Number.NaN)).toBe('0 B');
    expect(formatSize(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('stays within 8 cells for any plausible file size', () => {
    for (const size of [0, 1023, 1024, 1024 ** 2, 1024 ** 3, 1024 ** 4 * 900]) {
      expect(formatSize(size).length).toBeLessThanOrEqual(8);
    }
  });
});
