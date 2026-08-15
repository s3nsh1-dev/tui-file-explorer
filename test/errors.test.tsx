import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { KEY, cleanup, render, settle } from './helpers/render.js';

afterEach(cleanup);

// A mode-000 directory is readable by root, so this proves nothing as root.
const asRoot = process.getuid?.() === 0;

describe('unreadable directories', () => {
  it.skipIf(asRoot)('reports the failure instead of crashing', async () => {
    const denied = await mkdtemp(path.join(tmpdir(), 'glim-denied-'));
    await chmod(denied, 0o000);

    try {
      const { lastFrame } = render(<App cwd={denied} />);
      await settle();

      // Without a catch in the load effect this is an unhandled rejection,
      // which terminates the process rather than failing the assertion.
      expect(lastFrame() ?? '').toMatch(/permission denied/i);
    } finally {
      await chmod(denied, 0o755);
      await rm(denied, { recursive: true, force: true });
    }
  });

  it.skipIf(asRoot)('stays interactive so the user can navigate back out', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'glim-parent-'));
    const denied = path.join(parent, 'denied');
    await mkdtemp(denied).catch(async () => {
      await rm(denied, { force: true, recursive: true });
    });

    const { lastFrame, stdin } = render(<App cwd={parent} />);
    await settle();

    try {
      // The app is alive and responding to input after rendering the parent.
      stdin.write(KEY.left);
      await settle();
      expect(lastFrame() ?? '').not.toBe('');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
