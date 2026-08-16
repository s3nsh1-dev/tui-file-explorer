import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { errnoOf } from './errors.js';
import { sanitizeName } from './sanitize.js';
import { SORT_CYCLE } from './sort.js';
import type { SortKey } from './types.js';
import { clamp } from './util.js';

/**
 * User configuration: JSON, read once at startup, never executed.
 *
 * A `.js` or `.ts` config file would be arbitrary code execution by design —
 * the user's config would run with the user's privileges every time the app
 * starts, and a config file copied from the internet becomes a shell. JSON is
 * data, and data cannot run (ADR-0005).
 *
 * Nothing here can fail the app. A malformed, hostile or unreadable config
 * produces defaults plus a warning; a file explorer that refuses to start
 * because of a stray comma is worse than one that ignores it.
 */

export type Config = {
  readonly showHidden: boolean;
  readonly sortKey: SortKey;
  readonly sortReverse: boolean;
  /** Inner width below which the preview pane is dropped rather than crushed. */
  readonly previewMinWidth: number;
  /** Share of the inner width given to the listing when both panes show. */
  readonly listFraction: number;
  /** Rows kept between the cursor and the viewport edge while scrolling. */
  readonly scrollMargin: number;
};

/**
 * These MUST equal the constants they replaced in `app.tsx`, or the golden
 * frames change and the S3-02 zero-diff proof stops meaning anything.
 */
export const DEFAULT_CONFIG: Config = {
  showHidden: false,
  sortKey: 'name',
  sortReverse: false,
  previewMinWidth: 70,
  listFraction: 0.45,
  scrollMargin: 2,
};

/** `$XDG_CONFIG_HOME/glim/config.json`, falling back to `~/.config`. */
export const configPath = (env: NodeJS.ProcessEnv = process.env): string => {
  const base = env['XDG_CONFIG_HOME'];
  const root = base !== undefined && base !== '' ? base : path.join(os.homedir(), '.config');
  return path.join(root, 'glim', 'config.json');
};

/**
 * Keys that must never be copied out of parsed JSON.
 *
 * `JSON.parse('{"__proto__":{"polluted":true}}')` produces an object whose
 * `__proto__` key is an ordinary own property — but a naive `{...defaults,
 * ...parsed}` or a recursive merge can promote it to the real prototype, and
 * from there every object in the process inherits it. We read fields
 * individually rather than spreading, which already avoids this, and reject
 * these keys explicitly so the defence survives a future refactor to a merge.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readBoolean = (
  source: Record<string, unknown>,
  key: string,
  fallback: boolean,
  warnings: string[],
): boolean => {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  warnings.push(`${key}: expected a boolean, ignoring`);
  return fallback;
};

const readNumber = (
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  low: number,
  high: number,
  warnings: string[],
): number => {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    warnings.push(`${key}: expected a finite number, ignoring`);
    return fallback;
  }
  const bounded = clamp(value, low, high);
  if (bounded !== value) {
    warnings.push(`${key}: ${String(value)} is out of range, using ${String(bounded)}`);
  }
  return bounded;
};

const readSortKey = (
  source: Record<string, unknown>,
  fallback: SortKey,
  warnings: string[],
): SortKey => {
  const value = source['sortKey'];
  if (value === undefined) return fallback;
  if (typeof value === 'string' && (SORT_CYCLE as readonly string[]).includes(value)) {
    return value as SortKey;
  }
  warnings.push(`sortKey: expected one of ${SORT_CYCLE.join(', ')}, ignoring`);
  return fallback;
};

export type ConfigResult = {
  readonly config: Config;
  /** Sanitized, one line each. Printed to stderr; never rendered into a frame. */
  readonly warnings: readonly string[];
};

/** Validate parsed JSON into a Config. Exported for direct testing. */
export const validateConfig = (parsed: unknown): ConfigResult => {
  const warnings: string[] = [];

  if (!isRecord(parsed)) {
    return { config: DEFAULT_CONFIG, warnings: ['config must be a JSON object, using defaults'] };
  }

  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key)) {
      warnings.push(`${sanitizeName(key)}: refused`);
    } else if (!(key in DEFAULT_CONFIG)) {
      warnings.push(`${sanitizeName(key)}: unknown option, ignoring`);
    }
  }

  return {
    // Read field by field. A spread or a recursive merge is what turns a
    // "__proto__" own-property into actual prototype pollution.
    config: {
      showHidden: readBoolean(parsed, 'showHidden', DEFAULT_CONFIG.showHidden, warnings),
      sortKey: readSortKey(parsed, DEFAULT_CONFIG.sortKey, warnings),
      sortReverse: readBoolean(parsed, 'sortReverse', DEFAULT_CONFIG.sortReverse, warnings),
      previewMinWidth: readNumber(
        parsed,
        'previewMinWidth',
        DEFAULT_CONFIG.previewMinWidth,
        20,
        500,
        warnings,
      ),
      listFraction: readNumber(
        parsed,
        'listFraction',
        DEFAULT_CONFIG.listFraction,
        0.1,
        0.9,
        warnings,
      ),
      scrollMargin: readNumber(parsed, 'scrollMargin', DEFAULT_CONFIG.scrollMargin, 0, 20, warnings),
    },
    warnings,
  };
};

/** Size cap: a config file is a handful of keys, not a payload. */
const MAX_CONFIG_BYTES = 64 * 1024;

/** Load and validate the config. Never rejects. */
export const loadConfig = async (file: string = configPath()): Promise<ConfigResult> => {
  let text: string;
  try {
    text = await readFile(file, { encoding: 'utf8' });
  } catch (error) {
    // No config file is the normal case, not a problem worth mentioning.
    if (errnoOf(error) === 'ENOENT') return { config: DEFAULT_CONFIG, warnings: [] };
    return {
      config: DEFAULT_CONFIG,
      warnings: [`cannot read ${sanitizeName(file)}, using defaults`],
    };
  }

  if (text.length > MAX_CONFIG_BYTES) {
    return { config: DEFAULT_CONFIG, warnings: ['config file is implausibly large, using defaults'] };
  }

  try {
    return validateConfig(JSON.parse(text));
  } catch {
    // Malformed JSON. The parser's message can embed file content, so it is not
    // repeated back.
    return { config: DEFAULT_CONFIG, warnings: ['config is not valid JSON, using defaults'] };
  }
};
