import { Box, Text } from 'ink';
import { truncateToWidth } from '../core/sanitize.js';
import { pluralise } from '../core/util.js';
import { formatSize } from '../core/format.js';
import type { PreviewState } from '../core/types.js';
import { theme } from './theme.js';

export type PreviewProps = {
  readonly preview: PreviewState;
  readonly width: number;
  readonly height: number;
};

const Placeholder = ({ children }: { readonly children: string }) => (
  <Text {...theme.muted}>{children}</Text>
);

/**
 * The right pane. Every branch here is a refusal to render something naively —
 * see `usePreview` for why binaries, devices and oversized files never reach a
 * `<Text>` as raw bytes.
 *
 * Lines are pre-truncated to the pane width rather than wrapped: a wrapped
 * preview line reflows the pane on every resize and makes golden frames
 * unstable, and a source file's 400th column is rarely worth three screen rows.
 */
export const Preview = ({ preview, width, height }: PreviewProps) => {
  const fit = (line: string): string => truncateToWidth(line, Math.max(width, 1));
  const rows = Math.max(height, 1);

  switch (preview.kind) {
    case 'idle':
      return <Placeholder>nothing selected</Placeholder>;

    case 'loading':
      return <Placeholder>loading…</Placeholder>;

    case 'binary':
      return <Placeholder>{fit(`binary file · ${formatSize(preview.size)}`)}</Placeholder>;

    case 'special':
      // Deliberately not read. Opening a FIFO or device blocks forever.
      return <Placeholder>{fit(`${preview.label} · not previewed`)}</Placeholder>;

    case 'error':
      return <Text {...theme.error}>{fit(preview.message)}</Text>;

    case 'directory': {
      const shown = preview.names.slice(0, rows - 1);
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>{fit(pluralise(preview.total, 'item'))}</Text>
          {shown.map((name) => (
            <Text key={name} {...theme.directory}>
              {fit(name)}
            </Text>
          ))}
        </Box>
      );
    }

    case 'text': {
      if (preview.lines.length === 0) {
        return <Placeholder>empty file</Placeholder>;
      }
      const shown = preview.lines.slice(0, preview.truncated ? rows - 1 : rows);
      return (
        <Box flexDirection="column">
          {shown.map((line, index) => (
            // Index is part of the key because two lines can be identical.
            <Text key={`${String(index)}:${line}`}>{fit(line)}</Text>
          ))}
          {preview.truncated && <Text {...theme.muted}>{fit('… truncated at 64 KB')}</Text>}
        </Box>
      );
    }
  }
};
