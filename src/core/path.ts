import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describeFsError } from './errors.js';
import { sanitizeName } from './sanitize.js';
import type { TargetResult } from './types.js';

/**
 * Path handling. Pure except for `resolveTarget`, which touches the filesystem
 * once at startup.
 *
 * Moved out of `app.tsx` at S3-02, behaviour unchanged.
 */

/**
 * Validate the CLI path argument BEFORE Ink mounts.
 *
 * Order matters: failing after mount means printing an error over a terminal
 * already switched into raw mode and the alternate screen, which the user
 * cannot read. Failing here is one clean stderr line and a non-zero exit.
 */
export const resolveTarget = async (input: string): Promise<TargetResult> => {
  const resolved = path.resolve(input);
  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, message: `not a directory: ${sanitizeName(resolved)}` };
    }
    return { ok: true, path: resolved };
  } catch (error) {
    return { ok: false, message: describeFsError(error, resolved) };
  }
};

/**
 * `/home/you/projects` → `~/projects`.
 *
 * Cosmetic only. This value is never used for I/O — expanding `~` back into a
 * real path is a whole class of bug (`~` is a shell convention, not a
 * filesystem one), so the abbreviated form exists solely to be printed.
 */
export const displayPath = (target: string): string => {
  const home = os.homedir();
  if (target === home) return '~';
  if (target.startsWith(home + path.sep)) return `~${target.slice(home.length)}`;
  return target;
};

/**
 * The parent directory, or `null` at the filesystem root.
 *
 * `path.dirname('/')` returns `'/'`, so the naive version loops forever at the
 * top. Returning `null` makes "there is no parent" a value the caller must
 * handle rather than a condition it must remember to check.
 */
export const parentOf = (dir: string): string | null => {
  const parent = path.dirname(dir);
  return parent === dir ? null : parent;
};

/** Path of a child entry. Always `path.join`, never string concatenation. */
export const childOf = (dir: string, name: string): string => path.join(dir, name);
