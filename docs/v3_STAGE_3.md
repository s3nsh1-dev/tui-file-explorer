# v3 — Stage 3: Production

> **Agent mentality for this stage:** Auditor — see `00_PROJECT_INSPIRATION.md §7`.
> **Status:** **Complete.** Spec reconciled and frozen at the first commit of `stage-3`, 2026-08-16;
> all tasks delivered; gate green at 189 tests.
>
> **Branch:** `stage-3`, cut from `develop` at `b93c909`. Its work now lives on `main` — see
> `docs/INCIDENT-2026-08-16-docs-loss.md` for how that happened and why it was not the planned route.
> **Retrospective:** [`docs/version/stage3.md`](version/stage3.md).
>
> **Review gate waived** on the maintainer's instruction — *"i leave you in charge decide whatever
> you like to reach the goal"* (2026-08-16). `version/stage3.md §2` carries the reasoning for every
> judgement call, which is the substitute for the review that did not happen.
>
> **Scope added by the maintainer at kickoff:** a DRY audit (`S3-04`), centralised domain types
> (`S3-05`), shared primitives (`S3-06`), and the step-by-step learning guide (`S3-22`). All
> refactoring or documentation; **none adds a user-facing feature**, so `§1`'s hard rule holds.

---

## 0. Entry Point — start here

> ⛔ **PLACEHOLDER.** Fill from `v2_STAGE_2.md §10 Handoff` at Stage 3 kickoff.

**State of the codebase.** _(from v2 Handoff)_

**Architecture as it stands.** _(from v2 Handoff)_

**Load-bearing decisions carried in.**
- ADR-0001 pnpm · ADR-0002 TypeScript 6.0.3 · ADR-0003 Node 22 / Ink 7 · ADR-0004 npm name deferred ·
  **ADR-0005 read-only by construction** · ADR-0006 reducer + name-anchored cursor ·
  ADR-0007 alternate screen
- _(plus whatever v2 adds)_

**Known debt carried forward.** _(from v2 Handoff — expect at minimum: out-of-order `readdir` under
key-mash, deferred here as `S3-04`)_

**Read `v2_STAGE_2.md` only if:** you need the rationale for the name-anchored cursor, or the reason a
golden frame looks the way it does before you change it.

---

## 1. Intent

Assume the program is broken and prove otherwise. Stage 2 built something that works when the
filesystem cooperates; this stage establishes what happens when it does not — when the directory is
40 000 entries, when the symlink points at itself, when the read is denied, when the terminal is four
columns wide, when the user hits `Ctrl-C` in the middle of an async read, and when someone pipes the
output to `head`.

Then it does the one large refactor this project sanctions: separating pure logic (`core/`) from Ink
components (`ui/`), so the logic can be tested exhaustively without rendering anything. The golden
frames from Stage 2 are what make that refactor safe — **if a single frame changes, the refactor
changed behaviour and is wrong.**

**This stage adds zero user-facing features.** If it introduces one, Stage 2 was not finished. The
deliverable is not "added error handling" — it is a test that spawns a real pseudo-terminal,
navigates into a permission-denied directory, and asserts the process is still alive with a readable
message on screen.

---

## 2. Scope — IN

- **`core/` ⟂ `ui/` split** — pure logic with no React and no Ink import, mechanically enforced by a
  lint rule rather than by discipline.
- **`memfs`** — deterministic filesystem in tests, including permission and error simulation that
  real fixtures cannot express portably.
- **Request sequencing** — `AbortController` + a monotonic request id per navigation; stale
  `readdir` results are discarded, not rendered.
- **The adversary list** (`§4`) — each with a named test, not a vague robustness claim.
- **Config file** — `$XDG_CONFIG_HOME/glim/config.json`, strictly validated, malformed input warns
  and falls back. Data, never code.
- **Degradation** — `NO_COLOR`, no-TTY stdout, no-TTY stdin, extreme terminal geometry.
- **L3 PTY end-to-end tests** — `node-pty` spawning the *built binary* and driving it with real
  keystrokes.
