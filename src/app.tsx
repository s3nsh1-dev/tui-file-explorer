import { Box, useApp, useInput, useStdin, useWindowSize } from 'ink';
import { useEffect, useReducer, useState } from 'react';
import { DEFAULT_CONFIG, type Config } from './core/config.js';
import { describeFsError } from './core/errors.js';
import { readDirectory } from './core/fs.js';
import { childOf, displayPath, parentOf } from './core/path.js';
import { cursorIndex, initialState, reducer, selectedEntry } from './state/reducer.js';
import { nextOffset, windowSlice } from './state/selectors.js';
import { Frame } from './ui/Frame.js';
import { Help } from './ui/Help.js';
import { List } from './ui/List.js';
import { Preview } from './ui/Preview.js';
import { StatusBar } from './ui/StatusBar.js';
import { usePreview } from './ui/hooks/usePreview.js';

/**
 * The root component: hooks, layout arithmetic, and JSX.
 *
 * After the S3-02 split this file holds no filesystem access, no path
 * manipulation and no text processing — those are `core/fs`, `core/path` and
 * `core/sanitize`. What is left is the part that genuinely needs React: wiring
 * state to effects to rendered output, and deciding how many cells each pane
 * gets.
 */

/** border(2) + header(1) + status(2). */
const CHROME_ROWS = 5;
/** Left and right border columns. */
const CHROME_COLUMNS = 2;
/** Smallest usable inner width before layout arithmetic stops being meaningful. */
const MIN_INNER_WIDTH = 8;

export type AppProps = {
  readonly cwd: string;
  /**
   * User configuration. Defaults when omitted, so every existing test and
   * golden frame renders exactly as before (S3-16).
   */
  readonly config?: Config;
};

export const App = ({ cwd, config = DEFAULT_CONFIG }: AppProps) => {
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

  const [state, dispatch] = useReducer(reducer, { cwd, config }, ({ cwd: dir, config: c }) =>
    initialState(dir, c),
  );
  const { dir, mode, requestId, visible } = state;

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const entries = await readDirectory(dir);
        if (!cancelled) dispatch({ type: 'LOADED', requestId, entries });
      } catch (error) {
        // AGENTS.md §7: handle or rethrow. An uncaught rejection here kills the
        // process with the terminal still in raw mode.
        if (!cancelled)
          dispatch({
            type: 'FAILED',
            requestId,
            message: describeFsError(error, dir),
          });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // requestId, not just dir: navigating a -> b -> a must issue a NEW read of
    // `a` rather than reusing the effect, or the two reads of `a` race.
  }, [dir, requestId]);

  const selected = selectedEntry(state);
  const preview = usePreview(selected === undefined ? null : childOf(dir, selected.name));

  const innerWidth = Math.max(columns - CHROME_COLUMNS, MIN_INNER_WIDTH);
  const bodyHeight = Math.max(rows - CHROME_ROWS, 1);
  const showPreview = innerWidth >= config.previewMinWidth;
  const listWidth = showPreview ? Math.floor(innerWidth * config.listFraction) : innerWidth;
  const previewWidth = showPreview ? Math.max(innerWidth - listWidth - 2, 1) : 0;

  const cursor = cursorIndex(state);

  // Scroll offset is derived state that needs its own history: where the
  // viewport should sit depends on where it sat last time. React's documented
  // way to hold that is useState adjusted DURING render — not a ref, which the
  // hooks lint correctly rejects, and not an effect, which would render the
  // stale window first and then correct it as a visible jump.
  // Safe because nextOffset is idempotent: it converges in one extra render.
  const [offset, setOffset] = useState(0);
  const wantedOffset = nextOffset(offset, cursor, bodyHeight, visible.length, config.scrollMargin);
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
          dispatch({ type: 'NAVIGATE', dir: childOf(dir, selected.name) });
        }
        return;
      }

      if (key.leftArrow || input === 'h') {
        // parentOf returns null at the filesystem root, so "there is no parent"
        // is a value to handle rather than a condition to remember.
        const parent = parentOf(dir);
        if (parent !== null) dispatch({ type: 'NAVIGATE', dir: parent });
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
