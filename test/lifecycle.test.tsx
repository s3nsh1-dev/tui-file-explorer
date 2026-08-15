import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import { cleanup, render, settle } from './helpers/render.js';

afterEach(cleanup);

describe('quitting', () => {
  it('exits on q', async () => {
    const { stdin, waitUntilExit } = render(<App cwd={fixture('basic')} />);
    await settle();

    stdin.write('q');

    // Resolves only if exit() was called. The suite timeout is the failure
    // mode if it never is.
    await expect(waitUntilExit()).resolves.toBeUndefined();
  });
});

describe('raw mode degradation', () => {
  /**
   * Ink 7 THROWS when useInput mounts and raw mode is unsupported —
   * ink/build/components/App.js handleSetRawMode, reached from
   * use-input.js:34 which calls setRawMode(true) gated only by isActive.
   * The app must gate on isRawModeSupported rather than let that throw.
   */
  it('still renders the listing when raw mode is unavailable', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { stdinIsTTY: false });
    await settle();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('README.md');
    expect(frame).toContain('docs/');
  });

  it('tells the user input is unavailable instead of failing silently', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { stdinIsTTY: false });
    await settle();

    expect(lastFrame() ?? '').toMatch(/input unavailable/i);
  });

  it('does not crash when keys are sent with raw mode unavailable', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, { stdinIsTTY: false });
    await settle();

    const before = lastFrame();
    stdin.write('j');
    stdin.write('q');
    await settle();

    // Input is inert, not fatal: the frame is unchanged and we are still alive.
    expect(lastFrame()).toBe(before);
  });
});
