import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayWidth } from '../src/core/sanitize.js';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import {
  KEY,
  cleanup,
  countSgr,
  render,
  settle,
  settleStable,
  stripAnsi,
} from './helpers/render.js';

afterEach(cleanup);

/**
 * Golden frames — L2 evidence (AGENTS.md §2).
 *
 * Committed as plain text with ANSI stripped, because a snapshot full of SGR
 * codes cannot be reviewed in a diff, and reviewing every change by hand is the
 * entire point. NEVER bulk-accept with `-u`.
 *
 * Terminal size is pinned in every case. An unpinned snapshot differs per
 * machine and becomes noise everyone learns to ignore.
 */
const snapshot = async (name: string, frame: string | undefined): Promise<void> => {
  await expect(stripAnsi(frame ?? '')).toMatchFileSnapshot(`__snapshots__/${name}.txt`);
};

describe('golden frames', () => {
  it('two panes at 100x20', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settleStable(lastFrame);
    await snapshot('two-pane-100x20', lastFrame());
  });

  it('single pane at 50x20 — preview dropped', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { columns: 50, rows: 20 });
    await settleStable(lastFrame);
    await snapshot('narrow-50x20', lastFrame());
  });

  it('wide terminal at 120x30', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { columns: 120, rows: 30 });
    await settleStable(lastFrame);
    await snapshot('wide-120x30', lastFrame());
  });

  it('filter mode active', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settle();
    stdin.write('/');
    await settle();
    stdin.write('r');
    await settleStable(lastFrame);
    await snapshot('filter-active-100x20', lastFrame());
  });

  it('help overlay', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settle();
    stdin.write('?');
    await settleStable(lastFrame);
    await snapshot('help-100x20', lastFrame());
  });

  it('binary preview', async () => {
    const { lastFrame } = render(<App cwd={fixture('preview')} />, { columns: 100, rows: 20 });
    await settleStable(lastFrame);
    await snapshot('preview-binary-100x20', lastFrame());
  });

  it('hidden files shown', async () => {
    const { lastFrame, stdin } = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settle();
    stdin.write('.');
    await settleStable(lastFrame);
    await snapshot('hidden-shown-100x20', lastFrame());
  });

  it('read-only notice when stdin is not a TTY', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, {
      columns: 100,
      rows: 20,
      stdinIsTTY: false,
    });
    await settleStable(lastFrame);
    await snapshot('no-tty-100x20', lastFrame());
  });

  it('tiny terminal at 20x8 does not throw or overflow', async () => {
    const { lastFrame } = render(<App cwd={fixture('basic')} />, { columns: 20, rows: 8 });
    await settle();

    const frame = stripAnsi(lastFrame() ?? '');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
    await snapshot('tiny-20x8', lastFrame());
  });
});

describe('NO_COLOR', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * Note on what this can and cannot prove. Chalk decides colour support from
   * the real `process.stdout`, which is not a TTY under vitest, so frames in
   * this suite carry no SGR either way — a "colour is emitted by default"
   * assertion here would pass vacuously and prove nothing.
   *
   * The split is therefore: `test/theme.test.ts` proves OUR gate empties every
   * token; the assertion below proves no SGR reaches the frame; and the real
   * binary is checked by hand (recorded in docs/version/stage2.md §8), where
   * FORCE_COLOR=1 yields 32 SGR sequences and NO_COLOR=1 yields 0 — even with
   * FORCE_COLOR also set, which chalk alone would have honoured.
   */
  it('emits ZERO SGR sequences when NO_COLOR is set', async () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.resetModules();

    // Re-import after the env change: theme.ts reads NO_COLOR at module load,
    // and the whole point is that the decision is made once, not per render.
    const { App: FreshApp } = await import('../src/app.js');
    const { render: freshRender, settle: freshSettle } = await import('./helpers/render.js');

    const { lastFrame } = freshRender(<FreshApp cwd={fixture('basic')} />, {
      columns: 100,
      rows: 20,
    });
    await freshSettle();

    const frame = lastFrame() ?? '';
    expect(countSgr(frame)).toBe(0);
    // Selection must still be visible without colour — that is why the cursor
    // is a glyph and not just an inverse-video row.
    expect(stripAnsi(frame)).toContain('❯');
  });
});

describe('frame stability', () => {
  it('produces a byte-identical frame for the same state reached two ways', async () => {
    const first = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settle();
    const direct = first.lastFrame();
    first.unmount();

    const second = render(<App cwd={fixture('basic')} />, { columns: 100, rows: 20 });
    await settle();
    second.stdin.write(KEY.down);
    await settle();
    second.stdin.write(KEY.up);
    await settle();

    expect(second.lastFrame()).toBe(direct);
  });
});

/**
 * Every rendered row must be exactly the terminal width in CELLS, not in
 * `String.length`. This catches the whole class of layout bug that produces a
 * ragged right edge — including the one found by eye at S2-05, where text
 * budgets were measured against the outer width instead of the inner one.
 */
describe('column alignment', () => {
  const sizes = [
    { columns: 20, rows: 8 },
    { columns: 50, rows: 20 },
    { columns: 100, rows: 20 },
    { columns: 120, rows: 30 },
  ] as const;

  for (const size of sizes) {
    it(`every row is exactly ${String(size.columns)} cells at ${String(size.columns)}x${String(size.rows)}`, async () => {
      const { lastFrame } = render(<App cwd={fixture('basic')} />, size);
      await settleStable(lastFrame);

      const lines = stripAnsi(lastFrame() ?? '')
        .replace(/\n$/, '')
        .split('\n');

      expect(lines.length).toBeGreaterThan(0);
      for (const [index, line] of lines.entries()) {
        expect(displayWidth(line), `row ${String(index)}: ${JSON.stringify(line)}`).toBe(
          size.columns,
        );
      }
    });
  }

  it('stays aligned when a filename contains wide characters', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'glim-wide-'));
    try {
      await writeFile(path.join(dir, '日本語のファイル.txt'), 'x');
      await writeFile(path.join(dir, 'emoji-🎉-file.txt'), 'xx');
      await writeFile(path.join(dir, 'plain.txt'), 'xxx');

      const { lastFrame } = render(<App cwd={dir} />, { columns: 60, rows: 12 });
      await settle(150);

      for (const line of stripAnsi(lastFrame() ?? '')
        .replace(/\n$/, '')
        .split('\n')) {
        expect(displayWidth(line), JSON.stringify(line)).toBe(60);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
