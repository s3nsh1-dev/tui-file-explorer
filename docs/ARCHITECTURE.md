# Architecture

How `glim` is put together, for someone about to change it.

This describes the code as it stands. For the reasoning behind individual decisions, see
[`adr/`](adr/) — each non-obvious choice has a file there stating what was rejected and why.

---

## The layer rule

Three layers. The dependency arrow points one way only.

```
  ┌───────────────────────────────────────────────────────────────┐
  │  src/ui/      React + Ink. Components, hooks, styling.        │
  │               Knows about cells, colours, and Ink.            │
  └───────────────────────────┬───────────────────────────────────┘
                              │ imports — one direction only
  ┌───────────────────────────▼───────────────────────────────────┐
  │  src/state/   Pure. Reducer, actions, selectors.              │
  │               Knows about cursors and windows. No I/O.        │
  └───────────────────────────┬───────────────────────────────────┘
                              │
  ┌───────────────────────────▼───────────────────────────────────┐
  │  src/core/    Pure logic + filesystem primitives.             │
  │               No React. No Ink. No component ever imports up. │
  └───────────────────────────────────────────────────────────────┘
```

**This is a lint rule, not a convention.** `eslint.config.js` restricts imports inside
`src/core/**` and `src/state/**`:

| Forbidden import | Message                                                     |
| ---------------- | ----------------------------------------------------------- |
| `react`          | `core/ and state/ are pure. React belongs in src/ui/.`      |
| `ink`            | `core/ and state/ are pure. Ink belongs in src/ui/.`        |
| `../ui/*`        | `The dependency arrow points ui → core, never the reverse.` |

`pnpm lint` runs with `--max-warnings 0`, so a violation fails the build rather than producing a
warning someone scrolls past.

**The test for which layer something belongs in:** if the type or function still means something
with the layer above deleted, it belongs further down.

### What the rule buys

Measured on the current suite — 189 tests across 20 files:

| Kind                                               | Tests | How they run                              |
| -------------------------------------------------- | ----- | ----------------------------------------- |
| Pure functions — no renderer, no subprocess        | 96    | plain calls; no terminal, no async settle |
| Renderer — mounted through `ink-testing-library`   | 76    | frame assertions and golden frames        |
| Process level — the built binary, incl. a real PTY | 17    | `execFile` and `node-pty`                 |

All cursor, sorting, filtering, windowing, config and width logic sits in that first row. Those
tests cannot flake on a timing window because nothing asynchronous is involved.

---

## Module map

### `src/core/` — pure logic and filesystem primitives

| Module        | Exports                                                         | Responsibility                                           |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `types.ts`    | `Entry` `Status` `TargetResult` `Mode` `SortKey` `PreviewState` | The vocabulary every other layer speaks                  |
| `fs.ts`       | `readDirectory`                                                 | The only directory read. Returns `Entry[]`, never throws |
| `path.ts`     | `resolveTarget` `displayPath` `parentOf` `childOf`              | Path resolution and the `~` display form                 |
| `preview.ts`  | `readPreview`                                                   | Bounded file read for the right pane                     |
| `sanitize.ts` | `sanitizeName` `displayWidth` `truncateToWidth`                 | Untrusted-text defence and character-width maths         |
| `sort.ts`     | `SORT_CYCLE` `nextSortKey` `compareEntries` `sortEntries`       | Ordering — directories first, then the active sort key   |
| `config.ts`   | `loadConfig` `validateConfig` `configPath` `DEFAULT_CONFIG`     | Optional JSON config, field by field                     |
| `format.ts`   | `formatSize`                                                    | Human-readable byte sizes                                |
| `errors.ts`   | `errnoOf` `describeFsError`                                     | `errno` → a sentence a user can act on                   |
| `util.ts`     | `clamp` `pluralise` `isPresent`                                 | Small shared helpers                                     |

### `src/state/` — the reducer

| Module         | Exports                                                        | Responsibility                                        |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `actions.ts`   | `Action`                                                       | Every state transition, as one discriminated union    |
| `reducer.ts`   | `State` `initialState` `reducer` `cursorIndex` `selectedEntry` | One flat reducer; the cursor is anchored by **name**  |
| `selectors.ts` | `nextOffset` `windowSlice`                                     | Viewport windowing — which slice of the list is drawn |

