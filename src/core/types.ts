/**
 * Domain types shared across the `core` / `state` / `ui` boundary.
 *
 * ## What belongs here
 *
 * A type earns a place in this file when **more than one layer** needs it.
 * `Entry` is produced by `core/fs.ts`, sorted by `state/reducer.ts` and rendered
 * by `ui/Row.tsx` — three layers, so it lives here rather than in whichever
 * module happened to need it first.
 *
 * ## What does NOT belong here
 *
 * Types used by exactly one layer stay with that layer. `State` is the
 * reducer's business, `Action` is the action module's, component `Props` belong
 * to their component, and `Style` is presentation-only. Hoisting those would
 * turn this file into a dumping ground and couple every module to it.
 *
 * The test: *if I delete a layer, does this type still mean anything?*
 */

// ─────────────────────────── filesystem ───────────────────────────

/**
 * One row in a directory listing.
 *
 * `isDirectory` is resolved THROUGH symlinks: `readdir` reports the link's own
 * type, so a symlink pointing at a directory would otherwise sort among the
 * files and refuse to open. `isSymlink` records that it is a link, so the UI
 * can colour it differently.
 *
 * `size` and `mtimeMs` come from `lstat` — the link's own metadata, not its
 * target's. They are `0` when the stat failed (a file deleted between `readdir`
 * and `lstat`, which is a race, not an error worth failing the listing over).
 */
export type Entry = {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  readonly mtimeMs: number;
};

/** Where a directory read got to. Drives which empty-state message is shown. */
export type Status = 'loading' | 'ready' | 'error';

/**
 * Result of validating a path before Ink mounts.
 *
 * A discriminated union rather than `string | null` or a thrown error: the
 * caller cannot read `.path` without first narrowing on `ok`, so "forgot to
 * check the failure case" is a compile error instead of `undefined` reaching
 * the renderer.
 */
export type TargetResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message: string };

// ─────────────────────────── interaction ──────────────────────────

/**
 * Which keymap is live. Exactly one `useInput` is mounted for the whole app and
 * it branches on this — see `AGENTS.md §8`: two mounted `useInput` hooks make
 * every keystroke fire twice, and the symptom is doubled input, not an error.
 */
export type Mode = 'normal' | 'filter' | 'help';

/** Sort orders, cycled by `s`. The order of this union is the cycle order. */
export type SortKey = 'name' | 'size' | 'mtime' | 'ext';

// ───────────────────────────── preview ────────────────────────────

/**
 * What the right-hand pane is showing.
 *
 * Every variant except `text` and `directory` is a REFUSAL, and that is the
 * point (ADR-0005): `binary` means we found a NUL and stopped, `special` means
 * `lstat` said it was not a regular file and we never opened it, `error` means
 * the read failed and the reason has already been sanitized.
 *
 * Named `PreviewState`, not `Preview`, so it does not collide with the
 * `<Preview>` component that renders it.
 */
export type PreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'directory'; readonly names: readonly string[]; readonly total: number }
  | { readonly kind: 'text'; readonly lines: readonly string[]; readonly truncated: boolean }
  | { readonly kind: 'binary'; readonly size: number }
  | { readonly kind: 'special'; readonly label: string }
  | { readonly kind: 'error'; readonly message: string };
