import type { Entry, Mode } from './reducer.js';

/**
 * Every way the state can change. A discriminated union rather than loose
 * setters, so `noFallthroughCasesInSwitch` and exhaustiveness checking make an
 * unhandled action a compile error instead of a silent no-op.
 */
export type Action =
  /** A navigation began. Clears entries so the UI can show a loading state. */
  | { readonly type: 'NAVIGATE'; readonly dir: string }
  /** readdir resolved. `dir` is echoed so a stale result can be ignored. */
  | {
      readonly type: 'LOADED';
      readonly dir: string;
      readonly entries: readonly Entry[];
    }
  /** readdir rejected, with a message already sanitized by the caller. */
  | { readonly type: 'FAILED'; readonly dir: string; readonly message: string }
  | { readonly type: 'MOVE'; readonly delta: number }
  | { readonly type: 'MOVE_TO'; readonly position: 'start' | 'end' }
  | { readonly type: 'TOGGLE_HIDDEN' }
  | { readonly type: 'CYCLE_SORT' }
  | { readonly type: 'REVERSE_SORT' }
  | { readonly type: 'SET_MODE'; readonly mode: Mode }
  | { readonly type: 'FILTER_INPUT'; readonly value: string }
  | { readonly type: 'FILTER_COMMIT' }
  | { readonly type: 'FILTER_CANCEL' };
