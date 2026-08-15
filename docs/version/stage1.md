# Stage 1 — Walking Skeleton · Retrospective

> **IMMUTABLE once written.** This is history. If Stage 2 proves something here wrong, the correction
> goes in *that* stage's retrospective, not in an edit here.

---

## At a glance

| | |
|---|---|
| **Branch** | `stage-1` |
| **Cut from `develop`** | 2026-08-15 |
| **Merged to `develop`** | _pending — S1-17, after sign-off_ |
| **Signed off by** | _pending — CHECKPOINT 1 (S1-16)_ |
| **Commits** | 14 |
| **Tests at close** | 36 passing, 7 files |
| **Source size** | 337 lines across `src/app.tsx` + `src/cli.tsx` |
| **Test size** | 656 lines — roughly 2:1 test to source |
| **Gate at close** | typecheck ✓ · lint ✓ · test ✓ · build ✓ |
| **Spec** | [`docs/v1_STAGE_1.md`](../v1_STAGE_1.md) |

---

## 1. What this stage was for

Before Stage 1 there was no code — only documentation describing a file explorer. After it, `glim` is
a real program: it reads a directory, lists it, moves a cursor with the arrow keys, descends into
subdirectories, climbs back out, and quits without wrecking your terminal.

None of that is the point. The point is that **every claim above is backed by a test that was watched
failing first**, and that four commands — typecheck, lint, test, build — pass on a clean checkout.
Stage 1 built the machine that will verify Stages 2 and 3. The file explorer is a by-product.

Deliberately absent: the second pane, preview, filtering, sorting, colour, and viewport windowing. On
a 40,000-entry directory this version will hang, and that is *expected* — windowing is a Stage 2
requirement and fixing it early would have meant guessing at a state shape nothing had exercised yet.

---

## 2. Design choices, and what they cost

### One file, no abstractions

**Chose:** all logic in `src/app.tsx` — state, effect, input handler, rendering — with obvious
duplication left in place.
**Over:** starting with the `core/` ⟂ `ui/` split that Stage 3 will eventually want anyway.
**Because:** the correct boundaries are not knowable until Stage 2 shows which pieces actually vary
together. A boundary guessed now becomes demolition work later, and it would have been guessed from
documentation rather than observed from code.
**Cost:** `app.tsx` already mixes four concerns at 250 lines, and Stage 2 will make that worse before
Stage 3 makes it better. Anyone reading it mid-Stage-2 will find it genuinely untidy.
**Recorded as:** not an ADR — it is `00_PROJECT_INSPIRATION.md §7`'s stated Stage 1 mentality.

### Security rules written before any source existed

**Chose:** configure ESLint's ADR-0005 bans at S1-04, one task *before* the first line of `src/`.
**Over:** writing the app and adding the boundary later.
**Because:** retrofitting a boundary means auditing existing code for violations. Starting with it
means violations are impossible to introduce — the failure is immediate and mechanical.
**Cost:** essentially none, and it paid for itself immediately: the rules were proven by writing a
probe file with four deliberate violations and confirming exactly four errors, each carrying its
ADR-0005 message. `readFile` on an adjacent line was correctly *not* flagged, proving the `node:fs`
ban is member-precise rather than a blanket module ban.

### Escaping hostile characters rather than stripping them

**Chose:** render `U+202E` as the literal text `<U+202E>`.
**Over:** deleting the character, or replacing it with `�`.
**Because:** a silently removed character is its own kind of spoof. If two files differ only by an
invisible codepoint, stripping makes them render identically — which is precisely the attack.
**Cost:** displayed names are not byte-identical to what is on disk. A file whose real name contains
`<U+202E>` as ordinary text renders the same as one carrying the actual override. That ambiguity is
harmless (neither can attack the terminal) but it is a real inaccuracy.
**Recorded as:** [ADR-0005](../adr/ADR-0005-read-only-by-construction.md). The ADR's illustrative
`\x1b` form was not used — `<U+XXXX>` avoids ambiguity with a filename that genuinely contains a
backslash.

