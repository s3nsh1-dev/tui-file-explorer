# STATE

> **Read this first. Rewrite it last. Every session.**
> This is the single source of truth for *where the project actually is*. Stage docs describe intent;
> this file describes reality. When they disagree, this file is right and the stage doc's *Deviations*
> section needs an entry.

---

- **Stage:** 3 — **complete.** All three stages built, tested and documented
- **Branch:** `main` @ `b8e1327` — the maintainer moved `main` onto the Stage 3 tip on 2026-08-16 and
  pushed to `github.com/s3nsh1-dev/tui-file-explorer`. `develop` is now BEHIND main (still at
  `b93c909`, Stage 2). `stage-3` no longer exists as a branch; its commits are on `main`
- **Doc:** `docs/v3_STAGE_3.md` — frozen, complete
- **Last verified green:** 2026-08-16 — typecheck ✓ lint ✓ test ✓ (189 passed, 20 files) build ✓
  format ✓
- **Last task completed:** recovery from the docs-loss incident (see below)
- **Next task:** none queued. Three open **decisions**, listed in
  [`FOR_THE_MAINTAINER.md`](FOR_THE_MAINTAINER.md)
- **Blocked on:** one decision — whether `docs/` should be tracked again. See
  [`INCIDENT-2026-08-16-docs-loss.md`](INCIDENT-2026-08-16-docs-loss.md)
- **Open ADRs:** none proposed. ADR-0001 … ADR-0008 are **Accepted**
- **Do not touch:** n/a

> ⚠ **`develop` is stale.** It sits at `b93c909` (end of Stage 2) while `main` has all of Stage 3.
> That inverts the intended flow (`stage-N → develop → main`). Harmless today because nothing is
> being built on `develop`; fix it with `git checkout develop && git merge main` before starting any
> new work.

### Project at a glance

| | |
|---|---|
| Tests | **189 passing, 20 files** (36 → 136 → 189) |
| …needing no renderer | **92** — pure logic, no terminal |
| Evidence levels | L1 frame · L2 golden · **L3 real PTY** · L4 human |
| Source | 1 943 lines, 23 modules |
| Golden frames | 9, byte-identical through the entire Stage 3 refactor |
| Retrospectives | [stage1](version/stage1.md) · [stage2](version/stage2.md) · [stage3](version/stage3.md) |
| Learning guide | [`LEARNING_TUI.md`](LEARNING_TUI.md) |
| Distribution guide | [`DEPLOYING_A_TUI.md`](DEPLOYING_A_TUI.md) |

### Measured, not assumed

| Question | Answer |
|---|---|
| 40 000-entry directory load | **294 ms** (incl. 40 000 `lstat`, batched 64) |
| 40 000-entry sort | **205 ms** |
| Does `readdir` honour `AbortSignal`? | **No** — it resolves even when already aborted |
| Do symlink cycles need our own guard? | **No** — the kernel returns `ELOOP` |
| Suite under `FORCE_COLOR=3` vs `=0` | identical, 189 passed both ways |
| Does the packed tarball install and run? | **Yes** — verified in a scratch project |

### Decisions locked during planning (2026-08-15)

| Decision | Value | Record |
|---|---|---|
| Package manager | pnpm 11 | ADR-0001 |
| TypeScript | pinned `6.0.3` — **not** the `latest` 7.0.2 | ADR-0002 |
| Runtime / UI | Node ≥ 22, `ink@7.1.1`, React 19.2 | ADR-0003 |
| Project name | `glim` (npm name deferred — taken since 2022) | ADR-0004 |
| Security posture | read-only by construction; sanitization chokepoint | ADR-0005 |
| Platforms | **Linux only** | `v3 §3` |
| Publishing | release-ready, never fired | `v3 §3` |
| Checkpoints | **2** — after Stage 1 (`S1-16`) and after Stage 2 (`S2-19`) | `v1 §7`, `v2 §7` |

> ⚠ `00_PROJECT_INSPIRATION.md §4` says Node 20 / Ink 6, and `§1` says `glim` is free on npm. Both
> are stale. That file is IMMUTABLE and stays stale on purpose — ADR-0002/0003/0004 win.

---

## Repo shape as it stands

