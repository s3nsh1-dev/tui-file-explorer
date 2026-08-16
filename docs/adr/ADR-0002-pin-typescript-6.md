# ADR-0002: Pin TypeScript to 6.0.3, not 7.x

- **Status:** Accepted
- **Date:** 2026-08-15
- **Stage:** 1 (scaffold)

## Context

`npm view typescript version` returns **7.0.2** — TypeScript 7 is the native-port compiler and is
the `latest` dist-tag. The obvious scaffold move is to take `latest`.

That breaks the green gate irrecoverably:

```
$ npm view typescript-eslint peerDependencies
{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0',
  typescript: '>=4.8.4 <6.1.0' }
```

`typescript-eslint@8.67.0` — the current release — supports TypeScript **below 6.1.0**. This project
requires type-aware linting, not just syntactic linting, because `AGENTS.md §7` mandates zero `any`
as a *lint error* and `noUncheckedIndexedAccess` correctness that only type-aware rules can see.
Without type-aware rules, `pnpm lint` cannot enforce the code floor, and with TypeScript 7 installed
typescript-eslint will not run at all.

A gate that cannot pass is worse than a missing gate: it invites the next agent to disable the rule,
which `AGENTS.md §6` explicitly forbids.

## Decision

Pin `typescript` to **6.0.3** — the highest release inside typescript-eslint's supported range.

Pinned exactly (no `^`), because a floating range would silently pull 6.1.x the moment it publishes
and break lint on an unrelated day. The pin is revisited only by a superseding ADR.

Companion versions, all verified live on 2026-08-15:

| Package | Version | Constraint that fixed it |
|---|---|---|
| `typescript` | `6.0.3` | `< 6.1.0` from typescript-eslint |
| `typescript-eslint` | `8.67.0` | latest |
| `eslint` | `10.8.1` | latest; in ts-eslint's peer range |
| `eslint-plugin-react-hooks` | `7.1.1` | peers `eslint ^10.0.0` ✓ |

## Consequences

+ `pnpm lint` can run `strictTypeChecked` rules, so the zero-`any` floor is machine-enforced from
  commit #1 exactly as `00_PROJECT_INSPIRATION.md §5` demands.
+ TypeScript 6 is a mature, well-understood compiler. Nothing in this project needs a TS 7 feature.
− We are one major version behind `latest`, and `pnpm outdated` will nag about it forever.
− Whoever eventually upgrades must move `typescript` and `typescript-eslint` together, in one commit,
  and re-run the full gate. It is not a routine bump.

## Trigger to revisit

When `typescript-eslint` publishes a release whose peer range admits `typescript@>=7`. Check with:

```bash
npm view typescript-eslint peerDependencies
```

At that point write a superseding ADR; do not edit this one.

## Rejected alternatives

- **TypeScript 7 + syntactic-only linting.** Drops type-aware rules, which is the majority of the
  value here. `no-explicit-any` survives, but `no-unsafe-assignment`, `no-unsafe-member-access`, and
  `no-floating-promises` do not — and floating promises are a live hazard in a codebase whose entire
  I/O layer is async.
- **TypeScript 7 + no ESLint.** Violates `AGENTS.md §6`, and loses `eslint-plugin-react-hooks`, which
  `00_PROJECT_INSPIRATION.md §4` calls out as genuinely bug-catching because Ink is React.
- **Take `latest` and add `@ts-expect-error`/rule disables as needed.** Explicitly forbidden by
  `AGENTS.md §6`.
