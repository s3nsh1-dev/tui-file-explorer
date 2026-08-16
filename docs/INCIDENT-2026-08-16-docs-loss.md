# Incident — 16 documentation files deleted from the working tree

- **Date:** 2026-08-16
- **Severity:** low — everything was recoverable, no code affected
- **Data permanently lost:** none from git history. Two files' *uncommitted* edits, rewritten.
- **Cause:** a trap I built. **Not** a mistake by the maintainer.

---

## What you saw

You pushed to GitHub, looked at the repository, and found `docs/version/` and `docs/adr/` missing the
Stage 1 and Stage 2 material. Reasonable conclusion: *"I broke this while uploading."*

You did not. Two separate things were going on, and only one of them was a problem.

---

## What was actually true

### 1. The code was fine — all of it

`main` at `b8e1327` contains **23 source files**: every module from Stages 1, 2 and 3. Nothing was
missing, nothing was overwritten, and the four-command gate passes on it.

### 2. The docs were never on GitHub in the first place

On 2026-08-16 you asked: *"i decided not to upload the docs so add the docs in gitignore"*. I did
exactly that in commit `bdd4353`:

```
chore: stop tracking docs/ at the maintainer's request
```

That ran `git rm --cached docs/` and added `docs/` to `.gitignore`. From that commit onward, **no
documentation is in the repository at all** — not the Stage 1 docs, not the Stage 2 docs, not any of
it. So GitHub was showing exactly what was asked for.

The reason it *looked* like a partial loss rather than a total one is that `main` had previously been
frozen at `46153a1`, a commit where `docs/` was still tracked and contained only the planning-era
files. So depending on which commit you looked at, you saw either a partial set or none.

### 3. The actual damage: 16 files deleted from your disk

This is the real incident, and it is my fault.

After `bdd4353`, `docs/` was **untracked-and-ignored**. The files sat on disk, invisible to git. Then
`main` was moved from `46153a1` (where those same files **were** tracked) to `b8e1327` (where they
are not).

Git did the correct thing: for files tracked at the source commit and absent at the target, a branch
move **deletes them from the working tree**. It had no way to know those files were precious — from
git's point of view they were ordinary tracked files being checked out away.

Sixteen files vanished:

```
docs/00_PROJECT_INSPIRATION.md      docs/adr/ADR-0001 … ADR-0007   (7 files)
docs/STATE.md                       docs/version/stage1.md
docs/_TEMPLATE_STAGE.md             docs/version/stage2.md
docs/v1_STAGE_1.md                  docs/version/_TEMPLATE_RETROSPECTIVE.md
docs/v2_STAGE_2.md
docs/v3_STAGE_3.md
```

Five survived — `LEARNING_TUI.md`, `FOR_THE_MAINTAINER.md`, `DEPLOYING_A_TUI.md`,
`version/stage3.md`, `adr/ADR-0008` — precisely because they were created *after* `bdd4353` and were
therefore never tracked. Git had no record of them, so it left them alone.

**That asymmetry is the whole lesson.** The files git knew about were the ones git deleted.

---

## The fix

```bash
git checkout bdd4353^ -- docs/
```

`bdd4353^` is the commit immediately before untracking, where all 16 files were still tracked at
their final pre-Stage-3 content. All 16 came back byte-identical.

### What that did not restore

Two files had been **edited after** `bdd4353` and, because `docs/` was untracked, those edits were
never committed anywhere:

| File | Lost content | Status |
|---|---|---|
| `docs/STATE.md` | The whole Stage 3 state block | **rewritten** |
| `docs/v3_STAGE_3.md` | Status block, §8 log, §10 handoff | **rewritten** |

These are the only genuinely lost bytes in the incident. Both have been reconstructed and are more
accurate than before, because they now describe the branch topology as it actually is rather than as
it was planned.

---

## Root cause, stated plainly

**I created a configuration where a routine git operation silently deletes files, and I did not warn
you about it.**

The `.gitignore` entry I wrote *does* contain a warning — but the wrong one:

> CONSEQUENCE for a future session: a fresh `git clone` of this repo will NOT contain `docs/`.

That is true and it is not the dangerous case. The dangerous case is the one that actually happened:
**switching or moving a branch across the untracking commit deletes the files.** I reasoned about the
clone scenario and did not reason about the checkout scenario, which is the one that occurs weekly.

Contributing factors:

- `docs/` was untracked while another branch (`main`) still tracked it. That mixed state is
  inherently fragile, and it existed for the entire life of `stage-3`.
- There was no backup outside git, because git *was* the backup until I removed it.
- The retrospectives are the least reproducible artefacts in the project — they record reasoning that
  cannot be recovered from the code — and they were the files placed at risk.

---

## The decision this forces

**`docs/` cannot safely stay in its current state.** Right now the files are on disk, ignored by git,
and one `git checkout` away from disappearing again. Pick one:

### Option A — track `docs/` again *(recommended)*

Delete the `docs/` line from `.gitignore` and commit the directory. The documentation becomes part of
the repository again: versioned, backed up, and visible on GitHub.

- **For:** this class of loss becomes impossible. The retrospectives and ADRs are the least
  reproducible things here.
- **Against:** the docs are public if the repository is public — which reverses your 2026-08-16
  decision, and **cannot be undone** once pushed. Public git history is public forever.
- **Note:** the repository `s3nsh1-dev/tui-file-explorer` — check whether it is public or private
  before choosing. If it is private, this option has essentially no downside.

### Option B — keep them ignored, but back them up properly

Leave `.gitignore` alone and copy `docs/` somewhere outside the repository, or into a second private
repository.

- **For:** the docs stay off GitHub, exactly as you decided.
- **Against:** you now own a manual backup step forever, and the failure mode recurs the moment you
  forget it.
- **Mitigation if you choose this:** move the docs *outside* the repository directory entirely. Files
  that are not inside a git worktree cannot be deleted by a git operation.

### Option C — track only what matters

Un-ignore `docs/adr/` and `docs/version/` (the decisions and the history) and keep the working specs
ignored. A middle path, but it keeps the mixed state that caused this, so I do not recommend it.

**I have not chosen for you.** The files are restored and safe as of right now, and nothing is pushed.

---

## What also needs a decision: `develop` is stale

Separate from the docs, the branch topology drifted:

```
main     b8e1327  ← has everything: Stages 1, 2, 3
develop b93c909   ← BEHIND: stops at the end of Stage 2
stage-3            ← no longer exists; its commits are on main
```

The intended flow was `stage-N → develop → main`. What happened was `stage-3 → main` directly, which
is fine as an outcome but leaves `develop` behind `main` — the opposite of the model in
`AGENTS.md §5.1`.

Harmless while nothing is being built on `develop`. Before any new work:

```bash
git checkout develop && git merge main && git checkout main
```

---

## What changed as a result

- All 16 files restored from `bdd4353^`.
- `docs/STATE.md` and `docs/v3_STAGE_3.md` rewritten, and `STATE.md` now records the real branch
  topology including the stale `develop`.
- This document written.
- `.gitignore`'s warning comment corrected to name the **checkout** hazard, not just the clone one.

## What I would do differently

Untracking a directory that another branch still tracks is a fragile state, and I set it up without
saying so. The instruction was *"don't upload the docs"* — and **moving them outside the repository
would have satisfied that without putting them at risk.** I reached for `.gitignore` because it was
the literal reading, and the literal reading had a sharp edge I should have found before you did.
