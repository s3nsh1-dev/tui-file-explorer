# Stage 3 — Production · Retrospective

> **IMMUTABLE once written.** This is history, and the last of three. Read
> [`stage1.md`](stage1.md) → [`stage2.md`](stage2.md) → this file in order and the whole project's
> reasoning is there.
>
> **This document carries the same extra load as Stage 2's.** The maintainer waived the spec-review
> gate again — *"i leave you in charge decide whatever you like to reach the goal"*. §2 is the
> substitute for the review that did not happen.

---

## At a glance

| | |
|---|---|
| **Branch** | `stage-3` |
| **Cut from `develop`** | 2026-08-16 (at `b93c909`) |
| **Merged to `develop`** | _pending — S3-24, after sign-off_ |
| **Signed off by** | _pending_ |
| **Commits** | 7 |
| **Tests at close** | **189 passing, 20 files** (36 → 136 → 189) |
| **Of those, needing no renderer** | **92** — pure logic, no terminal, no async settle |
| **Source** | 1 943 lines across 23 modules |
| **Test** | 2 877 lines — still ahead of source |
| **Evidence levels reached** | L1 frame · L2 golden · **L3 real PTY** · L4 human |
| **Gate at close** | typecheck ✓ · lint ✓ · test ✓ · build ✓ |
| **Spec** | [`docs/v3_STAGE_3.md`](../v3_STAGE_3.md) |

---

## 1. What this stage was for

Stage 2 built something that works when the filesystem cooperates. Stage 3 asked what happens when it
does not, and it **added no user-facing features** — every keybinding a user can press today existed
before this branch was cut.

Three things happened:

**The `core/` ⟂ `ui/` split**, the one large refactor this project sanctions, deferred until the shape
was known rather than guessed. The measurable result: **92 of 189 tests now run without importing a
renderer at all** — the entire cursor, sorting, filtering, windowing, width, config and path logic is
tested as plain functions. No terminal, no async settle, no flakiness.

**The adversary list**, turned from a plan into named tests: permission-denied directories, symlink
cycles, FIFOs and devices, a 40 000-entry directory, binary files, hostile filenames, malformed
config, tiny terminals, pipes.

**L3 evidence.** A real pseudo-terminal, running the built binary, driven by real keystrokes. This is
the level `00_PROJECT_INSPIRATION.md §7` says a Stage 3 deliverable actually is.

The maintainer added four items at kickoff — a DRY audit, centralised types, shared utilities, and
the learning guide. All four are in.

---

## 2. Design choices, and what they cost

### Splitting on "does this cross a layer", not "is this reusable"

**Chose:** `core/types.ts` holds only types that cross a layer boundary — `Entry`, `Status`, `Mode`,
`SortKey`, `PreviewState`, `TargetResult`. `State`, `Action`, component `Props` and `Style` stayed
where they were.
**Over:** hoisting every exported type into one types file, which is what "globally defined" most
naturally suggests.
**Because:** a types file that everything imports couples everything to it. `State` means nothing
without the reducer; moving it would create an import edge for no gain. The test I used: *if I delete
a layer, does this type still mean anything?*
**Cost:** the rule needs judgement, so a future contributor may put something in the wrong place.
It is written at the top of the file, which is the best available defence.

### `core/util.ts`, capped on purpose

**Chose:** a `util` module with exactly three functions — `clamp`, `pluralise`, `isPresent`.
**Over:** three single-purpose modules, or no util file at all.
**Because:** each replaces a real repetition the audit found — 16 hand-rolled `Math.min(Math.max())`
expressions, two inline pluralisations, one `filter` predicate that did not narrow.
**Cost:** `util` is a magnet. The file documents a two-part admission rule (used by two modules in
different directories, *and* has no domain of its own) and says outright that growing past a handful
is a signal to split rather than to keep adding.
**And I did not force it.** `clamp` was imported into `app.tsx` and then removed: the layout maths
there is `Math.max(x, minimum)` — a *floor*, not a two-sided clamp. Applying the utility would have
made those lines worse. **A DRY pass that force-fits its own helper is not a DRY pass.**

### Not writing symlink cycle detection

**Chose:** no code. Three tests instead.
**Over:** the depth cap and visited-set the spec called for.
**Because:** I measured first. The kernel already refuses — `stat` on a symlink loop rejects with
`ELOOP`, and `errors.ts` already mapped `ELOOP` to a readable line. A 40-link chain resolves; a
2-link cycle does not. A hand-rolled cap would have been redundant logic guarding a case that cannot
reach it, in the stage explicitly asked to *remove* redundancy.
**Cost:** we depend on OS behaviour. On a platform with no such limit this would be wrong — which is
survivable because the project is Linux-only by decision, and the tests would fail loudly.

### Discarding stale results instead of cancelling

**Chose:** a monotonic `requestId` in the reducer; stale `LOADED`/`FAILED` dropped.
**Over:** `AbortController`, which the spec called for by name.
**Because:** **`fs.promises.readdir` ignores an `AbortSignal`.** Handed an already-aborted signal it
resolves normally. Verified in about two minutes; assuming otherwise would have shipped a fix that
fixed nothing while looking thorough.
**Cost:** the work still happens — we pay for a read whose result we throw away. Unavoidable without
cancellation support, and cheap: the measurement below says a 40 000-entry read is 294 ms.

