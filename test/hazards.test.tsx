import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { displayWidth } from '../src/core/sanitize.js';
import { readPreview } from '../src/ui/hooks/usePreview.js';
import { fixture } from './helpers/fixture.js';
import { KEY, cleanup, render, settle, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

const asRoot = process.getuid?.() === 0;

const hasMkfifo = ((): boolean => {
  try {
    execFileSync('sh', ['-c', 'command -v mkfifo'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * ADR-0005's most important guard, and the only test in the suite whose failure
 * mode is HANGING rather than going red.
 *
 * Opening a FIFO does not error — it blocks until a writer appears, forever, in
 * raw mode, with no way out but killing the process from another terminal. If
 * this test stops instead of failing, the `isFile()` gate in usePreview has
 * regressed. Stage 3 knows it as adversary A9.
 */
describe('non-regular files are refused, never opened', () => {
  it.skipIf(!hasMkfifo)('previews a FIFO as a placeholder without reading it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-fifo-'));
    const fifo = path.join(dir, 'pipe');
    try {
      execFileSync('mkfifo', [fifo]);

      // Direct call, not through the component: if the guard is gone this
      // never settles, and the suite timeout is the alarm.
      const preview = await readPreview(fifo);

      expect(preview.kind).toBe('special');
      if (preview.kind === 'special') {
        expect(preview.label).toContain('pipe');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasMkfifo)('renders the FIFO placeholder in the preview pane', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-fifo-ui-'));
    try {
      execFileSync('mkfifo', [path.join(dir, 'pipe')]);

      const { lastFrame } = render(<App cwd={dir} />, { columns: 100, rows: 12 });
      await settle(200);

      const frame = stripAnsi(lastFrame() ?? '');
      expect(frame).toContain('pipe');
      expect(frame).toContain('not previewed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('previews a character device as a placeholder rather than reading it', async () => {
    // /dev/zero would return infinite bytes; /dev/null blocks nothing but is
    // still not a regular file. Both must be refused before open().
    const preview = await readPreview('/dev/null');
    expect(preview.kind).toBe('special');
  });
});

describe('unreadable directories', () => {
  it.skipIf(asRoot)('shows a sanitized reason and stays interactive', async () => {
    const denied = await mkdtemp(path.join(tmpdir(), 'glim-denied-'));
    await chmod(denied, 0o000);

    try {
      const { lastFrame, stdin } = render(<App cwd={denied} />, { columns: 100, rows: 12 });
      await settle(150);

      expect(stripAnsi(lastFrame() ?? '')).toMatch(/permission denied/i);

      // The keymap is still alive: help opens, so the user can get out.
      stdin.write('?');
      await settle();
      expect(stripAnsi(lastFrame() ?? '')).toContain('Keys');
    } finally {
      await chmod(denied, 0o755);
      await rm(denied, { recursive: true, force: true });
    }
  });
});

describe('quitting from an error state', () => {
  it.skipIf(asRoot)('still exits on q when the directory is unreadable', async () => {
    const denied = await mkdtemp(path.join(tmpdir(), 'glim-denied-quit-'));
    await chmod(denied, 0o000);

    try {
      const { stdin, waitUntilExit } = render(<App cwd={denied} />, { columns: 80, rows: 12 });
      await settle(150);

      stdin.write('q');
      // Resolves only if exit() ran. An error state must not trap the user.
      await expect(waitUntilExit()).resolves.toBeUndefined();
    } finally {
      await chmod(denied, 0o755);
      await rm(denied, { recursive: true, force: true });
    }
  });
});

describe('terminal resize', () => {
  it('collapses the preview pane when the terminal narrows', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-resize-'));
    try {
      await writeFile(path.join(dir, 'alpha.txt'), 'hello preview\n');
      await writeFile(path.join(dir, 'beta.txt'), 'other\n');

      const { lastFrame, resize } = render(<App cwd={dir} />, { columns: 120, rows: 16 });
      await settle(150);
      expect(stripAnsi(lastFrame() ?? '')).toContain('hello preview');

      resize(50, 16);
      await settle(150);

      const narrow = stripAnsi(lastFrame() ?? '');
      expect(narrow).not.toContain('hello preview');
      expect(narrow).toContain('alpha.txt');
      for (const line of narrow.replace(/\n$/, '').split('\n')) {
        expect(line.length).toBeLessThanOrEqual(50);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('restores the preview pane when the terminal widens again', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-regrow-'));
    try {
      await writeFile(path.join(dir, 'alpha.txt'), 'hello preview\n');

      const { lastFrame, resize } = render(<App cwd={dir} />, { columns: 50, rows: 16 });
      await settle(150);
      expect(stripAnsi(lastFrame() ?? '')).not.toContain('hello preview');

      resize(120, 16);
      await settle(150);
      expect(stripAnsi(lastFrame() ?? '')).toContain('hello preview');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps the cursor visible when the terminal gets shorter', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-shrink-'));
    try {
      await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          writeFile(path.join(dir, `f-${String(index).padStart(2, '0')}.txt`), 'x'),
        ),
      );

      const { lastFrame, stdin, resize } = render(<App cwd={dir} />, { columns: 80, rows: 24 });
      await settle(200);

      for (let press = 0; press < 30; press += 1) stdin.write(KEY.down);
      await settle(200);
      expect(stripAnsi(lastFrame() ?? '')).toMatch(/❯ f-30\.txt/);

      resize(80, 10);
      await settle(200);

      // The window must follow the cursor down, not strand it off-screen.
      expect(stripAnsi(lastFrame() ?? '')).toMatch(/❯ f-30\.txt/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Regression: Ink overlays surplus rows instead of truncating them, so any
 * fixed-height content in a flexGrow container corrupts the frame rather than
 * clipping. Help was the only such component; these assert it stays clipped.
 */
describe('help overlay in a short terminal', () => {
  it('clips instead of interleaving its own lines', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, {
      columns: 60,
      rows: 10,
    });
    await settle();
    stdin.write('?');
    await settle();

    const frame = stripAnsi(lastFrame() ?? '');
    // The title survives intact — it rendered as " eys" before the fix.
    expect(frame).toContain('Keys');
    // Text from two different bindings must never share a row.
    expect(frame).not.toContain('directorytory');
    expect(frame).not.toMatch(/dotfiles.*cancels/);
  });

  it('renders every row at exactly the terminal width', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, {
      columns: 60,
      rows: 10,
    });
    await settle();
    stdin.write('?');
    await settle();

    for (const line of stripAnsi(lastFrame() ?? '')
      .replace(/\n$/, '')
      .split('\n')) {
      expect(displayWidth(line), JSON.stringify(line)).toBe(60);
    }
  });
});
