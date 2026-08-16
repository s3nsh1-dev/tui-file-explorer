# Architecture decision records

One file per decision. Each records the context, the choice made, the alternatives rejected, and the
consequences that follow.

| ADR                                                   | Decision                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| [0001](ADR-0001-pnpm-as-package-manager.md)           | pnpm is the package manager                                  |
| [0002](ADR-0002-pin-typescript-6.md)                  | TypeScript is pinned                                         |
| [0003](ADR-0003-node-22-ink-7-floor.md)               | Node 22 / Ink 7 is the floor                                 |
| [0004](ADR-0004-npm-name-collision.md)                | Handling the `glim` name collision on npm                    |
| [0005](ADR-0005-read-only-by-construction.md)         | Read-only is a lint-enforced boundary, not a missing feature |
| [0006](ADR-0006-flat-reducer-name-anchored-cursor.md) | One flat reducer; the cursor is anchored by name             |
| [0007](ADR-0007-alternate-screen-via-ink.md)          | The alternate screen comes from Ink, not hand-rolled         |
| [0008](ADR-0008-core-ui-boundary.md)                  | The `core` ⟂ `ui` boundary                                   |

All eight are **Accepted**.

## Conventions

**An ADR is a historical record, not a living document.** Once accepted it is not edited to match
later reality. If a decision is superseded, a new ADR supersedes it and the old one stays as written.

**Some ADRs cite the project's planning and stage documents** — `00_PROJECT_INSPIRATION.md`,
`v1_STAGE_1.md`, and so on. Those are the maintainer's working notes and are kept outside this
repository. Where an ADR depends on such a source it quotes the relevant passage inline, so the
reasoning is complete without them.

## Writing a new one

Promote a decision to an ADR when it is expensive to reverse, constrains future work, or will
otherwise be re-argued by whoever meets it next. Number sequentially; do not renumber existing files.
