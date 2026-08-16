# glim

A keyboard-driven terminal file explorer, built as a React component tree with
[Ink](https://github.com/vadimdemedes/ink).

> **Status: Stage 2 of 3 — feature complete.** Two panes with a live preview, filtering, sorting,
> hidden-file toggle, colour, viewport windowing and the alternate screen. Stage 3 adds no features
> — it is hardening: adversarial inputs, a real-PTY test suite, and release engineering. See
> [`docs/STATE.md`](docs/STATE.md) for exactly where the project is.

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

## Keys

| Key | Action |
|---|---|
| `↑` `↓` · `k` `j` | move the cursor |
| `g` · `G` | jump to first / last entry |
| `PgUp` · `PgDn` | move a screen at a time |
| `⏎` `→` · `l` | open the highlighted directory |
| `←` · `h` | go to the parent directory |
| `/` | filter — `⏎` keeps it, `⎋` cancels and restores your selection |
| `.` | show or hide dotfiles |
| `s` · `S` | cycle sort key (name → size → mtime → ext) / reverse it |
| `?` | help |
| `q` · `Ctrl-C` | quit |

The cursor clamps at both ends — it does not wrap. Changing the sort keeps your selection on the
same file rather than on the same row.

Set `NO_COLOR=1` to disable every style, not just colours.

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings 0
pnpm test        # vitest run
pnpm build       # tsup
```

All four must pass before any commit. There are no exceptions and no `--no-verify`.

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

| Document | What it is for |
|---|---|
| [`docs/STATE.md`](docs/STATE.md) | Where the project is *right now*. Read first. |
| [`docs/00_PROJECT_INSPIRATION.md`](docs/00_PROJECT_INSPIRATION.md) | Why this project exists, and why Ink. Immutable. |
| [`docs/v1_STAGE_1.md`](docs/v1_STAGE_1.md) | Stage 1's frozen spec, plus its implementation log. |
| [`docs/v2_STAGE_2.md`](docs/v2_STAGE_2.md) | Stage 2's frozen spec, log and handoff. |
| [`docs/version/stage1.md`](docs/version/stage1.md) | The Stage 1 story: choices, surprises, bugs, mistakes. |
| [`docs/version/stage2.md`](docs/version/stage2.md) | The Stage 2 story, plus the Stage 3 refactor plan. |
| [`docs/adr/`](docs/adr/) | Why each non-obvious decision was made. |
| [`AGENTS.md`](AGENTS.md) · [`CLAUDE.md`](CLAUDE.md) | The operating contract for agents working here. |

## License

MIT
