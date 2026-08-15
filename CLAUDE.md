# CLAUDE.md

> Claude Code operating manual for `glim`.
> **`AGENTS.md` is the contract. This file is how you execute it.** Where they conflict, `AGENTS.md`
> wins. This file adds nothing new to the rules — only to the workflow.

---

## 1. First 60 seconds of every session

```bash
cat docs/STATE.md
git branch --show-current     # stage-{N} for stage work, develop for governance docs.
                              # NEVER main — agents don't touch it. AGENTS.md §5.1
git log --oneline -10
git status
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**If that second command prints `main`, stop.** `main` is human-only — you do not commit to it,
merge into it, or check it out to make a change. Switch to `develop`, or cut/check out `stage-{N}`.

> **pnpm, not npm** (`docs/adr/ADR-0001`). Also read `docs/adr/` before the stage doc on your first
> session — five ADRs were written during planning and two of them (0002 TypeScript pin, 0003 Ink 7 /
> Node 22) contradict versions stated in `00_PROJECT_INSPIRATION.md §4`, which is IMMUTABLE and
> therefore permanently stale. The ADRs win.

Then read the current stage doc. Then state, in one line, what you are about to do:

> `Stage 2, resuming at S2-08 (status bar). Tree is green as of the last commit. Starting now.`

If the green gate fails on inherited code, **stop**. Report the failing command and its output.
Do not fix and proceed silently — you do not know whether the breakage is intentional (mid-refactor
flagged in `STATE.md`) or real.

---

## 2. Plan before you edit

Use extended thinking / plan mode for anything larger than a single-file change. Specifically:

- starting a stage
- anything touching state shape or the input state machine
- anything with more than three file edits
- the Stage 3 `core/` ⟂ `ui/` split (this one is large — plan it fully, get sign-off, then execute)

Present the plan as: files touched → order of edits → how each is verified → what could break.

**Do not present a plan and then immediately execute it in the same turn** on stage kickoffs or the
Stage 3 refactor. Those need a human "go."

---

## 3. Tool usage

| Situation | Do this |
|---|---|
| Package versions | `npm view ink version` — **never** trust a version written in a doc, including these docs |
| Ink / testing-library API uncertainty | Read `node_modules/ink/build/index.d.ts`. Types are ground truth; your training data may be stale. |
| Reading files | Read before you edit. Always. `str_replace` on an unread file is how you overwrite someone's work. |
| Searching | Grep for the symbol before assuming it doesn't exist |
| Running the TUI | You **cannot** meaningfully run it — no TTY, no eyes. `pnpm dev` proves it boots, nothing more. Use tests. |
| Long output | Pipe through `head`. A 40k-line test output buys you nothing. |

### Parallel subagents

Useful for: independent read-only investigation (e.g. "survey how three published Ink CLIs handle
viewport windowing"), or independently-testable leaf tasks in a stage.

**Not** useful for: anything touching shared state shape, the stage doc, or `STATE.md`. Those
serialize. Two agents appending to the same log below the BUILD LINE will produce a mess.

If you dispatch subagents, you own merging their work and the green gate afterwards.

---

## 4. Where Claude specifically tends to go wrong on this project

Read this section honestly. These are your failure modes, not generic advice.

1. **Describing the UI you imagine instead of the UI you rendered.**
   You will be tempted to write "the two-pane layout now renders cleanly with the preview on the
   right." You have not seen it. Write the `lastFrame()` assertion, run it, quote the frame.
   This is `AGENTS.md §2` and it is the rule most likely to be broken.

2. **Over-engineering Stage 1.**
   You will want a `FileSystemAdapter` interface, a theme context, and a keybinding registry on day
   one. Stage 1 is `The Bricklayer`. One component file that works beats five that anticipate.
   The abstraction happens in Stage 3, *after* the shape is known.

3. **Silent scope drift.**
   "While I was in there, I also added…" — no. One task ID per commit. The OUT-OF-SCOPE list is
   binding.

4. **Agreeing too fast.**
   If the stage doc specifies something that will not work — say so, with the specific reason. The
   spec is frozen against *casual* edits, not against being wrong. Frozen means you record the
   divergence below the BUILD LINE and ask; it does not mean you implement something broken.

5. **Assuming React browser semantics.**
   No DOM, no CSS, no `overflow: hidden` saving you. Layout is Yoga flexbox on a character grid.
   Every row you render costs a terminal write. See `AGENTS.md §8`.

6. **Finishing a session without updating `docs/STATE.md`.**
   The most damaging and the easiest to fix. It is the last step of every session.

7. **Declaring a stage complete.**
   You don't. You write the `## Handoff` section and stop for human sign-off.

