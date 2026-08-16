import { Text } from 'ink';
import { memo } from 'react';
import { displayWidth, sanitizeName, truncateToWidth } from '../core/sanitize.js';
import type { Entry } from '../core/types.js';
import { formatSize } from '../core/format.js';
import { theme } from './theme.js';

export type RowProps = {
  readonly entry: Entry;
  readonly selected: boolean;
  /** Cells available for the whole row, including marker and size column. */
  readonly width: number;
};

const MARKER_WIDTH = 2;

/**
 * One listing row.
 *
 * `memo` is not premature here — AGENTS.md §8: every parent state change
 * re-renders the whole tree, and an unmemoized row means the entire viewport is
 * rewritten on each cursor move, which is visible as flicker.
 *
 * Padding is computed from our own `displayWidth` rather than delegated to
 * Yoga's flexbox. Two reasons: golden frames must be byte-stable, and the size
 * column has to align even when a filename contains CJK or emoji, which are two
 * cells wide but one `String.length` each.
 */
export const Row = memo(({ entry, selected, width }: RowProps) => {
  const label = sanitizeName(entry.name) + (entry.isDirectory ? '/' : '');
  const size = entry.isDirectory ? '' : formatSize(entry.size);
  const sizeColumn = size === '' ? 0 : size.length + 1;

  const nameBudget = Math.max(width - MARKER_WIDTH - sizeColumn, 1);
  const name = truncateToWidth(label, nameBudget);

  const used = MARKER_WIDTH + displayWidth(name) + sizeColumn;
  const padding = ' '.repeat(Math.max(width - used, 0));

  const nameStyle = entry.isSymlink
    ? theme.symlink
    : entry.isDirectory
      ? theme.directory
      : theme.file;

  return (
    <Text {...(selected ? theme.selected : {})} wrap="truncate-end">
      {selected ? '❯ ' : '  '}
      <Text {...nameStyle}>{name}</Text>
      {padding}
      {size === '' ? '' : ' '}
      <Text {...theme.size}>{size}</Text>
    </Text>
  );
});

Row.displayName = 'Row';
