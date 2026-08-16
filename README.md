# glim

A keyboard-driven terminal file explorer, built as a React component tree with
[Ink](https://github.com/vadimdemedes/ink).

> **Status: Stage 3 of 3 — hardened.** Feature complete since Stage 2; Stage 3 added no features and
> changed no rendered byte. It added the `core`/`ui` separation, a real-pseudo-terminal test suite,
> a config file, and the adversarial coverage below. **189 tests, 20 files** — 92 of which run
> without a terminal at all.

---

## Requirements

- **Node 22 or newer.** Enforced at install time (`engine-strict`). Ink 7 requires it.
- **pnpm.** See [`docs/adr/ADR-0001`](docs/adr/ADR-0001-pnpm-as-package-manager.md).

## Run it

```bash
pnpm install
pnpm build
node dist/cli.js            # current directory
node dist/cli.js ~/projects # or any path
```

Piping works too — `glim` notices it is not talking to a terminal and prints a plain listing
instead of a screen full of box-drawing:

```bash
node dist/cli.js src | head -3
# core/
# state/
# ui/
```

## Keys

| Key               | Action                                                         |
| ----------------- | -------------------------------------------------------------- |
| `↑` `↓` · `k` `j` | move the cursor                                                |
| `g` · `G`         | jump to first / last entry                                     |
| `PgUp` · `PgDn`   | move a screen at a time                                        |
| `⏎` `→` · `l`     | open the highlighted directory                                 |
| `←` · `h`         | go to the parent directory                                     |
| `/`               | filter — `⏎` keeps it, `⎋` cancels and restores your selection |
| `.`               | show or hide dotfiles                                          |
| `s` · `S`         | cycle sort key (name → size → mtime → ext) / reverse it        |
| `?`               | help                                                           |
| `q` · `Ctrl-C`    | quit                                                           |

The cursor clamps at both ends — it does not wrap. Changing the sort keeps your selection on the
same file rather than on the same row.

Set `NO_COLOR=1` to disable every style, not just colours. Selection stays visible because the
cursor is a `❯` glyph rather than merely an inverse-video row.

## Configuration

Optional. `$XDG_CONFIG_HOME/glim/config.json`, falling back to `~/.config/glim/config.json`.

```json
{
  "showHidden": false,
  "sortKey": "name",
  "sortReverse": false,
  "previewMinWidth": 70,
  "listFraction": 0.45,
  "scrollMargin": 2
}
```

Every field is optional. Nothing here can stop `glim` starting: a missing file is silent, and a
malformed one prints a single warning to stderr and runs on defaults.

It is **JSON, never JavaScript** — a `.js` config would be arbitrary code execution by design, running
with your privileges every time the app starts.

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings 0
pnpm build       # tsup
pnpm test        # vitest run
```

All four must pass before any commit. There are no exceptions and no `--no-verify`.

**Build before test.** `test/e2e.test.ts` and `test/cli.test.ts` drive the _built_ binary and skip
themselves when `dist/` is absent — so a green `pnpm test` on a fresh clone does not mean they ran.
CI builds first for exactly this reason.

### Architecture

```
ui/     React + Ink — components, hooks, styling
  ↓
state/  pure — reducer, actions, selectors
  ↓
core/   pure — fs · path · preview · sanitize · sort · config · types · util
```

The arrow points one way only, and that is a lint rule rather than a convention: `src/core/**` and
`src/state/**` may not import `react`, `ink`, or anything from `ui/`. The payoff is that **92 of the
189 tests need no renderer** — all of the cursor, sorting, filtering, windowing and config logic is
tested as plain functions.

### What is tested

| Level | Mechanism                               | Covers                        |
| ----- | --------------------------------------- | ----------------------------- |
| L1    | `lastFrame()` assertions                | content is on screen          |
| L2    | golden frames, committed `.txt`         | layout has not drifted        |
| L3    | **real pseudo-terminal** via `node-pty` | it works as an actual program |
| L4    | a human runs it                         | colour, fonts, flicker        |

Adversaries with named tests: permission-denied directories · symlink cycles · dangling symlinks ·
FIFOs and character devices · 40 000 entries · binary files · escape sequences in file _contents_ ·
RTL-override filenames · CJK and emoji widths · malformed and prototype-polluting config · 20-column
terminals · live resize · piped stdin and stdout · `NO_COLOR`.

---

## Two things worth knowing about the design

**It is read-only, permanently.** `glim` never deletes, renames, moves, or writes anything. This is
not a missing feature — it is the security boundary, and it is enforced by lint rules that ban the
mutating half of `node:fs`, all of `child_process`, and every networking module from `src/`. See
[`ADR-0005`](docs/adr/ADR-0005-read-only-by-construction.md).

**Filenames are treated as hostile input.** A terminal executes the bytes printed to it, so a file
named `$'\e[2J'` can clear your screen from inside a directory listing, and one containing `U+202E`
can make `invoice.txt.exe` display as `invoice.exe.txt`. Every untrusted string is escaped to
`<U+XXXX>` before rendering. There is a committed fixture that carries a real RTL override so the
defence has something genuine to fail against.

---

## Documentation

> **`docs/` is not published.** By the maintainer's decision it is gitignored, so it lives in the
> working directory but not in the repository — a fresh `git clone` will not contain it. The table
> below is a map for anyone working in a checkout that has it.

| Document                                                           | What it is for                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [`docs/LEARNING_TUI.md`](docs/LEARNING_TUI.md)                     | **Start here if you have never built a TUI.** Every concept, step by step, tied to the file that implements it. |
| [`docs/STATE.md`](docs/STATE.md)                                   | Where the project is _right now_. Read first.                                                                   |
| [`docs/00_PROJECT_INSPIRATION.md`](docs/00_PROJECT_INSPIRATION.md) | Why this project exists, and why Ink. Immutable.                                                                |
| [`docs/v1_STAGE_1.md`](docs/v1_STAGE_1.md)                         | Stage 1's frozen spec, plus its implementation log.                                                             |
| [`docs/v2_STAGE_2.md`](docs/v2_STAGE_2.md)                         | Stage 2's frozen spec, log and handoff.                                                                         |
| [`docs/version/stage1.md`](docs/version/stage1.md)                 | The Stage 1 story: choices, surprises, bugs, mistakes.                                                          |
| [`docs/version/stage2.md`](docs/version/stage2.md)                 | The Stage 2 story, plus the Stage 3 refactor plan.                                                              |
| [`docs/version/stage3.md`](docs/version/stage3.md)                 | The Stage 3 story: the refactor, the adversaries, what was dropped.                                             |
| [`docs/v3_STAGE_3.md`](docs/v3_STAGE_3.md)                         | Stage 3's frozen spec, log and handoff.                                                                         |
| [`docs/adr/`](docs/adr/)                                           | Why each non-obvious decision was made.                                                                         |
| [`AGENTS.md`](AGENTS.md) · [`CLAUDE.md`](CLAUDE.md)                | The operating contract for agents working here.                                                                 |

## License

MIT
