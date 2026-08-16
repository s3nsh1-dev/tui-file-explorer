# ADR-0003: Runtime floor is Node 22, on Ink 7 — diverges from the inspiration doc

- **Status:** Accepted
- **Date:** 2026-08-15
- **Stage:** 1 (scaffold)

## Context

`00_PROJECT_INSPIRATION.md §4` states:

> | Runtime | Node 20+ LTS | Ink 6 requires it; ESM-native |

That file is **IMMUTABLE**. It is also, as of today, wrong — which is precisely the case its own
header anticipates: *"If reality diverges from it, that divergence is recorded in the relevant stage
doc under Deviations, or promoted to an ADR."*

Verified live on 2026-08-15:

```
$ npm view ink version
7.1.1
$ npm view ink engines peerDependencies
engines = { node: '>=22' }
peerDependencies = {
  '@types/react': '>=19.2.0',
  react: '>=19.2.0',
  'react-devtools-core': '>=6.1.2' }
$ npm view ink peerDependenciesMeta
{ '@types/react': { optional: true },
  'react-devtools-core': { optional: true },
  react: { optional: true } }
```

Ink is at **7**, not 6, and its engine floor is **Node >= 22**, not 20. Local Node is v24.18.1.

## Decision

- Runtime floor is **Node >= 22**, declared in `package.json` `engines` and enforced at install time
  by `engine-strict=true` in `.npmrc`.
- `ink@7.1.1`, `react@19.2.x`, `@types/react@19.2.x`.
- `react` and `@types/react` are declared as **direct dependencies**, because Ink marks them optional
  peers and pnpm will not install them for us (see ADR-0001).
- `react-devtools-core` is *not* installed. It is an optional peer used only by Ink's devtools
  integration, which this project does not use. Adding it would be an undeclared runtime dependency
  under `AGENTS.md §3`.
- CI (`S3-15`) tests Node 22 and Node 24 — the floor and the current release — so the `engines` claim
  is proven, not asserted.
- `00_PROJECT_INSPIRATION.md` is **not edited**. This ADR is the record. `v1_STAGE_1.md §9
  Deviations` carries a pointer to it.

## Consequences

+ We are on the current Ink, which is what the ecosystem ships and what its docs describe. Building
  against Ink 6 would mean reading documentation that no longer matches the installed types.
+ React 19.2 semantics apply throughout, including the current hooks lint rules.
− The inspiration doc now contains a factually stale line that we are contractually forbidden from
  fixing. Any future session reading `§4` and trusting it will scaffold the wrong runtime. This is
  mitigated only by `CLAUDE.md §3`'s standing rule — *never trust a version written in a doc,
  including these docs* — and by this ADR being discoverable in `docs/adr/`.
− Node 20 users cannot run `glim`. Node 20 reaches end-of-life before this project would plausibly
  ship, so the cost is theoretical.

## Standing instruction

Do not "fix" `00_PROJECT_INSPIRATION.md §4`. Do not pin Ink 6 to make the doc true. If a future
session finds this ADR and the doc in conflict, **this ADR wins** and the doc is history.

## Rejected alternatives

- **Pin `ink@6` to satisfy the doc.** Optimising a working system for a stale sentence. Also puts us
  on an unmaintained line for a project whose entire premise is demonstrating how to write a *real*
  Ink application.
- **Edit the immutable doc.** Explicitly forbidden by its own header and by `AGENTS.md §4.1`. The
  whole point of an immutable inspiration doc is that it records what we believed at the start; a doc
  edited to agree with the code records nothing.
