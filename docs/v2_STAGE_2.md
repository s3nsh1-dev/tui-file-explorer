# v2 — Stage 2: Real Application

> **Agent mentality for this stage:** Craftsperson — see `00_PROJECT_INSPIRATION.md §7`.
> **Status:** ⚠ **PROVISIONAL — not frozen.** Written during planning on 2026-08-15, before Stage 1
> existed, at the maintainer's request for a full three-stage roadmap.
>
> **Branch:** `stage-2` — cut from `develop` at kickoff, merged back only after CHECKPOINT 2
> (`AGENTS.md §5.1`).
> **Retrospective:** `docs/version/stage2.md`, written at S2-18.
>
> **This spec freezes at the kickoff of Stage 2, not now.** Before the first commit of this stage,
> the agent must: (1) paste v1's `## Handoff` into `§0` below, (2) reconcile this spec against what
> Stage 1 actually produced, (3) present the reconciled spec for human review, and only then start
> work. Anything below that survives reconciliation freezes; anything that Stage 1 invalidated gets
> corrected **before** the freeze and noted in `§9`. This is the one window in which editing above
> the BUILD LINE is legitimate — see `CLAUDE.md §6`.

---

## 0. Entry Point — start here

> ⛔ **PLACEHOLDER.** Fill this from `v1_STAGE_1.md §10 Handoff` at Stage 2 kickoff. Do not start
> `S2-01` while this section still says PLACEHOLDER — that means the previous stage did not close out
> properly, which is a `AGENTS.md §9` stop-and-ask condition.

**State of the codebase.** _(from v1 Handoff)_

**Architecture as it stands.** _(from v1 Handoff)_

**Load-bearing decisions carried in.**
- ADR-0001 pnpm · ADR-0002 TypeScript 6.0.3 pin · ADR-0003 Node 22 / Ink 7 floor ·
  ADR-0004 npm name deferred · **ADR-0005 read-only by construction + sanitization chokepoint**
- _(plus whatever v1 adds)_

**Known debt carried forward.** _(from v1 Handoff)_

**Read `v1_STAGE_1.md` only if:** you need the rationale for the one-file `app.tsx`, or the record of
which Ink 7 API assumptions were verified against the installed `.d.ts` files.

---

## 1. Intent

Turn the skeleton into the program described in `00_PROJECT_INSPIRATION.md §1` — the one with two
panes, a preview, and enough interaction that a person would pick it over `ls`. Everything a user
touches is decided in this stage: what the screen looks like, what the keys do, what happens while
you wait, and what happens when something fails.

Two of the tasks here are not features and matter more than the features. **Viewport windowing** —
because rendering 40 000 rows is a correctness bug, not a slow feature. And the **input state
machine** — because `/ filter` introduces a second mode, and the moment two `useInput` hooks are
mounted at once, every keystroke fires twice and the app becomes unexplainable.

Stage 2 ends when the screen is settled. Stage 3 changes no pixels.

---

## 2. Scope — IN

- **Two-pane layout** — listing left, preview right, both inside a bordered frame with a header and a
  status bar. Panes reflow on terminal resize; the preview pane collapses below a width threshold
  rather than crushing the listing.
- **Preview pane** — first 64 KiB of the highlighted regular file, rendered as text. Directories
  preview as a child listing. Non-regular files (FIFO, socket, device) and binaries render a
  descriptive placeholder and are **never read** (ADR-0005).
- **Viewport windowing** — only rows that fit on screen are rendered. Cursor drives the window
  offset, with a scroll margin so the cursor is not pinned to the frame edge.
- **Filter** — `/` enters filter mode, live case-insensitive substring match, `⏎` commits, `⎋`
  cancels and restores the pre-filter cursor.
- **Sort** — `s` cycles name → size → mtime → extension; `S` reverses. Directories always first.
- **Hidden files** — `.` toggles dotfiles.
- **Help overlay** — `?` shows the keymap; any key dismisses.
- **Colour and theming** — one `ui/theme.ts` of semantic tokens (`selected`, `directory`, `symlink`,
  `dim`, `error`). Honours `NO_COLOR`.
- **Loading and error states, per pane** — a slow `readdir` shows a loading state; a failed one shows
  a sanitized, single-line reason in place of the listing. Neither unmounts the frame or the keymap.
- **Status bar** — entry count, filtered count, current sort, active filter, and the key hint row
  from the `§1` mockup.
- **Alternate screen buffer** — `glim` no longer scribbles on the user's scrollback.
- **Golden frames** — committed `.txt` snapshots at pinned terminal sizes for every layout state.

## 3. Scope — OUT (do not build)

> Binding. If an OUT item is genuinely required to complete an IN item, **stop and ask**.

