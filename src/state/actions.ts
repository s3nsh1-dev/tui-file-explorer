import type { Entry, Mode } from '../core/types.js';

/**
 * Every way the state can change. A discriminated union rather than loose
 * setters, so `noFallthroughCasesInSwitch` and exhaustiveness checking make an
 * unhandled action a compile error instead of a silent no-op.
 */
export type Action =
  /** A navigation began. Clears entries so the UI can show a loading state. */
  | { readonly type: 'NAVIGATE'; readonly dir: string }
  /**
   * readdir resolved. Carries the `requestId` it was issued under, so a result
   * that arrives after a newer navigation can be dropped.
   *
   * Echoing the directory is NOT sufficient: navigating a -> b -> a issues two
   * reads of `a`, and if the first resolves last it overwrites the newer one
   * with staler contents. Only a monotonic id distinguishes them.
   */
  | {
      readonly type: 'LOADED';
      readonly requestId: number;
      readonly entries: readonly Entry[];
    }
  /** readdir rejected, with a message already sanitized by the caller. */
  | { readonly type: 'FAILED'; readonly requestId: number; readonly message: string }
  | { readonly type: 'MOVE'; readonly delta: number }
  | { readonly type: 'MOVE_TO'; readonly position: 'start' | 'end' }
  | { readonly type: 'TOGGLE_HIDDEN' }
  | { readonly type: 'CYCLE_SORT' }
  | { readonly type: 'REVERSE_SORT' }
  | { readonly type: 'SET_MODE'; readonly mode: Mode }
  | { readonly type: 'FILTER_INPUT'; readonly value: string }
  | { readonly type: 'FILTER_COMMIT' }
  | { readonly type: 'FILTER_CANCEL' };
