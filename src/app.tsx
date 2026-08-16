import { lstat, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Box, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { useEffect, useReducer, useState } from 'react';
import { describeFsError } from './core/errors.js';
import { sanitizeName } from './core/sanitize.js';
import type { Entry } from './state/reducer.js';
import { cursorIndex, initialState, reducer, selectedEntry } from './state/reducer.js';
import { nextOffset, windowSlice } from './state/selectors.js';
import { Frame } from './ui/Frame.js';
import { Help } from './ui/Help.js';
import { List } from './ui/List.js';
import { Preview } from './ui/Preview.js';
import { StatusBar } from './ui/StatusBar.js';
import { usePreview } from './ui/hooks/usePreview.js';

export type { Entry } from './state/reducer.js';

/** border(2) + header(1) + status(2). */
const CHROME_ROWS = 5;
/** Left and right border columns. */
const CHROME_COLUMNS = 2;
/** Rows the cursor keeps between itself and the viewport edge while scrolling. */
const SCROLL_MARGIN = 2;
/** Below this inner width the preview pane is dropped rather than crushed. */
const PREVIEW_MIN_WIDTH = 70;
/** Share of the inner width given to the listing when both panes are shown. */
const LIST_FRACTION = 0.45;
/** Concurrent stat() calls. Unbounded Promise.all on 40k entries is EMFILE. */
const STAT_CONCURRENCY = 64;

export type AppProps = {
  readonly cwd: string;
};

export type TargetResult =
  { readonly ok: true; readonly path: string } | { readonly ok: false; readonly message: string };

/**
 * Validate the CLI path argument before Ink mounts.
 *
 * Failing here means one clean stderr line and a non-zero exit — not a React
 * error boundary, and not a half-drawn TUI over a terminal already in raw mode.
 */
export const resolveTarget = async (input: string): Promise<TargetResult> => {
  const resolved = path.resolve(input);
  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return {
        ok: false,
        message: `not a directory: ${sanitizeName(resolved)}`,
      };
    }
    return { ok: true, path: resolved };
  } catch (error) {
    return { ok: false, message: describeFsError(error, resolved) };
  }
};

/** `/home/you/projects` → `~/projects`. Cosmetic only; never used for I/O. */
const displayPath = (target: string): string => {
  const home = os.homedir();
  if (target === home) return '~';
  if (target.startsWith(home + path.sep)) return `~${target.slice(home.length)}`;
  return target;
};

/**
 * List a directory with the size and mtime that sorting needs.
 *
 * `readdir` gives names and types but no size, so every entry needs a stat.
 * Batched rather than one big `Promise.all`: 40,000 simultaneous opens is
 * EMFILE, which would turn a large directory into a crash instead of a wait.
 */
const readDirectory = async (dir: string): Promise<readonly Entry[]> => {
  const dirents = await readdir(dir, { withFileTypes: true });
  const entries: Entry[] = [];

  for (let index = 0; index < dirents.length; index += STAT_CONCURRENCY) {
    const batch = dirents.slice(index, index + STAT_CONCURRENCY);

    const resolved = await Promise.all(
      batch.map(async (dirent): Promise<Entry> => {
        const full = path.join(dir, dirent.name);
        const isSymlink = dirent.isSymbolicLink();
        let isDirectory = dirent.isDirectory();

        if (isSymlink) {
          try {
            // readdir reports link-type, so a symlink to a directory would
            // otherwise sort and navigate as a file.
            isDirectory = (await stat(full)).isDirectory();
          } catch {
            // Dangling symlink. Not an error worth failing the listing over —
            // it is shown as a non-directory and previewing reports why.
            isDirectory = false;
          }
        }

        try {
          const stats = await lstat(full);
          return {
            name: dirent.name,
            isDirectory,
            isSymlink,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          };
        } catch {
          // Raced with a delete between readdir and lstat. One unreadable entry
          // must not fail the whole listing; show it with unknown size.
          return {
            name: dirent.name,
            isDirectory,
            isSymlink,
            size: 0,
            mtimeMs: 0,
          };
        }
      }),
    );

    entries.push(...resolved);
  }

  return entries;
};

