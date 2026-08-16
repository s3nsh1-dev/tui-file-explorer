import type { Entry, Mode, SortKey, Status } from '../core/types.js';
import { compareEntries, nextSortKey } from '../core/sort.js';
import { clamp } from '../core/util.js';
import type { Action } from './actions.js';

export type State = {
  readonly dir: string;
  readonly status: Status;
  readonly error: string | undefined;
  /** Everything readdir returned, unfiltered and unsorted. */
  readonly entries: readonly Entry[];
  /**
   * DERIVED: entries after hidden-file filtering, text filtering and sorting.
   *
   * Stored rather than computed per render on purpose. It is recomputed only
   * inside `recompute()`, which runs on the transitions that can change it —
   * so a 40,000-entry directory pays for one sort per keypress instead of one
   * per render. Never assign to it outside `recompute()`.
   */
  readonly visible: readonly Entry[];
  /**
   * The cursor is anchored to a NAME, not an index (ADR-0006). An index points
   * at a different file after every sort or filter change; a name keeps the
   * user looking at what they were looking at.
   */
  readonly cursorName: string | null;
  readonly filter: string;
  /** What to restore if filter mode is cancelled with Escape. */
  readonly filterBackup: {
    readonly filter: string;
    readonly cursorName: string | null;
  } | null;
  /**
   * Monotonic id of the in-flight directory read.
   *
   * Incremented on every navigation. `LOADED`/`FAILED` carry the id they were
   * issued under and are DROPPED if it no longer matches — which is the only
   * defence against a slow read finishing after a faster, newer one.
   *
   * Note there is no AbortController here, deliberately: `fs.promises.readdir`
   * ignores an AbortSignal outright (verified — it resolves even when handed an
   * already-aborted signal), so cancellation is not available and discarding
   * the result is the whole mechanism.
   */
  readonly requestId: number;
  readonly sortKey: SortKey;
  readonly sortReverse: boolean;
  readonly showHidden: boolean;
  readonly mode: Mode;
};

export const initialState = (dir: string): State => ({
  dir,
  status: 'loading',
  error: undefined,
  entries: [],
  visible: [],
  cursorName: null,
  filter: '',
  filterBackup: null,
  requestId: 0,
  sortKey: 'name',
  sortReverse: false,
  showHidden: false,
  mode: 'normal',
});

/**
 * Re-anchor the cursor after the visible list changed.
 * Keeps the requested name if it survived; otherwise falls back to the first
 * row, which is why the cursor can never point past the end.
 */
const anchor = (visible: readonly Entry[], wanted: string | null): string | null => {
  if (visible.length === 0) return null;
  if (wanted !== null && visible.some((entry) => entry.name === wanted)) return wanted;
  return visible[0]?.name ?? null;
};

/**
 * The single place `visible` and `cursorName` are allowed to change together.
 * Every clamping invariant lives here, which is the entire argument for a
 * reducer over three useStates — see ADR-0006.
 */
const recompute = (state: State, keepCursorOn: string | null): State => {
  const needle = state.filter.toLowerCase();
  const filtered = state.entries.filter((entry) => {
    if (!state.showHidden && entry.name.startsWith('.')) return false;
    return needle === '' || entry.name.toLowerCase().includes(needle);
  });

  const visible = filtered.sort(compareEntries(state.sortKey, state.sortReverse));
  return { ...state, visible, cursorName: anchor(visible, keepCursorOn) };
};

/** Index of the cursor in the visible list, or -1 when nothing is selectable. */
export const cursorIndex = (state: State): number => {
  if (state.visible.length === 0) return -1;
  const index = state.visible.findIndex((entry) => entry.name === state.cursorName);
  return index >= 0 ? index : 0;
};

export const selectedEntry = (state: State): Entry | undefined => {
  const index = cursorIndex(state);
  return index < 0 ? undefined : state.visible[index];
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'NAVIGATE':
      // Sort key and hidden-file visibility are user preferences and survive.
      // The filter is about *this* listing and does not.
      return recompute(
        {
          ...state,
          dir: action.dir,
          requestId: state.requestId + 1,
          status: 'loading',
          error: undefined,
          entries: [],
          cursorName: null,
          filter: '',
          filterBackup: null,
          mode: 'normal',
        },
        null,
      );

    case 'LOADED':
      // Stale result from a superseded navigation. Dropped, not rendered.
      if (action.requestId !== state.requestId) return state;
      return recompute(
        {
          ...state,
          status: 'ready',
          error: undefined,
          entries: action.entries,
        },
        state.cursorName,
      );

    case 'FAILED':
      if (action.requestId !== state.requestId) return state;
      return recompute({ ...state, status: 'error', error: action.message, entries: [] }, null);

    case 'MOVE': {
      const index = cursorIndex(state);
      if (index < 0) return state;
      const target = clamp(index + action.delta, 0, state.visible.length - 1);
      return {
        ...state,
        cursorName: state.visible[target]?.name ?? state.cursorName,
      };
    }

    case 'MOVE_TO': {
      if (state.visible.length === 0) return state;
      const target = action.position === 'start' ? 0 : state.visible.length - 1;
      return {
        ...state,
        cursorName: state.visible[target]?.name ?? state.cursorName,
      };
    }

    case 'TOGGLE_HIDDEN':
      return recompute({ ...state, showHidden: !state.showHidden }, state.cursorName);

    case 'CYCLE_SORT':
      return recompute({ ...state, sortKey: nextSortKey(state.sortKey) }, state.cursorName);

    case 'REVERSE_SORT':
      return recompute({ ...state, sortReverse: !state.sortReverse }, state.cursorName);

    case 'SET_MODE':
      // Snapshot on the way in, so Escape can put everything back.
      if (action.mode === 'filter' && state.mode !== 'filter') {
        return {
          ...state,
          mode: 'filter',
          filterBackup: { filter: state.filter, cursorName: state.cursorName },
        };
      }
      return { ...state, mode: action.mode };

    case 'FILTER_INPUT':
      return recompute({ ...state, filter: action.value }, state.cursorName);

    case 'FILTER_COMMIT':
      return { ...state, mode: 'normal', filterBackup: null };

    case 'FILTER_CANCEL': {
      const backup = state.filterBackup;
      return recompute(
        {
          ...state,
          mode: 'normal',
          filter: backup?.filter ?? '',
          filterBackup: null,
        },
        backup?.cursorName ?? state.cursorName,
      );
    }
  }
};
