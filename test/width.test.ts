import { describe, expect, it } from 'vitest';
import { displayWidth, truncateToWidth } from '../src/core/sanitize.js';

describe('displayWidth', () => {
  it('counts ASCII as one cell each', () => {
    expect(displayWidth('README.md')).toBe(9);
    expect(displayWidth('')).toBe(0);
  });

  it('counts CJK as two cells', () => {
    expect(displayWidth('日本語')).toBe(6);
    expect(displayWidth('a日b')).toBe(4);
  });

  it('counts emoji as two cells', () => {
    expect(displayWidth('🎉')).toBe(2);
    expect(displayWidth('ab🎉')).toBe(4);
  });

  it('counts fullwidth forms as two cells', () => {
    expect(displayWidth('Ａ')).toBe(2);
  });

  it('counts combining marks as zero', () => {
    // "e" + combining acute renders as one cell, not two.
    expect(displayWidth(`e${String.fromCharCode(0x0301)}`)).toBe(1);
  });

  it('counts precomposed accents as one cell', () => {
    expect(displayWidth('café')).toBe(4);
  });
});

describe('truncateToWidth', () => {
  it('leaves short strings untouched', () => {
    expect(truncateToWidth('short', 10)).toBe('short');
    expect(truncateToWidth('exactly10!', 10)).toBe('exactly10!');
  });

  it('truncates and appends an ellipsis that fits inside the budget', () => {
    const result = truncateToWidth('abcdefghijklmnop', 10);
    expect(displayWidth(result)).toBeLessThanOrEqual(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('never splits a wide character in half', () => {
    // Budget 5: "日本" is 4 cells, the ellipsis is 1 → exactly 5.
    const result = truncateToWidth('日本語日本語', 5);
    expect(displayWidth(result)).toBeLessThanOrEqual(5);
    expect(result).not.toContain('�');
  });

  it('never splits a surrogate pair', () => {
    const result = truncateToWidth('🎉🎉🎉🎉', 5);
    expect(displayWidth(result)).toBeLessThanOrEqual(5);
    // A split pair would leave a lone surrogate, which stringifies as U+FFFD.
    expect(Array.from(result).every((c) => (c.codePointAt(0) ?? 0) !== 0xfffd)).toBe(true);
  });

  it('degrades sanely at tiny budgets instead of throwing', () => {
    expect(displayWidth(truncateToWidth('abcdef', 1))).toBeLessThanOrEqual(1);
    expect(truncateToWidth('abcdef', 0)).toBe('');
    expect(truncateToWidth('abcdef', -3)).toBe('');
  });

  it('truncates from the start when asked, keeping the useful tail of a path', () => {
    const result = truncateToWidth('/very/long/path/to/here', 10, 'start');
    expect(displayWidth(result)).toBeLessThanOrEqual(10);
    expect(result.startsWith('…')).toBe(true);
    expect(result.endsWith('here')).toBe(true);
  });
});
