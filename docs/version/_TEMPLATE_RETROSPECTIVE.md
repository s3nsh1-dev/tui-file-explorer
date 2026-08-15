# Stage {N} — {Name} · Retrospective

> **IMMUTABLE once written.** This is history. If Stage {N+1} proves something here wrong, the
> correction goes in *that* stage's retrospective, not in an edit here. A retrospective edited later
> to look smarter records nothing.
>
> **Audience: a human, reading months later, in order.** Prose, not checklists. Explain the *why* and
> the *what went wrong* — the parts that are not recoverable from `git log`.

---

## At a glance

| | |
|---|---|
| **Branch** | `stage-{N}` |
| **Cut from `main`** | YYYY-MM-DD |
| **Merged to `main`** | YYYY-MM-DD |
| **Signed off by** | _human name — an agent never fills this in_ |
| **Commits** | _n_ |
| **Tests at close** | _n passing_ |
| **Gate at close** | typecheck ✓ · lint ✓ · test ✓ · build ✓ |
| **Spec** | [`docs/v{N}_STAGE_{N}.md`](../v{N}_STAGE_{N}.md) |

---

## 1. What this stage was for

_One or two paragraphs, in plain language. What could the program not do before, and what can it do
now? Write it so someone who has never opened the spec understands what changed._

---

## 2. Design choices, and what they cost

_The heart of the document. One subsection per decision that a reasonable person could have made
differently. Do not list decisions that had only one sensible answer._

### {Decision}

**Chose:** _what._
**Over:** _the real alternative, stated fairly — not a strawman._
**Because:** _the reason, including the constraint that forced it._
**Cost:** _what this made harder. Every choice costs something; if you cannot name the cost, you have
not understood the decision yet._
**Recorded as:** _ADR-000N, or "not durable enough for an ADR"._

---

## 3. What surprised us

_Things that were not true, that we believed at kickoff. Version drift, API differences, tooling
behaving unlike its documentation. Each with what tipped us off._

### {Surprise}

**Expected:** _…_
**Found:** _…_
**How we found out:** _the command, the error, the failing test._
**What changed as a result:** _…_

---

## 4. Bugs found and fixed

_Only real defects — things that were wrong in committed code, not tasks that were merely hard.
A bug with no guarding test is not fixed; it is postponed._

| # | Symptom | Root cause | Fix | Commit | Test that now guards it |
|---|---|---|---|---|---|
| 1 | _what was observed_ | _why it actually happened_ | _what changed_ | `abc1234` | `path/to/x.test.ts:NN` |

---

## 5. What we got wrong

_Written honestly. Decisions reversed mid-stage, spec items that turned out unbuildable as written,
time spent in the wrong direction. This section is the reason the document is worth reading — a
retrospective with nothing in section 5 is marketing._

---

## 6. Deliberately left undone

_Scope we could have built and chose not to, with the reason and where it went. Distinguish
"deferred to Stage N+1" from "decided against permanently" — they are different promises._

---

## 7. If you are picking this up later

_What a stranger needs to know before touching this code. The load-bearing assumptions. The thing
that looks removable but is not. The test that fails in a confusing way if you break X._

---

## 8. Evidence

_The claims in this document, and what backs each. Per `AGENTS.md §2`, no UI claim appears here
without a frame assertion, a golden frame, or a PTY test behind it._

- _claim → `test/x.test.tsx:NN` / `__snapshots__/y.txt` / command output_