Note also that Stage 2's defence (echo the directory back) was genuinely insufficient, not merely
weaker: navigating a → b → a issues two reads of `a` that are indistinguishable by path.

### Config as JSON, read field by field

**Chose:** JSON, parsed then read one field at a time.
**Over:** a `.js`/`.ts` config, and over `{...DEFAULTS, ...parsed}`.
**Because:** a JavaScript config file is arbitrary code execution by design. And a spread or deep
merge is exactly how `{"__proto__": {...}}` graduates from an inert own-property into real prototype
pollution.
**Cost:** more code than a spread, and every new option needs a reader function. That verbosity is
the feature — each field states its type, its range and its fallback in one place.

### Non-TTY stdout prints a plain listing

**Chose:** detect a pipe and print names, one per line.
**Over:** letting Ink render its frame into the pipe (which "works").
**Because:** a box-drawn frame padded with trailing spaces is useless to every tool that would
consume it. `glim | head` should behave like a Unix program.
**Cost:** a second rendering path to keep consistent. Mitigated by sharing `core/sort.ts` with the
interactive view, so the two cannot disagree about order, and by driving both from `test/cli.test.ts`.

---

## 3. What surprised us

### `AbortController` does not cancel file reads

Covered above. The general lesson is the one this project keeps relearning: **measure the dependency,
do not reason about it.** Two minutes of measurement against a plausible-sounding assumption.

### Our own test suite was coupled to an environment variable

Six test files asserted on **raw** frames. `❯ ␛[1m␛[36mdocs/` does not match `/❯\s*docs\//`, so those
assertions only passed because chalk saw a non-TTY stdout and disabled colour. The moment
`FORCE_COLOR` appeared in the environment, three broke — and they broke *during a refactor*, which is
the worst possible time, because the obvious suspect is the refactor.

Fixed by stripping ANSI in every content assertion. The suite now passes identically under
`FORCE_COLOR=3` and `FORCE_COLOR=0`, which is asserted by running it both ways.

### A flaky golden frame, caught by one unlucky run

`settle(50)` is a race with the machine. On a 16-file suite the preview read sometimes landed after
the snapshot, capturing `loading…`. It passed three runs and failed the fourth.

A flaky test is worse than a failing one: it teaches everyone to re-run the suite, and after that a
real failure gets re-run too. Replaced with waiting for a **condition** — frame stability for
component tests, and `waitFor(predicate)` for the PTY tests, where "output stopped changing" is not
the same as "the thing I am waiting for appeared".

### `pnpm` blocked `node-pty` exactly as predicted, a stage late

ADR-0001 predicted this at planning time. It first bit at S1-02 with `esbuild`, two stages early.
When `node-pty` finally arrived it was one line in `pnpm-workspace.yaml` and a non-event — which is
what a correctly recorded decision looks like in practice.

### Prettier had no config and rewrote the codebase

Not new to this stage, but it recurred: running `prettier --write` for the first time produced a
341-line diff of pure style noise, because prettier's defaults are double quotes at 80 columns and
this code was written single-quoted at 100. Caught by reading the diff before committing.

---

## 4. Bugs found and fixed

| # | Symptom | Root cause | Fix | Commit | Test that now guards it |
|---|---|---|---|---|---|
| 1 | Three cursor tests broke during the refactor, apparently at random | Assertions ran against RAW frames; colour became enabled when `FORCE_COLOR` entered the environment | Strip ANSI in every content assertion | `32eb965` | Suite runs green under `FORCE_COLOR=3` and `=0` |
| 2 | A golden frame occasionally captured `loading…` | `settle(50)` raced the preview read on a busy suite | `settleStable` / `waitFor` — wait for a condition, never a duration | `32eb965`, `55c642d` | Three consecutive full-suite runs |
| 3 | A slow read of a directory the user returned to could overwrite the newer one | Staleness was checked by path; a → b → a issues two indistinguishable reads of `a` | Monotonic `requestId` | `0997ec7` | `reducer.test.ts` — "drops a slow read of the SAME directory" |
| 4 | e2e permission test reported the process dead | **My test was wrong**: `mkdtemp` appends random characters, so the path I `chmod`'d never existed and the binary correctly exited 2 | Use the path `mkdtemp` returns | `55c642d` | The test now passes for the right reason |
| 5 | e2e width assertion failed at 24 columns | Measuring screen width from a raw PTY byte stream — Ink moves the cursor with escape sequences, so "lines" in the capture are not screen rows | Removed the assertion; pointed at `golden.test.tsx`, where `lastFrame()` *is* the screen | `55c642d` | Cell-exact width at four sizes, in the right place |

Bugs 1, 2, 4 and 5 are all in **tests**, not in the app. That is worth sitting with: by Stage 3 the
application code was more trustworthy than the code checking it.

---

## 5. What we got wrong