- **`core/` ⟂ `ui/` split** — Stage 3, and the only large refactor this project sanctions. Stage 2 may
  create `src/core/sanitize.ts` (S2-06) because it is pure by nature and needed immediately; it must
  **not** start migrating anything else across that line.
- **`AbortController` / request sequencing** — Stage 3 (`S3-03`). Out-of-order `readdir` under
  key-mash remains a known bug through Stage 2. Do not fix it opportunistically; it needs the request
  model Stage 3 introduces, not a patch.
- **`memfs`, `node-pty`, config file, non-TTY modes, CI, publishing** — Stage 3, all of it.
- **File operations of any kind** — never. ADR-0005.
- **Feature sprawl, named explicitly so it can be refused by name:** bookmarks, tabs, multi-select,
  image/PDF preview, syntax highlighting, git status, file icons / Nerd Fonts, mouse support, fuzzy
  matching, search-in-file, trash integration, archive browsing.
- **Syntax highlighting deserves its own line** because it is the most tempting item on that list. It
  needs a highlighter dependency, a language map, and a theme — and it renders *attacker-controlled
  file contents through a parser*. If it is ever wanted, it is a separate project with its own ADR.

---

## 4. Approach and reasoning

**A single reducer over flat state → ADR-0006.** Stage 1's three `useState`s worked because nothing
changed the list length under a live cursor. Filter breaks that immediately: type one character and a
cursor at index 40 points past the end of a 3-item list. The fix is not a re-clamping `useEffect` —
that renders the invalid state and then corrects it, which is a visible flash. Clamping belongs
*inside* the transition, which means one reducer holding `{ cwd, entries, status, cursorName, filter,
sortKey, sortDir, showHidden, mode }`.

**The cursor is anchored by name, not index → ADR-0006.** Storing an index means every sort re-points
the cursor at an arbitrary file. Storing `cursorName: string | null` and deriving the index means
toggling sort keeps your selection on the file you were looking at, and a filter that excludes the
selected file falls back to the nearest surviving index. This is how `ranger` and `lf` behave, and it
is the difference between the app feeling considered and feeling generated.

*Alternative rejected:* store both and keep them in sync. Two sources of truth for one concept is the
bug this ADR exists to prevent.

**Windowing is a slice before the map, not a scroll container.** There is no DOM and no
`overflow: hidden`; every row handed to Ink is a terminal write. `visible.slice(offset, offset +
rows)` is the whole mechanism. The subtle part is the offset policy — the window follows the cursor
with a scroll margin, and margin arithmetic must degrade sanely when the viewport is shorter than
twice the margin. That edge case is a real Stage 3 adversary (4-row terminal), so the policy is
written as a pure function here to be unit-tested there.

**One `useInput`, one mode.** `mode` is a discriminated union in reducer state and exactly one
`useInput` is mounted, at the root, dispatching based on mode. The alternative — mounting a second
`useInput` inside the filter component — means both fire on every keypress, which `AGENTS.md §8`
names as a hazard and which is genuinely hard to debug because the symptom is doubled input, not an
error.

**Golden frames are the deliverable, not a side effect.** From this stage on I cannot claim a visual
outcome without a committed `.txt` frame. Terminal size is pinned in the harness or snapshots differ
per machine and become noise everyone learns to ignore. **Never bulk-accept `-u`** — every snapshot
diff is read line by line, because an unreviewed golden frame is worse than no golden frame: it
launders a regression into the repo with a green checkmark.

**Preview is where untrusted bytes meet the screen.** ADR-0005's chokepoint stops being theoretical
here. The order is `lstat` → reject non-regular → open → read ≤64 KiB into a fixed buffer → detect
NUL in the first 8 KiB → sanitize → truncate to pane width → render. Every step is a refusal to do
something naive, and the `lstat` gate is the one that matters most: previewing `/dev/zero` does not
error, it hangs forever, in raw mode, with no way out but another terminal.

**Alternate screen buffer → ADR-0007.** `\x1b[?1049h` on start, `\x1b[?1049l` on exit. This makes the
exit path load-bearing — a crash without the restore leaves the user staring at a dead screen. It
lands late in the stage, after the exit path has been exercised, and its ADR must state how it
interacts with the `SIGINT`/`uncaughtException` handlers from `S1-13`.

---

## 5. Architecture — target state

