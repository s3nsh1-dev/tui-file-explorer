# ADR-0006: One flat reducer, a name-anchored cursor, and derived state stored in it

- **Status:** Accepted
- **Date:** 2026-08-16
- **Stage:** 2

## Context

Stage 1 held `cwd`, `entries` and `cursorIndex` in three separate `useState`s. That worked because
nothing changed the list length while the cursor was live — a navigation reset the cursor to 0 anyway.

Stage 2 breaks that on the first keystroke of `/`. Type one character and a cursor sitting at index
40 points past the end of a 3-item filtered list. Sorting is worse: the index survives, but it now
points at a completely different file, so the selection silently jumps while the user is looking at
it.

Three separate decisions follow, and they are recorded together because each depends on the last.

## Decision

### 1. A single `useReducer` over one flat state object

`{ dir, status, error, entries, visible, cursorName, filter, filterBackup, sortKey, sortReverse,
showHidden, mode }`, with every clamping invariant enforced inside the transition.

*Rejected:* a `useEffect` that re-clamps the cursor after the list changes. It renders the invalid
state and then corrects it, which is a visible flash — and it splits one invariant across two places
that must agree.

*Rejected:* keeping three `useState`s and being careful. "Being careful" is not a mechanism, and the
desync is silent rather than loud.

### 2. The cursor is anchored to a NAME, not an index

State holds `cursorName: string | null`; the index is derived by lookup. After any change to the
visible list, `anchor()` keeps the name if it survived and falls back to the first row if it did not.

This is why `cursorIndex()` can never point past the end — not because callers check, but because the
only value it can return is the position of a name that is present, or `-1` when the list is empty.

The user-visible payoff: toggling sort keeps you on the file you were looking at, revealing hidden
files does not move your selection, and cancelling a filter puts you back exactly where you were.
This is how `ranger` and `lf` behave.

*Rejected:* storing both an index and a name and keeping them in sync. Two sources of truth for one
concept is the bug this ADR exists to prevent.

### 3. `visible` is derived state, stored in the reducer

`entries → hidden filter → text filter → sort` is recomputed only in `recompute()`, which runs on the
transitions that can change the result, and the outcome is stored on the state object.

This is denormalisation and it is deliberate. Computing it per render with `useMemo` would be more
conventional, but a 40,000-entry directory would then pay for a full sort on every render rather than
on every *state change* — and Ink re-renders on a frame timer, not only on input. `recompute()` is
documented as the sole writer.

*Rejected:* `useMemo` in the component. Correct, conventional, and measurably worse at the scale this
project explicitly targets.

## Consequences

+ The cursor invariant is enforced in exactly one function, and there is a test asserting the index is
  never past the end.
+ The reducer is pure, so all 21 of its tests run without rendering anything — no Ink, no terminal, no
  async settle.
+ Sort and filter behaviour became easy to specify precisely, because "what happens to the cursor" has
  a single answer.
− The state object is larger and every read goes through it. Call sites are more verbose.
− `visible` must never be assigned outside `recompute()`. That is a convention the type system cannot
  enforce; it is stated in the field's own doc comment.
− The reducer must be given a viewport height eventually if scroll offset ever moves into it. Today
  the offset lives in the component (see below).

## Note on the scroll offset

The offset is *not* in the reducer. It is `useState` in `App`, adjusted during render via the pure
`nextOffset()`. It stays out because it depends on terminal height, which is a rendering concern the
reducer has no business knowing. `nextOffset` is idempotent, which is what makes adjusting during
render safe — see `src/state/selectors.ts`.