### Replacing `ink-testing-library` with a local harness

**Chose:** ~150 lines of local test harness; dependency removed.
**Over:** using the library the project's own stack table (`00_INSPIRATION §4`) names.
**Because:** reading its source showed it cannot express two of this stage's own requirements. It
hardcodes `columns = 100`, has no `rows` property at all, and forces `stdin.isTTY = true`. Since Ink
derives `isRawModeSupported` straight from `stdin.isTTY`, the raw-mode degradation requirement in
S1-13 was literally unwritable through it — and Stage 2 needs golden frames at both 80×24 and 120×40.
**Cost:** ~150 lines we now own and must maintain, and a divergence from the documented stack. The
call shape was kept identical so `CLAUDE.md §5`'s test pattern still reads the same — only the import
path changed.
**And it caused a bug.** See §5.

### Pinning TypeScript one major version behind

**Chose:** `typescript@6.0.3` when `latest` was `7.0.2`.
**Over:** taking the newest compiler.
**Because:** `typescript-eslint@8.67.0` peers `typescript <6.1.0`. On TS 7 it does not run at all,
which means no type-aware linting, which means the zero-`any` floor becomes unenforceable — and an
unenforceable gate invites the next person to disable the rule.
**Cost:** permanently one major behind, and `pnpm outdated` will complain forever. The eventual
upgrade must move `typescript` and `typescript-eslint` together in one commit.
**Recorded as:** [ADR-0002](../adr/ADR-0002-pin-typescript-6.md), with the exact command to re-check.

---

## 3. What surprised us

### The stack table was wrong on its first line

**Expected:** Node 20, Ink 6, per `00_PROJECT_INSPIRATION.md §4`.
**Found:** Ink is at **7.1.1** and requires **Node ≥ 22**.
**How:** `npm view ink version` and `npm view ink engines`, run before installing anything —
`CLAUDE.md §3` says never to trust a version written in a doc, *including these docs*. It was right
on the first try.
**Result:** [ADR-0003](../adr/ADR-0003-node-22-ink-7-floor.md). The inspiration doc is IMMUTABLE, so
it stays permanently, knowingly stale, and the ADR carries a standing instruction not to "fix" it.

### The project name was taken

**Expected:** `glim` was free on npm — the inspiration doc says so explicitly.
**Found:** taken since 2022-05-03. An empty-description `0.0.2` stub.
**Result:** [ADR-0004](../adr/ADR-0004-npm-name-collision.md) separates two things that were never
actually the same: the *project* name (unchanged, `glim` everywhere the user sees) and the *registry*
name (deferred to S3-18, with `private: true` as a hard interlock in the meantime).

### Ink 7 already solves two problems the contract says to hand-roll

**Expected:** to write a resize-subscription hook, and to emit raw `\x1b[?1049h` for the alternate
screen — both as `AGENTS.md §8` instructs.
**Found:** Ink 7 ships `useWindowSize()`, and `render()` accepts `{ alternateScreen: true }` with
managed teardown. `AGENTS.md §8`'s advice on both is Ink 6-era.
**How:** reading `node_modules/ink/build/index.d.ts` before designing against it.
**Result:** `S2-02` and `S2-15` were rewritten in the (still provisional) Stage 2 spec before either
was started. Two tasks got smaller without being attempted first.

### pnpm blocked a build script two stages early

**Expected:** the `node-pty` install-script problem to surface in Stage 3, exactly as ADR-0001
predicted.
**Found:** it surfaced at **S1-02**. `esbuild`, transitive under tsup and vitest, had its postinstall
refused — which would have left both the bundler and the test runner broken.
**Also found, while fixing it:** pnpm 11 **renamed the setting**. pnpm 10's `onlyBuiltDependencies`
(a list, in `package.json`) is now `allowBuilds` (a map, in `pnpm-workspace.yaml`), and pnpm 11
*silently ignores* the `pnpm` field in `package.json` with only a warning. ADR-0001 and the Stage 3
spec both name the old setting; `pnpm-workspace.yaml` carries a comment correcting them at the point
of use.

