import { Box, Text } from 'ink';
import { sanitizeName, truncateToWidth } from '../core/sanitize.js';
import type { Mode, SortKey } from '../state/reducer.js';
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
  const counts =
    visible === total ? `${String(total)} items` : `${String(visible)}/${String(total)}`;

  const facts = [
    counts,
    `sort ${sortKey}${sortReverse ? ' ↓' : ' ↑'}`,
    showHidden ? 'hidden shown' : null,
    filter === '' ? null : `filter "${sanitizeName(filter)}"`,
  ].filter((part): part is string => part !== null);

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
