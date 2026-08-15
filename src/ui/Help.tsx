import { Box, Text } from 'ink';
import { truncateToWidth } from '../core/sanitize.js';
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

export const Help = ({ width }: { readonly width: number }) => (
  <Box flexDirection="column">
    <Text {...theme.header}>Keys</Text>
    <Text> </Text>
    {BINDINGS.map(([keys, description]) => (
      <Text key={keys}>
        <Text {...theme.accent}>{keys.padEnd(LABEL_WIDTH)}</Text>
        {truncateToWidth(description, Math.max(width - LABEL_WIDTH, 1))}
      </Text>
    ))}
    <Text> </Text>
    <Text {...theme.muted}>glim is read-only: it never deletes, renames or writes.</Text>
  </Box>
);
