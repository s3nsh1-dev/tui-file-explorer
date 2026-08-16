# Deploying a TUI

> **Who this is for:** you have deployed web apps and never shipped a terminal program.
> **The short version:** there is no deployment. There is **distribution**, and it is a different
> problem with a different shape.

---

## Part 0 — Why there is no Vercel for this

A web app is a **service**. It runs on a machine you control, and "deploying" means putting new code
on that machine. The user never has your code — they have a URL. That is why Vercel, Netlify, Fly and
the rest exist: they own the machine so you do not have to.

A TUI is a **program**. It runs on the user's machine, in their terminal, with their filesystem and
their privileges. Nothing you control is involved at runtime.

So the questions change completely:

| Web app | Terminal program |
|---|---|
| How do I get code onto my server? | How do I get code onto **their** computer? |
| Is the server up? | Does it work on **their** OS, terminal, and runtime version? |
| Roll back the deployment | You cannot. Every version you publish is somewhere forever. |
| Environment variables I set | Environment **they** have — `TERM`, `NO_COLOR`, locale |
| Users always get the latest | Users run whatever they installed, possibly for years |

That last row is the one that changes how you write the code. **Once someone installs version 1.2.0,
you can never fix it for them.** You can publish 1.2.1 and hope they upgrade. There is no equivalent
of pushing a hotfix and having every user refreshed within a minute.

---

## Part 1 — The distribution channels

There are roughly six ways a command-line program reaches a person. You will use one or two.

### 1. A language registry — npm, PyPI, crates.io

**What it is:** you publish a package; users install it with their language's package manager.

```bash
npm install --global glim     # they now have `glim` on their PATH
npx glim                      # or: run it once, without installing
```

**Best when:** your users already have that runtime. A Node CLI aimed at web developers is a perfect
fit — they all have Node.

**The catch:** it requires the runtime. `npx glim` on a machine with no Node does nothing useful, and
"install Node first" is a real barrier for a non-developer audience.

**This is the primary channel for `glim`,** and the repo is already set up for it.

### 2. A single self-contained binary

**What it is:** bundle the runtime *into* the program. One file, no dependencies, download and run.

Node can do this — `node --experimental-sea-config` produces a Single Executable Application. Bun and
Deno compile to binaries natively. Go and Rust do it by default, which is a large part of why so many
modern CLI tools are written in them.

**Best when:** your users are not developers, or you cannot assume any runtime.

**The catch:** the binary is 50–100 MB, because it contains all of Node. You need one per
platform/architecture (linux-x64, linux-arm64, darwin-arm64, …), so CI has to build a matrix, and
you own the update mechanism yourself — there is no `npm update`.

### 3. A system package manager

```bash
brew install glim             # macOS / Linux
apt install glim              # Debian / Ubuntu
paru -S glim                  # Arch (AUR)
```

**Best when:** the tool is broadly useful and mature. This is how `ranger`, `lf` and `nnn` — the
programs `glim` is modelled on — mostly reach people.

**The catch:** the largest amount of work per channel. Homebrew wants a formula in a tap. Debian
wants a `.deb` and a repository, and getting into the *official* repos means a maintainer sponsoring
you and a review process measured in months. Every channel is a separate release chore forever.

### 4. `curl | sh`

```bash
curl -fsSL https://example.com/install.sh | sh
```

**Best when:** you need one command and control the hosting.

**The catch:** you are asking people to pipe a URL into a shell. Plenty of respected tools do it, and
plenty of people will refuse on principle — correctly, since it is precisely the mechanism a
compromised host would use. If you offer it, also offer a way to download and read the script first.

### 5. A container image

```bash
docker run --rm -it -v "$PWD:/data" ghcr.io/you/glim /data
```

**Best when:** the tool needs a complicated environment.

**The catch:** for a *file explorer* this is close to useless. The whole point is browsing your
filesystem, and a container's filesystem is not yours unless you mount it — at which point the user
is writing a longer command than the task deserves. Interactive TUIs also need `-it` to get a TTY,
which people forget, and then the program looks broken.

### 6. Just the source

```bash
git clone … && pnpm install && pnpm build && node dist/cli.js
```

**Best when:** the audience is you, or contributors. **This is where `glim` is today**, and for a
personal tool it is a perfectly respectable final answer.

---

## Part 2 — How this repo is set up for npm

