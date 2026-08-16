import { lstat, open, readdir, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { useEffect, useState } from 'react';
import { describeFsError } from '../../core/errors.js';
import { sanitizeName } from '../../core/sanitize.js';

/**
 * Reads at most this many bytes, ever. Never `readFile` — a 4 GB log must not
 * become a 4 GB allocation just because the cursor passed over it (ADR-0005).
 */
const MAX_PREVIEW_BYTES = 64 * 1024;
/** A NUL in the first 8 KiB means binary. Cheap and near-universally correct. */
const NUL_SCAN_BYTES = 8 * 1024;
/** Read a fixed number of lines so a terminal resize does not re-read the file. */
const MAX_PREVIEW_LINES = 200;

export type Preview =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'directory';
      readonly names: readonly string[];
      readonly total: number;
    }
  | {
      readonly kind: 'text';
      readonly lines: readonly string[];
      readonly truncated: boolean;
    }
  | { readonly kind: 'binary'; readonly size: number }
  | { readonly kind: 'special'; readonly label: string }
  | { readonly kind: 'error'; readonly message: string };

const specialKindLabel = (stats: Stats): string => {
  if (stats.isFIFO()) return 'named pipe (FIFO)';
  if (stats.isSocket()) return 'socket';
  if (stats.isBlockDevice()) return 'block device';
  if (stats.isCharacterDevice()) return 'character device';
  return 'special file';
};

/**
 * Preview a path, refusing anything that could hang or flood us.
 *
 * The `isFile()` gate is the single most important line in this file. Opening a
 * FIFO or `/dev/zero` does not error — it blocks forever, in raw mode, with no
 * way out but killing the process from another terminal. The Stage 3 test for
 * this (adversary A9) fails by HANGING rather than going red.
 *
 * Never rejects. Every failure becomes an `error` preview, because a rejected
 * promise inside a render effect is an unhandled rejection, and an unhandled
 * rejection in a TUI kills the process with the terminal still in raw mode.
 */
export const readPreview = async (target: string): Promise<Preview> => {
  try {
    const link = await lstat(target);
    // Resolve one level so a symlink to a directory previews as a directory.
    // Cycle detection and depth caps are S3-07; one level cannot loop.
    const stats = link.isSymbolicLink() ? await stat(target) : link;

    if (stats.isDirectory()) {
      const names = await readdir(target);
      return {
        kind: 'directory',
        names: names.slice(0, MAX_PREVIEW_LINES).map(sanitizeName),
        total: names.length,
      };
    }

    if (!stats.isFile()) {
      return { kind: 'special', label: specialKindLabel(stats) };
    }

    if (stats.size === 0) {
      return { kind: 'text', lines: [], truncated: false };
    }

    const length = Math.min(MAX_PREVIEW_BYTES, stats.size);
    const handle = await open(target, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      const slice = buffer.subarray(0, bytesRead);

      if (slice.subarray(0, NUL_SCAN_BYTES).includes(0)) {
        return { kind: 'binary', size: stats.size };
      }

      const lines = slice
        .toString('utf8')
        .split(/\r?\n/)
        .slice(0, MAX_PREVIEW_LINES)
        .map(sanitizeName);

      return { kind: 'text', lines, truncated: stats.size > bytesRead };
    } finally {
      // finally, not after the return: a descriptor leaked on every preview
      // becomes EMFILE after a few hundred cursor moves (Stage 3 adversary A15).
      await handle.close();
    }
  } catch (error) {
    return { kind: 'error', message: describeFsError(error, target) };
  }
};

/**
 * Reads the preview for `target`, discarding results that arrive after a change.
 *
 * The stored value carries the target it belongs to, so "loading" is DERIVED
 * during render — the stored result simply belongs to a previous target. The
 * obvious alternative, `setPreview({kind:'loading'})` at the top of the effect,
 * is a synchronous setState inside an effect: it schedules a second render pass
 * for information already available during the first, and React's hooks lint
 * rejects it as a cascading render.
 */
export const usePreview = (target: string | null): Preview => {
  const [result, setResult] = useState<{
    readonly target: string | null;
    readonly preview: Preview;
  }>({ target: null, preview: { kind: 'idle' } });

  useEffect(() => {
    if (target === null) return;

    let cancelled = false;
    // setResult runs in the async continuation, never synchronously here.
    void readPreview(target).then((preview) => {
      if (!cancelled) setResult({ target, preview });
    });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (target === null) return { kind: 'idle' };
  return result.target === target ? result.preview : { kind: 'loading' };
};
