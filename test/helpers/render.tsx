import { EventEmitter } from 'node:events';
import { render as inkRender } from 'ink';
import type { ReactElement } from 'react';

/**
 * Local replacement for `ink-testing-library`.
 *
 * Why we do not use the published package (v1 §9, S1-06):
 *   - `columns` is a hardcoded getter returning 100, with no way to change it.
 *     Stage 2 needs golden frames at 80x24 AND 120x40.
 *   - There is no `rows` property at all, so viewport windowing — the Stage 2
 *     requirement that depends entirely on terminal height — cannot be tested.
 *   - Its fake stdin sets `isTTY = true` unconditionally. Ink derives
 *     `isRawModeSupported` straight from `stdin.isTTY`
 *     (ink/build/components/App.js:121), so the S1-13 raw-mode degradation
 *     requirement is literally unwritable through it.
 *
 * The call shape is kept identical to ink-testing-library so the pattern in
 * CLAUDE.md §5 still reads the same — only the import path changes.
 */

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

class FakeStdout extends EventEmitter {
  readonly frames: string[] = [];
  #lastFrame: string | undefined;

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super();
  }

  readonly write = (frame: string): void => {
    this.frames.push(frame);
    this.#lastFrame = frame;
  };

  readonly lastFrame = (): string | undefined => this.#lastFrame;
}

class FakeStderr extends EventEmitter {
  readonly frames: string[] = [];
  #lastFrame: string | undefined;

  readonly write = (frame: string): void => {
    this.frames.push(frame);
    this.#lastFrame = frame;
  };

  readonly lastFrame = (): string | undefined => this.#lastFrame;
}

class FakeStdin extends EventEmitter {
  data: string | null = null;

  /**
   * `boolean | undefined`, not `boolean`, because that is what Node does:
   * a non-TTY stream has `isTTY === undefined`, never `false`. Ink assigns it
   * straight through to `isRawModeSupported`, so a fake that reports a tidy
   * `false` is better-behaved than reality and hides a real bug — it did
   * exactly that at S1-13.
   */
  constructor(readonly isTTY: boolean | undefined) {
    super();
  }

  readonly write = (data: string): void => {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  };

  readonly read = (): string | null => {
    const { data } = this;
    this.data = null;
    return data;
  };

  setEncoding(): void {
    // Ink calls this; nothing to do for a fake.
  }
  setRawMode(): void {
    // Deliberately inert. `isRawModeSupported` is derived from isTTY above.
  }
  resume(): void {
    // no-op
  }
  pause(): void {
    // no-op
  }
  ref(): void {
    // no-op
  }
  unref(): void {
    // no-op
  }
}

export type RenderOptions = {
  /** Terminal width in character cells. Pinned so layout assertions are stable. */
  readonly columns?: number;
  /** Terminal height in rows. Drives viewport windowing from Stage 2 onward. */
  readonly rows?: number;
  /**
   * When false, Ink reports `isRawModeSupported === false` and the app must
   * degrade rather than throw. This is the whole reason for the local harness.
   */
  readonly stdinIsTTY?: boolean;
};

export type RenderResult = {
  readonly lastFrame: () => string | undefined;
  readonly frames: readonly string[];
  readonly stdin: FakeStdin;
  readonly stdout: FakeStdout;
  readonly stderr: FakeStderr;
  readonly rerender: (tree: ReactElement) => void;
  readonly unmount: () => void;
  readonly cleanup: () => void;
  /**
   * Resolves once the app calls exit() — how we prove `q` actually quits.
   * Ink 7 resolves with whatever was passed to exit(value), hence `unknown`.
   */
  readonly waitUntilExit: () => Promise<unknown>;
};

const instances: { unmount: () => void; cleanup: () => void }[] = [];

export const render = (tree: ReactElement, options: RenderOptions = {}): RenderResult => {
  const stdout = new FakeStdout(options.columns ?? DEFAULT_COLUMNS, options.rows ?? DEFAULT_ROWS);
  const stderr = new FakeStderr();
  const stdin = new FakeStdin(options.stdinIsTTY === false ? undefined : true);

  const instance = inkRender(tree, {
    // Ink types these as real TTY streams. The fakes implement the surface Ink
    // actually touches; `unknown` rather than `any` keeps AGENTS.md §7 intact.
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    // Emit every frame separately instead of diffing, so `frames` is a real
    // history and `lastFrame()` is the complete current screen.
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  instances.push({ unmount: instance.unmount, cleanup: instance.cleanup });

  return {
    lastFrame: stdout.lastFrame,
    frames: stdout.frames,
    stdin,
    stdout,
    stderr,
    rerender: instance.rerender,
    unmount: instance.unmount,
    cleanup: instance.cleanup,
    waitUntilExit: instance.waitUntilExit,
  };
};

export const cleanup = (): void => {
  for (const instance of instances) {
    instance.unmount();
    instance.cleanup();
  }
  instances.length = 0;
};

/**
 * Let pending microtasks and one timer tick drain.
 *
 * `readdir` resolves on a later tick, and Ink batches renders behind a frame
 * timer. Without this the first assertion runs against an empty frame and
 * passes for the wrong reason — CLAUDE.md §5, "the async settle is real".
 */
export const settle = async (ms = 50): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Terminal escape sequences, named so tests read as intent, not as bytes.
 *
 * Built with String.fromCharCode rather than written literally: a raw 0x1b in
 * source is invisible in a diff and silently mangled by editors and tooling.
 */
const ESC = String.fromCharCode(0x1b);

export const KEY = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  right: `${ESC}[C`,
  left: `${ESC}[D`,
  enter: String.fromCharCode(0x0d),
  escape: ESC,
} as const;