The cursor is stored as a **name**, not an index. Re-sorting therefore keeps your selection on the
same file rather than on the same row. See [`ADR-0006`](adr/ADR-0006-flat-reducer-name-anchored-cursor.md).

### `src/ui/` — React and Ink

| Module                | Responsibility                                                           |
| --------------------- | ------------------------------------------------------------------------ |
| `Frame.tsx`           | Outer border, the two-pane split, and the narrow-terminal fallback       |
| `List.tsx`            | The left pane — renders only the visible window                          |
| `Row.tsx`             | One entry: cursor glyph, sanitised name, size column                     |
| `Preview.tsx`         | The right pane — file contents or directory listing                      |
| `StatusBar.tsx`       | Path, item count, active sort, filter state                              |
| `Help.tsx`            | The `?` overlay                                                          |
| `theme.ts`            | `Style` `theme` `isColorEnabled` — every colour decision, and `NO_COLOR` |
| `hooks/usePreview.ts` | Async preview loading for the highlighted entry                          |

### Entry points

- `src/cli.tsx` — argument parsing (`meow`), TTY detection, the non-interactive plain-listing path,
  and exit codes.
- `src/app.tsx` — mounts the tree, owns the **single** `useInput` handler, and dispatches actions.

---

## Data flow

```
  keypress
     │
     ▼
  app.tsx  ── the ONLY useInput in the codebase ──▶ dispatch(Action)
     │                                                   │
     │                                                   ▼
     │                                             state/reducer.ts
     │                                                   │
     │                                  ┌────────────────┴───────────────┐
     │                                  ▼                                ▼
     │                          state/selectors.ts               core/sort.ts
     │                          (windowSlice)                    (sortEntries)
     │                                  │                                │
     ▼                                  ▼                                ▼
  core/fs.readDirectory ────────────▶  State  ────────────────▶  ui/ components
  core/preview.readPreview                                             │
                                                                       ▼
                                                             Ink reconciler → stdout
```

**One input owner.** A second `useInput` anywhere in the tree means two handlers receive the same
keypress and modes (filter, help) start fighting. Mode lives in state; `app.tsx` branches on it.

**Every untrusted string passes `sanitizeName` before it reaches a component.** Filenames are bytes
from the filesystem, and a terminal executes the bytes printed to it.

---

## Two invariants that are load-bearing

### Read-only by construction

`glim` never deletes, renames, moves, or writes. This is the security boundary, and it is enforced
by lint rather than by review: `eslint.config.js` bans the mutating half of `node:fs`
(`unlink`, `rmdir`, `writeFile`, `symlink`, `chmod`, …), all of `node:child_process`, and every
networking module from `src/`.

Adding a "delete file" feature is therefore not a small change — it removes the boundary. See
[`ADR-0005`](adr/ADR-0005-read-only-by-construction.md).

### Filenames are hostile input

A file named with `ESC [ 2 J` in it can clear the screen from inside a directory listing. A file
containing `U+202E` (right-to-left override) makes `invoice.txt.exe` display as `invoice.exe.txt`.

Every untrusted string is escaped to `<U+XXXX>` by `core/sanitize.ts` before rendering. The test
fixture set carries a real RTL-override filename so the defence has something genuine to fail
against — `test/fixtures/basic/invoice‮gpj.txt`.

---

## Things that look removable and are not

Three that reliably catch people:

- **`core/config.ts` reads fields one at a time** instead of spreading the parsed JSON. That is the
  prototype-pollution defence, not verbosity.
- **The `unknown` round-trip on `isRawModeSupported` in `app.tsx`** looks like a pointless cast.
  Removing it reintroduces a crash that shipped once.
- **`test/helpers/render.tsx` is not boilerplate.** It exists because the published testing library
  cannot pin terminal size or simulate a non-TTY stdin, and both matter for deterministic layout
  assertions.

---

## Where to go next

| Question                             | Document                               |
| ------------------------------------ | -------------------------------------- |
| Why was a specific choice made?      | [`adr/`](adr/) — one file per decision |
| How do I set up and submit a change? | [`CONTRIBUTING.md`](CONTRIBUTING.md)   |
| How would this reach users?          | [`DISTRIBUTION.md`](DISTRIBUTION.md)   |
