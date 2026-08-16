import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, configPath, loadConfig, validateConfig } from '../src/core/config.js';

const withConfigFile = async (contents: string, run: (file: string) => Promise<void>) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'glim-cfg-'));
  const file = path.join(dir, 'config.json');
  try {
    await writeFile(file, contents);
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('configPath', () => {
  it('honours XDG_CONFIG_HOME', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/glim/config.json');
  });

  it('falls back to ~/.config when XDG_CONFIG_HOME is unset or empty', () => {
    expect(configPath({})).toMatch(/\.config[/\\]glim[/\\]config\.json$/);
    expect(configPath({ XDG_CONFIG_HOME: '' })).toMatch(/\.config[/\\]glim[/\\]config\.json$/);
  });
});

describe('validateConfig', () => {
  it('accepts a well-formed config', () => {
    const { config, warnings } = validateConfig({
      showHidden: true,
      sortKey: 'size',
      sortReverse: true,
      previewMinWidth: 90,
      listFraction: 0.6,
      scrollMargin: 4,
    });

    expect(warnings).toEqual([]);
    expect(config).toEqual({
      showHidden: true,
      sortKey: 'size',
      sortReverse: true,
      previewMinWidth: 90,
      listFraction: 0.6,
      scrollMargin: 4,
    });
  });

  it('fills every missing field from defaults', () => {
    const { config, warnings } = validateConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it('warns and falls back on a wrong type instead of throwing', () => {
    const { config, warnings } = validateConfig({ showHidden: 'yes', sortKey: 42 });

    expect(config.showHidden).toBe(DEFAULT_CONFIG.showHidden);
    expect(config.sortKey).toBe(DEFAULT_CONFIG.sortKey);
    expect(warnings.join(' ')).toMatch(/showHidden/);
    expect(warnings.join(' ')).toMatch(/sortKey/);
  });

  it('clamps out-of-range numbers rather than accepting absurd layouts', () => {
    const { config, warnings } = validateConfig({ listFraction: 99, scrollMargin: -5 });

    expect(config.listFraction).toBeLessThanOrEqual(0.9);
    expect(config.scrollMargin).toBeGreaterThanOrEqual(0);
    expect(warnings.join(' ')).toMatch(/out of range/);
  });

  it('rejects a non-object', () => {
    for (const value of [null, 42, 'text', [1, 2, 3], true]) {
      const { config, warnings } = validateConfig(value);
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(warnings.join(' ')).toMatch(/JSON object/);
    }
  });

  it('reports unknown keys instead of silently ignoring them', () => {
    const { warnings } = validateConfig({ colourScheme: 'dracula' });
    expect(warnings.join(' ')).toMatch(/colourScheme.*unknown/);
  });

  it('sanitizes a hostile key before reporting it', () => {
    const hostile = `${String.fromCharCode(0x1b)}[2Jgotcha`;
    const { warnings } = validateConfig({ [hostile]: 1 });

    // A warning is printed text; ADR-0005 applies to it.
    expect(warnings.join(' ')).not.toContain(String.fromCharCode(0x1b));
    expect(warnings.join(' ')).toContain('<U+001B>');
  });
});

/**
 * Adversary A14. `JSON.parse('{"__proto__":{"x":1}}')` yields an object whose
 * `__proto__` is an ordinary own property — harmless until something spreads or
 * deep-merges it onto a target, at which point every object in the process
 * inherits the payload.
 */
describe('prototype pollution', () => {
  it('does not pollute Object.prototype from a __proto__ key', () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"polluted": "yes"}, "showHidden": true}');
    const { config, warnings } = validateConfig(parsed);

    expect(config.showHidden).toBe(true);
    expect(warnings.join(' ')).toMatch(/refused/);

    // The actual proof: nothing leaked onto the prototype chain.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('does not accept a constructor key', () => {
    const parsed: unknown = JSON.parse('{"constructor": {"prototype": {"bad": 1}}}');
    const { warnings } = validateConfig(parsed);

    expect(warnings.join(' ')).toMatch(/refused/);
    expect(({} as Record<string, unknown>)['bad']).toBeUndefined();
  });

  it('never returns an object with a tampered prototype', () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"sortKey": "size"}}');
    const { config } = validateConfig(parsed);

    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(config.sortKey).toBe('name');
  });
});

describe('loadConfig', () => {
  it('returns defaults with no warning when the file does not exist', async () => {
    const { config, warnings } = await loadConfig('/nonexistent/glim/config.json');
    // A missing config is the normal case, not a problem worth reporting.
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it('reads and applies a valid file', async () => {
    await withConfigFile('{"sortKey":"mtime","showHidden":true}', async (file) => {
      const { config, warnings } = await loadConfig(file);
      expect(config.sortKey).toBe('mtime');
      expect(config.showHidden).toBe(true);
      expect(warnings).toEqual([]);
    });
  });

  it('falls back on malformed JSON without echoing the file contents', async () => {
    await withConfigFile('{ this is not json,,, "secret": "hunter2" }', async (file) => {
      const { config, warnings } = await loadConfig(file);
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(warnings.join(' ')).toMatch(/not valid JSON/);
      // The parser's message can quote file content; ours must not.
      expect(warnings.join(' ')).not.toContain('hunter2');
    });
  });

  it('refuses an implausibly large config instead of parsing it', async () => {
    await withConfigFile(`{"pad":"${'x'.repeat(100_000)}"}`, async (file) => {
      const { config, warnings } = await loadConfig(file);
      expect(config).toEqual(DEFAULT_CONFIG);
      expect(warnings.join(' ')).toMatch(/implausibly large/);
    });
  });
});
