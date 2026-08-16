# ADR-0007: Use Ink's `alternateScreen` option, not hand-written escape sequences

- **Status:** Accepted
- **Date:** 2026-08-16
- **Stage:** 2

## Context

`AGENTS.md §8` says:

> **Alternate screen** — Ink does not use it by default; your app scrolls the user's scrollback.
> Write `\x1b[?1049h` on start, `\x1b[?1049l` on exit — Stage 2 decision, needs an ADR.

That was true of Ink 6. Ink 7 ships the feature:

```ts
// ink/build/render.d.ts
/**
Render the app in the terminal's alternate screen buffer. … the original terminal content is
restored when the app exits. … Only works in interactive mode. Ignored when `interactive` is
`false` or in a non-interactive environment (CI, piped stdout).
@default false
*/
alternateScreen?: boolean;
```

## Decision

Pass `alternateScreen: true` to `render()` in `src/cli.tsx`. Write no escape sequences by hand.

## Consequences

+ **The restore path stops being ours.** Hand-writing `\x1b[?1049h` means owning the matching
  `\x1b[?1049l` on every exit route — normal quit, `SIGINT`, `SIGTERM`, `uncaughtException` — and
  every route we forgot leaves the user staring at a dead screen with no prompt. Ink ties the restore
  to unmount, and `cli.tsx` already funnels all four routes through `instance.unmount()`.
+ **Non-TTY output is handled for us.** Ink ignores the option when stdout is not a TTY, so
  `glim | head` still emits a plain listing instead of an escape sequence followed by nothing.
+ The user's scrollback survives, which is the point.
− We inherit Ink's behaviour, including its documented decision to treat alternate-screen teardown
  output as disposable: anything written during unmount is not replayed onto the primary screen. That
  is why `cli.tsx` writes its `uncaughtException` message to stderr **after** `unmount()` rather than
  before.
− `AGENTS.md §8` now contains advice that is wrong for this codebase. It is not edited, because the
  contract is the maintainer's document; this ADR is the correction, and `v2 §0` carries a pointer.

## Rejected alternatives

- **Hand-written escapes, per `AGENTS.md §8`.** More code, four restore paths to get right, no
  non-TTY handling, and it would have to be undone the moment anyone noticed Ink already does it.
- **No alternate screen at all.** Leaves 40 screens of file listing in the user's scrollback after
  every run. `00_PROJECT_INSPIRATION.md §1` describes a full-screen application.

## Verification

`glim | head` on a non-TTY stdout emits no `[?1049` sequence — asserted by the piped-output check in
`docs/version/stage2.md §8`. Whether the user's scrollback is genuinely intact after `q` is an
**L4 human gate**, folded into CHECKPOINT 2: it cannot be observed from inside the process.
