# Building a TUI, step by step

> **Who this is for:** you have written web or Node code, and you have never built a terminal UI.
> **What it is:** every concept `glim` uses, in the order you would meet them if you built it
> yourself, each tied to the file in this repo that implements it.
>
> Read it top to bottom once. After that it works as a reference — each step is self-contained.

---

## Part 0 — The one idea you have to accept first

A browser gives you a **document**. You describe elements, and something else decides pixels.

A terminal gives you a **grid of character cells and a byte stream**. That is all. Roughly 80×24 of
them, each holding one character. You do not draw pixels, you do not have z-index, and there is no
layout engine underneath you unless you bring one.

And the terminal is not a display — it is a **machine that executes the bytes you send it**. Print
the three bytes `ESC [ 2 J` and the screen clears. Print `ESC [ 3 1 m` and everything after it turns
red. There is no separation between "content" and "commands": they travel the same channel, and the
terminal decides which is which by looking for `ESC`.

Three consequences follow, and most of this document is those three consequences:

1. **Everything is a string you print.** Layout, colour, the cursor position — all escape sequences.
2. **You own the whole screen.** Nothing repaints for you. If you write 40 rows, 40 rows are written.
3. **Any text you did not write yourself is executable input.** A filename is untrusted bytes.

---

## Step 1 — Get something on screen

The naive version of a file listing is one line of Node:

```js
const names = await readdir('.');
console.log(names.join('\n'));
```

That is `ls`. It is genuinely fine, and if that is all you need, stop here.

It becomes a TUI the moment you want the screen to **change in response to a keypress** — because
now you need to know what is currently on screen, erase it, and draw the new version. Doing that by
hand means tracking cursor position and emitting escape sequences yourself. That is what Ink is for.

**Ink is React that renders to a string instead of a DOM.** Same components, same hooks, same mental
model. `render(<App />)` produces text, works out what changed since the last frame, and writes the
minimum bytes needed to update the terminal.

📁 `src/cli.tsx` — the entry point. `render(<App cwd={target.path} />, { alternateScreen: true })`.

---

## Step 2 — The render loop, and why flicker happens

In a browser, a wasteful re-render costs you some CPU and you never see it.

In a terminal, **every row you render is bytes written to a device**. Re-render the whole list on
each cursor move and the terminal physically rewrites those lines — which you see as flicker.

Two defences, both in this codebase:

**Memoize rows.** A parent state change re-renders the whole tree by default. `Row` is wrapped in
`memo` so moving the cursor rewrites two rows (the one you left and the one you arrived at), not
forty.

**Never render what is off screen.** See Step 7.

📁 `src/ui/Row.tsx` — `export const Row = memo(({ entry, selected, width }) => …)`

> **Try it:** delete the `memo` and run `glim` on a large directory. Hold `↓`. That visible tearing
> is the concept.

---

## Step 3 — Layout on a character grid

Ink embeds **Yoga**, the same flexbox engine React Native uses. So this works:

```tsx
<Box flexDirection="row">
  <Box width={35}><List /></Box>
  <Box flexGrow={1}><Preview /></Box>
</Box>
```

Widths are **cells**, not pixels. `width={35}` means thirty-five characters.

Three things that surprised us, and they are the kind of thing you only learn by rendering:

**There is no `overflow: hidden` that saves you.** Content taller than its container is not clipped —
Ink lays the surplus rows *over* the ones above. In a 10-row terminal our help overlay rendered
`go to the parent directorytory`, two bindings merged into one line. The fix is that any fixed-height
content must clip *itself*.

**An empty `<Text>` has zero height.** `<Text>{''}</Text>` does not produce a blank row;
`<Text>{' '}</Text>` does. We lost the help overlay's spacer rows to this and only noticed because a
regenerated golden frame came back identical to the broken version.

**Measure against the right width.** A bordered box consumes two columns. Compute your text budgets
from the *inner* width or your header ends up a column short of your body, and the right edge looks
ragged.

📁 `src/ui/Frame.tsx` — `const inner = Math.max(width - 2, 1);`
📁 `src/ui/Help.tsx` — `lines.slice(0, Math.max(height, 1))`

---

## Step 4 — Input, and the thing called raw mode

Normally your terminal is in **cooked mode**: it buffers a whole line, lets the user backspace, and
hands your program the line only when they press Enter. Excellent for `read -p`, useless for a UI
that must react to `j`.