---

## 4. Bugs found and fixed

| # | Symptom | Root cause | Fix | Commit | Test that now guards it |
|---|---|---|---|---|---|
| 1 | `glim < /dev/null` printed an Ink crash instead of a listing | Ink types `isRawModeSupported` as `boolean` but assigns it from `stdin.isTTY`, which Node sets to **`undefined`** — never `false` — on a non-TTY stream. `useInput` got `{ isActive: undefined }` and fell back to its default of `true`, called `setRawMode`, and threw | Route the value through `unknown` and narrow with `=== true` | `f2e23ec` | `test/lifecycle.test.tsx` — "still renders the listing when raw mode is unavailable" |
| 2 | Entering a mode-`000` directory killed the process with `Unhandled Rejection: EACCES … scandir`, leaving the terminal in raw mode | The `readdir` effect had no `catch` | Catch, render one sanitized line, keep the keymap alive so the user can navigate out. `describeFsError` shared with `resolveTarget` | `f2e23ec` | `test/errors.test.tsx` — "reports the failure instead of crashing" |
| 3 | Typecheck failed on a fixture file | `tsconfig` included `test/**`, so `fixtures/basic/src/index.ts` — a file whose only job is to be listed — was compiled and failed on `verbatimModuleSyntax` | Exclude `test/fixtures` from both tsconfig and ESLint. Fixtures are data | `dcdd644` | The gate itself: `pnpm typecheck` |
| 4 | Vitest warned that esbuild options were ignored | Vitest 4 transforms with **oxc**, not esbuild; the `esbuild.jsx` block was dead config | Removed it; oxc reads `jsx` from tsconfig | `dcdd644` | Pristine test output |

**Bugs 1 and 2 are the important ones, and neither was caught by the unit tests.** Both were found by
running the built binary and reading what it actually printed. That is the entire argument for
Stage 3's PTY-level evidence, arriving early and unprompted.

---

## 5. What we got wrong

**The test fake was better-behaved than reality, and that hid a production bug.** `FakeStdin` set
`isTTY: false` — a tidy boolean that Node never actually produces. Real Node gives `undefined`. The
raw-mode gate therefore passed every test while being broken in the shipped binary.

The fix order matters and was deliberate: **the fake was corrected first**, to make the bug
reproducible inside the suite (RED), and only then the application code. Had the app been fixed
first, the suite would have gone green while still being incapable of detecting a regression. The
fake now types `isTTY` as `boolean | undefined` with a comment explaining why.

The general lesson, and it is uncomfortable: *a fake is a claim about how a dependency behaves, and
an untested claim is a guess.* This one was written from memory of how `isTTY` "should" work.

**Work started on `main` with no commits.** The maintainer caught it twice — first the branch, then
governance docs landing on `main`. The workflow was restructured mid-stage into three tiers
(`main` human-only ← `develop` ← `stage-N`) and encoded in `AGENTS.md §5.1` plus the session
checklist, so it fails loudly rather than depending on anyone remembering.

**The v1 spec was amended after it froze.** Adding S1-15/16/17 was authorised by the maintainer, but
it is still an edit above the BUILD LINE. Recorded in `v1 §9 Deviations` as *"amended by
authorisation, not by drift"* — a spec that can be quietly amended is not frozen.

**Invisible control bytes were written into source twice.** `test/helpers/render.tsx` ended up with
literal `0x1b` bytes in its `KEY` constants, then with over-escaped `\\u001B` after a botched repair.
Settled on `String.fromCharCode(0x1b)` — no escapes to mangle, nothing invisible in a diff. Mildly
absurd given this is the project whose security model is *"control characters are dangerous."*

---

## 6. Deliberately left undone

**Deferred to Stage 2** — every one of these is a task in `v2_STAGE_2.md`:
preview pane · filter · sort switching · hidden-file toggle · colour · viewport windowing ·
status bar · help overlay · the reducer.

