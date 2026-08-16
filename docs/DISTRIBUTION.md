# Distribution

`glim` is a program that runs on the user's machine, not a service. There is no deployment — there
is packaging, and it has a different shape.

The practical consequence: **once someone installs a version, you cannot fix it for them.** You can
publish a newer one and hope they upgrade. Plan the command-line interface accordingly.

> **Nothing below has been done.** The release workflow exists and has never been triggered. This
> document describes the packaging that is already in place and what publishing would take.

---

## How the package is set up

Four pieces make a Node package runnable as a command. All four are in `package.json` today.

### `bin` — the name that becomes a command

```json
"bin": { "glim": "./dist/cli.js" }
```

On install, the package manager symlinks a directory on `PATH` to that file. The `bin` key is
separate from the package name, so a package published as `@scope/glim` still installs a command
called `glim`.

### The shebang

`dist/cli.js` starts with `#!/usr/bin/env node`. Without it the OS tries to execute JavaScript as a
shell script and produces a confusing syntax error. `tsup` injects it via `banner`, because a
shebang written in source would be stripped by the bundler.

### `files` — an allowlist of what ships

```json
"files": ["dist"]
```

Without this, npm publishes nearly the whole directory — source, tests, notes, and anything else
present. Publishing is irreversible, so this is a security control rather than tidiness.

CI verifies it by **listing the tarball** rather than trusting the config, and fails if `src/`,
`test/` or `docs/` ever appear:

```
package/LICENSE
package/README.md
package/dist/cli.js
package/dist/cli.js.map
package/package.json
```

### `engines` — the runtime floor

```json
"engines": { "node": ">=22" }
```

Ink 7 requires Node 22. Declaring it gives a user on Node 18 a clear message instead of a syntax
error from a file they have never heard of. See [`ADR-0003`](adr/ADR-0003-node-22-ink-7-floor.md).

---

## What it costs a user

Measured, not estimated:

|                                 |                                |
| ------------------------------- | ------------------------------ |
| Runtime dependencies            | **3** — `ink`, `meow`, `react` |
| Transitive packages installed   | **40**                         |
| Install size                    | **23 MB**                      |
| The shipped artifact            | **36 KB**                      |
| Native code compiled at install | **none**                       |
| Install scripts run             | **none**                       |

**"No native code" is the row that matters.** A native addon has to compile on the user's machine,
which needs a C++ toolchain and fails in ways you cannot debug remotely. `node-pty` does have one,
but it is a devDependency used only by the test suite and never reaches a user.

---

## Publishing, step by step

### 1. Resolve the package name

`glim` is **taken** on npm — an abandoned `0.0.2` stub, untouched since 2022. Two options
([`ADR-0004`](adr/ADR-0004-npm-name-collision.md)):

- **Scope it** — `@scope/glim`. Always available, and the command stays `glim` because `bin` is a
  separate field. This is the recommendation.
- **Rename the package** — `glimpse-tui`, `peekfs`, `lsx-tui`, `tuifm` were all free as of
  2026-08-16. Re-check before relying on it.

Either way, nothing in `src/`, no config path, and no golden frame changes.

### 2. Remove the interlock

```json
"private": true    ← delete this line
```

It exists so an accidental `pnpm publish` cannot succeed. Removing it is the moment publishing
becomes possible, which is why it is a deliberate separate step.

### 3. Choose a version number

For a CLI, the public API is **the command-line interface**:

- **patch** (`0.1.1`) — a bug fix; keys and output behave the same
- **minor** (`0.2.0`) — a new key or flag; everything old still works
- **major** (`1.0.0`) — a key removed, a flag's meaning changed, or **an exit code changed**

Exit codes are the trap. `glim bad-path` exits `2`. If someone wrote `glim "$d" || echo missing`
into a script, changing that to `1` breaks them silently. It is an interface even though nobody
reads it.

`0.x` signals "this may still break". `1.0.0` is a promise.

### 4. Get a token

An automation token from npmjs.com, stored as `NPM_TOKEN` in the repository secrets. This is a
maintainer action — a token pasted into a chat log is a token that has to be rotated.

### 5. Dry run

```bash
pnpm pack --pack-destination /tmp
tar -tzf /tmp/glim-0.1.0.tgz     # read every line
```

If anything in that list was not intended, fix `files` first. After publishing it is public forever,
even if you unpublish.

### 6. Publish from CI

`.github/workflows/release.yml` is `workflow_dispatch` only — no push trigger, no tag trigger — and
defaults to a dry run. A tag-triggered release is one mistyped `git push --tags` away from shipping
something unfinished.

Publishing from CI also buys **provenance**: npm records which workflow, commit and repository built
the tarball, and users can verify it. A package published from a laptop is just bytes someone
uploaded.

### 7. Verify as a user would

```bash
npx glim@latest --version
```

From a different machine if possible. It is the only check that catches "works on my machine".

---

## Alternatives to npm

| Channel                                                     | Buys you                                      | Costs you                                                       |
| ----------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| **npm** (current setup)                                     | one command to publish; `npx` with no install | the user needs Node 22+                                         |
| **Single binary** (`node --experimental-sea-config`, `pkg`) | no runtime required                           | one artifact per OS/arch, each 40–100 MB, each needing a build  |
| **Homebrew / apt**                                          | feels native; users already trust it          | a formula per manager, and a review process you do not control  |
| **`curl \| sh`**                                            | works anywhere                                | asks users to pipe a URL into a shell; hosting is yours forever |
| **Container image**                                         | reproducible                                  | a file explorer in a container cannot see the user's filesystem |
| **Source only**                                             | zero release process                          | almost nobody will build it                                     |

For a Node TUI with three dependencies and no native code, npm is the right default; the others earn
their complexity only once there is demand for them.
