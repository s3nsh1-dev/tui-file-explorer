import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { sanitizeName, truncateToWidth } from '../core/sanitize.js';
import { theme } from './theme.js';

export type FrameProps = {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly notice: string | null;
  readonly body: ReactNode;
  readonly status: ReactNode;
};

/**
 * The outer chrome: border, header, body, status.
 *
 * Fixed `width`/`height` rather than letting the box size itself. Ink writes
 * whatever the layout produces, so a frame that is one row taller than the
 * terminal scrolls the previous frame into view and the display tears.
 */
const TITLE = 'glim ';

export const Frame = ({ path, width, height, notice, body, status }: FrameProps) => {
  // Text budgets are measured against the INNER width. Using the outer width
  // here left the header a column short of the body rows and the right edge
  // came out ragged — visible only once it was rendered, not in any assertion.
  const inner = Math.max(width - 2, 1);
  const pathBudget = Math.max(inner - TITLE.length, 1);

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round">
      <Text {...theme.header}>
        {TITLE}
        {truncateToWidth(sanitizeName(path), pathBudget, 'start')}
      </Text>
      {notice !== null && <Text {...theme.muted}>{truncateToWidth(notice, inner)}</Text>}
      <Box flexGrow={1} flexDirection="row" overflow="hidden">
        {body}
      </Box>
      {status}
    </Box>
  );
};
