import { Box, Text } from 'ink';
import type { Entry } from '../state/reducer.js';
import { Row } from './Row.js';
import { theme } from './theme.js';

export type ListProps = {
  /** ONLY the rows in the viewport. Slicing happens before this component. */
  readonly rows: readonly Entry[];
  readonly selectedName: string | null;
  readonly width: number;
  readonly emptyLabel: string;
};

/**
 * Renders exactly the rows it is given and nothing else.
 *
 * The windowing lives in `state/selectors.ts` and is applied by the caller, so
 * this component cannot accidentally map over 40,000 entries — it never sees
 * them. That is the entire defence, and it is structural rather than careful.
 */
export const List = ({ rows, selectedName, width, emptyLabel }: ListProps) => {
  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        <Text {...theme.muted}>{emptyLabel}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.map((entry) => (
        <Row key={entry.name} entry={entry} selected={entry.name === selectedName} width={width} />
      ))}
    </Box>
  );
};
