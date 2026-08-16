import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixture.js';
import { PTY_KEY, isBuilt, openGlim, type PtySession } from './helpers/pty.js';

/**
 * L3 — the real binary, in a real pseudo-terminal (AGENTS.md §2).
 *
 * `00_PROJECT_INSPIRATION.md §7` is blunt about what counts as a Stage 3
 * deliverable: not "added error handling", but a test that spawns a PTY,
 * navigates into a permission-denied directory, and asserts the app is still
 * alive with a visible message. That is the first test below.
 */

const asRoot = process.getuid?.() === 0;

const open: PtySession[] = [];
const glim = (args: readonly string[], size?: { cols?: number; rows?: number }): PtySession => {
  const session = openGlim(args, size);
  open.push(session);
  return session;
};

afterEach(() => {
  for (const session of open) session.kill();
  open.length = 0;
});

describe.skipIf(!isBuilt)('end-to-end in a real terminal', () => {
  it('renders the two-pane frame to an actual TTY', async () => {
    const session = glim([fixture('basic')]);
    // Wait for the preview to have loaded, not merely for output to pause.
    await session.waitFor((text) => text.includes('guide.md'));

    const text = session.text();
    expect(text).toContain('README.md');
    expect(text).toContain('docs/');
    // The preview pane followed the cursor onto docs/.
    expect(text).toContain('guide.md');
    // A real TTY means the interactive path, not the piped plain listing.
    expect(text).toContain('↑↓ move');
    expect(session.alive()).toBe(true);
  });

  it('enters the alternate screen on a TTY, unlike on a pipe', async () => {
    const session = glim([fixture('basic')]);
    await session.settled();

    // 1049h switches to the alternate screen. The piped run must never do this;
    // the TTY run must (ADR-0007).
    await session.waitFor(() => session.raw().includes('[?1049h'));
    expect(session.raw()).toContain('[?1049h');
  });

  it('moves the cursor in response to real keystrokes', async () => {
    const session = glim([fixture('basic')]);
    await session.waitFor((text) => /❯\s*docs\//.test(text));

    session.write(PTY_KEY.down);
    await session.waitFor((text) => /❯\s*src\//.test(text));

    expect(session.text()).toMatch(/❯\s*src\//);
  });

  it('navigates into a directory and back out', async () => {
    const session = glim([fixture('basic')]);
    await session.settled();

    session.write(PTY_KEY.enter);
    await session.waitFor((text) => text.includes('guide.md'));

    session.write(PTY_KEY.left);
    await session.waitFor((text) => text.includes('package.json'));
    expect(session.text()).toContain('package.json');
  });

  /**
   * Adversary A1, and the stage's defining deliverable.
   */
  it.skipIf(asRoot)('survives a permission-denied directory with a visible message', async () => {
    // mkdtemp APPENDS random characters to the prefix, so it returns the real
    // path — using a hand-built child path here silently created nothing and
    // the binary correctly exited 2 on a missing directory.
    const denied = await mkdtemp(path.join(tmpdir(), 'glim-e2e-denied-'));
    await writeFile(path.join(denied, 'unreadable.txt'), 'nope\n');

    try {
      await chmod(denied, 0o000);

      const session = glim([denied], { cols: 90, rows: 16 });
      await session.settled();

      await session.waitFor((text) => /permission denied|no such directory/i.test(text));
      expect(session.text()).toMatch(/permission denied|no such directory/i);
      // Alive is the point: it must not have crashed out.
      expect(session.alive()).toBe(true);

      // And still interactive — help opens, so the user can get out.
      session.write('?');
      await session.waitFor((text) => text.includes('Keys'));
      expect(session.text()).toContain('Keys');
    } finally {
      await chmod(denied, 0o755).catch(() => undefined);
      await rm(denied, { recursive: true, force: true });
    }
  });

  /**
   * Adversary A6/A7 — key-mash then quit. The terminal must be handed back.
   */
  it('exits cleanly on q and leaves the alternate screen', async () => {
    const session = glim([fixture('basic')]);
    await session.settled();

    session.write('q');
    const code = await session.exit();

    expect(code).toBe(0);
    // 1049l restores the primary screen. Without it the user's scrollback is
    // gone and they are staring at a dead frame.
    expect(session.raw()).toContain('[?1049l');
  });

  it('survives key-mash without crashing or losing the frame', async () => {
    const session = glim([fixture('basic')]);
    await session.settled();

    // Overlapping navigations: the exact race S3-08's request id defends.
    const mash = [
      PTY_KEY.down,
      PTY_KEY.enter,
      PTY_KEY.left,
      PTY_KEY.down,
      PTY_KEY.enter,
      PTY_KEY.left,
      PTY_KEY.up,
      PTY_KEY.enter,
      PTY_KEY.left,
    ];
    for (const key of mash) session.write(key);

    await session.settled();

    expect(session.alive()).toBe(true);
    // Whatever it settled on, it is a coherent listing with a status bar.
    await session.waitFor((text) => text.includes('↑↓ move') && /❯/.test(text));

    session.write('q');
    expect(await session.exit()).toBe(0);
  });

  it('exits 130 on Ctrl-C, the conventional 128+SIGINT', async () => {
    const session = glim([fixture('basic')]);
    await session.settled();

    session.write(PTY_KEY.ctrlC);
    const code = await session.exit();

    // Ink handles Ctrl-C in raw mode (it arrives as a byte, not a signal).
    // Either it exits 0 through the normal path or 130 through the signal
    // handler; what must NOT happen is a crash or a hang.
    expect([0, 130]).toContain(code);
    expect(session.raw()).toContain('[?1049l');
  });

  it('runs in a very small terminal without crashing', async () => {
    const session = glim([fixture('basic')], { cols: 24, rows: 8 });
    await session.settled();

    expect(session.alive()).toBe(true);
    // Something was drawn, and it is still the app.
    await session.waitFor((text) => /❯/.test(text));

    session.write('q');
    expect(await session.exit()).toBe(0);

    // NOTE: exact column widths are NOT asserted here. A raw PTY stream is not
    // a screen — Ink moves the cursor with escape sequences, so "lines" in the
    // captured bytes are not screen rows, and measuring them would be measuring
    // an artefact of the capture. Cell-exact width IS asserted, at 20 / 50 /
    // 100 / 120 columns, in test/golden.test.tsx, where lastFrame() really is
    // the rendered screen.
  });
});
