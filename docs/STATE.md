# STATE

> **Read this first. Rewrite it last. Every session.**
> This is the single source of truth for *where the project actually is*. Stage docs describe intent;
> this file describes reality. When they disagree, this file is right and the stage doc's *Deviations*
> section needs an entry.

---

- **Stage:** 1 — spec written, **not yet started**
- **Doc:** `docs/v1_STAGE_1.md` (spec complete, freezes on the first commit of Stage 1)
- **Last verified green:** never — no `package.json` exists yet, so the gate cannot run
- **Last task completed:** planning only. Five ADRs written; `v1`/`v2`/`v3` stage docs written
- **Next task:** **S1-01** — `git init`, `.gitignore`, `.editorconfig`, `.npmrc`, first commit
- **Blocked on:** human approval to begin Stage 1. No code has been written by design
  (`CLAUDE.md §6` — spec first, stop, then work)
- **Open ADRs:** none proposed. ADR-0001 … ADR-0005 are **Accepted**
- **Do not touch:** n/a

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
| Checkpoints | **2** — after Stage 1 (`S1-15`) and after Stage 2 (`S2-18`) | `v1 §7`, `v2 §7` |

> ⚠ `00_PROJECT_INSPIRATION.md §4` says Node 20 / Ink 6, and `§1` says `glim` is free on npm. Both
> are stale. That file is IMMUTABLE and stays stale on purpose — ADR-0002/0003/0004 win.

---

## Repo shape as it stands

```text
glim/
├── AGENTS.md                 §6 green gate now reads pnpm (ADR-0001)
├── CLAUDE.md                 §1 and §3 now read pnpm (ADR-0001)
└── docs/
    ├── 00_PROJECT_INSPIRATION.md   IMMUTABLE — partly stale, see ADRs
    ├── STATE.md              ← you are here
    ├── _TEMPLATE_STAGE.md
    ├── v1_STAGE_1.md         spec complete, ready to execute
    ├── v2_STAGE_2.md         PROVISIONAL — reconcile + freeze at Stage 2 kickoff
    ├── v3_STAGE_3.md         PROVISIONAL — reconcile + freeze at Stage 3 kickoff
    └── adr/
        ├── ADR-0001-pnpm-as-package-manager.md
        ├── ADR-0002-pin-typescript-6.md
        ├── ADR-0003-node-22-ink-7-floor.md
        ├── ADR-0004-npm-name-collision.md
        └── ADR-0005-read-only-by-construction.md
```

Not a git repository yet. No `package.json`. No `src/`. No tests. **No code has been written.**

---

## Update format — copy this block, don't improvise

```markdown
- **Stage:** 2 (in progress)
- **Doc:** docs/v2_STAGE_2.md
- **Last verified green:** 2026-08-14 14:20 — typecheck ✓ lint ✓ test ✓ (34 passed) build ✓
- **Last task completed:** S2-07 viewport windowing
- **Next task:** S2-08 status bar
- **Blocked on:** HUMAN GATE — selected-row contrast, see v2 log 2026-08-14
- **Open ADRs:** ADR-0009 (proposed) alternate screen buffer
- **Do not touch:** src/ui/Preview.tsx — mid-refactor under S2-09
```

Rules:

- `Last verified green` is a **timestamp plus the four gate results**. "green" alone is not an entry.
- `Blocked on` says *what* is blocked and *where the detail lives*. Never just "waiting."
- `Do not touch` exists so a parallel agent or a returning session doesn't stomp in-flight work.
  Clear it when the work lands.
- If you cannot fill a field honestly, write `UNKNOWN — <why>`. An honest gap beats a confident lie.

## Stage ledger

| Stage | Doc | Started | Completed | Signed off by |
|---|---|---|---|---|
| 1 — Walking Skeleton | `docs/v1_STAGE_1.md` | — | — | — |
| 2 — Real Application | `docs/v2_STAGE_2.md` | — | — | — |
| 3 — Production | `docs/v3_STAGE_3.md` | — | — | — |

Stage transitions are human-gated. An agent fills `Started`/`Completed`; a human fills `Signed off by`.
