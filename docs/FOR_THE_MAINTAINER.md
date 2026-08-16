# For the maintainer

> Written 2026-08-16, at the close of Stage 3. This is the "what now" document: what state the
> project is in, what only you can do, and where to start reading.

---

## Short answer

**The project is complete.** All three stages are built, tested and documented. Nothing is
half-finished, and there is no work queued that I am waiting on you to unblock.

Three things remain, and **all three are decisions rather than work**:

| # | Decision | Consequence if you never make it |
|---|---|---|
| 1 | Sign off Stage 3 → I merge `stage-3` into `develop` | The work sits on a branch. Nothing breaks. |
| 2 | Move `main` yourself | `main` stays at the planning baseline. Nothing breaks. |
| 3 | Resolve the npm package name, **only if you ever want to publish** | You can never `npm publish`. You can still use the app forever. |

If you do none of them, `glim` still runs today and every day from now on.

---

## Start using it right now

```bash
cd /home/user228/Local_Storage/development/WebDev/intentional-projects/tui-file-explorer
pnpm install
pnpm build
node dist/cli.js ~
```

That is the whole thing. Two commands and it runs.

To type `glim` instead of `node dist/cli.js`, pick one. **Both verified on your machine**:

```bash
# Option A — a symlink into ~/.local/bin, which is already on your PATH.
ln -sf "$PWD/dist/cli.js" ~/.local/bin/glim
glim ~
# undo: rm ~/.local/bin/glim
```

```bash
# Option B — a shell alias. Touches nothing outside your shell config.
echo "alias glim='node $PWD/dist/cli.js'" >> ~/.bashrc && source ~/.bashrc
# undo: delete the line
```

> **Not** `pnpm link --global` — I tried it and it fails here with
> *"The configured global bin directory /home/user228/.local/share/pnpm/bin is not in PATH"*.
> It would need `pnpm setup` and a shell restart first. The symlink above skips all of that,
> because `~/.local/bin` is already on your PATH.

Either way the symlink points at `dist/cli.js`, so **rebuilding updates the command automatically** —
no re-linking after a change.

**Requirements:** Node 22 or newer, and pnpm. That is all — `glim` has three runtime dependencies
(`ink`, `meow`, `react`) and **no native code**, so there is nothing to compile and nothing that can
fail to build on your machine.

Keys: `↑↓`/`kj` move · `⏎`/`→`/`l` open · `←`/`h` up · `/` filter · `.` hidden · `s`/`S` sort ·
`?` help · `q` quit. Press `?` first — it is the fastest way in.

---

## What I need you for

Honestly: **very little, and only for things that are structurally impossible for me.**

### 1. Eyes (the only thing I genuinely cannot do)

I have no terminal and no eyes. Every claim I make about the UI is backed by a string assertion or a
committed frame, and there is a small set of judgements that no assertion can reach:

- whether the colours are legible **in your theme**
- whether the box-drawing characters render **in your font**
- whether scrolling **feels** smooth
- whether the app **feels** like something you would choose to use

You have already signed off on all of these at Checkpoints 1 and 2, and Stage 3 changed **no rendered
byte** — proven by nine golden frames staying byte-identical through the entire refactor. So this is
done unless you change something visual.

### 2. `main`

`AGENTS.md §5.1` says an agent never commits to `main`, never merges into it, and never checks it out
to make a change. That is your branch. It currently sits at the planning baseline, deliberately.

### 3. Decisions that are yours, not mine

Things like: should this be published, under what name, should it support macOS, is a feature worth
adding. I can argue either side and I will tell you what each costs — but choosing is yours.

### 4. Nothing else

The project maintains itself in the sense that matters: four commands (`typecheck`, `lint`, `test`,
`build`) fail loudly if anything regresses, CI runs them on two Node versions, and the security
boundary is enforced by lint rather than by anyone remembering. You do not need to police it.

---

## What "complete" actually means here

The project defined its own finish line in `00_PROJECT_INSPIRATION.md §9`. Against it:

| The project's own definition of done | Status |
|---|---|
| 1. Clone, install, run — working explorer in under two minutes | ✅ two commands |
| 2. Read `v3 §Entry Point` and understand the architecture without reading v1 or v2 | ✅ |
| 3. `pnpm test` shows the real-TTY end-to-end suite passing | ✅ 8 PTY tests, 189 total |
| 4. Point it at `/`, mash keys for a minute, do not crash it | ⬜ **your call** — see below |
| 5. Read `docs/adr/` and know why every non-obvious choice was made | ✅ 8 ADRs |

Item 4 is the only one with a box unticked, and it is unticked because it is yours by definition. I
have automated as close to it as can be automated — a real pseudo-terminal navigating into a
permission-denied directory, key-mash across overlapping navigations, `Ctrl-C`, a 24×8 terminal — but
"it survived a minute of *your* hands on *your* filesystem" is not a thing I can assert.

If you want to close it:

```bash
node dist/cli.js /          # then hold arrow keys, mash ⏎ and ←, try / and s, press q
```

It should never crash, and `q` should hand your shell back cleanly.

---

## Where to start reading

**In this order.** Each stands alone, but they build.

1. **[`LEARNING_TUI.md`](LEARNING_TUI.md)** — start here. Twelve TUI concepts in the order you would
   meet them if you built this yourself, each tied to the file that implements it. Written for
   someone who has never built a terminal UI. It ends with the order to build your own.

2. **[`version/stage1.md`](version/stage1.md) → [`stage2.md`](version/stage2.md) →
   [`stage3.md`](version/stage3.md)** — the project's story. Not summaries: each has a *"what we got
   wrong"* section, and those are the parts worth your time. Stage 1's is about a test fake that was
   better behaved than reality and hid a shipped crash; Stage 2's is about a test whose positive case
   could never fail; Stage 3's is about four bugs that were in the tests rather than the app.

3. **[`adr/`](adr/)** — eight decisions, one file each, each stating what was rejected and why. Read
   these before changing anything that looks odd. Several things in this codebase look wrong and are
   not, and the ADR explains which.

4. **[`STATE.md`](STATE.md)** — where the project is, and a *"measured, not assumed"* table of things
   that turned out differently from what the plan assumed.

5. **[`DEPLOYING_A_TUI.md`](DEPLOYING_A_TUI.md)** — how programs like this reach users, if you ever
   want that.

**Skip:** `v1_STAGE_1.md`, `v2_STAGE_2.md`, `v3_STAGE_3.md` unless you want the frozen specs and
task-by-task logs. The retrospectives cover the same ground in prose.

---

## If you want to change something

The rules that keep this codebase honest, in one place:

- **Work on a branch.** `main` is yours; `develop` integrates; `feature/x` or `stage-N` for work.
- **The gate is not optional.** `pnpm typecheck && pnpm lint && pnpm build && pnpm test`, all four.
- **Build before test.** The end-to-end tests drive the *built* binary and silently skip themselves
  if `dist/` is missing — so a green `pnpm test` on a fresh clone does not mean they ran.
- **Never regenerate a golden frame without reading the diff.** They are the only thing standing
  between a refactor and a silent layout regression.
- **Never assert on a raw frame** (strip ANSI, or your test depends on `FORCE_COLOR`), and **never
  wait a fixed number of milliseconds** (wait for a condition).

Things that look removable but are not — the full list is in
[`version/stage3.md §7`](version/stage3.md), but the three most likely to catch you:

- `core/config.ts` reads fields one at a time instead of spreading. That is the prototype-pollution
  defence, not verbosity.
- The `unknown` round-trip on `isRawModeSupported` in `app.tsx` looks like a pointless conversion.
  Removing it reintroduces a crash that shipped once already.
- `test/helpers/render.tsx` is not boilerplate. It exists because the published testing library
  cannot pin terminal size or simulate a non-TTY stdin.

---

## The one thing I would ask

Read the three *"what we got wrong"* sections. They cost nothing to read and they are the only part
of this documentation that could not have been written by looking at the code. Everything else you
could reconstruct; those you could not.