export const App = ({ cwd }: AppProps) => {
  const { exit } = useApp();
  const stdin = useStdin();
  const { columns, rows } = useWindowSize();

  // Ink types isRawModeSupported as `boolean`, but assigns it from stdin.isTTY
  // (App.js:121), which Node sets to UNDEFINED — never false — on a non-TTY
  // stream. Routed through `unknown` and narrowed: Boolean() would be flagged
  // as a redundant conversion, which is the type system confidently repeating
  // Ink's mistake. See docs/version/stage1.md §5.
  const rawModeFlag: unknown = stdin.isRawModeSupported;
  const canReadInput = rawModeFlag === true;

  const [state, dispatch] = useReducer(reducer, cwd, initialState);
  const { dir, mode, visible } = state;

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const entries = await readDirectory(dir);
        if (!cancelled) dispatch({ type: 'LOADED', dir, entries });
      } catch (error) {
        // AGENTS.md §7: handle or rethrow. An uncaught rejection here kills the
        // process with the terminal still in raw mode.
        if (!cancelled)
          dispatch({
            type: 'FAILED',
            dir,
            message: describeFsError(error, dir),
          });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [dir]);

  const selected = selectedEntry(state);
  const preview = usePreview(selected === undefined ? null : path.join(dir, selected.name));

  const innerWidth = Math.max(columns - CHROME_COLUMNS, 8);
  const bodyHeight = Math.max(rows - CHROME_ROWS, 1);
  const showPreview = innerWidth >= PREVIEW_MIN_WIDTH;
  const listWidth = showPreview ? Math.floor(innerWidth * LIST_FRACTION) : innerWidth;
  const previewWidth = showPreview ? Math.max(innerWidth - listWidth - 2, 1) : 0;

  const cursor = cursorIndex(state);

  // Scroll offset is derived state that needs its own history: where the
  // viewport should sit depends on where it sat last time. React's documented
  // way to hold that is useState adjusted DURING render — not a ref, which the
  // hooks lint correctly rejects, and not an effect, which would render the
  // stale window first and then correct it as a visible jump.
  // Safe because nextOffset is idempotent: it converges in one extra render.
  const [offset, setOffset] = useState(0);
  const wantedOffset = nextOffset(offset, cursor, bodyHeight, visible.length, SCROLL_MARGIN);
  if (wantedOffset !== offset) setOffset(wantedOffset);

  const windowRows = windowSlice(visible, wantedOffset, bodyHeight);

  useInput(
    (input, key) => {
      // One input owner, dispatching by mode (AGENTS.md §8). A second useInput
      // mounted inside the filter component would fire on every keypress too.
      if (mode === 'help') {
        dispatch({ type: 'SET_MODE', mode: 'normal' });
        return;
      }

      if (mode === 'filter') {
        if (key.escape) {
          dispatch({ type: 'FILTER_CANCEL' });
          return;
        }
        if (key.return) {
          dispatch({ type: 'FILTER_COMMIT' });
          return;
        }
        if (key.backspace || key.delete) {
          dispatch({ type: 'FILTER_INPUT', value: state.filter.slice(0, -1) });
          return;
        }
        if (key.downArrow) {
          dispatch({ type: 'MOVE', delta: 1 });
          return;
        }
        if (key.upArrow) {
          dispatch({ type: 'MOVE', delta: -1 });
          return;
        }
        // Printable input only: control chords must not end up in the query.
        if (input !== '' && !key.ctrl && !key.meta) {
          dispatch({ type: 'FILTER_INPUT', value: state.filter + input });
        }
        return;
      }

      if (input === 'q') {
        exit();
        return;
      }
      if (key.downArrow || input === 'j') {
        dispatch({ type: 'MOVE', delta: 1 });
        return;
      }
      if (key.upArrow || input === 'k') {
        dispatch({ type: 'MOVE', delta: -1 });
        return;
      }
      if (key.pageDown) {
        dispatch({ type: 'MOVE', delta: bodyHeight });
        return;
      }
      if (key.pageUp) {
        dispatch({ type: 'MOVE', delta: -bodyHeight });
        return;
      }
      if (input === 'g') {
        dispatch({ type: 'MOVE_TO', position: 'start' });
        return;
      }
      if (input === 'G') {
        dispatch({ type: 'MOVE_TO', position: 'end' });
        return;
      }
      if (input === '.') {
        dispatch({ type: 'TOGGLE_HIDDEN' });
        return;
      }
      if (input === 's') {
        dispatch({ type: 'CYCLE_SORT' });
        return;
      }
      if (input === 'S') {
        dispatch({ type: 'REVERSE_SORT' });
        return;
      }
      if (input === '/') {
        dispatch({ type: 'SET_MODE', mode: 'filter' });
        return;
      }
      if (input === '?') {
        dispatch({ type: 'SET_MODE', mode: 'help' });
        return;
      }

      if (key.return || key.rightArrow || input === 'l') {
        if (selected?.isDirectory === true) {
          dispatch({ type: 'NAVIGATE', dir: path.join(dir, selected.name) });
        }
        return;
      }

      if (key.leftArrow || input === 'h') {
        const parent = path.dirname(dir);
        // At the filesystem root dirname('/') === '/'. Stop rather than loop.
        if (parent !== dir) dispatch({ type: 'NAVIGATE', dir: parent });
      }
    },
    { isActive: canReadInput },
  );

  const emptyLabel =
    state.status === 'loading'
      ? 'loading…'
      : state.status === 'error'
        ? (state.error ?? 'unreadable')
        : state.filter === ''
          ? 'empty directory'
          : 'no matches';

  return (
    <Frame
      path={displayPath(dir)}
      width={columns}
      height={rows}
      notice={canReadInput ? null : 'input unavailable — stdin is not a TTY (read-only listing)'}
      status={
        <StatusBar
          visible={visible.length}
          total={state.entries.length}
          sortKey={state.sortKey}
          sortReverse={state.sortReverse}
          showHidden={state.showHidden}
          filter={state.filter}
          mode={mode}
          width={innerWidth}
        />
      }
      body={
        mode === 'help' ? (
          <Help width={innerWidth} height={bodyHeight} />
        ) : (
          <>
            <Box flexDirection="column" width={listWidth}>
              {/* One column narrower than the box: the size column would
                  otherwise sit flush against the pane divider. */}
              <List
                rows={windowRows}
                selectedName={state.cursorName}
                width={listWidth - 1}
                emptyLabel={emptyLabel}
              />
            </Box>
            {showPreview && (
              <Box
                flexDirection="column"
                width={previewWidth + 2}
                paddingLeft={1}
                borderStyle="single"
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                overflow="hidden"
              >
                <Preview preview={preview} width={previewWidth} height={bodyHeight} />
              </Box>
            )}
          </>
        )
      }
    />
  );
};