Four pieces make a Node package runnable as a command. All four are already in place.

### `bin` — the name that becomes a command

```json
"bin": { "glim": "./dist/cli.js" }
```

On install, the package manager creates a symlink from a directory on `PATH` to that file. That is
the entire mechanism by which typing `glim` runs your code.

Note the name is separate from the *package* name — `bin` decides what the user types. A package
called `@you/glim` can still install a command called `glim`.

### The shebang — how the OS knows to use Node

```js
#!/usr/bin/env node
```

The first line of `dist/cli.js`. Without it the OS tries to execute JavaScript as a shell script and
produces a baffling syntax error.

`tsup` adds it via `banner`, because the bundler would otherwise strip a shebang written in source.

### `files` — what actually ships

```json
"files": ["dist"]
```

An **allowlist**. Without it, npm publishes nearly the whole directory: your source, your tests, your
notes, and anything you forgot was there. Publishing is irreversible, so this is a security control,
not tidiness.

Verified by *listing* the tarball rather than trusting the config — CI fails the build if `src/`,
`test/` or `docs/` ever appear in it:

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

Ink 7 requires Node 22. Declaring it means a user on Node 18 gets a clear message instead of a
mysterious syntax error from a file they have never heard of.

---

## Part 3 — What `glim` costs a user, measured

Numbers matter more than adjectives here, so these are measured rather than estimated:

| | |
|---|---|
| Runtime dependencies | **3** — `ink`, `meow`, `react` |
| Transitive packages installed | **40** |
| Install size | **23 MB** |
| The shipped artifact itself | **36 KB** |
| Native code compiled at install | **none** |
| Install scripts run | **none** |

**"No native code" is the important row.** A dependency with a native addon must compile on the
user's machine, which needs a C++ toolchain and fails in ways you cannot debug from here. `glim` has
none at runtime — `node-pty`, which does have one, is a devDependency used only by the test suite and
never reaches a user.

**Verified end-to-end**, not assumed: the tarball was packed, installed into a scratch project, and
run.

```
installed as a dependency ✓
binary linked at node_modules/.bin/glim
glim --version → 0.1.0
```

---

## Part 4 — Publishing this, step by step

Nothing below has been done. The workflow exists and has never been triggered — deliberately.

### Step 1 — Resolve the name

`glim` is **taken** on npm: an abandoned `0.0.2` stub, untouched since 2022. npm will not release it
without a dispute process that is not worth it.

Two options ([ADR-0004](adr/ADR-0004-npm-name-collision.md)):

- **Scope it** — `@yourname/glim`. Always available, no conflict, and **the command is still `glim`**
  because `bin` is a separate field. This is the recommendation.
- **Rename the package** — verified free as of 2026-08-16: `glimpse-tui`, `peekfs`, `lsx-tui`,
  `tuifm`.

Either way nothing in `src/`, no config path, and no golden frame changes.

### Step 2 — Remove the interlock

```json
"private": true    ← delete this line
```

It exists so that an accidental `pnpm publish` cannot succeed. Removing it is the moment publishing
becomes possible, which is why it is a separate, deliberate step.

### Step 3 — Decide a version number

Semver, and for a CLI the public API is **the command-line interface**:

- **patch** (`0.1.1`) — a bug fix; keys and output behave the same
- **minor** (`0.2.0`) — a new key or flag; everything old still works
- **major** (`1.0.0`) — you removed a key, changed a flag's meaning, or **changed an exit code**

Exit codes are the trap. `glim bad-path` exits `2`; if someone wrote `glim "$d" || echo missing` into
a script, changing that to `1` breaks them silently. It is an interface even though nobody looks at
it.

`0.x` signals "I may still break things". Publishing `1.0.0` is a promise.

### Step 4 — Get a token

An automation token from npmjs.com, stored as `NPM_TOKEN` in the repository secrets.

**Do this yourself.** I never handle credentials, and a token in a chat log is a token you have to
rotate.

### Step 5 — Dry run

```bash
pnpm pack --pack-destination /tmp
tar -tzf /tmp/glim-0.1.0.tgz     # read every line
```

Look at the list. If anything is in there you did not intend, fix `files` before publishing, because
after publishing it is public forever even if you unpublish.

### Step 6 — Publish, from CI

`.github/workflows/release.yml` is `workflow_dispatch` only — no push trigger, no tag trigger, and it
defaults to dry-run. A tag-triggered release is one mistyped `git push --tags` away from publishing
something unfinished.

