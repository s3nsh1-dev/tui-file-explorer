# ADR-0001: pnpm is the package manager

- **Status:** Accepted
- **Date:** 2026-08-15
- **Stage:** 1 (scaffold)

## Context

`AGENTS.md §6` and `CLAUDE.md §1` both hardcode the green gate as `npm run typecheck && npm run
lint && npm test && npm run build`. The maintainer uses pnpm. Running the gate as written fails on
their machine, and an npm install would produce a `package-lock.json` they do not want committed.

The green gate is the first command of every session. A stale command string there is not cosmetic —
it is the highest-traffic line in the operating manual.

## Decision

pnpm is the package manager for this repo. `pnpm@11.18.0` is installed locally; the version is
pinned via the `packageManager` field in `package.json` so Corepack resolves it identically
everywhere.

- Scripts run as `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build`.
- `pnpm-lock.yaml` is committed. `package-lock.json` is gitignored and must never appear.
- One-off binaries use `pnpm dlx`, not `npx`.
- The command strings in `AGENTS.md §6` and `CLAUDE.md §1` are updated to match. This is the one
  sanctioned edit to those files for this reason; `00_PROJECT_INSPIRATION.md` names no package
  manager in its `§4` stack table, so it stays untouched and IMMUTABLE.
- `npm view <pkg> version` remains the way to _query_ the registry — it needs no local install and
  `CLAUDE.md §3` names it explicitly.

## Consequences

- **Phantom dependencies become impossible.** pnpm's non-hoisted, symlinked `node_modules` means a
  module that is not declared in `package.json` cannot be imported. This enforces `AGENTS.md §3`'s
  "no runtime dependency without an ADR" rule mechanically rather than on the agent's honour.
- **Install-time code execution becomes an allowlist.** pnpm v10+ refuses to run dependency build
  scripts unless the package is named in `onlyBuiltDependencies`. Every package permitted to execute
  code at install time is therefore one reviewable line in `package.json` — a real supply-chain
  control, not a promise. See [`ADR-0005`](ADR-0005-read-only-by-construction.md) for the wider
  security posture.
- Faster installs, content-addressed store, no duplicated `node_modules` trees.
  − **Native modules need explicit approval.** `node-pty` (Stage 3, L3 evidence) ships `install`,
  `postinstall`, and `prepare` scripts and compiles through node-gyp. Under pnpm it installs
  _unbuilt_ and fails at import time with an error that looks like a missing binding rather than a
  missing approval. `onlyBuiltDependencies: ["node-pty"]` is therefore written into the Stage 3 spec
  ahead of time — see `S3-12`.
  − Peer dependencies must be declared explicitly. `ink@7` marks `react`, `@types/react`, and
  `react-devtools-core` as _optional_ peers, so nothing installs them for us. `react` and
  `@types/react` are declared as direct dependencies in `S1-02`.

## Rejected alternatives

- **npm** — matches the docs as written, but is not what the maintainer uses, and hoisting hides
  undeclared imports that would then break at publish time.
- **Bun** — faster still, but `node-pty` and the L3 PTY evidence level are the least portable part
  of this project, and Ink targets Node. Not worth the risk on the one thing that proves the app
  actually runs.
- **Leaving the docs saying `npm` and translating mentally** — guarantees a future session pastes a
  failing command on line one and starts by debugging the wrong thing.

## Note for future sessions

This ADR does not make the toolchain pnpm-only for _consumers_. The published tarball must install
and run under `npx`, `npm i -g`, and Bun. `S3-16` verifies this by inspecting the packed tarball,
not by assuming it.
