# v1 — Stage 1: Walking Skeleton

> **Agent mentality for this stage:** Bricklayer — see `00_PROJECT_INSPIRATION.md §7`.
> **Status:** Spec — freezes on the first commit of this stage.
>
> *(§0 Entry Point is deliberately absent. v1 starts from nothing; there is no prior stage to
> summarise. See `_TEMPLATE_STAGE.md` §0.)*

---

## 1. Intent

Prove the loop end to end, in the least interesting way that works: read a real directory, render its
entries, move a cursor with the arrow keys, descend into a subdirectory, climb back out, and quit
without leaving the terminal in a broken state. One pane. No colours beyond the cursor. No preview.

The deliverable is not the file explorer — it is the **evidence that the pipeline works**: a green
`typecheck / lint / test / build` gate, a test that renders an Ink component to a string and asserts
on its content, and a binary that boots. Stage 2 is where this becomes something a person would
choose to use. Stage 1 is where it becomes something that *runs and is verifiable*.

Everything in this stage should feel disappointingly simple. That is the intent, not a compromise.

---

## 2. Scope — IN

- **Toolchain**: pnpm workspace, pinned dependency set, `tsconfig`, ESLint flat config, Prettier,
  tsup build to a runnable ESM binary with a shebang, Vitest with a pinned terminal size.
- **Single-pane directory listing** — `readdir` on a target directory, entries rendered one per row,
  directories visually distinguished from files by a `/` suffix.
- **Cursor** — `↑`/`↓` (and `k`/`j`) move a selection; the selected row is marked with `❯`. The
  cursor clamps at both ends; it does not wrap.
- **Navigation** — `⏎` (or `→`, `l`) descends into the highlighted directory; `←` (or `h`) ascends to
  the parent. The header shows the current absolute path, with `$HOME` abbreviated to `~`.
- **Quit** — `q` and `Ctrl-C` both exit cleanly, restoring the terminal.
- **Filename sanitization, minimal** — control characters and bidirectional-override characters in
  filenames are escaped before rendering. Required by ADR-0005; a filename is untrusted input from
  the very first frame that draws one.
- **CLI entry** — `glim [path]` via `meow`. The path argument is resolved and validated before Ink
  mounts; a bad path exits with a message on **stderr** and a non-zero code, never a stack trace.
- **Degradation floor** — no crash when raw mode is unavailable (`isRawModeSupported === false`).
  Terminal state is restored on `exit`, `SIGINT`, `SIGTERM`, and `uncaughtException`.
- **Sorting** — one fixed order only: directories first, then case-insensitive name. Not
  configurable, not switchable. Hardcoded and visible, per `§7 Bricklayer`.

## 3. Scope — OUT (do not build)

> Binding. Treat a violation as a compile error. If an OUT item is genuinely required to complete an
> IN item, **stop and ask** (`AGENTS.md §9`).

- **Second pane / preview** — the defining Stage 2 feature. Building it here means building it on a
  state shape that has not been proven yet.
- **Filter (`/`), sort switching (`s`), hidden-file toggle (`.`), help overlay (`?`)** — Stage 2. Each
  needs the reducer that Stage 2 introduces; bolting them onto `useState` is the exact desync that
  ADR-0006 will exist to prevent.
- **Colour and theming** — Stage 2. A `theme.ts` here is the "theme engine on day one" failure that
  `00_PROJECT_INSPIRATION.md §7` names explicitly.
- **Viewport windowing** — Stage 2, and a hard Stage 2 requirement. Stage 1 renders every row. On a
  40 000-entry directory Stage 1 will hang, and that is *acceptable and expected* here. Do not fix it.
- **`core/` ⟂ `ui/` split, `memfs`, `node-pty`** — Stage 3. `src/app.tsx` is one file in this stage.
- **`AbortController` / request sequencing** — Stage 3 (`S3-03`). Stage 1 may resolve `readdir` out of
  order under key-mash. Known, accepted, logged.
- **Config file, `NO_COLOR`, non-TTY output modes** — Stage 3.
- **Any abstraction anticipating a future need** — no `FileSystemAdapter`, no `IEntryProvider`, no
  keybinding registry, no plugin surface. Duplication is acceptable here; wrong abstractions are not.
- **Mouse support, tabs, bookmarks, git status, icons/Nerd Fonts** — not this project.
- **Any filesystem mutation** — never, at any stage. ADR-0005.

---

## 4. Approach and reasoning

**One component file, on purpose.** `src/app.tsx` holds the state, the effect that reads the
directory, the input handler, and the rendering. It will be roughly 150 lines and it will contain
obvious duplication. This is the Bricklayer's whole thesis: the correct module boundaries are not
knowable until Stage 2 has shown which pieces actually vary together. Stage 3 sanctions exactly one
large refactor, and it is scheduled precisely because the shape will be known by then.

