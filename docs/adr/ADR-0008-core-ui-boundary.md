# ADR-0008: `core` ⟂ `state` ⟂ `ui`, enforced by lint

- **Status:** Accepted
- **Date:** 2026-08-16
- **Stage:** 3

## Context

Stages 1 and 2 put everything that worked wherever it was first needed. By the end of Stage 2,
`app.tsx` held filesystem access, path manipulation, layout arithmetic, an input state machine and
JSX — 16 modules with no stated rule about what may depend on what.

That is not a criticism of those stages; it was the plan (`00_PROJECT_INSPIRATION.md §7`). Boundaries
drawn before the shape is known are guesses, and a wrong boundary is worse than none.

By Stage 3 the shape was known.

## Decision

Three layers, with dependencies pointing one way only:

```
  ui/      React + Ink. Components, hooks, styling.
    │      May import from state/ and core/.
    ▼
  state/   Pure. Reducer, actions, selectors.
    │      May import from core/. May NOT import react or ink.
    ▼
  core/    Pure logic + I/O primitives.
           May import nothing from state/ or ui/. May NOT import react or ink.
```

**Enforced by ESLint**, not by convention:

```js
{
  files: ['src/core/**/*.ts', 'src/state/**/*.ts'],
  rules: { 'no-restricted-imports': ['error', {
    paths: [{ name: 'react', … }, { name: 'ink', … }],
    patterns: [{ group: ['../ui/*', '**/ui/*'], … }],
  }]},
}
```

**Where a type lives** follows from the same idea: `core/types.ts` holds only types that cross a layer
boundary. `State`, `Action`, component `Props` and `Style` stay with their layer. The test is *if I
delete a layer, does this type still mean anything?*

## Consequences

+ **92 of 189 tests import no renderer.** The whole of cursor movement, sorting, filtering, windowing,
  width measurement, config validation and path handling is tested as plain functions — no terminal,
  no async settle, no flakiness. That is the entire payoff and it is measurable.
+ The rule is mechanical. A `import { useState } from 'react'` in `core/` fails the build, so the
  boundary cannot erode through one careless import and a code review that was busy that day.
+ `core/` is portable. Nothing in it knows a terminal exists.
− Three layers is more ceremony than one file, and small changes sometimes touch two of them.
− The type-placement rule needs judgement, so it is stated at the top of `core/types.ts` rather than
  left implicit.

## How the refactor was proven safe

Behaviour was defined as **the bytes rendered**. Nine golden frames were snapshotted before anything
moved, and every step of the split had to leave them **byte-identical**. They did, throughout —
including the type centralisation, the utility extraction and the config work that followed.

This is the only refactor strategy available to an agent that cannot look at a screen, and it is
stronger than looking: no human eye catches a column shifted by one.

## Rejected alternatives

- **Leaving it as it was.** Defensible — it worked. But the pure logic could only be tested through a
  renderer, which meant every state-machine test paid for an async settle and inherited its
  flakiness.
- **Two layers (`core` and `ui`), with the reducer in `ui`.** The reducer is pure and has no business
  near Ink; putting it there would have made the "no react in pure code" rule unstateable.
- **A rule in a document instead of a lint rule.** `AGENTS.md` already says pure code should stay
  pure. It said so through all of Stage 2, during which `app.tsx` accumulated three I/O functions.
  Documents do not fail builds.
