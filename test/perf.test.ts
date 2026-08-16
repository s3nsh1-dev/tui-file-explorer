import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDirectory } from '../src/core/fs.js';
import { sortEntries } from '../src/core/sort.js';
import { initialState, reducer } from '../src/state/reducer.js';
import { nextOffset, windowSlice } from '../src/state/selectors.js';

/**
 * Adversary A4 — the 40 000-entry directory.
 *
 * Stage 2 proved the RENDER is bounded (only viewport rows are ever mapped) but
 * never measured the LOAD, which stats every entry. These budgets are
 * deliberately loose: the point is to catch an order-of-magnitude regression,
 * not to police normal variance on a shared machine. A test that fails when the
 * CI box is busy teaches people to ignore it.
 */

const ENTRY_COUNT = 40_000;
/** Generous. Real measurement on this machine is recorded in stage3.md §8. */
const LOAD_BUDGET_MS = 30_000;
const SORT_BUDGET_MS = 2_000;
const WINDOW_BUDGET_MS = 50;

const makeHugeDirectory = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'glim-huge-'));
  // Batched: 40k unbounded writeFile calls is EMFILE before the test even runs.
  const BATCH = 500;
  for (let start = 0; start < ENTRY_COUNT; start += BATCH) {
    await Promise.all(
      Array.from({ length: Math.min(BATCH, ENTRY_COUNT - start) }, (_, offset) =>
        writeFile(path.join(dir, `entry-${String(start + offset).padStart(6, '0')}.txt`), 'x'),
      ),
    );
  }
  return dir;
};

describe('40,000 entries', () => {
  // Vitest 4 removed the it(name, fn, options) form; options are the SECOND arg.
  it('loads, sorts and windows within budget', { timeout: 180_000 }, async () => {
    const dir = await makeHugeDirectory();

    try {
      const loadStart = performance.now();
      const entries = await readDirectory(dir);
      const loadMs = performance.now() - loadStart;

      expect(entries).toHaveLength(ENTRY_COUNT);
      expect(loadMs).toBeLessThan(LOAD_BUDGET_MS);

      const sortStart = performance.now();
      const sorted = sortEntries(entries, 'name');
      const sortMs = performance.now() - sortStart;
      expect(sortMs).toBeLessThan(SORT_BUDGET_MS);

      // The part that runs on EVERY keypress must stay trivial regardless of
      // directory size — this is the whole point of windowing.
      const windowStart = performance.now();
      for (let cursor = 0; cursor < 500; cursor += 1) {
        const offset = nextOffset(cursor, cursor, 20, sorted.length, 2);
        windowSlice(sorted, offset, 20);
      }
      const windowMs = performance.now() - windowStart;
      expect(windowMs).toBeLessThan(WINDOW_BUDGET_MS);

      // Recorded so a future run can compare rather than guess.
      expect({
        entries: entries.length,
        loadMs: Math.round(loadMs),
        sortMs: Math.round(sortMs),
        windowMsPer500Moves: Math.round(windowMs),
      }).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('windows a huge list to the viewport, never the whole thing', () => {
    // No filesystem needed: this is the property that makes 40k renderable.
    const entries = Array.from({ length: ENTRY_COUNT }, (_, index) => ({
      name: `f-${String(index)}`,
      isDirectory: false,
      isSymlink: false,
      size: 0,
      mtimeMs: 0,
    }));

    const loaded = reducer(initialState('/huge'), {
      type: 'LOADED',
      requestId: 0,
      entries,
    });

    expect(loaded.visible).toHaveLength(ENTRY_COUNT);
    // …but only 20 ever reach a component.
    expect(windowSlice(loaded.visible, 0, 20)).toHaveLength(20);
  });

  it('keeps a single cursor move O(1) in work, not O(entries)', () => {
    const entries = Array.from({ length: ENTRY_COUNT }, (_, index) => ({
      name: `f-${String(index).padStart(6, '0')}`,
      isDirectory: false,
      isSymlink: false,
      size: 0,
      mtimeMs: 0,
    }));

    let state = reducer(initialState('/huge'), {
      type: 'LOADED',
      requestId: 0,
      entries,
    });

    const start = performance.now();
    for (let press = 0; press < 200; press += 1) {
      state = reducer(state, { type: 'MOVE', delta: 1 });
    }
    const elapsed = performance.now() - start;

    // MOVE does a findIndex (the cost of the name-anchored cursor, ADR-0006)
    // but must NOT re-filter or re-sort — that would make each keypress
    // O(n log n) on 40k entries and the app unusable.
    expect(elapsed).toBeLessThan(SORT_BUDGET_MS);
  });
});