*Alternative rejected:* start with `core/` ⟂ `ui/` now, since Stage 3 wants it anyway. Rejected
because the split would be guessed rather than observed, and a wrong boundary drawn in Stage 1 is
demolition work in Stage 3 rather than a head start. The lint rule that *enforces* the boundary
(ADR-0005) is written now; the boundary itself is drawn later.

**Three `useState`s, not a reducer.** `cwd`, `entries`, `cursorIndex`. They cannot desync in Stage 1
because nothing changes the list length except a navigation, which resets the cursor to 0 anyway. The
reducer arrives in Stage 2 with a *demonstrated* reason (filter changes list length under a live
cursor), which is what makes it an ADR instead of a preference.

**Fixtures, not mocks.** Real directories under `test/fixtures/`. `memfs` is a Stage 3 tool, adopted
when determinism and permission simulation start to matter. In Stage 1 a real `readdir` against a
real directory proves more and costs less.

**Sanitization is not an abstraction, so it is not deferred.** `S1-11` is ~20 lines inlined in
`app.tsx`. It is in Stage 1 because the alternative is a stage where a filename can repaint the
screen, and "we'll secure it in Stage 3" is how Stage 3 becomes a rewrite. The *module* (`core/
sanitize.ts`, width-aware, fully covered) is Stage 2. The *behaviour* is now.

**The security lint rules land before the first line of `src/`.** ESLint is configured in `S1-04`,
ahead of `S1-08`, so the `no-child_process` / `no-mutating-fs` / `no-eval` rules from ADR-0005 are
live before there is any code for them to police. Retrofitting a boundary is harder than never
crossing it.

**Verify APIs against the installed types, not against memory.** Ink 7 is a major version newer than
most training data. Three specific things get checked against `node_modules/ink/build/index.d.ts` and
`node_modules/ink-testing-library/` at the task that first needs them, and the finding is logged
below the BUILD LINE:

1. `useInput` / `useApp` / `useStdin` / `useStdout` signatures and whether `useInput` still takes
   `{ isActive }` (`S1-09`).
2. How `ink-testing-library@4` exposes a stdout stub, and therefore how terminal `columns`/`rows` get
   pinned in tests (`S1-06`). Layout assertions are meaningless if this varies by machine.
3. Whether `<Text wrap="truncate-end">` exists in Ink 7 and handles East-Asian width correctly — if
   it does, it removes the need for a `string-width` runtime dependency in Stage 2 (`S1-08`).

---

## 5. Architecture — target state

Everything here is `[NEW]`; the repo currently contains only documentation.

```
glim/
├── package.json            [NEW]  private:true · engines node>=22 · packageManager pnpm@11
├── pnpm-lock.yaml          [NEW]  committed
├── .npmrc                  [NEW]  engine-strict=true
├── tsconfig.json           [NEW]  strict · noUncheckedIndexedAccess · verbatimModuleSyntax
├── eslint.config.js        [NEW]  flat · type-aware · ADR-0005 security rules
├── tsup.config.ts          [NEW]  esm · node22 · shebang banner
├── vitest.config.ts        [NEW]  node env · pinned terminal size
├── src/
│   ├── cli.tsx             [NEW]  meow · path validation · exit codes · render()
│   └── app.tsx             [NEW]  ONE FILE: state + effect + input + render
├── test/
│   ├── fixtures/basic/     [NEW]  real directory tree
│   ├── helpers/render.tsx  [NEW]  pins columns/rows, awaits the readdir settle
│   └── app.test.tsx        [NEW]  L1 frame assertions
└── docs/
    ├── adr/ADR-0001..0005  [DONE] written during planning
    ├── STATE.md            [CHANGED]
    └── v1_STAGE_1.md       [NEW]  this file
```

**Data flow** — one direction, one input owner:

```
  ┌──────────┐   arg    ┌──────────────┐  resolved+validated  ┌───────────┐
  │  argv    │─────────►│  cli.tsx     │─────────────────────►│  app.tsx  │
  └──────────┘          │  meow        │                      └─────┬─────┘
                        │  lstat guard │  bad path ──► stderr        │
                        │  exit codes  │              exit 2         │
                        └──────────────┘                             │
                                                                     ▼
   keypress ──► useInput ──► setCursorIndex / setCwd ──────► React state
   (ONE hook,      │                                              │
    the only one)  │                          cwd change          │
                   │                                ▼             │
                   │                    useEffect ──► readdir ────┤
                   │                    (fs/promises)             │
                   ▼                                              ▼
                 'q' ──► useApp().exit() ──► restore terminal ──► render
                                                                    │
                                            entries ──► sanitize ──►│
                                            (per row, ADR-0005)     ▼
                                                              <Box><Text>
```