**Raw mode** turns that off — every keypress arrives immediately, unbuffered, unechoed. That is what
`useInput` needs, and enabling it has consequences you now own:

- **You must turn it off again.** A process that dies in raw mode leaves the user's shell with no
  echo and no line editing. They will type `reset` blind.
- **`Ctrl-C` stops being a signal.** In raw mode it arrives as byte `0x03` like any other key. If you
  do not handle it, `Ctrl-C` does nothing. (Ink handles it for you via `exitOnCtrlC`.)
- **Raw mode is not always available.** If stdin is a pipe, there is no terminal to put into raw
  mode.

That last one bit us for real. Ink types `isRawModeSupported` as `boolean`, but assigns it straight
from `stdin.isTTY` — and **Node sets `isTTY` to `undefined`, never `false`**, on a non-TTY stream.
Passing it through unchanged gave `useInput` `{ isActive: undefined }`, which fell back to its default
of `true`, called `setRawMode`, and threw. `glim < /dev/null` printed a crash instead of a listing.

📁 `src/app.tsx`:
```ts
const rawModeFlag: unknown = stdin.isRawModeSupported;
const canReadInput = rawModeFlag === true;
```
Routed through `unknown` on purpose: `Boolean(...)` fails the "redundant conversion" lint rule,
because per Ink's declared type it *is* redundant. That lint error is the type system confidently
repeating Ink's mistake.

### Keys arrive as escape sequences

There is no `KeyboardEvent`. Pressing `↓` sends three bytes: `ESC [ B`. Ink parses the common ones
into a `key` object for you, but this is why the test harness defines:

```ts
const ESC = String.fromCharCode(0x1b);
export const KEY = { up: `${ESC}[A`, down: `${ESC}[B`, … };
```

📁 `test/helpers/render.tsx`

> Built with `String.fromCharCode` rather than typed literally, because a raw `0x1b` byte in source
> is invisible in a diff. We learned that the hard way — three separate times an invisible control
> character got written into this codebase.

---

## Step 5 — One input owner, and the state machine

The single most important structural rule in a TUI:

> **Exactly one `useInput` may be mounted at a time.**

Two mounted hooks both receive every keypress. The symptom is not an error — it is the cursor moving
two rows per press, and it is genuinely hard to diagnose because nothing is broken, everything just
happens twice.

But `glim` has three keymaps. `j` moves the cursor in normal mode, and types the letter "j" in filter
mode. The answer is not a second hook; it is a **mode** in state, with one hook branching on it:

```
        ┌──────────────────────────────────────┐
   ┌───►│                NORMAL                │◄──┐
   │    │  ↑↓ jk move · ⏎ open · / filter · ?  │   │
   │    └────────┬────────────────────┬────────┘   │
   │             │ '/'                │ '?'        │
   │             ▼                    ▼            │
   │      ┌─────────────┐      ┌─────────────┐     │
   │      │   FILTER    │      │    HELP     │     │
   │      │ letters →   │      │  any key ───┼─────┘
   │      │   query     │      └─────────────┘
   │      │ ⏎ commit ───┼──┐
   │      │ ⎋ cancel ───┼──┤
   │      └─────────────┘  │
   └───────────────────────┘
```

📁 `src/app.tsx` — one `useInput`, first branching on `mode`
📁 `src/core/types.ts` — `export type Mode = 'normal' | 'filter' | 'help';`

---

## Step 6 — Async I/O, and results that arrive out of order

The filesystem is slow and fallible. `readdir` on a network mount can take a second and may throw.

Two problems appear that a synchronous mental model hides.

**Unhandled rejections kill the process.** In a web app a failed fetch shows a spinner forever. Here,
an unhandled promise rejection terminates Node — with the terminal still in raw mode. Entering a
`chmod 000` directory did exactly that: `Unhandled Rejection: EACCES … scandir`, and your shell was
left broken. Every async path in a TUI needs a `catch` that turns the failure into a *value*.

**Results arrive in the wrong order.** Press `⏎` then `←` then `⏎` quickly and you have three
overlapping `readdir` calls. Promises resolve in whatever order the disk feels like. The slow first
one can land last and overwrite the newest listing — so the screen shows one directory's contents
under another's name.

The fix people reach for is `AbortController`. **It does not work here:** `fs.promises.readdir`
ignores an `AbortSignal` entirely — hand it an already-aborted signal and it still resolves. We
verified that rather than assuming it.

So cancellation is unavailable, and the mechanism has to be *discarding* instead. Every navigation
increments a counter; each result carries the counter it was issued under; anything stale is dropped:

```ts
case 'LOADED':
  if (action.requestId !== state.requestId) return state;  // stale, drop it
```

Note that echoing the *directory* back is not enough: navigating a → b → a issues two reads of `a`,
and they are indistinguishable by path. Only a monotonic id separates them.

📁 `src/state/reducer.ts`, `src/state/actions.ts`

---

## Step 7 — Viewport windowing

**The one that makes a TUI a TUI.**

A directory with 40 000 entries has 40 000 rows. There is no DOM to virtualise them for you. Render
them all and the terminal receives 40 000 lines and freezes.

So you slice **before** you map, never after:

```ts
const windowRows = windowSlice(visible, offset, bodyHeight);   // ≤ 20 items
…
{rows.map((entry) => <Row … />)}                                // ≤ 20 components
```

The component that renders rows is never even *shown* the other 39 980. That is a structural defence
rather than a careful one — `List` cannot accidentally map over everything, because it never has it.

The subtle part is the **offset**: where should the window start? Two naive answers are both wrong:

- *Offset = cursor* pins the cursor to the top row. It never appears to move; the list scrolls under
  it on every press.
- *Offset = cursor − height/2* keeps it centred, which means the list scrolls on **every** keypress
  even in the middle of a screenful.

What you want is: **do not scroll until the cursor gets close to an edge**, then scroll just enough.
That needs to know where the window was last time, which makes it derived state *with history*:

```ts
export const nextOffset = (previous, cursor, height, total, margin) => { … }
```

Two properties worth internalising:

- **It is idempotent.** Applying it to its own output changes nothing. That is what makes it safe to
  compute during render (React may render twice).
- **The margin shrinks on small viewports.** A 2-row margin in a 3-row window means the cursor is
  inside both margins at once and the window oscillates. `clamp(floor((height-1)/2), 0, margin)`.

📁 `src/state/selectors.ts` — pure, so the awkward cases (height 0, 1, 4) are tested without rendering

---

## Step 8 — A character is not a cell

`'日'.length === 1`, but it occupies **two** terminal cells. So does most emoji. Combining accents
occupy **zero**.

Get this wrong and every column after the offending name shifts, so a single Japanese filename
misaligns your whole size column.

```ts
export const displayWidth = (text: string): number => { … }   // cells, not .length
export const truncateToWidth = (text, budget, from) => { … }  // never splits a wide char
```

Truncation accumulates **whole codepoints** — it can neither split a surrogate pair (which renders as
`�`) nor leave half of a two-cell character on screen.

📁 `src/core/sanitize.ts`

> **Honest limitation:** this is an approximation of Unicode UAX #11. It covers common CJK and emoji
> ranges and is tested against both, but it does not do grapheme clusters — a flag emoji built from
> two regional indicators will measure wrong. A full implementation means a dependency; we chose the
> approximation and wrote down that we did.

---

## Step 9 — Security: why a filename is dangerous

Back to Part 0: **the terminal executes what you print.**

A file explorer prints filenames. Filenames are chosen by whoever created the file. Therefore a file
explorer prints attacker-controlled bytes to a machine that executes them.

Concrete attacks, all defended in this codebase:

| Input in a filename | What happens if you print it raw |
|---|---|
| `ESC [ 2 J` | clears your screen from inside the listing |
| `ESC ] 0 ; text BEL` | rewrites your terminal's window title |
| `\r` | overwrites the row to its left — hides the real name |
| `U+202E` (RTL override) | `invoice‮gpj.exe` **displays as** `invoice exe.jpg` |
| zero-width joiners | two different files render identically |

The last two are the interesting ones: they are not crashes, they are **lies about what you are
looking at**. In a file manager with a delete key, that is how you get someone to delete the wrong
file.

The defence is one function that everything untrusted passes through:

```ts
sanitizeName('invoice‮gpj.txt')  // → 'invoice<U+202E>gpj.txt'
```

**Escaped, not stripped** — deliberately. If two files differ only by an invisible codepoint,
*removing* it makes them render identically, which is the attack you were defending against. Showing
`<U+202E>` tells the user something is there.

📁 `src/core/sanitize.ts`, and there is a real hostile filename committed at
`test/fixtures/basic/invoice‮gpj.txt` so the defence has something genuine to fail against.

### The other half: bounded, guarded reads

The preview pane reads files. That is where the rest of the danger lives:

- **Never `readFile`.** A 4 GB log must not become a 4 GB allocation because the cursor passed over
  it. Read at most 64 KiB into a fixed buffer.
- **`lstat` first and refuse anything that is not a regular file.** Opening a FIFO or `/dev/zero`
  does not error — it *blocks forever*, in raw mode, with no way out but killing the process from
  another terminal. This is the single most important line in the preview code.
- **Close the descriptor in `finally`.** One leaked per cursor move is `EMFILE` after a few hundred
  keystrokes.
- **Detect binary and refuse.** A NUL byte in the first 8 KiB means stop — otherwise you print raw
  binary, which contains every escape sequence there is.

📁 `src/core/preview.ts`

### And the strongest defence: not having the capability

`glim` never deletes, renames, moves, or writes. That is not a missing feature — it removes an entire
class of bug rather than testing for its absence. It is enforced by lint rules that ban the mutating
half of `node:fs`, all of `child_process`, and every networking module from `src/`.

📁 `eslint.config.js`, `docs/adr/ADR-0005-read-only-by-construction.md`

---

## Step 10 — Degrading instead of breaking

A terminal program runs in conditions a browser never sees:

| Condition | What `glim` does |
|---|---|
| stdout is a pipe (`glim \| head`) | prints a **plain listing**, not a box-drawn frame |
| stdin is a pipe | renders read-only with a notice, instead of throwing on raw mode |
| `NO_COLOR=1` | emits **zero** styling — not just no colour |
| 20-column terminal | truncates; still renders |
| `Ctrl-C` mid-read | exits 130 with the terminal restored |

Two are worth expanding.

**`NO_COLOR` must empty every token, not just the colours.** `bold`, `dim` and `inverse` are escape
sequences too. Because we gate in our own theme rather than relying on the colour library, `NO_COLOR`
beats `FORCE_COLOR` here — verified: `FORCE_COLOR=1` gives 32 escape sequences, `NO_COLOR=1
FORCE_COLOR=1` gives 0.

**Selection must survive without colour.** That is why the cursor is a `❯` glyph and not merely an
inverse-video row.

📁 `src/ui/theme.ts`, `src/cli.tsx`

---

## Step 11 — Testing something you cannot see

This is the part with no web equivalent, and it is the reason this project is testable at all.

**`render()` returns a string.** So a "screenshot" test is just a string assertion:

```tsx
const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
await settled();
expect(stripAnsi(lastFrame() ?? '')).toContain('README.md');
```

Four things we learned the hard way:

**1. Pin the terminal size.** A layout assertion means nothing if `columns` varies between machines.

**2. Never wait a fixed number of milliseconds.** `await settle(50)` is a race with the machine: on a
busy day the directory read lands at 60 ms and your test captures `loading…`. That is a *flaky*
test, which is worse than a failing one because it teaches everyone to re-run the suite. Wait for a
**condition** — here, "the frame stopped changing".

**3. Strip escape sequences before asserting on content.** Six of our test files asserted on raw
frames, so `❯ ESC[1m ESC[36m docs/` failed to match `/❯\s*docs\//`. They passed only because colour
happened to be off; the day `FORCE_COLOR` appeared in the environment, three broke. A layout test must
not depend on an environment variable.

**4. Golden frames.** Snapshot the whole frame to a committed `.txt` file, ANSI stripped so it is
readable in a diff. This is what made the Stage 3 refactor safe: **behaviour is defined as the bytes
rendered**, so moving code is proven correct by the frames being byte-identical. That is a stronger
check than looking — no human eye catches a column shifted by one.

📁 `test/helpers/render.tsx`, `test/golden.test.tsx`, `test/__snapshots__/`

> **A trap worth naming.** Our fake stdin reported `isTTY: false` — a tidy boolean Node never
> actually produces. The fake was *better behaved than reality*, so the raw-mode bug in Step 4 passed
> every test while being broken in the shipped binary. When you write a fake, you are making a claim
> about how a dependency behaves. An untested claim is a guess.

---

## Step 12 — Exiting without wrecking the terminal

You enabled raw mode. You switched to the alternate screen. You hid the cursor. **All of that is
global state on the user's terminal**, and if your process dies without undoing it, their shell is
broken until they run `reset`.

There are four ways out, and every one must restore:

```
  q / Ctrl-C  ──┐
  SIGINT      ──┤
  SIGTERM     ──┼──► instance.unmount()  ──► terminal restored
  uncaught    ──┘
```

📁 `src/cli.tsx`

Two details:

**Use the framework's alternate-screen support if it has one.** Ink's `alternateScreen: true` ties
the restore to unmount. Writing `\x1b[?1049h` by hand means owning the matching `\x1b[?1049l` on all
four routes, and the one you forget is the one that strands the user.

**Validate before you mount.** `glim /nonexistent` prints one line to stderr and exits 2 — *before*
Ink starts. Failing after mount means printing an error over a terminal already in raw mode and the
alternate screen, where the user cannot read it.

---

## Part 2 — The architecture that emerged

Not designed up front. Stage 1 was deliberately one file; the boundaries were drawn in Stage 3, once
we could see which pieces actually varied together.

```
  ┌──────────────────────────────────────────────────────────┐
  │  ui/     React + Ink. Components, hooks, styling.         │
  │          Knows about cells, colours, and Ink.             │
  └───────────────────────────┬──────────────────────────────┘
                              │ imports (one direction only)
  ┌───────────────────────────▼──────────────────────────────┐
  │  state/  Pure. The reducer and its selectors.            │
  │          Knows about cursors and sorting. No I/O.        │
  └───────────────────────────┬──────────────────────────────┘
                              │
  ┌───────────────────────────▼──────────────────────────────┐
  │  core/   Pure + I/O primitives. No React. No Ink.        │
  │          fs · path · preview · sanitize · sort · types   │
  └──────────────────────────────────────────────────────────┘
```

**The arrow only points down**, and that is enforced by a lint rule, not by discipline —
`src/core/**` and `src/state/**` may not import `react`, `ink`, or anything from `ui/`.

Why it is worth the ceremony: **31 of the tests import no renderer at all.** The entire cursor,
sorting, filtering and windowing logic is tested as plain functions — no terminal, no async settle,
no flakiness. Only the things that genuinely need a screen are tested through one.

The rule that keeps it honest: *if the type or function still means something with a layer deleted,
it belongs further down.*

---

## Part 3 — What we actually got wrong

Worth more than the successes, because these are the ones you will repeat.

1. **A fake that was better behaved than reality** hid a shipped crash. (Step 4, Step 11.)
2. **A test whose positive case could never fail** — asserting colour *is* emitted, in an environment
   where colour is never emitted. It would have sat there looking like coverage forever.
3. **Fixed-millisecond waits** produced a flaky snapshot that passed 3 runs and failed the 4th.
4. **Raw control bytes written into source** three separate times — in the project whose entire
   security model is that control characters are dangerous.
5. **Assuming `AbortController` cancels file I/O.** It does not, for `readdir`. Measuring took two
   minutes; the assumption would have shipped a fix that fixed nothing.
6. **Layout bugs invisible to the tests** — a ragged right edge and a column with no gutter, both
   found only by rendering the thing and looking at it.

The pattern: **five of the six were found by running the real program or measuring the real
dependency, not by reasoning about them.**

---

## Part 4 — If you build your own

Order matters more than you would expect. This is the sequence that worked:

1. **Print a list.** No interactivity. Prove the pipeline: build, run, test.
2. **Add a cursor and arrow keys.** You now meet raw mode and escape sequences.
3. **Add navigation.** You now meet async I/O and error handling.
4. **Only now, add a second pane.** Layout problems are much easier once one pane works.
5. **Add modes** (filter, help) — and resist the second `useInput`.
6. **Add windowing before you need it.** Retrofitting it into finished components is a rewrite.
7. **Harden last.** Adversarial inputs, degradation, and the refactor into layers — after the shape
   is known, not before.

Two rules that saved the most time:

- **Never trust a version or an API written in a doc, including your own.** Read the installed
  `.d.ts`. Ink 7 already had `useWindowSize()` and `alternateScreen`, both of which this project's own
  contract told us to hand-roll.
- **You cannot see the screen from inside the program.** Colour contrast, font glyphs and flicker are
  human judgements. Build the automated evidence for everything else, and be explicit about the small
  set of things that genuinely require eyes.

---

## Where to read next, in this repo

| To understand | Read |
|---|---|
| Why any of this exists | `docs/00_PROJECT_INSPIRATION.md` |
| Why a specific decision was made | `docs/adr/` — one file per decision |
| What each stage did, and what it cost | `docs/version/stage1.md` → `stage2.md` → `stage3.md` |
| Where the project is right now | `docs/STATE.md` |
| The rules an agent works under here | `AGENTS.md`, `CLAUDE.md` |