Publishing from CI rather than your laptop buys you **provenance**: npm records which workflow, which
commit and which repository built the tarball, and users can verify it. A package published from a
laptop is just bytes someone uploaded.

### Step 7 — Verify like a user

```bash
npx glim@latest --version
```

From a different machine if you can. This is the only test that catches "works on my machine".

---

## Part 5 — What users expect from a terminal program

There are conventions. Breaking them makes a tool feel wrong in a way people struggle to articulate.
`glim` follows all of these already, and they are worth knowing as a checklist for anything you build
next:

| Convention | Why | `glim` |
|---|---|---|
| `--help` and `--version` work | The first two things anyone types | ✅ |
| Errors to **stderr**, output to **stdout** | `cmd > out` must not put errors in `out` | ✅ |
| Exit `0` on success, non-zero on failure | Every script depends on this | ✅ `2` for a bad path |
| Detect a pipe and behave differently | A TUI frame in a pipe is useless | ✅ plain listing |
| Honour `NO_COLOR` | Accessibility, and log files | ✅ zero styling, not just no colour |
| Never require colour to understand output | Colourblind users, dumb terminals | ✅ cursor is a `❯` glyph |
| Restore the terminal on **every** exit path | Otherwise their shell is broken until `reset` | ✅ quit, SIGINT, SIGTERM, crash |
| Do not phone home | A CLI making network calls is a surprise | ✅ no network at all |
| No install scripts | They run arbitrary code at install time | ✅ none |

The piping one deserves emphasis because it is the most commonly missed. Compare:

```bash
glim | head -3        # plain listing, three lines — useful
                      # vs. a box-drawn frame padded with trailing spaces
```

---

## Part 6 — What goes wrong, and how to think about it

**Someone runs it on Node 20.** `engines` gives them a clear message. Without it, a syntax error from
inside a dependency. *Always declare `engines`.*

**A dependency needs a compiler.** The user's install fails with pages of `node-gyp` output. You
cannot debug their toolchain. *Prefer pure-JS dependencies for anything you distribute.*

**Their terminal lacks a font glyph.** Your careful box-drawing renders as `□□□`. There is no way to
detect this. *Offer an ASCII fallback, or accept the risk knowingly.*

**Their `TERM` is `dumb`.** No colour, no cursor movement. *Degrade rather than crash — the same
discipline as the non-TTY path.*

**You publish a broken version.** `npm unpublish` is only allowed within 72 hours and only if nothing
depends on it. Otherwise: publish a fix and deprecate the bad one. *This is why the gate runs before
publish, in CI, on two Node versions.*

**Nobody upgrades.** People install a CLI once and keep it for years. *Which is the real argument for
the gate: the version you publish is the version someone is still running in 2029.*

---

## Part 7 — What I would actually do with `glim`

**Today:** nothing. It runs from the repo with two commands. For a tool you built to learn, that is a
finished state, not an unfinished one.

**If you want it on your PATH:** symlink it into a directory already on your `PATH`:

```bash
ln -sf "$PWD/dist/cli.js" ~/.local/bin/glim
```

Verified working on this machine. No publishing, no name decision, and because the symlink points at
the build output, `pnpm build` updates the command with no re-linking.

(`pnpm link --global` is the "proper" answer and **does not work here** — pnpm's global bin directory
is not on your PATH, so it errors out until you run `pnpm setup`. The symlink sidesteps it.)

**If you want to hand it to someone else:** publish to npm under a scope (`@you/glim`). One decision,
one token, one workflow run, and they get `npx @you/glim`.

**If you want strangers to use it:** that is a different project. It needs macOS and Windows support
(currently out of scope by decision), a real README with screenshots, an issue tracker you actually
watch, and probably a Homebrew formula. The *code* is ready; the *commitment* is the part to be
honest with yourself about.

---

## Where to read next

- [`FOR_THE_MAINTAINER.md`](FOR_THE_MAINTAINER.md) — what is left, and what only you can do
- [`adr/ADR-0004`](adr/ADR-0004-npm-name-collision.md) — the name decision, with both options costed
- [`../.github/workflows/release.yml`](../.github/workflows/release.yml) — the workflow, with its two
  interlocks commented in place
- [`LEARNING_TUI.md`](LEARNING_TUI.md) — how the program itself works
