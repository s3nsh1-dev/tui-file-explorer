# STATE

> **Read this first. Rewrite it last. Every session.**
> This is the single source of truth for *where the project actually is*. Stage docs describe intent;
> this file describes reality. When they disagree, this file is right and the stage doc's *Deviations*
> section needs an entry.

---

- **Stage:** 2 — **code complete, awaiting CHECKPOINT 2**
- **Branch:** `stage-2` (cut from `develop` at `9ba2bf1`). `main` is human-only and frozen at
  `46153a1`; `develop` holds signed-off Stage 1 — `AGENTS.md §5.1`
- **Doc:** `docs/v2_STAGE_2.md` — spec reconciled and **frozen** at `b142f99`
- **Last verified green:** 2026-08-16 — typecheck ✓ lint ✓ test ✓ (136 passed, 15 files) build ✓
- **Last task completed:** S2-18 — `docs/version/stage2.md` retrospective written
- **Next task:** **S2-19 — CHECKPOINT 2 · HUMAN GATE.** Colour contrast, box-drawing glyphs, scroll
  flicker and scrollback restoration all need human eyes (`AGENTS.md §2`)
- **Blocked on:** **HUMAN GATE — CHECKPOINT 2.** See `v2 §7 Human gates`. S2-20 (merge `stage-2` →
  `develop`) does not happen until it passes
- **Open ADRs:** none proposed. ADR-0001 … ADR-0007 are **Accepted**
- **Do not touch:** n/a

### Stage 2 at a glance

| | |
|---|---|
| Commits on `stage-2` | 6 |
| Tests | 136 passing, 15 files (up from 36) |
| Golden frames | 9 committed `.txt`, each reviewed by hand |
| Source | 1 483 lines, 16 modules (up from 337, 2 modules) |
| Bugs found and fixed | 5 — three found by looking at rendered output, not by assertions |
| Retrospective | [`docs/version/stage2.md`](version/stage2.md) |
| Stage 3 refactor plan | [`stage2.md §7`](version/stage2.md) — for review at CHECKPOINT 2 |

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
| 2 — Real Application | `docs/v2_STAGE_2.md` | `stage-2` | 2026-08-16 | 2026-08-16 (pending gate) | — | ✅ `docs/version/stage2.md` | — |
| 3 — Production | `docs/v3_STAGE_3.md` | `stage-3` | — | — | — | `docs/version/stage3.md` | — |

Stage transitions are human-gated. An agent fills `Started`/`Completed`/`Merged`; **a human fills
`Signed off by`**, and the merge does not happen before they do.