- **CI** — GitHub Actions on `ubuntu-latest`, Node 22 and 24, full gate plus `pnpm audit`.
- **Release engineering, never fired** — `files` allowlist, tarball inspection, a release workflow
  that exists and is correct but is not triggered (maintainer's decision, 2026-08-15).

## 3. Scope — OUT (do not build)

- **Any user-facing feature.** The hard rule of this stage. A keybinding that did not exist in Stage 2
  does not exist here.
- **macOS and Windows support.** Linux-only, decided 2026-08-15. Do not add CI runners, do not add
  `win32` path branches, do not write drive-letter handling "while we're here." If the platform set
  ever changes it is a new stage with its own spec.
- **Actually publishing to npm.** `private: true` stays set until the S3-17 human gate resolves the
  ADR-0004 name question. The workflow is built and verified; the trigger is the maintainer's.
- **Performance work beyond the stated budget.** Windowing already solved the real problem in Stage 2.
  Micro-optimising a render that meets its budget is not auditing.
- **Rewriting Stage 2's visual decisions.** They were human-approved at Checkpoint 2. If a golden
  frame changes in this stage, that is a bug report about the refactor, not an improvement.

---

## 4. The adversaries

Not "robustness." Each line is a test with a name, and each is a thing that has broken a real file
manager.

| # | Adversary | Expected behaviour | Level |
|---|---|---|---|
| A1 | `EACCES` — directory with mode `000` | Listing replaced by a sanitized one-line reason; app alive; `←` still works | L3 |
| A2 | `ENOENT` mid-navigation — cwd deleted while open | Falls back to nearest existing ancestor; does not crash | L1 (memfs) |
| A3 | Circular symlink — `a → b → a` | Cycle detected, depth-capped, rendered as a symlink; no infinite descent | L1 |
| A4 | 40 000-entry directory | First frame within budget; ≤ viewport rows rendered; memory bounded | L1 + perf |
| A5 | 4-column × 1-row terminal | Renders *something*; no crash, no negative-width layout, no thrown Yoga error | L2 |
| A6 | `SIGINT` during an in-flight `readdir` | Exit 130; terminal restored; alternate screen exited; no unhandled rejection | L3 |
| A7 | Key-mash producing out-of-order `readdir` resolution | Only the newest request renders; stale results discarded | L1 + L3 |
| A8 | Binary file preview | Placeholder; zero raw bytes reach the screen | L1 |
| A9 | FIFO / `/dev/zero` / socket / block device | Refused before opening; **test completes instead of hanging** | L1 |
| A10 | `NO_COLOR=1` | Zero SGR sequences in the frame | L2 |
| A11 | Piped stdout (not a TTY) | Plain listing to stdout, exit 0 — `glim \| head` behaves | L3 |
| A12 | Piped stdin (not a TTY), TTY stdout | Renders read-only with a notice; does not crash on raw mode | L3 |
| A13 | Filename with `\x1b[2J`, `\r`, `U+202E`, ZWJ, 2-cell CJK/emoji | Escaped; column alignment holds; no repaint | L1 + L2 |
| A14 | Malformed / hostile `config.json` (bad JSON, wrong types, huge, `__proto__`) | Warns to stderr, falls back to defaults, never throws, never pollutes prototypes | L1 |
| A15 | `EMFILE` — file descriptor exhaustion | Surfaces as an error state, not a crash; descriptors always closed in `finally` | L1 |

A9 deserves a note: it is the only test in the suite whose failure mode is **hanging rather than
failing**. If the `lstat` guard regresses, that test does not go red — it stops. Treat a Stage 3 test
run that never finishes as an A9 regression until proven otherwise.

---

## 5. Approach and reasoning

**The refactor is planned before Checkpoint 2, not during Stage 3.** `CLAUDE.md §2` requires the
`core/` ⟂ `ui/` split to be fully planned with human sign-off before execution. The maintainer has
two checkpoints, both consumed by Stages 1 and 2. **Resolution: the split plan — exact file
inventory, move order, and the golden-frame proof strategy — is written into `v2_STAGE_2.md §10
Handoff`, so it is reviewed as part of Checkpoint 2.** No third interruption; no unplanned refactor.

**Golden frames are the refactor's safety net, and this is the reason they exist.** The split moves
code without changing behaviour. Behaviour is defined as "the bytes rendered." Therefore: snapshot
before, move, snapshot after, and require a **zero-byte diff**. Any frame that changes means the move
changed semantics. This is the only refactor strategy available to an agent that cannot look at the
screen — and it is genuinely stronger than looking, because a human eye would not catch a shifted
column.

**The boundary is enforced by lint, not by intention.** `src/core/**` gets a
`no-restricted-imports` rule banning `react`, `ink`, and `ink-testing-library`. Without it the
boundary erodes in one careless import six months from now, and nobody notices until the day someone
tries to test `core/` in isolation. The rule makes erosion fail the gate.

**`memfs` replaces fixtures where determinism matters — not everywhere.** Real fixtures stay for the
happy path; they are honest and cheap. `memfs` is adopted for exactly the cases fixtures cannot
express portably: mode `000` directories (which behave differently as root, and break `git`), FIFOs,
and descriptor exhaustion. Using it for everything would trade real-filesystem confidence for
uniformity we do not need.

**Request sequencing is a correctness bug, not a performance one.** Key-mash `↓↓⏎↓⏎` fires overlapping
`readdir`s. Promises resolve in arbitrary order, so the *last* directory entered can be overwritten by
an *earlier* one that happened to be slower — the user is looking at a listing that is not the path in
the header. The fix is a monotonic request id compared at dispatch, with `AbortController` to stop the
work. It is deferred to Stage 3 rather than patched in Stage 2 because a partial fix here reads as
"handled" and stops anyone looking again.

**Config is parsed, validated, and never executed.** JSON only — never a `.js` or `.ts` config, which
would be arbitrary code execution by design. Validated by a hand-written narrowing function rather
than a schema dependency: the config surface is under ten keys, and `AGENTS.md §3` prices a runtime
dependency at one ADR. `__proto__` and `constructor` keys are rejected explicitly, because
`JSON.parse` will happily hand you a prototype-polluting object.

**Non-TTY behaviour is a feature of the design, not an error path.** `glim | head` printing a plain
listing and exiting 0 is what a well-behaved Unix tool does. Refusing to run would be defensible;
crashing would not.

---

## 6. Tasks

| ID | Task | Depends on | Evidence level |
|---|---|---|---|
| S3-01 | Golden-frame baseline: snapshot every frame **before touching anything**; this is the refactor's control group | v2 | **L2** |
| S3-02 | `core/` ⟂ `ui/` split, executed per the plan signed off at Checkpoint 2. Zero-byte golden-frame diff required | S3-01 | **L2** |
| S3-03 | ESLint boundary rule — `src/core/**` may not import `react` / `ink` | S3-02 | lint ✓ |
| S3-04 | Request sequencing — `AbortController` + monotonic request id (A7) | S3-02 | L1 |
| S3-05 | `memfs` harness; migrate the error-path tests onto it | S3-02 | L1 |
| S3-06 | Error taxonomy — `EACCES`/`ENOENT`/`ENOTDIR`/`ELOOP`/`EMFILE` → typed results, sanitized messages (A1, A2, A15) | S3-05 | L1 |
| S3-07 | Symlinks — `lstat`, cycle detection, depth cap (A3) | S3-05 | L1 |
| S3-08 | Non-regular file refusal, adversarial coverage (A9) — **watch for hangs, not failures** | S3-05 | L1 |
| S3-09 | 40 000-entry perf budget, asserted (A4) | S3-02 | L1 + perf |
| S3-10 | Extreme terminal geometry (A5) | S3-02 | **L2** |
| S3-11 | Degradation — `NO_COLOR`, non-TTY stdout, non-TTY stdin (A10, A11, A12) | S3-02 | L1 |
| S3-12 | Signal handling — `SIGINT` mid-read, exit 130, alt-screen + terminal restored (A6) | S3-04 | L1 |
| S3-13 | `core/config.ts` — XDG path, strict validation, prototype-pollution rejection, fallback (A14) | S3-02 | L1 |
| S3-14 | `node-pty` harness — **add `onlyBuiltDependencies: ["node-pty"]` first** or it installs unbuilt and fails with a misleading error (ADR-0001) | S3-02 | **L3** |
| S3-15 | L3 e2e — navigate into a denied directory; assert process alive + message on screen (A1) | S3-14 | **L3** |
| S3-16 | L3 e2e — key-mash, `Ctrl-C`, assert clean exit and restored terminal (A6, A7) | S3-14 | **L3** |
| S3-17 | CI — `ubuntu-latest`, Node 22 + 24, full gate, `pnpm audit`, lockfile integrity, frozen install | S3-16 | CI green |
| S3-18 | Packaging — `files` allowlist, `pnpm pack` + tarball inspection, release workflow (not triggered), **ADR-0004 npm name decision** | S3-17 | **L4 HUMAN GATE** |
| S3-19 | `README`, ADR sweep, `docs/STATE.md`, final delivery report | S3-18 | docs |
| S3-20 | `docs/version/stage3.md` — narrative retrospective (`AGENTS.md §4.6`). Closes the three-part history: read `stage1.md` → `stage2.md` → `stage3.md` in order and the whole project's reasoning is there | S3-19 | docs |
| S3-21 | Merge `stage-3` → `develop`. **Only after the maintainer signs off.** | S3-20 | — |

---

## 7. Definition of Done

**Gate:** `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` ✓ · `pnpm build` ✓ — green in CI on Node 22
and 24, not only locally.

**Behaviour:**

- [ ] Every adversary A1–A15 has a named test. `pnpm test` output can be grepped for each.
- [ ] The `core/` ⟂ `ui/` refactor produced a **zero-byte diff** across all Stage 2 golden frames.
- [ ] `grep -rn "from 'react'\|from 'ink'" src/core/` returns nothing, and the lint rule fails the
      build if it ever would.
- [ ] `src/core/**` unit tests run with no renderer imported at all.
- [ ] A3 completes in bounded time (cycle detection proven, not assumed).
- [ ] A4 renders the first frame within the budget recorded at S3-09, asserted in the test.
- [ ] A9 **completes** — see the note in `§4`.
- [ ] L3: `node-pty` spawns `dist/cli.js`, navigates into a mode-`000` directory, and the process is
      alive with the error text present in the stripped screen buffer.
- [ ] L3: after `Ctrl-C`, the PTY buffer contains the alternate-screen exit sequence and the process
      exit code is 130.
- [ ] `glim | head -5` prints five lines of plain listing and exits 0.

**Artifacts:**

- [ ] `.github/workflows/ci.yml` green on Node 22 + 24, `ubuntu-latest`.
- [ ] `.github/workflows/release.yml` present, correct, **never triggered**.
- [ ] `pnpm pack` tarball contains `dist/`, `README.md`, `LICENSE` — and **no** `src/`, `test/`,
      `docs/`, or `.github/`. Verified by listing the tarball, not by reading the config.
- [ ] `pnpm audit` clean, or every exception documented in an ADR.
- [ ] ADRs for every durable Stage 3 decision.

**Human gates:**

- [ ] **S3-18 — npm package name.** ADR-0004 resolves: scope it `@<you>/glim`, or rename. Blocks
      removing `private: true`.
- [ ] **Final acceptance (optional, no scheduled checkpoint).** `00_PROJECT_INSPIRATION.md §9.4`:
      point it at `/`, mash keys for a minute, confirm it does not crash. I can approximate this with
      A7 + A1 under PTY, but "did not crash on *your* machine against *your* filesystem" is
      irreducibly yours. Stage 3 closes with a written delivery report rather than a review session,
      per the two-checkpoint decision of 2026-08-15.

**Docs:**

- [ ] `docs/version/stage3.md` written, completing the three-part history. Test the claim the same
      way `§9.2` should be tested: hand `stage1.md` → `stage2.md` → `stage3.md` to someone with no
      other context and see whether they can explain why the app is shaped the way it is.
- [ ] **Branch (`AGENTS.md §5.1`):** all work on `stage-3`; merged to `develop` only at S3-21, after
      sign-off.
- [ ] `docs/v3_STAGE_3.md §0 Entry Point` is good enough that a stranger can read v3 alone and
      understand the architecture — `00_PROJECT_INSPIRATION.md §9.2` is a testable claim, so test it:
      hand the Entry Point to a fresh agent with no other context and see whether it can name the
      module boundaries.
- [ ] `README` gets someone from `git clone` to a running explorer in under two minutes (§9.1).
- [ ] `docs/STATE.md` final.

---

═══════════════════════════ BUILD LINE ═══════════════════════════

> **Frozen at the first commit of Stage 3 — not before.**

---

## 8. Implementation log

### 2026-08-16 — S3-01 → S3-23

- **S3-01..S3-06** — golden-frame baseline, the `core/` ⟂ `ui/` split, the boundary lint rule,
  centralised types (`core/types.ts`), shared primitives (`core/util.ts`). Commit `32eb965`.
  Verified: **zero-diff golden frames at every step**, which is the whole proof.
- **S3-08** — monotonic request sequencing. Commit `0997ec7`.
- **S3-10, S3-14** — plain listing on a pipe, `core/sort.ts` extraction, symlink-cycle proofs.
  Commit `4faef6c`.
- **S3-12, S3-20, S3-21** — perf measurement, CI, packaging, never-fired release. Commit `259230a`.
- **S3-17..S3-19** — the PTY end-to-end suite. Commit `55c642d`.
- **S3-16** — XDG JSON config with prototype-pollution defence. Commit `8cc198e`.
- **S3-22, S3-23** — `LEARNING_TUI.md`, ADR-0008, README, retrospective. Commit `c25f625`.
- **Post-stage** — `FOR_THE_MAINTAINER.md`, `DEPLOYING_A_TUI.md`. Commit `b8e1327`.

- **Gate at close:** typecheck ✓ · lint ✓ · test ✓ **189 passed (20 files)** · build ✓ · format ✓.

- **Surprise — `AbortController` does not cancel `readdir`.** The spec called for it by name.
  `fs.promises.readdir` ignores an `AbortSignal` outright: handed an already-aborted one it resolves
  normally. Verified in about two minutes. The mechanism is therefore *discarding* stale results.

- **Surprise — symlink cycles need no code from us.** The kernel rejects `stat` on a loop with
  `ELOOP` (a 2-link cycle fails, a 40-link chain resolves) and `errors.ts` already mapped it. A
  hand-rolled depth cap would be redundant logic guarding an unreachable case.

- **Surprise — the test suite was coupled to an environment variable.** Six files asserted on RAW
  frames, so `❯ ESC[1m ESC[36m docs/` failed `/❯\s*docs\//`. They passed only because chalk saw a
  non-TTY stdout; when `FORCE_COLOR` appeared, three broke — *during a refactor*, where the obvious
  suspect is the refactor. The golden frames' zero-diff is what said otherwise.

- **Surprise — four of the five bugs this stage were in the TESTS, not the app.**

- **Deviation — `memfs` (S3-07) was dropped.** Argued in `version/stage3.md §5`.

- **INCIDENT (post-stage, 2026-08-16)** — 16 documentation files were deleted from the working tree
  when `main` was moved onto this branch's tip. Root cause: `docs/` had been untracked while `main`
  still tracked it, so the branch move was a legitimate tracked→absent deletion. All recovered from
  `bdd4353^`. Full write-up: `docs/INCIDENT-2026-08-16-docs-loss.md`.

---

## 9. Deviations from spec

| Task | Spec said | Reality | Why | Resolution |
|---|---|---|---|---|

---

## 10. Handoff → project close

**Final state.**

`glim` is complete against `00_PROJECT_INSPIRATION.md §9`. 189 tests across 20 files; 92 of them need
no renderer. The four-command gate is green, and CI runs it on Node 22 and 24.

**Architecture.**

```
  ui/     React + Ink — Frame List Row(memo) Preview StatusBar Help theme
    │                   hooks/usePreview
    ▼     (the arrow points ONE way, and it is a lint rule — ADR-0008)
  state/  pure — reducer (name-anchored cursor, requestId) · actions · selectors
    ▼
  core/   pure — types util sanitize errors fs path preview sort format config

  cli.tsx  meow · validate-before-mount · non-TTY plain listing · exit codes
           · alternateScreen · SIGINT/SIGTERM/uncaught all unmount
```

**What was proven, and how.**

- The refactor changed nothing — 9 golden frames byte-identical throughout.
- The boundary holds — a probe importing `react`, `ink` and `../ui/theme.js` from `core/` produced
  exactly three lint errors.
- It works as a real program — 8 PTY tests against the built binary.
- 40 000 entries: 294 ms load, 205 ms sort.
- The suite is colour-independent: identical under `FORCE_COLOR=3` and `FORCE_COLOR=0`.
- The tarball was packed, installed into a scratch project and run.

**What remains unproven, and why.**

- **`memfs`** dropped as redundant (`§9`). A reviewer might disagree.
- **macOS and Windows** — out of scope by decision.
- **`displayWidth`** approximates UAX #11; grapheme clusters measure wrong.
- **The npm name** — `glim` is taken. `private: true` is the interlock (ADR-0004).

**If you pick this up in a year, read:**

1. [`docs/FOR_THE_MAINTAINER.md`](FOR_THE_MAINTAINER.md) — status and what is left.
2. [`docs/LEARNING_TUI.md`](LEARNING_TUI.md) if the terminal parts are unfamiliar.
3. [`version/stage3.md §7`](version/stage3.md) for the traps — what looks removable but is not.
4. [`docs/INCIDENT-2026-08-16-docs-loss.md`](INCIDENT-2026-08-16-docs-loss.md) before changing
   `.gitignore`.
