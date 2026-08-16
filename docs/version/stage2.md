# Stage 2 — Real Application · Retrospective

> **IMMUTABLE once written.** This is history. If Stage 3 proves something here wrong, the correction
> goes in *that* stage's retrospective, not in an edit here.
>
> **This document carries an extra load.** The maintainer waived the spec-review gate for Stage 2
> — *"you have free hand to take decisions just explain your logic in final version doc"*. §2 is
> therefore the substitute for the review that did not happen, and every judgement call a reviewer
> would have questioned is argued there rather than merely recorded.

---

## At a glance

| | |
|---|---|
| **Branch** | `stage-2` |
| **Cut from `develop`** | 2026-08-16 (at `9ba2bf1`) |
| **Merged to `develop`** | 2026-08-16 |
| **Signed off by** | Shubham Pandey — CHECKPOINT 2 passed 2026-08-16 ("everything looks fine") |
| **Commits** | 5 |
| **Tests at close** | 136 passing, 15 files (up from 36) |
| **Golden frames** | 9 committed `.txt` |
| **Source size** | 1 483 lines across 16 modules (up from 337 across 2) |
| **Test size** | 1 900 lines — still ahead of source |
| **Gate at close** | typecheck ✓ · lint ✓ · test ✓ · build ✓ |
| **Spec** | [`docs/v2_STAGE_2.md`](../v2_STAGE_2.md) |

---

## 1. What this stage was for

Stage 1 proved a pipeline. Stage 2 had to produce the program `00_PROJECT_INSPIRATION.md §1`
describes: two panes, a preview, filtering, sorting, colour, and enough interaction that someone
would choose it over `ls`.

Two of the tasks were not features and mattered more than the features. **Viewport windowing**,
because rendering 40 000 rows is a correctness bug rather than a slow feature — Stage 1 would hang
your terminal on a large directory, by design and on the record. And the **input state machine**,
because `/` introduces a second mode, and the moment two `useInput` hooks are mounted at once every
keystroke fires twice and the app becomes unexplainable.

Everything a user touches is now settled. Stage 3 changes no pixels.

---

## 2. Design choices, and what they cost

### A single reducer holding derived state

**Chose:** one `useReducer` over a flat object, with the filtered-and-sorted list (`visible`) stored
*in* the state rather than recomputed per render.
**Over:** `useMemo` in the component, which is the conventional answer.
**Because:** Ink re-renders on a frame timer, not only on input. A `useMemo` keyed on
`entries/filter/sort/showHidden` is correct, but it recomputes on every dependency change *and* is
evaluated per render; storing the result means a 40 000-entry directory pays for one sort per **state
change** instead of one per **frame**. This project explicitly targets that scale.
**Cost:** denormalised state. `visible` can now disagree with `entries` if anyone assigns it outside
`recompute()`. The type system cannot prevent that; it is a convention documented on the field
itself. A reviewer would reasonably have pushed back here, and the honest answer is that this is a
performance-motivated exception to a good default.
**Recorded as:** [ADR-0006](../adr/ADR-0006-flat-reducer-name-anchored-cursor.md).

### Cursor anchored by name, not index

**Chose:** `cursorName: string | null`, with the index derived by lookup.
**Over:** the obvious `cursorIndex: number`.
**Because:** an index points at a *position*, and every sort or filter change makes that position
mean a different file. The selection would silently jump while the user was looking at it. A name
points at the *thing*.
**Cost:** every cursor read is an O(n) `findIndex` rather than an array access. On 40 000 entries
that is a linear scan per render — measurably worse than an integer, and genuinely the wrong choice
if the list were larger still. It buys the invariant that the cursor can never point past the end,
because the only value `cursorIndex()` can return is the position of a name that is present.
**Bonus that justified it independently:** cancelling a filter restores the previous selection for
free, because the name was never invalidated.

### The scroll offset deliberately stayed OUT of the reducer

