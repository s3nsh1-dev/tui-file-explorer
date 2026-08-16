# AGENTS.md

> Operating contract for **any** coding agent working on `glim`.
> Tool-specific instructions live in `CLAUDE.md` (Claude Code), `.cursorrules`, etc. Those files
> extend this one; they never contradict it. **If they conflict, this file wins.**
>
> _(Filename note: `AGENTS.md` — plural — is the cross-tool convention read by Cursor, Codex, Jules,
> Aider and others. Rename to `AGENT.md` if you prefer, but you lose free auto-discovery.)_

---

## 1. Read order — every session, no exceptions

```
   1. report/process/STATE.md              ← where are we RIGHT NOW (30 seconds)
   2. AGENTS.md                  ← this file (you are here)
   3. report/process/v{N}_STAGE_{N}.md     ← current stage only, incl. its Entry Point
   4. docs/adr/                  ← skim titles; read any ADR the stage doc references
   5. report/process/00_PROJECT_INSPIRATION.md   ← only if unclear WHY, or on first ever session
```

You do **not** read earlier stage docs by default. Stage docs are written so that `§0 Entry Point`
gives you everything you need from prior stages. If the Entry Point is insufficient, that is a bug in
the doc — fix the doc, then continue.

**Stop condition:** if `report/process/STATE.md` does not exist, the project has not been initialised. Do not
scaffold. Ask.

---

## 2. The one rule that matters most

> **You cannot see the terminal UI. Never assert anything about it that you have not rendered and
> tested.**

Banned phrases in any output, commit message, or log entry:

- "the layout looks good / clean / balanced"
- "the colors work well together"
- "this should render correctly"
- "the UI is now polished"

Permitted replacements — each backed by evidence:

- "`lastFrame()` contains `README.md` and the cursor glyph `❯` — asserted in `list.test.tsx:41`"
- "golden frame `__snapshots__/two-pane-80x24.txt` updated; diff shows preview pane widened by 4 cols"
- "PTY e2e navigates into `fixtures/denied/` and asserts the process is alive with `EACCES` in the
  status bar — `e2e/permissions.test.ts:18`"
- "**HUMAN GATE:** colour contrast on the selected row needs a human eye. Blocked."

### Evidence levels

| Level | Tool                                             | Use for                             | From    |
| ----- | ------------------------------------------------ | ----------------------------------- | ------- |
| L1    | `ink-testing-library` → `lastFrame()` assertions | "is this content on screen"         | Stage 1 |
| L2    | Golden frame snapshots (committed `.txt`)        | "did layout change unintentionally" | Stage 2 |
| L3    | `node-pty` + `strip-ansi`                        | "does the real binary behave"       | Stage 3 |
| L4    | **HUMAN GATE** — halt and ask                    | aesthetics, fonts, feel             | always  |

A `HUMAN GATE` is a **hard stop**. Print what you need looked at and end your turn. Do not
self-certify. Do not continue to the next task "while waiting."

---

## 3. Scope discipline

Each stage doc has an explicit `## Scope — OUT` section. Treat it as a compile error.

- **Do not** implement a Stage N+1 feature because it is "only 10 lines."
- **Do not** refactor outside the current task's blast radius.
- **Do not** add a runtime dependency without an ADR. Dev dependencies are free.
- **Do not** rename, restructure, or reformat files you were not asked to touch.

If you believe something out of scope is genuinely required to complete an in-scope task, **stop and
say so** with the specific dependency chain. Do not decide unilaterally.

### Refactoring permission by stage

| Stage | Refactor permitted?                                                                          |
| ----- | -------------------------------------------------------------------------------------------- |
| 1     | Almost never. Duplication is fine. Wrong abstractions are not.                               |
| 2     | Only when a feature cannot be built cleanly otherwise. State the blocking reason in the log. |
| 3     | Yes — this is the sanctioned `core/` ⟂ `ui/` separation. Behaviour must not change.          |

---

## 4. Documentation protocol