---

## 5. Writing tests here

```tsx
// The Stage 1 pattern. Learn it now; everything scales from it.
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.js';

describe('directory list', () => {
  it('renders entries from the target directory', async () => {
    const { lastFrame } = render(<App cwd="test/fixtures/basic" />);
    await new Promise((r) => setTimeout(r, 50)); // let the async readdir settle
    expect(lastFrame()).toContain('README.md');
    expect(lastFrame()).toContain('src');
  });

  it('moves the cursor on arrow down', async () => {
    const { lastFrame, stdin } = render(<App cwd="test/fixtures/basic" />);
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\u001B[B');            // ↓
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toMatch(/❯\s+src/);
  });
});
```

Rules:

- **Fixtures over mocks in Stage 1.** Real directories under `test/fixtures/` are simpler and prove
  more. Swap to `memfs` in Stage 3, when determinism and permission simulation start to matter.
- **Assert on frame content, not implementation.** Test what the user sees.
- **Golden frames from Stage 2.** `expect(lastFrame()).toMatchFileSnapshot('__snapshots__/x.txt')` —
  a committed, human-diffable text file. Review every snapshot change; never bulk-accept `-u`.
- **The async settle is real.** `readdir` resolves on a later tick. Without the await, you assert on
  an empty frame and get a false green.
- **Pin the terminal size in tests.** Layout assertions are meaningless if `columns` varies across
  machines and CI.

---

## 6. Stage kickoff ritual

When a stage begins:

1. **Cut the branch first:** `git checkout develop && git checkout -b stage-{N}`. Everything below
   happens on that branch. Not `main` — ever. (`AGENTS.md §5.1`)
2. `cp docs/_TEMPLATE_STAGE.md docs/v{N}_STAGE_{N}.md`
3. Paste the previous stage's `## Handoff` content into `§0 Entry Point`. (For v1, delete §0.)
4. Fill the spec sections **above the BUILD LINE**: intent, scope in/out, approach, architecture
   diagram, ordered task list with IDs, machine-checkable DoD.
5. **Stop.** Present the spec for human review.
6. Only after approval: first commit, spec freezes, work starts.

Writing code before step 6 means the spec gets bent to match whatever you happened to build.

> For v2 and v3 specifically: those docs were drafted during planning and are marked
> **PROVISIONAL**. At their kickoff you reconcile them against what the previous stage actually
> built, *then* freeze. That reconciliation is step 4, and it is the last legitimate edit above the
> BUILD LINE.

---

## 7. Stage completion ritual

1. Green gate passes.
2. Walk the DoD line by line and paste the evidence for each. Not "done" — the actual assertion,
   snapshot path, or test name.
3. Any `HUMAN GATE` items: state them explicitly and wait.
4. Write `## Handoff` — this is you telling the next agent what it needs. Be specific about debt,
   surprises, and load-bearing decisions. Assume it will not read your stage's log.
5. **Write `docs/version/stage{N}.md`** from `docs/version/_TEMPLATE_RETROSPECTIVE.md`
   (`AGENTS.md §4.6`). This one is for the *human*, not the next agent — prose, the reasoning behind
   each real choice, the surprises, the bugs with their guarding tests, and an honest "what we got
   wrong". Source it from the log you appended below the BUILD LINE *as you worked*; if you left that
   log thin, you cannot write this section honestly now, and that is the cost of skipping it.
6. Update `docs/STATE.md`, including the `Branch` field.
7. **Stop and request sign-off.** Do not start the next stage. Do not merge.
8. **After** sign-off: merge `stage-{N}` → `develop`, and record the merge date and the human's name
   in the retrospective's *At a glance* table. An agent never fills in "Signed off by", and never
   merges anything to `main` — `main` moves only when the maintainer moves it.

---

## 8. Response style in this repo

Per the maintainer's stated preference:

- Direct. No preamble, no "Great question!", no summary of what you're about to do before doing it.
- Show real code and real file paths, not descriptions of code.
- ASCII diagrams for architecture and layout — they live in the docs and survive in any editor.
- Multi-step work: give the plan, execute step one, stop for confirmation. Do not dump all steps.
- Uncertain? Say so and check (`npm view`, read the `.d.ts`, grep the repo). Do not guess confidently.
