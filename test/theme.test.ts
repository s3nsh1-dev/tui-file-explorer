import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `theme.ts` reads NO_COLOR once at module load, so every case here needs a
 * fresh module graph. That single read is deliberate: the decision is made
 * once, not re-derived on every render of every row.
 */
const loadTheme = async (noColor: string | undefined) => {
  vi.resetModules();
  if (noColor === undefined) {
    vi.stubEnv('NO_COLOR', '');
  } else {
    vi.stubEnv('NO_COLOR', noColor);
  }
  return import('../src/ui/theme.js');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('theme', () => {
  it('carries real styles when colour is enabled', async () => {
    const { theme, isColorEnabled } = await loadTheme(undefined);

    expect(isColorEnabled).toBe(true);
    expect(theme.directory).toEqual({ color: 'cyan', bold: true });
    expect(theme.error).toEqual({ color: 'red', bold: true });
    expect(theme.selected).toEqual({ inverse: true });
  });

  it('empties EVERY token under NO_COLOR, not just the colours', async () => {
    const { theme, isColorEnabled } = await loadTheme('1');

    expect(isColorEnabled).toBe(false);
    // bold / dimColor / inverse are SGR too. Leaving them would still emit
    // escape sequences and break the "zero SGR" guarantee.
    for (const [name, token] of Object.entries(theme)) {
      expect(token, `theme.${name} should be empty under NO_COLOR`).toEqual({});
    }
  });

  it('treats any non-empty NO_COLOR value as "disable", per no-color.org', async () => {
    for (const value of ['1', '0', 'true', 'anything']) {
      const { isColorEnabled } = await loadTheme(value);
      expect(isColorEnabled, `NO_COLOR=${value}`).toBe(false);
    }
  });

  it('treats an empty NO_COLOR as unset', async () => {
    const { isColorEnabled } = await loadTheme('');
    expect(isColorEnabled).toBe(true);
  });
});
