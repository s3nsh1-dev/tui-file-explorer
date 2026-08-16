import type { Entry, SortKey } from './types.js';

/**
 * Entry ordering. Pure, and shared by the reducer and the non-TTY plain
 * listing — the two must agree, or `glim | head` would show a different order
 * from the interactive view of the same directory.
 */

/** The cycle order for the `s` key. The array order IS the cycle. */
export const SORT_CYCLE: readonly SortKey[] = ['name', 'size', 'mtime', 'ext'];

export const nextSortKey = (current: SortKey): SortKey => {
  const position = SORT_CYCLE.indexOf(current);
  return SORT_CYCLE[(position + 1) % SORT_CYCLE.length] ?? 'name';
};

const byName = (a: Entry, b: Entry): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  // `> 0`, not `>= 0`: a leading dot makes a hidden file, not an extension.
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/** Every comparator falls back to name, so ordering is total and looks stable. */
const COMPARATORS: Record<SortKey, (a: Entry, b: Entry) => number> = {
  name: byName,
  size: (a, b) => b.size - a.size || byName(a, b),
  mtime: (a, b) => b.mtimeMs - a.mtimeMs || byName(a, b),
  ext: (a, b) => extensionOf(a.name).localeCompare(extensionOf(b.name)) || byName(a, b),
};

/**
 * Directories first under every key and in BOTH directions.
 *
 * Reversing the sort should reorder files, not scatter directories through
 * them — so the directory test happens before the reverse is applied.
 */
export const compareEntries =
  (key: SortKey, reverse: boolean) =>
  (a: Entry, b: Entry): number => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    const result = COMPARATORS[key](a, b);
    return reverse ? -result : result;
  };

/** Non-mutating sort. Callers never have to remember to copy first. */
export const sortEntries = (
  entries: readonly Entry[],
  key: SortKey,
  reverse = false,
): readonly Entry[] => [...entries].sort(compareEntries(key, reverse));