Viewport windowing deserves a specific note: **this build renders every row.** Point it at a
40,000-entry directory and it will hang your terminal. That is not an oversight — `v1 §3` lists it as
explicitly out of scope and instructs against fixing it here.

**Deferred to Stage 3:** `AbortController` request sequencing (key-mash can still resolve `readdir`
out of order and render a listing that does not match the header), `memfs`, PTY end-to-end tests,
config file, symlink cycle guards, the npm package name.

**Decided against permanently:** every form of filesystem mutation. Not deferred — excluded by
[ADR-0005](../adr/ADR-0005-read-only-by-construction.md) and enforced by lint.

---

## 7. If you are picking this up later

- **`test/helpers/render.tsx` is load-bearing and easy to mistake for boilerplate.** It exists
  because `ink-testing-library` cannot pin terminal size or simulate a non-TTY stdin. Deleting it in
  favour of the published package silently removes the ability to test raw-mode degradation and,
  from Stage 2, golden frames at two terminal sizes.
- **`FakeStdin.isTTY` is `boolean | undefined` on purpose.** Tidying it to `boolean` reintroduces
  bug #1 and the suite will not notice.
- **The `unknown` round-trip on `isRawModeSupported` looks like a pointless conversion.** It is not.
  `Boolean()` there fails lint as a redundant conversion, because Ink's type is wrong and the
  compiler believes it.
- **`test/fixtures/basic/invoice<U+202E>gpj.txt` is a real RTL override**, committed on purpose. Some
  editors will render its name deceptively and some tools will mangle it. Do not "clean it up" — it
  is the only adversarial input the suite currently has.
- **`pnpm-workspace.yaml` is not workspace configuration.** It exists because pnpm 11 moved settings
  there. Removing it breaks `esbuild`, and therefore both build and test.
- **Stage 1 is meant to look unsophisticated.** Before refactoring `app.tsx`, read
  `00_PROJECT_INSPIRATION.md §7` and `AGENTS.md §3` — refactoring is permitted in Stage 2 only to
  enable a feature, and taste is explicitly not a reason.

---

## 8. Evidence

Every claim above, and what backs it:

- **Gate green** — `pnpm typecheck` (silent), `pnpm lint` (silent, `--max-warnings 0`),
  `pnpm test` → `Test Files 7 passed / Tests 36 passed`, `pnpm build` → `ESM ⚡️ Build success`.
- **Listing, cursor, navigation, sanitization** — `test/app.test.tsx`, `test/cursor.test.tsx`,
  `test/navigation.test.tsx`, `test/sanitize.test.tsx`. Frame assertions on `lastFrame()`, never a
  description of the UI.
- **Clamping** — compares frames byte-for-byte before and after a blocked keypress; the bottom clamp
  presses down 20 times against a 7-entry fixture first.
- **Exit codes**, from the built binary:
  `glim /nonexistent/path` → exit 2, stderr `no such directory: …`, **stdout empty**, zero `    at `
  lines · `glim ./package.json` → exit 2, `not a directory: …` · `glim --help` → exit 0.
- **Non-TTY degradation**, from the built binary — `glim test/fixtures/basic < /dev/null` exits 0 and
  prints the listing, the `input unavailable` notice, and `invoice<U+202E>gpj.txt` escaped.
- **Code floor** — `grep -rn "console\." src/` → none · `grep -rn ": any\|as any" src/` → none ·
  `grep -rn "TODO" src/` → none.
- **Security rules fire** — probe file with four deliberate violations produced exactly four errors,
  each with its ADR-0005 message; `readFile` on an adjacent line was not flagged.

**Not verified by me, and it cannot be:** whether the cursor glyph is legible in your font, whether
movement flickers, and whether `q` returns you to a healthy shell prompt. I have no TTY and no eyes.
That is CHECKPOINT 1 (S1-16), and it is why the stage is not finished until a human runs it.
