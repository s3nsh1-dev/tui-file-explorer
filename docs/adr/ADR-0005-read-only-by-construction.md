# ADR-0005: `glim` is read-only by construction, and hostile input is the threat model

- **Status:** Accepted
- **Date:** 2026-08-15
- **Stage:** 1 (applies to every stage)

## Context

The maintainer's requirement is that this be "production level secure and protected." For a file
explorer, that phrase needs a threat model or it degenerates into adding input validation to
functions that have no inputs.

The real model is uncomfortable and specific:

> **The filesystem is an attacker-controlled input channel, and the terminal emulator is a
> programmable machine that executes every byte you print to it.**

A user runs `glim ~/Downloads`. The bytes in that directory — filenames, file contents, symlink
targets — were not written by us and are not trustworthy. Printing them unmodified to a terminal is
equivalent to `eval` on a device that can move the cursor, repaint the screen, change the window
title, and in some emulators respond on stdin.

Two consequences follow, and they are the whole of this ADR.

## Decision

### 1. No mutation. Ever. At any stage.

`glim` reads the filesystem and renders it. It does not delete, rename, move, copy, `chmod`, `chown`,
create, or truncate. This is not a deferred feature — it is the security boundary.

Mechanically enforced, not merely intended:

- `src/**` may not import `node:child_process`, `node:worker_threads`, or `node:vm`. ESLint
  `no-restricted-imports`, error level, from `S1-04`.
- `src/**` may not call the mutating half of `node:fs` — `writeFile`, `rm`, `unlink`, `rename`,
  `mkdir`, `chmod`, `open` with any flag but `'r'`. ESLint `no-restricted-syntax`, error level.
- `no-eval` and `no-implied-eval` at error level; no dynamic `import()` of a user-supplied path.
- No network. No `fetch`, no `node:http`, no telemetry, no update check. A CLI that phones home is a
  supply-chain surface and an exfiltration path for the directory listings it can see.

The payoff is that an entire class of bug — the class where a file explorer destroys your data —
cannot be written here. Testing for its absence is unnecessary because the capability is absent.

### 2. Every untrusted string is sanitized before it reaches a `<Text>`.

Untrusted means: filenames, file contents, symlink targets, and OS error messages (which embed
attacker-chosen paths). All of it routes through one function.

Defended concretely — these are attacks, not hypotheticals:

| Input | Effect if rendered raw |
|---|---|
| `$'\e[2J\e[H'` in a filename | Clears the screen and homes the cursor from inside the listing |
| `$'\e]0;pwned\a'` (OSC) | Rewrites the terminal window title |
| `\r` in a filename | Overwrites the row to the left; hides the real name |
| `U+202E` right-to-left override | `invoice‮gpj.exe` displays as `invoice exe.jpg` — classic filename spoofing |
| Zero-width joiner / combining marks | Two distinct files render identically; the user selects the wrong one |
| C1 controls (`0x80`–`0x9F`) | CSI equivalents in 8-bit mode on some emulators |
| A binary file previewed raw | All of the above at once, from file *contents* |

A **minimal** version ships in Stage 1 (`S1-11`) — filenames are untrusted from the very first frame
that renders one, so this cannot wait for the Stage 2 preview pane. It is promoted to
`src/core/sanitize.ts` with full coverage and width-aware truncation in `S2-06`, and adversarially
tested in `S3-04`.

### 3. Reads are bounded and type-checked before they happen.

- Preview reads at most **64 KiB**, through a file handle into a fixed-size buffer. Never
  `readFile` — a 4 GB log file must not become a 4 GB allocation.
- `lstat` before reading, always, and **refuse anything that is not a regular file.** Reading a FIFO
  or `/dev/zero` does not error; it blocks forever, and a TUI that has swallowed raw mode and blocked
  on a read is a terminal the user has to kill from another window.
- Symlinks are resolved with a cycle guard and a depth cap (`S3-05`).

## Consequences

+ "Secure" becomes a set of checkable properties instead of a feeling. Each line above maps to a
  lint rule or a named Stage 3 adversary.
+ The lint rules make violations fail `pnpm lint`, so the boundary holds even when a future session
  has forgotten this ADR exists — which is the only kind of boundary worth having.
+ Sanitization has a real cost per rendered row. Stage 2 windowing means we only ever sanitize the
  rows actually on screen, so the cost is bounded by terminal height, not directory size.
− `glim` will never be a file *manager*. No delete, no rename, no bulk operations. That is a genuine
  product limitation and it is the point.
− Sanitized filenames are not byte-identical to real ones. A name containing a control character
  renders escaped (`\x1b`), which is a deliberate lie about the bytes on disk in service of not being
  a lie about which file you are looking at.

## Rejected alternatives

- **Add file operations behind a confirmation prompt.** Confirmation dialogs are exactly where
  spoofed filenames do their damage — the user confirms deleting what they *think* the name says.
  Combining mutation with untrusted display names is the worst available pairing.
- **Sanitize at render time inside each component.** Guarantees the one component that forgets.
  Routing every untrusted string through a single chokepoint is what makes the property auditable.
- **Strip only `\x1b`.** Insufficient — `\r`, C1 controls, and U+202E all work without it.