### 4.1 File map

**Two trees, two audiences.** `docs/` is public and ships with the repository; `report/` is the
maintainer's private working record and is gitignored. Which one a file belongs in is decided by
_who reads it_, not by what it is about.

```
docs/                           TRACKED — the project's public documentation
├── README.md                   index of this directory
├── ARCHITECTURE.md             layers, modules, data flow, load-bearing invariants
├── CONTRIBUTING.md             setup, the gate, testing conventions, what is out of scope
├── DISTRIBUTION.md             packaging and what publishing would take
└── adr/
    ├── README.md               index + the ADR conventions
    ├── ADR-0001-<slug>.md      one decision, never edited (supersede instead)
    └── ...

report/                         GITIGNORED — the maintainer's learning journal
├── README.md                   index of this directory
├── FOR_THE_MAINTAINER.md       end-of-project briefing
├── process/
│   ├── 00_PROJECT_INSPIRATION.md   IMMUTABLE   why + stack + stage model + agent mentality
│   ├── STATE.md                    MUTABLE     read first, write last, every session
│   ├── _TEMPLATE_STAGE.md          IMMUTABLE   copy this to start a stage
│   ├── v1_STAGE_1.md               spec frozen at kickoff · log appended during
│   ├── v2_STAGE_2.md               "
│   └── v3_STAGE_3.md               "
├── retrospectives/             the human-readable history — see §4.6
│   ├── _TEMPLATE_RETROSPECTIVE.md   IMMUTABLE   copy this to close a stage
│   ├── stage1.md               IMMUTABLE once written
│   ├── stage2.md               "
│   └── stage3.md               "
├── incidents/                  post-mortems
└── CI_CD_github_errors/        raw CI failure output

AGENTS.md                       this file
CLAUDE.md                       Claude Code specifics
```

> ⚠ **`report/` is gitignored; `docs/` is tracked.** The process documents — STATE, the stage docs,
> the retrospectives — are still the operating contract and still required reading. They are simply
> not version-controlled, so a fresh `git clone` will not contain them.
>
> **If `report/process/STATE.md` is missing, you are on a clone, not at the start of the project.**
> §1's stop condition ("if `report/process/STATE.md` does not exist, the project has not been
> initialised") does not distinguish those two cases on its own. Do not scaffold. Ask.
>
> **Writing a doc? Decide the tree first.** Would someone who just found this repository need it?
> Then `docs/`, written for them — no session logs, no "what I learned", no stage numbers. Is it a
> record of how the work went? Then `report/`. A topic that serves both gets two documents, not one
> shared document with two voices.
>
> **Never reference a `report/` path from tracked code, tests, or `docs/`.** Those readers do not
> have the file. Quote what you need inline instead.

**Three doc types, three different jobs.** Do not merge them:

| File                                | Written                         | Audience                          | Answers                                      |
| ----------------------------------- | ------------------------------- | --------------------------------- | -------------------------------------------- |
| `report/process/v{N}_STAGE_{N}.md`  | before + during                 | agents                            | "what am I building, and what happened"      |
| `docs/adr/ADR-000N.md`              | at the moment of decision       | agents + contributors             | "why is it this way, so nobody re-litigates" |
| `report/retrospectives/stage{N}.md` | at stage close                  | **the maintainer, reading later** | "what is the story of this stage"            |
| `docs/*.md`                         | when the public surface changes | **anyone who found the repo**     | "how do I use, understand or change this"    |

### 4.2 The BUILD LINE

Every stage doc contains this literal marker:

```
═══════════════════════════ BUILD LINE ═══════════════════════════
```

- **Above it:** the frozen spec — intent, scope in/out, approach, architecture, task list, DoD.
  Written _before_ any code. **Never edited after the first commit of that stage.** If the spec turns
  out wrong, you do not rewrite it — you record the divergence below the line under _Deviations_.
- **Below it:** append-only log. Dated entries, what you did, what surprised you, what you had to
  change. Never delete, never reword history.

