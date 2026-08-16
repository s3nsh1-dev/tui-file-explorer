# Documentation

Reference material for using, understanding and changing `glim`. Start with the
[project README](../README.md) for install and key bindings.

| Document                             | Read it when                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | You want to know how the code is organised before changing it         |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | You are about to make a change — setup, the gate, testing conventions |
| [`DISTRIBUTION.md`](DISTRIBUTION.md) | You want to know how this would be packaged and published             |
| [`adr/`](adr/)                       | Something looks wrong and you want to know whether it is deliberate   |

## Architecture decision records

One file per decision. Each states the context, the choice, what was rejected, and the consequences.
They are the fastest way to avoid re-litigating a settled question.

| ADR                                                       | Decision                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [0001](adr/ADR-0001-pnpm-as-package-manager.md)           | pnpm is the package manager                                  |
| [0002](adr/ADR-0002-pin-typescript-6.md)                  | TypeScript is pinned                                         |
| [0003](adr/ADR-0003-node-22-ink-7-floor.md)               | Node 22 / Ink 7 is the floor                                 |
| [0004](adr/ADR-0004-npm-name-collision.md)                | How to handle the `glim` name being taken on npm             |
| [0005](adr/ADR-0005-read-only-by-construction.md)         | Read-only is a lint-enforced boundary, not a missing feature |
| [0006](adr/ADR-0006-flat-reducer-name-anchored-cursor.md) | One flat reducer; the cursor is anchored by name             |
| [0007](adr/ADR-0007-alternate-screen-via-ink.md)          | The alternate screen comes from Ink, not hand-rolled         |
| [0008](adr/ADR-0008-core-ui-boundary.md)                  | The `core` ⟂ `ui` boundary                                   |

---

### Scope of this directory

`docs/` is the project's public documentation: what a user or a contributor needs. The maintainer's
learning notes, stage specifications, retrospectives and incident write-ups are kept separately and
are not part of the repository.