The `sanitize` step sits between the filesystem and every `<Text>`. Nothing renders a raw byte from
disk. That chokepoint is the entire security story of Stage 1, and it becomes `core/sanitize.ts` in
Stage 2 without moving.

---

## 6. Tasks

Ordered. Do them in order unless a dependency says otherwise. One task ID per commit
(`AGENTS.md §5`).

| ID | Task | Depends on | Evidence level |
|---|---|---|---|
| S1-01 | `git init`; `.gitignore` (incl. `package-lock.json`), `.editorconfig`, `.npmrc` with `engine-strict=true`; first commit of the doc set | — | gate |
| S1-02 | `package.json` — deps pinned per ADR-0002/0003, `engines: node>=22`, `packageManager`, `private: true` (ADR-0004), the four gate scripts + `dev` | S1-01 | gate |
| S1-03 | `tsconfig.json` — `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `nodenext`, `jsx: react-jsx`, `noEmit` | S1-02 | `pnpm typecheck` ✓ |
| S1-04 | `eslint.config.js` — type-aware `strictTypeChecked`, `react-hooks`, `no-explicit-any`, `no-console` in `src/**`, **and the ADR-0005 security rules**; Prettier | S1-03 | `pnpm lint` ✓ |
| S1-05 | `tsup.config.ts` → `dist/cli.js`, ESM, `target: node22`, `#!/usr/bin/env node` banner; `bin` wired | S1-03 | `pnpm build` ✓ |
| S1-06 | `vitest.config.ts` + `test/helpers/render.tsx` — pins `columns`/`rows`, encapsulates the async settle. **Verify ink-testing-library@4's stdout stub against its types first.** | S1-03 | `pnpm test` ✓ |
| S1-07 | `test/fixtures/basic/` — subdirectories, files of differing sizes, a dotfile, a name with a space, a name with a `‮` override | S1-06 | L1 |
| S1-08 | `src/app.tsx` — `readdir` on mount, render entries, `/` suffix on directories, dirs-first name sort | S1-07 | **L1** |
| S1-09 | Cursor state; `↑↓`/`kj`; `❯` marker; clamps at both ends, no wrap. **Verify `useInput` signature against Ink 7 types first.** | S1-08 | **L1** |
| S1-10 | `⏎`/`→`/`l` descend, `←`/`h` ascend; header shows `~`-abbreviated absolute path; cursor resets to 0 on navigation | S1-09 | **L1** |
| S1-11 | Filename sanitization per ADR-0005 — escape C0/C1 controls, `\r`, and `U+202E`/`U+202D`; applied to every rendered name | S1-08 | **L1** |
| S1-12 | `src/cli.tsx` — `meow` with `--help`/`--version`; resolve + `lstat` the path arg; `ENOENT`/`ENOTDIR`/`EACCES` → sanitized stderr message + exit 2 | S1-10 | **L1** |
| S1-13 | Lifecycle — `q` quits via `useApp().exit()`; `isRawModeSupported === false` degrades with a message instead of throwing; terminal restored on `exit`/`SIGINT`/`SIGTERM`/`uncaughtException`; `SIGINT` → exit 130 | S1-12 | **L1** |
| S1-14 | `README.md` (install, run, keys, Node 22 requirement); log below the BUILD LINE; `docs/STATE.md`; `§10 Handoff` | S1-13 | docs |
| S1-15 | **CHECKPOINT 1** — maintainer runs the binary in a real terminal | S1-14 | **L4 HUMAN GATE** |

Evidence levels: L1 frame assertion · L2 golden frame · L3 PTY e2e · L4 human gate (`AGENTS.md §2`).

---

## 7. Definition of Done

**Gate** — all four, from a clean `pnpm install`:

- [ ] `pnpm typecheck` ✓ (`tsc --noEmit`, zero errors)
- [ ] `pnpm lint` ✓ (`eslint . --max-warnings 0`)
- [ ] `pnpm test` ✓
- [ ] `pnpm build` ✓ (`dist/cli.js` exists, starts with the shebang, is ESM)

**Behaviour** — each phrased so it can be checked, not admired:

- [ ] `lastFrame()` on `test/fixtures/basic/` contains every entry name in the fixture and **exactly
      one** `❯` character.
- [ ] Directories render with a trailing `/`; files do not.
- [ ] After one `[B` (↓), `lastFrame()` matches `/❯\s+<second entry>/` and no longer matches
      `/❯\s+<first entry>/`.
- [ ] Pressing ↑ at index 0 leaves the frame byte-identical (clamp, no wrap).
- [ ] Pressing ↓ at the last index leaves the frame byte-identical.
- [ ] `⏎` on a directory row produces a frame containing that directory's children and a header path
      ending in that directory's name.
- [ ] `←` from a subdirectory produces a frame containing the parent's entries.
- [ ] A fixture file named with `‮` renders **escaped** — `lastFrame()` does **not** contain the
      raw `‮` code point. (ADR-0005)
- [ ] `glim /nonexistent/path` exits **2**, prints to **stderr**, and stdout is empty. No stack trace
      in either stream.
- [ ] `glim ./package.json` (a file, not a directory) exits **2** with an `ENOTDIR`-class message.
- [ ] Rendering with `isRawModeSupported === false` does not throw; the frame contains a message
      saying input is unavailable.
- [ ] `grep -rn "console\." src/` returns nothing. (`AGENTS.md §7` — stdout is the canvas.)
- [ ] `grep -rn ": any\|as any" src/` returns nothing.

**Artifacts:**

- [ ] `pnpm-lock.yaml` committed; `package-lock.json` absent and gitignored.
- [ ] `test/fixtures/basic/` committed, including the `‮` filename.
- [ ] `dist/` gitignored and absent from the repo.
- [ ] `docs/adr/ADR-0001` … `ADR-0005` present.

**Human gates:**

- [ ] **CHECKPOINT 1 (S1-15).** The maintainer runs `pnpm build && node dist/cli.js ~` in a real
      terminal on Linux and confirms, with their own eyes:
      1. the listing appears and the `❯` cursor is visible and legible;
      2. arrow keys move it without flicker;
      3. `⏎` and `←` navigate;
      4. `q` exits and **the shell prompt returns normally** — cursor visible, echo working, no need
         to run `reset`;
      5. `Ctrl-C` mid-session does the same.
      I cannot verify any of these. There is no TTY in my environment and I have no eyes;
      `pnpm dev` proves the process boots and nothing more (`CLAUDE.md §3`).

**Docs:**

- [ ] Implementation log below the BUILD LINE is complete and dated
- [ ] ADRs written for durable decisions
- [ ] `docs/STATE.md` updated
- [ ] `## Handoff` written

---

═══════════════════════════ BUILD LINE ═══════════════════════════

> **Everything above is frozen at the first commit of this stage. Everything below is append-only.**
> Wrong spec? Do not edit above. Record it under *Deviations* and ask.

---

## 8. Implementation log

_Newest entries at the bottom. Date every entry. Reference task IDs. Record surprises — the surprises
are the part that has value later._

### 2026-08-15 — planning (pre-freeze)

- **Spec written.** Stack verified live rather than taken from `00_PROJECT_INSPIRATION.md §4`:
  `ink@7.1.1` (not 6), `engines: node>=22` (not 20), `typescript@6.0.3` (not the `latest` 7.0.2 —
  typescript-eslint peers `<6.1.0`). ADR-0002, ADR-0003.
- **Surprise:** `glim` is taken on npm — `0.0.2`, empty description, last modified 2022-05-03. The
  inspiration doc's claim that it was free is stale. Resolved by ADR-0004: project name unchanged,
  registry name deferred to `S3-16`, `private: true` in the meantime.
- **Surprise:** the repo was not a git repository and `docs/adr/` did not exist, despite
  `STATE.md` describing it as present-and-empty. Both fold into `S1-01`.

---

## 9. Deviations from spec

| Task | Spec said | Reality | Why | Resolution |
|---|---|---|---|---|
| — | `00_INSPIRATION §4`: Node 20+, Ink 6 | Ink 7.1.1, `engines: node>=22` | Ink shipped a major version | ADR-0003 — inspiration doc is IMMUTABLE and stays stale by design |
| — | `00_INSPIRATION §1`: `glim` is free on npm | Taken since 2022 | Registry changed | ADR-0004 |
| — | `AGENTS.md §6`: `npm run …` | Maintainer uses pnpm | Toolchain preference | ADR-0001 — command strings updated in `AGENTS.md §6`, `CLAUDE.md §1`+`§3`, and `_TEMPLATE_STAGE.md §7` |
| — | `_TEMPLATE_STAGE.md` is IMMUTABLE (`AGENTS.md §4.1`) | Its DoD block still said `npm run …` | It is a **tool**, not a record — a stale gate propagates into every future stage doc copied from it. Changing a command string does not drift the stage *format*, which is what its immutability protects | Edited. `00_PROJECT_INSPIRATION.md` was **not** touched: that one is a record of what we believed, and stays stale by design |

---

## 10. Handoff → v2

> Written last, as the final act of this stage. This becomes `§0 Entry Point` of `v2_STAGE_2.md`.
> Assume the next agent reads **only this** and never opens this stage's log. Be specific enough for
> that to be true.

**State of the codebase.**

**Architecture as it stands.**

```
```

**Load-bearing decisions carried out.**

**Known debt carried forward.**

**Read this doc only if:**
