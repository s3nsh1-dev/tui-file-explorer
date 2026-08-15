# v{N} — Stage {N}: {Name}

> **Agent mentality for this stage:** {Bricklayer | Craftsperson | Auditor} — see
> `00_PROJECT_INSPIRATION.md §7`.
> **Status:** Spec (frozen on first commit) | In progress | Complete
> **Branch:** `stage-{N}` — cut from `main` at kickoff, merged back only after sign-off
> (`AGENTS.md §5.1`).
> **Retrospective:** `docs/version/stage{N}.md` — written at close, IMMUTABLE after
> (`AGENTS.md §4.6`).

---

## 0. Entry Point — start here

> **Delete this whole section for v1.** For v2 and v3, this is written by the *previous* stage's
> agent in its `## Handoff`, then pasted here. It exists so you never read v1 → v2 → v3 in sequence.

**If you are joining at this stage, this section is all the history you need.**

**State of the codebase.**
_3–6 sentences. What exists, what works, what it can do today. Concrete: file paths, commands._

**Architecture as it stands.**

```
_ASCII diagram of the current module structure and data flow._
```

**Load-bearing decisions carried in.**
- _Decision → link to `adr/ADR-000N.md` or an anchor in the previous stage doc._

**Known debt carried forward.**
- _`S{N}-{nn}` — what's owed and why it was deferred._

**Read `v{N-1}_STAGE_{N-1}.md` only if:**
- _Specific triggers, e.g. "you need the rationale behind the flat state shape."_

---

## 1. Intent

_One paragraph. What capability the project gains in this stage, in user-visible terms. Not a task
list — the reason the task list exists._

---

## 2. Scope — IN

- _Concrete, testable capabilities. Each maps to at least one task ID below._

## 3. Scope — OUT (do not build)

> Binding. Treat a violation as a compile error. If an OUT item is genuinely required to complete an
> IN item, **stop and ask** (`AGENTS.md §9`).

- _Tempting adjacent features, with a one-line reason: "deferred to Stage 3" / "not this project"._

---

## 4. Approach and reasoning

_Why this shape and not the obvious alternative. Name the alternatives considered and why they were
rejected — this is what stops the next agent re-litigating. Anything durable here gets promoted to an
ADR._

---

## 5. Architecture — target state

```
_ASCII diagram of the module structure at the END of this stage.
 Mark deltas from the Entry Point diagram with [NEW] / [CHANGED] / [REMOVED]._
```

**Data flow:**

```
_keypress → handler → state → render, or whatever the relevant flow is._
```

---

## 6. Tasks

Ordered. Do them in order unless a dependency says otherwise.

| ID | Task | Depends on | Evidence level |
|---|---|---|---|
| S{N}-01 | _…_ | — | L1 |
| S{N}-02 | _…_ | S{N}-01 | L1 |
| S{N}-03 | _…_ | S{N}-01 | L2 |
| S{N}-04 | _…_ | — | **L4 HUMAN GATE** |

Evidence levels: L1 frame assertion · L2 golden frame · L3 PTY e2e · L4 human gate
(`AGENTS.md §2`).

---

## 7. Definition of Done

Machine-checkable where possible. "Looks good" is not an entry.

**Gate:**
- [ ] `pnpm typecheck` ✓
- [ ] `pnpm lint` ✓ (`--max-warnings 0`)
- [ ] `pnpm test` ✓
- [ ] `pnpm build` ✓

**Behaviour:**
- [ ] _Assertion phrased so it can be checked, e.g. "`lastFrame()` on a 3-entry fixture contains all
      three names and exactly one `❯`"_
- [ ] _…_

**Artifacts:**
- [ ] _Files that must exist, e.g. `__snapshots__/two-pane-80x24.txt` committed_

**Human gates:**
- [ ] _What a human must look at with their own eyes, and on what terminal_

**Docs:**
- [ ] Implementation log below the BUILD LINE is complete and dated
- [ ] ADRs written for durable decisions
- [ ] `docs/STATE.md` updated (including the `Branch` field)
- [ ] `## Handoff` written
- [ ] `docs/version/stage{N}.md` written from `docs/version/_TEMPLATE_RETROSPECTIVE.md`
      (`AGENTS.md §4.6`) — **before** the human gate, so the reviewer reads the history while
      reviewing, not after

**Branch (`AGENTS.md §5.1`):**
- [ ] All work on `stage-{N}`, cut from `main` at kickoff
- [ ] One commit per task ID, each with a `Verified:` line
- [ ] Merge to `main` **only** after the human gate passes — never before

---

═══════════════════════════ BUILD LINE ═══════════════════════════

> **Everything above is frozen at the first commit of this stage. Everything below is append-only.**
> Wrong spec? Do not edit above. Record it under *Deviations* and ask.

---

## 8. Implementation log

_Newest entries at the bottom. Date every entry. Reference task IDs. Record surprises — the surprises
are the part that has value later._

### YYYY-MM-DD

- **S{N}-01** — _what was done._
  Verified: _test name / snapshot path / assertion._
- **Surprise:** _what didn't behave as expected and what you learned._

---

## 9. Deviations from spec

| Task | Spec said | Reality | Why | Resolution |
|---|---|---|---|---|
| S{N}-0N | _…_ | _…_ | _…_ | _accepted / ADR-000N / escalated_ |

---

## 10. Handoff → v{N+1}

> Written last. This becomes `§0 Entry Point` of the next stage doc. Assume the next agent reads
> **only this** and never opens this stage's log. Be specific enough for that to be true.

**State of the codebase.**

**Architecture as it stands.**

```
```

**Load-bearing decisions carried out.**

**Known debt carried forward.**

**Read this doc only if:**