This is what makes the docs usable as both plan and record without an agent confusing the two.

### 4.3 Entry Point sections — the "no re-explain" rule

`v2` and `v3` each open with:

```markdown
## 0. Entry Point — start here

**If you are joining at this stage, this section is all the history you need.**

State of the codebase: <3–6 sentences>
Architecture as it stands: <ASCII diagram>
Load-bearing decisions from prior stages: <bullets, each linking to an ADR or a v{N-1} anchor>
Known debt carried forward: <bullets with owner task IDs>
Read v{N-1} only if: <specific conditions, e.g. "you need the rationale for the flat state shape">
```

`v1` has no Entry Point — it starts from nothing.

**This section is written by the agent finishing the _previous_ stage**, as its last act, in the
previous doc's `## Handoff` section — then copied forward. The agent that just did the work is the
one who knows what the next agent needs.

### 4.4 ADRs

Promote a decision to `docs/adr/` when it satisfies **any** of:

- it outlives the current stage
- a future agent would plausibly reverse it without knowing why
- it locks in a dependency, a file layout, or a public API

Format — keep it under one screen:

```markdown
# ADR-0007: Use a flat reducer for navigation state

- **Status:** Accepted (Proposed | Accepted | Superseded by ADR-00NN)
- **Date:** 2026-08-14
- **Stage:** 2

## Context

Three independent `useState`s (cursor, filter, sort) desynced when filtering changed the
list length — cursor pointed past the end of the filtered array.

## Decision

Single `useReducer` over `{ entries, cursorIndex, filter, sortKey }`, with cursor clamping
applied inside the reducer.

## Consequences

- Cursor can never point out of bounds; invariant enforced in one place.
- Reducer is pure → unit-testable without rendering.
  − Every state read now goes through one object; more verbose call sites.

## Rejected alternatives

- `useEffect` to re-clamp the cursor: introduces a render-then-correct flash.
- Zustand/Jotai: unjustified dependency for one component tree.
```

Never edit an accepted ADR. Write a new one with `Supersedes: ADR-0007` and update the old one's
status line only.

### 4.5 `report/process/STATE.md`

The single answer to "where are we". Rewritten at the end of every session:

```markdown
# STATE

- **Stage:** 2 (in progress)
- **Doc:** report/process/v2_STAGE_2.md
- **Last verified green:** 2026-08-14 — typecheck ✓ lint ✓ test ✓ (34) build ✓
- **Last task completed:** S2-07 viewport windowing
- **Next task:** S2-08 status bar
- **Blocked on:** HUMAN GATE — selected-row contrast (see v2 log 2026-08-14)
- **Open ADRs:** none proposed
- **Do not touch:** src/ui/Preview.tsx — mid-refactor, see S2-09
```

If you end a session without updating this file, the next agent starts blind. This is the most
common way agent-built projects rot.

### 4.6 `report/retrospectives/stage{N}.md` — the retrospective

Written **once, at stage close**, from `report/retrospectives/_TEMPLATE_RETROSPECTIVE.md`. **IMMUTABLE
afterwards.** If a later stage proves it wrong, the correction goes in _that_ stage's retrospective.

This is not a summary of the stage doc. The stage doc is a contract with a log attached; this is
**the story, for a human reading all three in order, months later.** It carries what `git log` cannot:

- **Design choices and what they cost** — one per decision a reasonable person could have made
  differently, with the alternative stated fairly. If you cannot name what a choice made _harder_,
  you have not understood it yet.
- **Surprises** — what you believed at kickoff that turned out false, and the command or failing test
  that tipped you off.
- **Bugs found and fixed** — symptom, root cause, fix, commit, **and the test that now guards it.**
  A bug with no guarding test is not fixed; it is postponed.
- **What you got wrong** — reversed decisions, unbuildable spec items, time spent in the wrong
  direction. A retrospective with an empty "what we got wrong" section is marketing, and the next
  agent will learn nothing from it.

