import { lstat, open, readdir, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { describeFsError } from './errors.js';
import { sanitizeName } from './sanitize.js';
import type { PreviewState } from './types.js';

/**
 * Bounded, guarded reading for the preview pane. Pure I/O, no React.
 *
 * Moved out of `ui/hooks/usePreview.ts` at S3-02; the hook is now a thin
 * wrapper over this. Behaviour unchanged.
 */

/**
 * Never read more than this, ever. Not `readFile` — a 4 GB log must not become
 * a 4 GB allocation just because the cursor passed over it (ADR-0005).
 */
const MAX_PREVIEW_BYTES = 64 * 1024;
/** A NUL in the first 8 KiB means binary. Cheap and near-universally correct. */
const NUL_SCAN_BYTES = 8 * 1024;
/** Fixed line budget, so a terminal resize does not re-read the file. */
const MAX_PREVIEW_LINES = 200;

const specialKindLabel = (stats: Stats): string => {
  if (stats.isFIFO()) return 'named pipe (FIFO)';
  if (stats.isSocket()) return 'socket';
  if (stats.isBlockDevice()) return 'block device';
  if (stats.isCharacterDevice()) return 'character device';
  return 'special file';
};

/** Read a bounded prefix of a regular file and classify it. */
const readRegularFile = async (target: string, size: number): Promise<PreviewState> => {
  const length = Math.min(MAX_PREVIEW_BYTES, size);
  // 'r' is the only flag this app ever opens with — ADR-0005.
  const handle = await open(target, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const slice = buffer.subarray(0, bytesRead);

    if (slice.subarray(0, NUL_SCAN_BYTES).includes(0)) {
      return { kind: 'binary', size };
    }

    const lines = slice.toString('utf8').split(/\r?\n/).slice(0, MAX_PREVIEW_LINES).map(sanitizeName);
    return { kind: 'text', lines, truncated: size > bytesRead };
  } finally {
    // `finally`, not after the return: a descriptor leaked on every preview is
    // EMFILE after a few hundred cursor moves (Stage 3 adversary A15).
    await handle.close();
  }
};

/**
 * Preview a path, refusing anything that could hang or flood us.
 *
 * The `isFile()` gate is the single most important line here. Opening a FIFO or
 * `/dev/zero` does not error — it blocks forever, in raw mode, with no way out
 * but killing the process from another terminal. The test for this (adversary
 * A9) fails by HANGING rather than going red.
 *
 * Never rejects. Every failure becomes an `error` preview, because a rejected
 * promise inside a render effect is an unhandled rejection, and an unhandled
 * rejection in a TUI kills the process with the terminal still in raw mode.
 */
export const readPreview = async (target: string): Promise<PreviewState> => {
  try {
    const link = await lstat(target);
    // Resolve one level so a symlink to a directory previews as a directory.
    // One level cannot loop; deeper chains are guarded at S3-10.
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

    return await readRegularFile(target, stats.size);
  } catch (error) {
    return { kind: 'error', message: describeFsError(error, target) };
  }
};
