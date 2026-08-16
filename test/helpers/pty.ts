import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as pty from 'node-pty';

/**
 * L3 harness — the real binary, in a real pseudo-terminal.
 *
 * Everything below this level is a lie of some size. A component test renders
 * to a string; a `child_process` test gets a pipe, so `isTTY` is false and the
 * app takes its degraded path. Only a PTY makes the program believe it is
 * talking to a terminal, which is the only way to exercise raw mode, the
 * alternate screen, and signal handling as a user would meet them.
 *
 * Requires `node-pty`, whose native addon needs an `allowBuilds` entry in
 * pnpm-workspace.yaml (ADR-0001).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const BINARY = path.join(here, '..', '..', 'dist', 'cli.js');

/** False on a fresh clone where `pnpm build` has not run; tests skip rather than fail. */
export const isBuilt = existsSync(BINARY);

const ESC = String.fromCharCode(0x1b);

/** Named so PTY tests read as intent. These go down the wire as real bytes. */
export const PTY_KEY = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  right: `${ESC}[C`,
  left: `${ESC}[D`,
  enter: String.fromCharCode(0x0d),
  escape: ESC,
  ctrlC: String.fromCharCode(0x03),
} as const;

const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g');
const OSC = new RegExp(`${ESC}\\][^\\u0007]*\\u0007`, 'g');

export type PtySession = {
  /** Everything the program has written, escape sequences included. */
  readonly raw: () => string;
  /** The same, with escape sequences removed — for content assertions. */
  readonly text: () => string;
  readonly write: (data: string) => void;
  /** Resolves when output stops changing, or rejects if it never does. */
  readonly settled: (options?: { interval?: number; timeout?: number }) => Promise<void>;
  /**
   * Resolves once the visible text satisfies `predicate`.
   *
   * Preferred over `settled()` before an assertion. "Output stopped changing"
   * is not the same as "the thing I am waiting for has appeared": under a busy
   * suite the process can pause between the directory read and the preview
   * read, and stability fires in that gap. Waiting for the CONDITION removes
   * the race instead of widening the window.
   */
  readonly waitFor: (
    predicate: (text: string) => boolean,
    options?: { interval?: number; timeout?: number },
  ) => Promise<void>;
  /** Resolves with the exit code once the process ends. */
  readonly exit: (timeoutMs?: number) => Promise<number>;
  readonly alive: () => boolean;
  readonly kill: () => void;
};

export const openGlim = (
  args: readonly string[],
  { cols = 100, rows = 24 }: { cols?: number; rows?: number } = {},
): PtySession => {
  const term = pty.spawn(process.execPath, [BINARY, ...args], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    // NO_COLOR keeps the captured buffer readable: colour is asserted
    // separately, and SGR noise makes a failure message unreadable.
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });

  let buffer = '';
  let exitCode: number | null = null;

  term.onData((data) => {
    buffer += data;
  });
  term.onExit(({ exitCode: code }) => {
    exitCode = code;
  });

  const settled = async ({ interval = 60, timeout = 6000 } = {}): Promise<void> => {
    const deadline = Date.now() + timeout;
    let previous: string | null = null;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      if (buffer !== '' && buffer === previous) return;
      previous = buffer;
    }
    throw new Error(`pty output never settled within ${String(timeout)}ms`);
  };

  const waitFor = async (
    predicate: (text: string) => boolean,
    { interval = 50, timeout = 15_000 } = {},
  ): Promise<void> => {
    const deadline = Date.now() + timeout;
    const visible = (): string => buffer.replace(OSC, '').replace(ANSI, '');
    while (Date.now() < deadline) {
      if (predicate(visible())) return;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(
      `condition never met within ${String(timeout)}ms. Last output:\n${visible().slice(-800)}`,
    );
  };

  return {
    raw: () => buffer,
    text: () => buffer.replace(OSC, '').replace(ANSI, ''),
    write: (data) => {
      term.write(data);
    },
    settled,
    waitFor,
    exit: async (timeoutMs = 6000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (exitCode !== null) return exitCode;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      throw new Error(`process did not exit within ${String(timeoutMs)}ms`);
    },
    alive: () => exitCode === null,
    kill: () => {
      if (exitCode === null) term.kill();
    },
  };
};