Write it as prose. Checklists belong in the stage doc.

---

## 5. Branch, task, and commit discipline

### 5.1 Branching — three tiers, and an agent never touches `main`

```
  main ─────●···························································●──────►
            │   NO AGENT COMMITS, EVER.                    project close ↑
            │   Human-only. Releases and final sign-off.                 │
            │                                                           │
develop ────●────●──────────────●───────────────────●────────────────────┘
            │  integration      ↑                   ↑
            │  (process docs,   │                   │
            │   completed       │                   │
            │   stages)         │                   │
            └── stage-1 ──●──●──┘                   │
                          (S1-01 … S1-17)           │
                   develop ── stage-2 ──●──●──●──●──┘
                                        (S2-01 … S2-20)
```

**The rule, stated once and without exception: an agent never commits to `main`, never merges into
`main`, and never checks out `main` to make a change.** `main` moves only when a human moves it.
There is no category of change — not a typo fix, not a doc tweak, not "just the .gitignore" — that
justifies an agent writing to `main`.

- **`develop` is the integration branch.** Everything an agent produces ends up here: completed
  stages, process/governance doc changes, tooling fixes. If you are about to commit and you are not
  on a `stage-{N}` branch, `develop` is where it goes.
- **Cut `stage-{N}` from `develop` at stage kickoff**, before the first line of code:
  `git checkout develop && git checkout -b stage-{N}`.
- **All stage work lands on that branch**, one commit per task ID.
- **Merge `stage-{N}` → `develop` only after the stage's `HUMAN GATE` passes.** The merge is part of
  the stage completion ritual (`§10`), not something you do because the tests went green.
- **Governance docs** — `AGENTS.md`, `CLAUDE.md`, `_TEMPLATE_*`, `report/retrospectives/`, `.gitignore` — go
  to `develop` directly, since they are not stage output. Then merge `develop` into the live stage
  branch so it inherits them.
- If you find yourself on `main` for any reason, **stop and switch** before doing anything else.

> **Why the extra tier.** `main` being human-only means there is always one branch whose history no
> agent has written to. That is the branch you can trust without reading a diff. Collapsing `develop`
> into `main` would take that away for the sake of one fewer branch.

### 5.2 Tasks and commits

Tasks are IDs: `S{stage}-{nn}`, e.g. `S1-03`, `S2-11`. They come from the stage doc's task list.
Never invent a task outside the list — propose it, get it added above the BUILD LINE _before_ the
stage starts, or defer it.

Commit format:

```
feat(list): windowed rendering for large directories

S2-07. Renders only viewport-height rows; cursor drives the window offset.
Verified: golden frame 40k-entries-80x24.txt, render time asserted < 16ms.
```

- Conventional Commits type. One logical change per commit.
- Task ID on the first body line.
- A `Verified:` line naming the evidence. No `Verified:` line means no claim of correctness.

---

## 6. The green gate

Before you say a task is done, before every commit, before ending any session:

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings 0
pnpm test        # vitest run
pnpm build       # tsup
```

> **pnpm, not npm** — see `docs/adr/ADR-0001`. `pnpm-lock.yaml` is committed; a `package-lock.json`
> appearing in this repo is a bug. `npm view <pkg> version` is still the way to _query_ the registry.

All four green, or the task is not done. Do not:

- disable a lint rule to pass (add an ADR if a rule is genuinely wrong for this repo)
- `@ts-expect-error` without a comment explaining why and a task ID to remove it
- `.skip` a test (delete it and say why, or fix it)
- weaken a test to match broken behaviour

If the gate cannot pass, stop and report which command fails with the actual output.

---

## 7. Non-negotiable code floor — from commit #1, not Stage 3

- `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`
- Zero `any` — lint error. Use `unknown` + narrowing.
- ESM only. `"type": "module"`. Node built-ins imported as `node:fs/promises`.
- No `console.log` in `src/` — a TUI owns stdout; logging to it corrupts the render. Use a debug
  file sink or `stderr` behind a flag.
- Every `catch` either handles or rethrows with context. No empty catch, no swallowed errors.
- `eslint-plugin-react-hooks` enabled. **Ink is React.** Missing deps cause real, visible bugs here.
- No commented-out code. Git remembers.
- No `TODO` without a task ID: `// TODO(S3-04): handle circular symlinks`.

