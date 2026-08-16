# ADR-0004: `glim` stays the project name; the npm package name is deferred to S3-16

- **Status:** Accepted
- **Date:** 2026-08-15
- **Stage:** 1 (scaffold)

## Context

`00_PROJECT_INSPIRATION.md §1` says:

> Rename freely — `glim` is a placeholder chosen because it does not collide on npm as of writing.
> If you rename, do it in Stage 1 and never again.

Checked before scaffolding, per that instruction:

```text
$ npm view glim name version description time.modified
name = 'glim'
version = '0.0.2'
description = ''
time.modified = '2022-05-03T22:00:28.197Z'
```

The name **is** taken — an empty-description stub, untouched since May 2022. Abandoned in practice,
unavailable in fact. npm will not release it without a formal dispute, which is not worth doing for a
package we have already decided never to publish (the maintainer chose *release-ready, never fired*
for Stage 3).

The naming instruction exists because the name is load-bearing in more places than the registry: the
binary, the config directory, the header rendered in every golden frame. Changing it after Stage 1
invalidates snapshots.

## Decision

Separate the two names, which were never actually the same thing:

- **Project name, binary name, config path, all user-facing strings: `glim`.** Unchanged, decided
  now, never revisited. Config lives at `$XDG_CONFIG_HOME/glim/config.json`, the bin entry is `glim`,
  and golden frames render `glim` in the header.
- **npm package name: undecided, and deliberately so.** `package.json` carries `"name": "glim"` with
  `"private": true` until S3-16. The private flag makes an accidental `pnpm publish` impossible
  rather than merely unlikely.

At **S3-16** this becomes a `HUMAN GATE` with exactly two live options, and the maintainer picks:

1. **Scope it** — `@<npm-username>/glim`. Always available, zero conflict, no user-facing change: the
   binary is still `glim` because `bin` is a separate field from `name`. This is the recommendation.
2. **Rename the package only** — verified free as of today: `glimpse-tui`, `peekfs`, `lsx-tui`,
   `tuifm`. Costs a README line and nothing else.

Neither option touches `src/`, the config path, or a single snapshot.

## Consequences

+ Stage 1 is unblocked immediately, and the name never churns through Stages 2 and 3.
+ `"private": true` is a hard interlock against publishing something half-finished. It is removed in
  the same commit that decides the real name, and not before.
+ Packaging evidence at S3-16 uses `pnpm pack` plus tarball inspection, which is purely local and
  works regardless of who owns a registry name. The pipeline never depends on owning `glim`.
− `pnpm publish --dry-run` is not usable as evidence while `private` is set. `pnpm pack` is the
  substitute and is strictly better anyway — it produces an artefact you can actually list and read.
− A future session that wants to publish must open this ADR first. That is the intent.

## Rejected alternatives

- **Rename everything to a free name now.** Real cost (the maintainer already chose `glim` twice —
  once in the inspiration doc, once when asked directly today) for zero benefit on a package that is
  never published. The `§1` "rename in Stage 1" rule exists to stop *snapshot churn*, and deferring
  the registry name causes none.
- **Set `"name": "glim"` and leave `private` off.** Leaves a latent publish failure in the repo,
  discovered at the worst possible moment — during release, by whoever is least expecting it.
- **Dispute the abandoned package with npm support.** Weeks of latency for a name on a package we
  have decided not to ship.
