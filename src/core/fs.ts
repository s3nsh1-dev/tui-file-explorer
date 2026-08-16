import { lstat, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Entry } from './types.js';

/**
 * Directory listing. Pure I/O — no React, no Ink, no rendering concerns.
 *
 * Moved out of `app.tsx` at S3-02. Behaviour is unchanged; the golden frames
 * are the proof, and any byte that differs means the move was wrong.
 */

/**
 * Concurrent `stat` calls per batch.
 *
 * `readdir` returns names and types but no size, so sorting by size or mtime
 * needs a stat per entry. An unbounded `Promise.all` over 40 000 entries opens
 * 40 000 descriptors at once and hits `EMFILE` — a large directory would crash
 * instead of merely taking a moment. 64 is comfortably under the usual 1024
 * soft limit while still saturating a disk.
 */
const STAT_CONCURRENCY = 64;

/** Metadata for one entry, with every failure already turned into a value. */
const describeEntry = async (dir: string, dirent: { name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }): Promise<Entry> => {
  const full = path.join(dir, dirent.name);
  const isSymlink = dirent.isSymbolicLink();
  let isDirectory = dirent.isDirectory();

  if (isSymlink) {
    try {
      // readdir reports the LINK's type, so a symlink to a directory would
      // otherwise sort among the files and refuse to open.
      isDirectory = (await stat(full)).isDirectory();
    } catch {
      // Dangling symlink. Not worth failing the whole listing over — it shows
      // as a non-directory, and previewing it reports why.
      isDirectory = false;
    }
  }

  try {
    // lstat, not stat: we want the LINK's own size and mtime, not its target's.
    const stats = await lstat(full);
    return { name: dirent.name, isDirectory, isSymlink, size: stats.size, mtimeMs: stats.mtimeMs };
  } catch {
    // Raced with a delete between readdir and lstat. One unreadable entry must
    // not fail the listing; show it with unknown size.
    return { name: dirent.name, isDirectory, isSymlink, size: 0, mtimeMs: 0 };
  }
};

/**
 * List a directory with the metadata sorting needs.
 *
 * Rejects only if `readdir` itself fails — a per-entry failure degrades to a
 * zero-size row rather than taking the listing down with it.
 */
export const readDirectory = async (dir: string): Promise<readonly Entry[]> => {
  const dirents = await readdir(dir, { withFileTypes: true });
  const entries: Entry[] = [];

  for (let index = 0; index < dirents.length; index += STAT_CONCURRENCY) {
    const batch = dirents.slice(index, index + STAT_CONCURRENCY);
    entries.push(...(await Promise.all(batch.map((dirent) => describeEntry(dir, dirent)))));
  }

  return entries;
};