---

## 8. Ink-specific hazards

Things that are free in a browser and expensive here. Know these before writing components.

| Hazard               | Reality                                                                   | What to do                                                                            |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Rendering long lists | Ink re-diffs and rewrites terminal lines. 40k rows = frozen terminal.     | Slice to viewport height before mapping. Stage 2 requirement.                         |
| Unmemoized children  | Every parent state change re-renders the whole tree → flicker.            | `memo` row components; stable keys; `useCallback` for handlers.                       |
| `useInput` stacking  | Multiple mounted `useInput` hooks all fire on every keypress.             | One input owner per focus mode; gate with `{ isActive }`.                             |
| Raw mode             | Required for key input; unavailable when stdin is not a TTY.              | Check `useStdin().isRawModeSupported`; degrade, don't crash.                          |
| Terminal resize      | `useStdout().stdout.columns` changes under you.                           | Subscribe to `resize`; recompute viewport; never hardcode 80×24.                      |
| Exit cleanup         | A crash can leave the terminal without a cursor or in raw mode.           | Restore on `exit`, `SIGINT`, `SIGTERM`, and `uncaughtException`.                      |
| Alternate screen     | Ink does not use it by default; your app scrolls the user's scrollback.   | Write `\x1b[?1049h` on start, `\x1b[?1049l` on exit — Stage 2 decision, needs an ADR. |
| Unicode width        | Emoji and CJK are 2 cells wide; box-drawing may be missing from the font. | ASCII fallback path. Never assume a Nerd Font.                                        |
| stdout is the canvas | `console.log` anywhere in the tree corrupts the frame.                    | See §7.                                                                               |

---

## 9. When to stop and ask

Stop. Do not guess. Ask, and end your turn.

- A `HUMAN GATE` in the DoD.
- The stage doc's spec contradicts the code, and it is not obvious which is right.
- A task needs something on the OUT-OF-SCOPE list.
- A new runtime dependency seems necessary.
- You'd need to change a frozen spec above the BUILD LINE.
- You'd need to reverse an accepted ADR.
- The green gate fails for a reason you did not introduce.
- Two plausible designs exist and the choice is expensive to reverse.

A question costs one message. A wrong guess propagates through three stages.

---

## 10. Session checklist

```
START
  □ read report/process/STATE.md
  □ `git branch --show-current` — must be stage-{N} for stage work, or
    develop for governance docs. If it prints `main`, STOP: agents never
    touch main (§5.1)
  □ read current stage doc (Entry Point + spec + log tail)
  □ run the green gate — confirm you inherited a working tree
  □ state which task ID you are starting

DURING
  □ one task at a time, in doc order
  □ ONE COMMIT PER TASK ID — not one commit at the end of the session
  □ tests written alongside, not after
  □ evidence captured for every UI claim
  □ log surprises below the BUILD LINE as they happen — that log is the raw
    material for the retrospective; reconstructing it later loses the detail

END
  □ green gate passes
  □ stage doc log appended (dated, task IDs, deviations)
  □ ADRs written for anything durable
  □ report/process/STATE.md rewritten (including the Branch field)
  □ committed with Verified: lines
  □ if stage complete →
      □ write §Handoff in the stage doc
      □ write report/retrospectives/stage{N}.md from the retrospective template (§4.6)
      □ STOP and request human sign-off
      □ merge stage-{N} → develop ONLY after sign-off (§5.1)
      □ never merge to main — that is the human's move, not yours
```

**Stage transitions are human-gated.** An agent never declares a stage complete and rolls into the
next one. It writes the Handoff and stops.