```text
glim/
├── package.json · pnpm-lock.yaml · pnpm-workspace.yaml   allowBuilds: esbuild
├── tsconfig.json · eslint.config.js · tsup.config.ts · vitest.config.ts
├── .gitignore · .editorconfig · .npmrc      engine-strict=true
├── README.md
├── AGENTS.md · CLAUDE.md                    §5.1 three-tier branching
├── src/
│   ├── cli.tsx               meow · validate-before-mount · alternateScreen
│   ├── app.tsx               hooks + layout + JSX (still holds I/O until S3-02)
│   ├── core/                 PURE — sanitize, errors
│   ├── state/                PURE — reducer, actions, selectors
│   └── ui/                   Frame List Row Preview StatusBar Help theme format
├── test/
│   ├── helpers/render.tsx    LOCAL harness — pinned size, resize(), non-TTY stdin
│   ├── fixtures/basic/       incl. a real U+202E filename
│   ├── fixtures/preview/     incl. real NUL and ESC bytes in file CONTENT
│   ├── __snapshots__/        9 golden frames
│   └── 15 × *.test.ts(x)     136 tests
└── docs/
    ├── 00_PROJECT_INSPIRATION.md   IMMUTABLE — partly stale, see ADRs
    ├── STATE.md              ← you are here
    ├── _TEMPLATE_STAGE.md
    ├── v1_STAGE_1.md         frozen spec + implementation log + handoff
    ├── v2_STAGE_2.md         PROVISIONAL — reconcile + freeze at Stage 2 kickoff
    ├── v3_STAGE_3.md         PROVISIONAL — reconcile + freeze at Stage 3 kickoff
    ├── version/
    │   ├── _TEMPLATE_RETROSPECTIVE.md
    │   ├── stage1.md         ✅ the Stage 1 story, for humans
    │   └── stage2.md         ✅ the Stage 2 story + the Stage 3 refactor plan
    └── adr/ADR-0001 … ADR-0007
```

`dist/` is gitignored and built on demand. `pnpm build && node dist/cli.js ~` runs the app today.

---

## Update format — copy this block, don't improvise

```markdown
- **Stage:** 2 (in progress)
- **Branch:** `stage-2` (cut from `develop` at <sha>)
- **Doc:** docs/v2_STAGE_2.md
- **Last verified green:** 2026-08-14 14:20 — typecheck ✓ lint ✓ test ✓ (34 passed) build ✓
- **Last task completed:** S2-07 viewport windowing
- **Next task:** S2-08 status bar
- **Blocked on:** HUMAN GATE — selected-row contrast, see v2 log 2026-08-14
- **Open ADRs:** ADR-0009 (proposed) alternate screen buffer
- **Do not touch:** src/ui/Preview.tsx — mid-refactor under S2-09
```

Rules:

- `Branch` is **mandatory**. If it says `main` and the stage is in progress, that is a bug in the
  workflow, not a state to record — see `AGENTS.md §5.1`.
- `Last verified green` is a **timestamp plus the four gate results**. "green" alone is not an entry.
- `Blocked on` says *what* is blocked and *where the detail lives*. Never just "waiting."
- `Do not touch` exists so a parallel agent or a returning session doesn't stomp in-flight work.
  Clear it when the work lands.
- If you cannot fill a field honestly, write `UNKNOWN — <why>`. An honest gap beats a confident lie.

## Stage ledger

| Stage | Doc | Branch | Started | Completed | Merged to `develop` | Retrospective | Signed off by |
|---|---|---|---|---|---|---|---|
| 1 — Walking Skeleton | `docs/v1_STAGE_1.md` | `stage-1` | 2026-08-15 | 2026-08-16 | 2026-08-16 | ✅ `docs/version/stage1.md` | Shubham Pandey |
| 2 — Real Application | `docs/v2_STAGE_2.md` | `stage-2` | 2026-08-16 | 2026-08-16 | 2026-08-16 | ✅ `docs/version/stage2.md` | Shubham Pandey |
| 3 — Production | `docs/v3_STAGE_3.md` | `stage-3` | 2026-08-16 | 2026-08-16 | onto `main` directly | ✅ `docs/version/stage3.md` | Shubham Pandey |

Stage transitions are human-gated. An agent fills `Started`/`Completed`/`Merged`; **a human fills
`Signed off by`**, and the merge does not happen before they do.