**Chose:** `useState` in the component, adjusted during render via a pure `nextOffset()`.
**Over:** putting `offset` and `viewportHeight` into the reducer alongside everything else.
**Because:** the offset depends on terminal height, which is a rendering concern the reducer has no
business knowing. Putting it in would have meant either a `VIEWPORT` action dispatched from a resize
effect, or every movement action carrying a height — both leak layout into state.
**Cost:** an unusual-looking pattern. `if (wanted !== offset) setOffset(wanted)` during render reads
like a bug. It is React's documented way to hold derived state that needs history, and it is only
safe because `nextOffset` is idempotent — a property the tests assert directly rather than assume.
**Rejected on the way:** a `useRef` mutated during render, which is what I wrote first. The hooks
lint rejected it, correctly.

### Escaping to `<U+XXXX>` rather than delegating truncation to Ink

**Chose:** measure and truncate with our own `displayWidth` / `truncateToWidth`.
**Over:** `<Text wrap="truncate-end">`, which Ink provides and which measures width correctly.
**Because:** golden frames must be byte-stable, and the size column has to align when a filename
contains CJK or emoji — two cells each but one `String.length`. Delegating layout to Yoga would have
made the frames depend on Ink's internal measurement, so an Ink upgrade could churn every snapshot.
**Cost:** ~60 lines of Unicode width tables that are an *approximation*. They cover the common East
Asian and emoji ranges; they do not implement UAX #11 fully, and they do not handle grapheme clusters
(a flag emoji built from regional indicators will measure wrong). There is a test asserting alignment
with CJK and emoji filenames, so the common cases are covered — but this is a known simplification,
not a complete implementation.

### A local test harness instead of `ink-testing-library` — vindicated

Stage 1 replaced it because it hardcodes `columns = 100`, has no `rows`, and forces
`stdin.isTTY = true`. Stage 2 immediately needed all three: golden frames at four pinned sizes, a
`rows` value for windowing, and — added here — a `resize()` that mutates the dimensions and emits the
event Ink listens for. Without that last one, "the preview collapses on resize" could only be tested
by rendering twice at two sizes, which proves layout but not that the app *reacts*.

### Ink 7 replaced two things the contract told me to hand-roll

`AGENTS.md §8` instructs writing a resize subscription and raw `\x1b[?1049h` for the alternate
screen. Both are Ink 6-era. Ink 7 ships `useWindowSize()` and `render(_, { alternateScreen: true })`.
Taking the built-ins matters most for the alternate screen: hand-rolling it means owning the matching
`\x1b[?1049l` on all four exit routes — quit, `SIGINT`, `SIGTERM`, `uncaughtException` — and every
route missed leaves the user staring at a dead screen with no prompt.
**Recorded as:** [ADR-0007](../adr/ADR-0007-alternate-screen-via-ink.md).

### `src/core/errors.ts` was added outside the frozen spec

