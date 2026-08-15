import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Box, Text, useInput } from 'ink';
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

/** `/home/you/projects` → `~/projects`. Cosmetic only; never used for I/O. */
const displayPath = (target: string): string => {
  const home = os.homedir();
  if (target === home) return '~';
  if (target.startsWith(home + path.sep)) return `~${target.slice(home.length)}`;
  return target;
};

export const App = ({ cwd }: AppProps): React.JSX.Element => {
  const [dir, setDir] = useState(cwd);
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const dirents = await readdir(dir, { withFileTypes: true });
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
  }, [dir]);

  // One input owner for the whole app — AGENTS.md §8. Stacking a second
  // useInput anywhere in the tree makes every keypress fire twice.
  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      setCursor((current) => Math.min(current + 1, Math.max(entries.length - 1, 0)));
      return;
    }

    if (key.upArrow || input === 'k') {
      setCursor((current) => Math.max(current - 1, 0));
      return;
    }

    if (key.return || key.rightArrow || input === 'l') {
      const entry = entries[cursor];
      // noUncheckedIndexedAccess makes the undefined case explicit: an empty
      // directory has no entry under the cursor at all.
      if (entry?.isDirectory === true) {
        setDir(path.join(dir, entry.name));
        setCursor(0);
      }
      return;
    }

    if (key.leftArrow || input === 'h') {
      const parent = path.dirname(dir);
      // At the filesystem root, dirname('/') === '/'. Stop rather than loop.
      if (parent !== dir) {
        setDir(parent);
        setCursor(0);
      }
    }
  });

  return (
    <Box flexDirection="column">
      {/* truncate-start keeps the tail of a long path — the part that says
          where you actually are. Wrapping would reflow the whole listing. */}
      <Text bold wrap="truncate-start">
        glim {displayPath(dir)}
      </Text>
      {entries.map((entry, index) => (
        <Text key={entry.name}>
          {index === cursor ? '❯ ' : '  '}
          {entry.name}
          {entry.isDirectory ? '/' : ''}
        </Text>
      ))}
    </Box>
  );
};