```
src/
├── cli.tsx                 [CHANGED] alt-screen enter/exit wrapped around render()
├── app.tsx                 [CHANGED] shrinks: owns reducer + effects, delegates all rendering
├── core/
│   └── sanitize.ts         [NEW] the ADR-0005 chokepoint, promoted from v1's inline version
│                                 + width-aware truncate (East-Asian / emoji = 2 cells)
├── state/
│   ├── reducer.ts          [NEW] pure; all clamping lives here            → ADR-0006
│   ├── actions.ts          [NEW] discriminated union
│   └── selectors.ts        [NEW] pure: filter → sort → window(offset,rows)
└── ui/
    ├── Frame.tsx           [NEW] border + header + status bar
    ├── List.tsx            [NEW] windowed; slices before mapping
    ├── Row.tsx             [NEW] memo'd; stable keys                      ← AGENTS.md §8
    ├── Preview.tsx         [NEW] bounded read, kind-aware
    ├── StatusBar.tsx       [NEW]
    ├── Help.tsx            [NEW] overlay
    ├── theme.ts            [NEW] semantic tokens, NO_COLOR aware
    └── hooks/
        ├── useTerminalSize.ts  [NEW] resize subscription
        └── usePreview.ts       [NEW] bounded read for the highlighted entry

test/__snapshots__/         [NEW] committed golden frames (.txt)
```

`state/` and `core/` are pure and React-free from the day they are created. They are *not* the Stage 3
`core/` split — that migration moves `fs`, `path`, `preview`, `sort`, `filter`, and `format` across
the same line. Creating these two directories now is not a head start on that refactor; it is the
minimum shape that lets the reducer be unit-tested without rendering.

**Input state machine** — one `useInput`, mode in reducer state:

```
             ┌──────────────────────────────────────────────┐
        ┌───►│                   NORMAL                     │◄───┐
        │    │  ↑↓/jk move · ⏎/→/l enter · ←/h up           │    │
        │    │  . hidden · s sort · S reverse · q quit      │    │
        │    └────────┬───────────────────────┬─────────────┘    │
        │             │ '/'                   │ '?'              │
        │             ▼                       ▼                  │
        │      ┌─────────────┐         ┌─────────────┐           │
        │      │   FILTER    │         │    HELP     │           │
        │      │ printable→  │         │  overlay    │           │
        │      │   query     │         │             │           │
        │      │ ⌫ backspace │         │  any key ───┼───────────┘
        │      │ ⏎ commit ───┼─────────┤             │
        │      │ ⎋ cancel ───┼────┐    └─────────────┘
        │      └─────────────┘    │
        └───────────────────────  ┘   (⎋ also restores pre-filter cursorName)
```

**Render pipeline** — the invariant is that sanitization is unskippable:

```
  reducer state
       │
       ▼
  selectors:  entries ──► filter(query, showHidden) ──► sort(key, dir)
                                                            │
                                                            ▼
                                              window(cursorIndex, rows, margin)
                                                            │
              ┌─────────────────────────────────────────────┤
              ▼                                             ▼
      core/sanitize(name)                          usePreview(entry)
      truncate(paneWidth)                          lstat → guard → ≤64KiB
              │                                    → NUL scan → sanitize
              ▼                                             ▼
         <Row memo/>  × visible only                   <Preview/>
```

---

## 6. Tasks

Ordered. Infrastructure first — windowing and the reducer are load-bearing for everything after them,
and retrofitting either into finished components is a rewrite.

| ID | Task | Depends on | Evidence level |
|---|---|---|---|
| S2-01 | `state/` — reducer, actions, selectors; name-anchored cursor + clamping. **ADR-0006.** Unit-tested with no rendering at all | v1 | L1 + unit |
| S2-02 | Terminal size. **Ink 7 ships `useWindowSize()`** — returns `{columns, rows}` and re-renders on resize (verified in `ink/build/hooks/use-window-size.d.ts`, 2026-08-15). Use it; do **not** hand-roll the planned `ui/hooks/useTerminalSize.ts` | v1 | L1 |
| S2-03 | Windowing — pure `window()` in selectors, scroll margin, `Row` memoized with stable keys | S2-01, S2-02 | L1 |
| S2-04 | Golden-frame harness — pinned columns/rows, `toMatchFileSnapshot`, snapshot dir committed | S2-02 | **L2** |
| S2-05 | `ui/Frame.tsx` — border, header, two-pane split; preview collapses below the width threshold | S2-04 | **L2** |
| S2-06 | `core/sanitize.ts` — full ADR-0005 coverage (CSI, OSC, C0/C1, `\r`, U+202E/202D, zero-width) + width-aware truncate. Table-driven tests | v1 | unit |
| S2-07 | `ui/Preview.tsx` + `usePreview` — `lstat` guard, ≤64 KiB bounded read, NUL binary detect, directory preview | S2-05, S2-06 | **L2** |
| S2-08 | `ui/StatusBar.tsx` — counts, sort indicator, active filter, key hints | S2-05 | **L2** |
| S2-09 | `.` hidden-file toggle | S2-01 | L1 |
| S2-10 | `s` / `S` sort cycle and reverse; dirs-first invariant preserved across all keys | S2-01 | L1 |
| S2-11 | `/` filter mode — the mode machine, single `useInput`, `⎋` restores pre-filter cursor | S2-01 | **L2** |
| S2-12 | `?` help overlay | S2-11 | **L2** |
| S2-13 | `ui/theme.ts` — semantic tokens, `NO_COLOR` respected | S2-05 | **L2** |
| S2-14 | Loading and error states per pane; sanitized single-line failure text; keymap stays alive | S2-07 | **L2** |
| S2-15 | Alternate screen buffer. **Ink 7 supports `render(node, { alternateScreen: true })` natively**, including teardown (verified in `ink/build/render.d.ts`, 2026-08-15). Do **not** write raw `\x1b[?1049h`/`[?1049l` as `AGENTS.md §8` suggests — that advice is Ink 6-era. ADR-0007 shrinks to "we use Ink's option, and here is how it interacts with the S1-13 signal handlers" | S2-14 | L1 |
| S2-16 | Golden-frame sweep — every layout state snapshotted at 80×24 and 120×40; each diff reviewed by hand | all above | **L2** |
| S2-17 | Log, ADRs, `docs/STATE.md`, `§10 Handoff` — **including the full Stage 3 `core/` ⟂ `ui/` split plan**, so it is reviewed at Checkpoint 2 rather than needing a third interruption (`v3 §5`) | S2-16 | docs |
| S2-18 | `docs/version/stage2.md` — narrative retrospective (`AGENTS.md §4.6`), written **before** the gate | S2-17 | docs |
| S2-19 | **CHECKPOINT 2** — maintainer runs it | S2-18 | **L4 HUMAN GATE** |
| S2-20 | Merge `stage-2` → `develop`. **Only after S2-19 passes.** | S2-19 | — |

