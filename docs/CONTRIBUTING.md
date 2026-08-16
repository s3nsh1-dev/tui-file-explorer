# Contributing

## Requirements

- **Node 22 or newer.** Ink 7 requires it, and `engines` enforces it at install time.
  See [`ADR-0003`](adr/ADR-0003-node-22-ink-7-floor.md).
- **pnpm.** Not npm, not yarn. `pnpm-lock.yaml` is the committed lockfile; a `package-lock.json`
  appearing in a diff is a bug. See [`ADR-0001`](adr/ADR-0001-pnpm-as-package-manager.md).

```bash
pnpm install
pnpm build
node dist/cli.js .
```

---

## The gate

Four commands. All four must pass before a change is proposed.

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings 0
pnpm build       # tsup
pnpm test        # vitest run
```

CI runs exactly these on Node 22 and Node 24, plus `pnpm format:check`.

### Build before test — this one bites

`test/cli.test.ts` and `test/e2e.test.ts` drive the **built** binary and **skip themselves** when
`dist/` is absent. A green `pnpm test` on a fresh clone therefore does not mean they ran; it may
mean 17 tests quietly opted out.

CI orders the steps `build` → `test` for this reason. Do the same locally.

---

## Working on a change

- **Branch.** `main` is the maintainer's; `develop` integrates. Work happens on a branch off
  `develop`.
- **One concern per commit.** "While I was in there I also…" is how a reviewable diff stops being
  reviewable.
- **Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before moving code between layers.** The `ui → state →
core` arrow is a lint rule; a change that violates it fails `pnpm lint` rather than getting caught
  in review.
- **Check [`adr/`](adr/) before changing something that looks wrong.** Several things in this
  codebase look odd and are deliberate. The ADR says which, and what was rejected.

---

## Testing conventions

The suite is 189 tests across 20 files, in four levels:

| Level | Mechanism                              | Proves                        |
| ----- | -------------------------------------- | ----------------------------- |
| L1    | `lastFrame()` string assertions        | content is on screen          |
| L2    | golden frames — committed `.txt` files | layout has not drifted        |
| L3    | a real pseudo-terminal via `node-pty`  | it works as an actual program |
| L4    | a human runs it                        | colour, fonts, flicker        |

Rules that are not negotiable, each of which exists because it was violated once:

- **Never assert on a raw frame.** Strip ANSI first, or the test's result depends on whether
  `FORCE_COLOR` happens to be set in that environment.
- **Never wait a fixed number of milliseconds.** Wait for a _condition_. A fixed wait produced a
  snapshot that passed three runs and failed the fourth.
- **Pin the terminal size.** Layout assertions are meaningless if `columns` varies between your
  machine and CI. Use `test/helpers/render.tsx`, which exists precisely because the published
  testing library cannot pin size or simulate a non-TTY stdin.
- **Never bulk-accept snapshots with `-u`.** Golden frames are the only thing standing between a
  refactor and a silent layout regression. Read every diff.
- **Prefer a real fixture to a mock.** A fake that is better behaved than the real filesystem hides
  real crashes — that has happened here.

### Fixtures

`test/fixtures/` is committed and load-bearing. `test/fixtures/basic/` in particular is asserted on
by 8 test files and 9 golden frames, and it deliberately contains awkward names — a space, a
dotfile, and a real `U+202E` right-to-left override.

> **Do not add an unanchored directory name to `.gitignore`.** A bare pattern like `docs/` matches at
> _every_ depth, including `test/fixtures/basic/docs/`. That has untracked a fixture and turned CI
> red on a fresh checkout while the local working tree still looked fine. Anchor repository-root
> patterns with a leading slash: `/report/`, not `report/`.

Fixtures that cannot be committed — FIFOs, sockets, device nodes, mode-`000` directories — are
created at test time under `test/fixtures/**/.generated/` and are ignored.

---

## What is deliberately out of scope

`glim` is **read-only, permanently**. It never deletes, renames, moves, or writes. Lint rules ban
the mutating half of `node:fs`, all of `child_process`, and every networking module from `src/`.

A pull request adding file mutation is not a feature request — it removes the security boundary the
project is built on. Read [`ADR-0005`](adr/ADR-0005-read-only-by-construction.md) first; if the
argument there is wrong, the ADR is what needs replacing.

---

## Configuration

Optional, at `$XDG_CONFIG_HOME/glim/config.json` (falling back to `~/.config/glim/config.json`).

It is **JSON, never JavaScript**. A `.js` config would be arbitrary code execution by design,
running with the user's privileges on every start. Fields are read one at a time rather than spread,
which is the prototype-pollution defence — keep it that way when adding one.

A missing file is silent. A malformed one prints a single warning to stderr and runs on defaults.
Nothing in the config can stop `glim` starting.