**I wrote two broken tests and briefly suspected the refactor.** Bugs 4 and 5 above. When a test
fails during a large refactor the reflex is to assume the refactor broke it — and here the golden
frames said otherwise (zero diff, throughout), which is exactly what a control group is for. Without
them I would have gone looking in the wrong place.

**I reached for `AbortController` because the spec said so.** The spec was written by me, two stages
earlier, from plausible reasoning rather than measurement. A frozen spec is not evidence.

**The DRY pass nearly force-fit its own helper.** `clamp` went into `app.tsx` before I looked at what
those lines actually do. Lint caught it as an unused import, which is luck rather than method — the
method would have been reading the call sites first.

**`docs/` is no longer version-controlled.** The maintainer asked for it and it is their call, but it
is worth recording honestly: the ADRs, the stage specs and these retrospectives are now backed up
only by whatever backs up the working directory. Past commits still contain them; nothing from
`bdd4353` onward does.

**One spec item was dropped rather than delivered: `memfs` (S3-07).** The error paths it was meant to
enable — permission denied, FIFOs, devices, symlink cycles, dangling links — are all covered by real
fixtures created at test time, on a project that is Linux-only by decision. Adding `memfs` would have
meant a second filesystem abstraction covering cases the first already covers, and it cannot
faithfully simulate FIFOs or real permission semantics anyway. I judged that redundant in the stage
asked to remove redundancy. **That is a judgement call, and a reviewer might disagree** — it is
recorded here rather than quietly skipped.

---

## 6. Deliberately left undone

- **`memfs`** — see above. Dropped with reasoning, not forgotten.
- **The npm package name** — `glim` is taken by an abandoned 2022 stub. `private: true` and a
  dispatch-only release workflow are the interlocks. ADR-0004.
- **macOS and Windows** — Linux-only by decision (2026-08-15). No CI runners, no `win32` path
  branches. Changing that is a new stage with its own spec.
- **`displayWidth` remains an approximation** of UAX #11 — no grapheme clusters, so a flag emoji
  measures wrong. Stated in Stage 2 and still true.
- **Every form of filesystem mutation** — permanently excluded, enforced by lint. ADR-0005.

---

## 7. If you are picking this up later

- **The golden frames are the contract.** Any change that alters a rendered byte must be an
  intentional change to a snapshot, reviewed by hand. Never `-u` without reading the diff.
- **`src/core/**` and `src/state/**` may not import React or Ink**, and may not import from `ui/`.
  That is a lint rule, and it is what keeps 92 tests renderer-free.
- **`recompute()` is still the only legal writer of `visible`.**
- **`nextOffset` must stay idempotent** — it is applied during render.
- **`Help` must stay height-aware** — Ink overlays surplus rows rather than clipping.
- **Never assert on a raw frame.** Strip ANSI, or your test depends on `FORCE_COLOR`.
- **Never wait a fixed number of milliseconds.** Wait for a condition.
- **`test/e2e.test.ts` needs `pnpm build` first.** It skips itself otherwise, so a green
  `pnpm test` on a fresh clone does *not* mean the e2e suite ran. CI builds first for this reason.
- **`config.ts` reads fields individually on purpose.** Do not "simplify" it to a spread.

---

## 8. Evidence

- **Gate** — `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` → **189 passed, 20 files** ·
  `pnpm build` ✓ · `pnpm format:check` ✓.
- **The refactor changed nothing** — all nine golden frames byte-identical at every step of the
  split, the type centralisation, the utility extraction and the config work.
- **The boundary holds** — `grep -rn "from 'react'\|from 'ink'" src/core src/state` returns nothing,
  and a probe file importing `react`, `ink` and `../ui/theme.js` produced exactly three lint errors.
- **Colour independence** — the full suite passes identically under `FORCE_COLOR=3` and
  `FORCE_COLOR=0`.
- **Performance (A4)** — 40 000 entries: **294 ms to load** including 40 000 `lstat` calls batched 64
  at a time, **205 ms to sort**. A cursor move stays cheap because `MOVE` never re-filters or
  re-sorts.
- **L3 / real PTY** — 8 end-to-end tests against the built binary: two-pane render on a TTY,
  alternate screen entered (`[?1049h`) and left (`[?1049l`), cursor movement from real keystrokes,
  navigation in and out, **permission-denied survival with the message on screen and help still
  opening**, clean exit on `q`, key-mash across overlapping navigations, `Ctrl-C`, and a 24×8 terminal.
- **Packaging** — the tarball, listed rather than assumed, contains exactly `dist/cli.js`, its
  sourcemap, `package.json`, `README.md` and `LICENSE`. No `src/`, `test/` or `docs/`.
- **Config (A14)** — 16 tests including three that assert nothing reached `Object.prototype`, and one
  that a secret in a malformed config never appears in the warning.
- **Non-TTY (A11)** — `glim | head -3` prints three plain lines with no border characters and no
  `[?1049` sequence.

**Not verified by me, and it cannot be:** whether the colours are legible in your theme, whether the
box-drawing glyphs render in your font, and whether scrolling feels smooth. Those were confirmed at
CHECKPOINT 2 and nothing in this stage changed a rendered byte.
