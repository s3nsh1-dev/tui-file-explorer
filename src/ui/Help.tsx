import { Box, Text } from 'ink';
import { truncateToWidth } from '../core/sanitize.js';
import type { Style } from './theme.js';
import { theme } from './theme.js';

const BINDINGS: readonly (readonly [string, string])[] = [
  ['↑ ↓  k j', 'move the cursor'],
  ['g  G', 'jump to first / last entry'],
  ['⏎ →  l', 'open the highlighted directory'],
  ['←  h', 'go to the parent directory'],
  ['/', 'filter — ⏎ keeps it, ⎋ cancels'],
  ['.', 'show or hide dotfiles'],
  ['s  S', 'cycle sort key / reverse it'],
  ['?', 'close this help'],
  ['q  Ctrl-C', 'quit'],
];

const LABEL_WIDTH = 12;
const FOOTER = 'glim is read-only: it never deletes, renames or writes.';

type Line = {
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly style: Style;
};

export type HelpProps = {
  readonly width: number;
  /** Rows available. Surplus content is dropped, never overflowed. */
  readonly height: number;
};

/**
 * Keymap overlay, clipped to the rows it is actually given.
 *
 * Height-awareness here is required, not polite. Ink does not cleanly truncate
 * a column taller than its container — the surplus rows are laid out over the
 * ones above them, producing interleaved text. In a 10-row terminal this
 * overlay rendered "go to the parent directorytory" and turned "Keys" into
 * " eys". Found by asserting on the frame in an error state at 60x10.
 */
export const Help = ({ width, height }: HelpProps) => {
  // Spacers are list ENTRIES, not layout margins, so they are subject to the
  // same height budget as everything else. A margin would survive clipping and
  // push a real row off the bottom.
  const lines: readonly Line[] = [
    { key: 'title', label: 'Keys', description: null, style: theme.header },
    { key: 'gap-1', label: ' ', description: null, style: {} },
    ...BINDINGS.map(([label, description]) => ({
      key: label,
      label,
      description,
      style: theme.accent,
    })),
    { key: 'gap-2', label: ' ', description: null, style: {} },
    { key: 'footer', label: FOOTER, description: null, style: theme.muted },
  ];

  return (
    <Box flexDirection="column">
      {lines.slice(0, Math.max(height, 1)).map((line) =>
        line.description === null ? (
          <Text key={line.key} {...line.style}>
            {truncateToWidth(line.label, width)}
          </Text>
        ) : (
          <Text key={line.key}>
            <Text {...line.style}>{line.label.padEnd(LABEL_WIDTH)}</Text>
            {truncateToWidth(line.description, Math.max(width - LABEL_WIDTH, 1))}
          </Text>
        ),
      )}
    </Box>
  );
};
