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

  // Mutable, not readonly: Ink's useWindowSize reads these on every 'resize'
  // event, so simulating a terminal resize means changing them and emitting.
  constructor(
    public columns: number,
    public rows: number,
  ) {
    super();
  }

  /** Simulate the user dragging the terminal edge. */
  readonly resize = (columns: number, rows: number): void => {
    this.columns = columns;
    this.rows = rows;
    this.emit('resize');
  };

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
  /**
   * Wait until this instance's frame stops changing.
   *
   * Preferred over `settle(ms)` before any assertion: a fixed delay is a race
   * with the machine, and the loser is a test that fails on a busy day for a
   * reason unrelated to the code.
   */
  readonly settled: () => Promise<void>;
  /** Change the terminal size and fire Ink's resize handling. */
  readonly resize: (columns: number, rows: number) => void;
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
    settled: async () => settleStable(stdout.lastFrame),
    resize: stdout.resize,
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
 * Wait until the frame stops changing, instead of guessing a duration.
 *
 * A fixed `settle(50)` is a race with the machine: the preview read, the
 * directory read and Ink's frame timer all have to land inside it, and on a
 * loaded CI box or a 16-file suite they sometimes do not. The symptom is a
 * golden frame that occasionally captures `loading…` — a flaky snapshot, which
 * is worse than a failing one because it teaches everyone to re-run the suite.
 *
 * Polls until two consecutive reads are identical, then returns. Bounded, so a
 * genuinely never-settling app fails the test instead of hanging the suite.
 */
export const settleStable = async (
  lastFrame: () => string | undefined,
  {
    interval = 15,
    timeout = 5000,
    allowLoading = false,
  }: { interval?: number; timeout?: number; allowLoading?: boolean } = {},
): Promise<void> => {
  const deadline = Date.now() + timeout;
  let previous: string | undefined;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const current = lastFrame();

    // Stability ALONE is not enough. The directory read and the preview read
    // are separate async chains, and the app is briefly idle between them —
    // two identical frames can be captured in that gap, with the preview pane
    // still showing `loading…`. Requiring the loading indicator to be gone
    // closes it. Found by a flake in "shows a preview pane beside the listing",
    // which passed 4 runs in 5.
    const stillLoading = !allowLoading && (current?.includes('loading…') ?? false);

    if (current !== undefined && current === previous && !stillLoading) return;
    previous = current;
  }

  throw new Error(`frame never stabilised within ${String(timeout)}ms`);
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

/**
 * Remove ANSI escape sequences so a frame is human-diffable.
 *
 * Golden frames are committed as plain text: a snapshot full of SGR codes is
 * unreviewable, and reviewing every snapshot change by hand is the whole point
 * (CLAUDE.md §5 — never bulk-accept `-u`). Colour is asserted separately by
 * counting SGR sequences, which is a different question from layout.
 *
 * The pattern is built with fromCharCode so no literal ESC byte lands in source.
 */
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;?]*[A-Za-z]`, 'g');

export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, '');

/** How many SGR (colour/style) sequences a frame contains. */
export const countSgr = (text: string): number =>
  (text.match(new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g')) ?? []).length;