---

## 7. Definition of Done

**Gate:** `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` ✓ · `pnpm build` ✓

**Behaviour** (representative; the full list is fixed at kickoff reconciliation):

- [ ] On a 500-entry fixture in a 24-row terminal, `lastFrame()` contains **at most 20 entry rows** —
      the proof that windowing slices before mapping rather than after.
- [ ] Holding ↓ past the viewport edge scrolls the window; the cursor stays ≥ 2 rows from the frame
      edge until the list ends.
- [ ] `/` then `re` reduces the frame to matching entries only; the status bar shows the filter and
      both counts; `⎋` restores both the full list and the originally selected name.
- [ ] `s` cycles the sort and the **selected filename is unchanged across the transition** — the
      name-anchored cursor invariant from ADR-0006.
- [ ] A binary fixture previews as a placeholder; `lastFrame()` contains **no** `\x00` and no raw
      escape byte.
- [ ] A fixture file containing `\x1b[2J` previews with the sequence escaped and visible.
- [ ] A FIFO fixture renders a placeholder and the test completes — proving no read was attempted.
      (This test hangs forever if the `lstat` guard regresses; it is the guard's alarm.)
- [ ] `NO_COLOR=1` produces a frame with zero ANSI SGR sequences.
- [ ] Resizing from 120 to 60 columns collapses the preview pane; the listing stays intact.
- [ ] A `readdir` failure renders a one-line sanitized reason and `q` still exits.

**Artifacts:**

- [ ] `test/__snapshots__/*.txt` committed for: single pane · two pane 80×24 · two pane 120×40 ·
      filter active · help overlay · error state · narrow (60 col) · binary preview.
- [ ] ADR-0006 (reducer + name-anchored cursor), ADR-0007 (alternate screen).

**Human gates:**

- [ ] **CHECKPOINT 2 (S2-19).** The maintainer runs `glim` on a real directory and confirms: colour
      contrast on the selected row is readable in their terminal theme; box-drawing characters render
      in their font (or the ASCII fallback is acceptable); scrolling a large directory does not
      flicker; the alternate screen restores their scrollback on exit. **Every one of these is L4 by
      definition — I cannot see colour, fonts, or flicker.** This is the last checkpoint; Stage 3
      changes nothing visual.

**Docs:** log complete · ADRs written · `docs/STATE.md` updated (incl. `Branch`) · `§10 Handoff`
written · **`docs/version/stage2.md` retrospective written** (`AGENTS.md §4.6`).

**Branch (`AGENTS.md §5.1`):** all work on `stage-2`, cut from `develop` after Stage 1 was signed off ·
one commit per task ID with a `Verified:` line · merged to `develop` only after CHECKPOINT 2 (S2-20).

---

═══════════════════════════ BUILD LINE ═══════════════════════════

> **Frozen at the first commit of Stage 2 — not before.** See the Status note at the top of this file.

---

## 8. Implementation log

### YYYY-MM-DD

---

## 9. Deviations from spec

| Task | Spec said | Reality | Why | Resolution |
|---|---|---|---|---|

---

## 10. Handoff → v3

**State of the codebase.**

**Architecture as it stands.**

```
```

**Load-bearing decisions carried out.**

**Known debt carried forward.**

**Read this doc only if:**
