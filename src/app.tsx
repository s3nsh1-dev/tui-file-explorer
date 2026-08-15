import { readdir } from 'node:fs/promises';
import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';

/**
 * Stage 1 is deliberately one file. See v1_STAGE_1.md §4 — the correct module
 * boundaries are not knowable until Stage 2 shows which pieces vary together,
 * and a boundary guessed now is demolition work in Stage 3.
 */

export type Entry = {
  readonly name: string;
  readonly isDirectory: boolean;
};

export type AppProps = {
  readonly cwd: string;
};

/** Directories first, then case-insensitive by name. Fixed order in Stage 1. */
const compareEntries = (a: Entry, b: Entry): number => {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

export const App = ({ cwd }: AppProps): React.JSX.Element => {
  const [entries, setEntries] = useState<readonly Entry[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const dirents = await readdir(cwd, { withFileTypes: true });
      if (cancelled) return;

      const loaded = dirents.map((dirent) => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
      }));

      setEntries([...loaded].sort(compareEntries));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <Text key={entry.name}>
          {entry.name}
          {entry.isDirectory ? '/' : ''}
        </Text>
      ))}
    </Box>
  );
};