The spec's file list allowed `core/sanitize.ts` and nothing else in `core/`. `describeFsError` is
needed by both `app.tsx` and `usePreview`, and importing it from `app.tsx` would make the module
graph circular. Adding a small pure module was the lesser evil against a cycle. Logged in
[`v2 §9`](../v2_STAGE_2.md#9-deviations-from-spec) rather than done quietly.

---

## 3. What surprised us

### A frame-level colour test passes vacuously

**Expected:** `countSgr(frame) > 0` by default, `=== 0` under `NO_COLOR`.
**Found:** zero SGR **either way**. Chalk decides colour support from the real `process.stdout`,
which is not a TTY under vitest — so the "colour works" half of the test proved nothing at all, and
would have sat there looking like coverage.
**How:** the assertion failed, which is the only reason I looked.
**Result:** split three ways. `test/theme.test.ts` proves *our* gate empties every token;
the frame assertion proves no SGR reaches the frame; and the real binary was checked by hand.
That hand-check produced the best result of the stage: `FORCE_COLOR=1` yields 32 SGR sequences, and
`NO_COLOR=1` yields **0 even with `FORCE_COLOR=1` also set** — which chalk alone would have honoured.
NO_COLOR wins because `theme.ts` empties the tokens itself. The belt-and-braces gate that looked
redundant when written is the only reason that guarantee holds.

### Prettier had no config, and silently rewrote the codebase

Running `prettier --write` for the first time reformatted every file to double quotes at 80 columns —
prettier's defaults, and not the style the code was written in. It was a 341-line diff of pure noise.
Caught by reading the diff before committing. `.prettierrc.json` now pins single quotes at 100.

### Ink overlaps overflowing rows instead of truncating them

**Expected:** content taller than its container gets clipped.
**Found:** the surplus rows are laid out **on top of** the rows above. The help overlay in a 10-row
terminal rendered `go to the parent directorytory`, merged `show or hide dotfiles` with `⎋ cancels`,
and turned `Keys` into ` eys`.
**How:** a test asserting `frame` contains `'Keys'` failed with `' eys'`. I nearly dismissed it as an
off-by-one in the assertion.
**Result:** `Help` now slices itself to the rows it is given. It was the only fixed-height content in
a `flexGrow` container; `List` was already windowed and `Preview` already slices.

### Empty `<Text>` collapses to zero height

Restoring the help overlay's blank spacer rows as `label: ''` silently did nothing — Ink gives an
empty `<Text>` no height. `' '` works. Discovered because the golden frame came back byte-identical
to the broken version rather than the intended one.

---

## 4. Bugs found and fixed

| # | Symptom | Root cause | Fix | Commit | Test that now guards it |
|---|---|---|---|---|---|
| 1 | Help overlay rendered interleaved text in a short terminal; `Keys` became ` eys` | Ink lays surplus rows over the ones above rather than clipping. `Help` rendered 14 fixed rows into a shorter `flexGrow` container | `Help` takes `height` and slices to it | `f4411e4` | `test/hazards.test.tsx` — "clips instead of interleaving its own lines" |
| 2 | Header and status rows were one column shorter than body rows — ragged right edge | Text budgets measured against the **outer** width; the border's two columns were never subtracted | `Frame` computes `inner = width - 2` and derives every budget from it | `b504789` | `test/golden.test.tsx` — "every row is exactly N cells", at four sizes |
| 3 | The size column sat flush against the pane divider | The list Box and the row content were the same width, leaving no gutter | Rows render one column narrower than their Box | `b504789` | Golden frames `two-pane-100x20`, `narrow-50x20` |
| 4 | Blank spacer rows silently disappeared from the help overlay | Ink gives an empty `<Text>` zero height | Spacers use `' '`, and are list entries so they respect the height budget | `f4411e4` | Golden frame `help-100x20`, byte-identical to the reviewed original |
| 5 | `prettier --write` rewrote all 29 source files to a different style | No `.prettierrc.json`; prettier's defaults are double quotes at 80 cols | Added a config matching the existing style | `b504789` | `pnpm format:check` |

Bugs 1, 2 and 3 were **found by looking at rendered output**, not by a failing assertion written in
advance. Bug 2 and 3 came from running the real binary and reading the frame; bug 1 came from a test
that failed for a reason I did not anticipate. That is the second stage running in which the
important defects were invisible to the tests as originally written.

---

## 5. What we got wrong

**I wrote a test whose positive half could never fail.** The `NO_COLOR` frame test asserted that
colour *is* emitted by default — in an environment where chalk never emits colour. Had the negative
half been written alone, it would have passed forever while proving nothing, and I would have
recorded it as evidence for a DoD item. The lesson is narrower than "test your tests": *an assertion
about an environment-dependent global needs a control that actually varies*, and the control here had
to be a hand-run of the real binary.

**I reached for a `useRef` mutated during render.** It is a pattern I have seen used for derived
scroll state and it is wrong in React 19; the hooks lint caught it immediately. The correct pattern
was two lines away and better. I should have checked the rule before writing the workaround.

**Three separate times this project has written invisible control bytes into source** — the `KEY`
escapes in Stage 1, an over-escaped repair of the same, and a literal NUL in a Stage 2 assertion.
Each was functional and each was unreviewable in a diff. `String.fromCharCode` is now the house style
for control characters, which is faintly absurd in the project whose security model is *control
characters are dangerous*.

**The width tables are an approximation presented as a solution.** `displayWidth` covers common CJK
and emoji ranges and is tested against both, but it is not UAX #11 and it does not do grapheme
clusters. A flag emoji will measure wrong and the size column will shift by a cell. I chose not to
add a dependency for this; that trade is defensible, but the limitation deserves to be stated
plainly rather than left for someone to discover.

---

## 6. Deliberately left undone

**Deferred to Stage 3**, all with owning task IDs in `v3_STAGE_3.md`:

- `S3-04` — **request sequencing.** Rapid key-mash can still resolve `readdir` out of order. The
  reducer drops results whose `dir` no longer matches, which handles the common case, but two
  navigations into the *same* directory racing each other are not ordered. Needs `AbortController`
  plus a monotonic request id. **A partial fix here would have been worse than none**, because it
  reads as "handled" and stops anyone looking.
- `S3-07` — symlink cycles. `usePreview` resolves exactly one level, which cannot loop; nothing
  guards a deeper chain.
- `S3-09` — the 40 000-entry directory is *rendered* correctly (windowing works) but has never been
  **measured**. Every entry is `lstat`ed on load in batches of 64, and that cost is unknown.
- `S3-13` — config file. Every constant (`SCROLL_MARGIN`, `PREVIEW_MIN_WIDTH`, `LIST_FRACTION`,
  `MAX_PREVIEW_BYTES`) is hardcoded and visible at the top of its module, which is the Stage 1
  instruction still being honoured.
- `S3-02` — the `core/` ⟂ `ui/` split. See §7 for the plan.

**Refused, and named so they can be refused by name again:** syntax highlighting (it renders
attacker-controlled bytes through a parser), bookmarks, tabs, multi-select, image preview, git status,
icons, mouse support, fuzzy matching.

**Excluded permanently:** every form of filesystem mutation
([ADR-0005](../adr/ADR-0005-read-only-by-construction.md), enforced by lint).

---

## 7. If you are picking this up later

- **`recompute()` in `src/state/reducer.ts` is the only legal writer of `visible`.** Assigning it
  anywhere else desynchronises derived state from `entries` and nothing will tell you.
- **`nextOffset` must stay idempotent.** `App` calls it during render and adjusts state from the
  result. If it ever became non-idempotent, that becomes an infinite render loop, not a subtle bug.
- **`Help` must stay height-aware.** Any fixed-height content dropped into the body `Box` will
  overlap rather than clip. If you add a second overlay, give it a `height` prop on day one.
- **Golden frames are ANSI-stripped on purpose.** Colour is asserted separately, by counting SGR.
  Never regenerate them with `-u` without reading the diff — bug 4 was caught precisely because a
  regenerated frame came back identical to the broken version instead of the intended one.
- **`test/fixtures/preview/escape.txt` and `binary.bin` contain real hostile bytes.** An editor that
  "cleans" them removes the only adversarial content the preview tests have.
- **`displayWidth` is an approximation.** See §5 before trusting it with unusual scripts.

### The Stage 3 `core/` ⟂ `ui/` split — plan, for review at CHECKPOINT 2

`CLAUDE.md §2` requires this refactor to be planned and signed off before execution. It is presented
here so it can be reviewed as part of Checkpoint 2 rather than needing a third interruption.

**Target layout.** Everything already in `src/core/` and `src/state/` is pure and stays. What moves is
the I/O and formatting still living in `app.tsx`:

```
src/
├── cli.tsx                unchanged
├── app.tsx                shrinks to: hooks, layout arithmetic, JSX. No I/O.
├── core/                  PURE — no react, no ink imports (lint-enforced, S3-03)
│   ├── sanitize.ts        [exists]
│   ├── errors.ts          [exists]
│   ├── fs.ts              [NEW]  readDirectory()  ← moves out of app.tsx
│   ├── preview.ts         [NEW]  readPreview()    ← moves out of ui/hooks/usePreview.ts
│   ├── path.ts            [NEW]  displayPath(), resolveTarget()  ← moves out of app.tsx
│   └── format.ts          [MOVED] from ui/format.ts — pure, no reason to sit in ui/
├── state/                 unchanged (already pure)
└── ui/
    ├── hooks/usePreview.ts  keeps ONLY the hook; the reader moves to core/preview.ts
    └── …                    unchanged
```

**Move order** — each step is one commit, and the gate runs between them:

1. `S3-01` snapshot every golden frame first. That is the control group.
2. `ui/format.ts` → `core/format.ts` (pure move, imports only).
3. `readDirectory` → `core/fs.ts`.
4. `resolveTarget` + `displayPath` → `core/path.ts`.
5. `readPreview` → `core/preview.ts`, leaving `usePreview` as a thin hook over it.
6. `S3-03` add the lint rule banning `react`/`ink` imports from `src/core/**`, which makes the
   boundary mechanical rather than aspirational.

**How it is verified.** Behaviour is defined as the bytes rendered. Every step must leave all nine
golden frames **byte-identical** — a zero-diff requirement. Any frame that changes means the move
changed semantics and is wrong. This is the only refactor strategy available to an agent that cannot
look at a screen, and it is stronger than looking, because no human eye catches a shifted column.

**What could break.** `readDirectory` and `readPreview` both close over module-level constants
(`STAT_CONCURRENCY`, `MAX_PREVIEW_BYTES`); those move with them. `usePreview` currently imports
`describeFsError` from `core/errors.ts`, so no cycle is created by the split. The risk is low and the
proof is mechanical.

---

## 8. Evidence

- **Gate** — `pnpm typecheck` ✓ · `pnpm lint` ✓ (exit 0) · `pnpm test` → **136 passed, 15 files** ·
  `pnpm build` ✓.
- **Windowing** — 500-entry directory at 24 rows renders **≤ 19** entry rows and the status bar reads
  `500 items` (`test/features.test.tsx`). Scrolling 40 rows down drops `f-000.txt` and shows
  `f-040.txt`.
- **Name-anchored cursor** — 21 reducer tests run with no renderer imported at all; the selection
  survives sort changes, hidden-file toggles and filter cancellation.
- **Column alignment** — every row is exactly the terminal width **in cells** at 20×8, 50×20, 100×20
  and 120×30, plus a case with CJK and emoji filenames.
- **Preview safety** — a binary fixture renders `binary file · 28 B` with no NUL and no raw bytes; a
  fixture whose *contents* are `\x1b[2J\x1b[31m…` renders `<U+001B>[2J` as visible text; a FIFO and
  `/dev/null` render placeholders and the tests **complete** rather than hang.
- **Colour**, hand-run against the built binary:
  `FORCE_COLOR=1` → 32 SGR sequences · `NO_COLOR=1 FORCE_COLOR=1` → **0** SGR, cursor glyph still
  present.
- **Alternate screen** — piped stdout contains no `[?1049` sequence and prints 10 plain lines.
- **Resize** — narrowing 120→50 collapses the preview; widening restores it; shortening 24→10 keeps
  the cursor on screen.
- **Golden frames** — 9 committed `.txt` files, every one read by hand.

**Not verified by me, and it cannot be:** whether the cyan directories and inverse-video selection are
legible in your terminal theme, whether the round box-drawing characters render in your font, whether
scrolling a large directory flickers, and whether your scrollback survives quitting. That is
CHECKPOINT 2 (S2-19), and it is the last one — Stage 3 changes nothing visual.
