import { Box, Text } from 'ink';
import { sanitizeName, truncateToWidth } from '../core/sanitize.js';
import { isPresent, pluralise } from '../core/util.js';
import type { Mode, SortKey } from '../core/types.js';
import { theme } from './theme.js';

export type StatusBarProps = {
  readonly visible: number;
  readonly total: number;
  readonly sortKey: SortKey;
  readonly sortReverse: boolean;
  readonly showHidden: boolean;
  readonly filter: string;
  readonly mode: Mode;
  readonly width: number;
};

const KEY_HINTS = '↑↓ move   ⏎ open   ← up   / filter   . hidden   s sort   ? help   q quit';

export const StatusBar = ({
  visible,
  total,
  sortKey,
  sortReverse,
  showHidden,
  filter,
  mode,
  width,
}: StatusBarProps) => {
  // `1 item`, not `1 items` — the old inline template got this wrong for a
  // single-entry directory, which is exactly the sort of thing a shared helper
  // fixes once instead of in each place someone remembers.
  const counts =
    visible === total ? pluralise(total, 'item') : `${String(visible)}/${String(total)}`;

  const facts = [
    counts,
    `sort ${sortKey}${sortReverse ? ' ↓' : ' ↑'}`,
    showHidden ? 'hidden shown' : null,
    filter === '' ? null : `filter "${sanitizeName(filter)}"`,
  ].filter(isPresent);

  return (
    <Box flexDirection="column">
      <Text {...theme.muted}>{truncateToWidth(facts.join('  ·  '), width)}</Text>
      {mode === 'filter' ? (
        // The caret is a plain character, not a styled block: under NO_COLOR a
        // styled cursor would vanish entirely and the user would be typing blind.
        <Text {...theme.accent}>{truncateToWidth(`/${sanitizeName(filter)}▏`, width)}</Text>
      ) : (
        <Text {...theme.muted}>{truncateToWidth(KEY_HINTS, width)}</Text>
      )}
    </Box>
  );
};
