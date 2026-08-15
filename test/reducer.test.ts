import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/state/reducer.js';
import { cursorIndex, initialState, reducer, selectedEntry } from '../src/state/reducer.js';

const entry = (name: string, over: Partial<Entry> = {}): Entry => ({
  name,
  isDirectory: false,
  isSymlink: false,
  size: 0,
  mtimeMs: 0,
  ...over,
});

const SAMPLE: readonly Entry[] = [
  entry('src', { isDirectory: true, mtimeMs: 300 }),
  entry('docs', { isDirectory: true, mtimeMs: 100 }),
  entry('README.md', { size: 3100, mtimeMs: 500 }),
  entry('.hidden', { size: 10, mtimeMs: 400 }),
  entry('a.txt', { size: 20_000, mtimeMs: 200 }),
];

const loaded = (entries: readonly Entry[] = SAMPLE) =>
  reducer(initialState('/tmp'), { type: 'LOADED', dir: '/tmp', entries });

describe('loading', () => {
  it('starts empty and loading', () => {
    const state = initialState('/tmp');
    expect(state.status).toBe('loading');
    expect(state.visible).toHaveLength(0);
  });

  it('sorts directories first, then by name, hiding dotfiles by default', () => {
    const state = loaded();
    expect(state.status).toBe('ready');
    expect(state.visible.map((e) => e.name)).toEqual(['docs', 'src', 'a.txt', 'README.md']);
  });

  it('puts the cursor on the first entry', () => {
    expect(selectedEntry(loaded())?.name).toBe('docs');
    expect(cursorIndex(loaded())).toBe(0);
  });

  it('ignores a result for a directory we already navigated away from', () => {
    const state = reducer(loaded(), { type: 'NAVIGATE', dir: '/other' });
    const stale = reducer(state, { type: 'LOADED', dir: '/tmp', entries: SAMPLE });
    expect(stale.status).toBe('loading');
    expect(stale.visible).toHaveLength(0);
  });

  it('records a failure without losing the directory', () => {
    const state = reducer(loaded(), { type: 'FAILED', dir: '/tmp', message: 'permission denied' });
    expect(state.status).toBe('error');
    expect(state.error).toBe('permission denied');
    expect(state.visible).toHaveLength(0);
  });
});

describe('cursor', () => {
  it('moves and clamps at both ends without wrapping', () => {
    let state = loaded();
    state = reducer(state, { type: 'MOVE', delta: -1 });
    expect(cursorIndex(state)).toBe(0);

    state = reducer(state, { type: 'MOVE', delta: 1 });
    expect(cursorIndex(state)).toBe(1);

    state = reducer(state, { type: 'MOVE', delta: 999 });
    expect(cursorIndex(state)).toBe(state.visible.length - 1);

    state = reducer(state, { type: 'MOVE', delta: 1 });
    expect(cursorIndex(state)).toBe(state.visible.length - 1);
  });

  it('jumps to start and end', () => {
    let state = reducer(loaded(), { type: 'MOVE_TO', position: 'end' });
    expect(cursorIndex(state)).toBe(state.visible.length - 1);
    state = reducer(state, { type: 'MOVE_TO', position: 'start' });
    expect(cursorIndex(state)).toBe(0);
  });

  it('reports index -1 and no selection for an empty listing', () => {
    const state = reducer(initialState('/tmp'), { type: 'LOADED', dir: '/tmp', entries: [] });
    expect(cursorIndex(state)).toBe(-1);
    expect(selectedEntry(state)).toBeUndefined();
  });
});

/**
 * ADR-0006's whole reason for existing. An index-anchored cursor points at a
 * different file after every sort or filter change; a name-anchored one keeps
 * the user looking at what they were looking at.
 */
describe('name-anchored cursor', () => {
  it('stays on the same file across a sort change', () => {
    let state = reducer(loaded(), { type: 'MOVE', delta: 3 });
    const before = selectedEntry(state)?.name;
    expect(before).toBe('README.md');

    state = reducer(state, { type: 'CYCLE_SORT' });
    expect(selectedEntry(state)?.name).toBe(before);
  });

  it('stays on the same file when hidden files are revealed', () => {
    let state = reducer(loaded(), { type: 'MOVE', delta: 2 });
    expect(selectedEntry(state)?.name).toBe('a.txt');

    state = reducer(state, { type: 'TOGGLE_HIDDEN' });
    expect(selectedEntry(state)?.name).toBe('a.txt');
    expect(state.visible.map((e) => e.name)).toContain('.hidden');
  });

  it('falls back to a valid neighbour when the selected file is filtered away', () => {
    let state = reducer(loaded(), { type: 'MOVE', delta: 3 });
    expect(selectedEntry(state)?.name).toBe('README.md');

    state = reducer(state, { type: 'FILTER_INPUT', value: 'doc' });
    expect(state.visible.map((e) => e.name)).toEqual(['docs']);
    // Cursor must land somewhere valid, never past the end.
    expect(cursorIndex(state)).toBe(0);
    expect(selectedEntry(state)?.name).toBe('docs');
  });

  it('never reports an index past the end of the visible list', () => {
    let state = reducer(loaded(), { type: 'MOVE_TO', position: 'end' });
    state = reducer(state, { type: 'FILTER_INPUT', value: 'zzz-nothing-matches' });
    expect(state.visible).toHaveLength(0);
    expect(cursorIndex(state)).toBe(-1);
  });
});

describe('sorting', () => {
  it('cycles name → size → mtime → ext → name', () => {
    let state = loaded();
    expect(state.sortKey).toBe('name');
    state = reducer(state, { type: 'CYCLE_SORT' });
    expect(state.sortKey).toBe('size');
    state = reducer(state, { type: 'CYCLE_SORT' });
    expect(state.sortKey).toBe('mtime');
    state = reducer(state, { type: 'CYCLE_SORT' });
    expect(state.sortKey).toBe('ext');
    state = reducer(state, { type: 'CYCLE_SORT' });
    expect(state.sortKey).toBe('name');
  });

  it('keeps directories first under every sort key', () => {
    let state = loaded();
    for (const _ of [0, 1, 2, 3]) {
      state = reducer(state, { type: 'CYCLE_SORT' });
      const names = state.visible.map((e) => e.name);
      expect(names.slice(0, 2).sort()).toEqual(['docs', 'src']);
    }
  });

  it('sorts by size, largest first, and reverses', () => {
    let state = reducer(loaded(), { type: 'CYCLE_SORT' });
    expect(state.visible.filter((e) => !e.isDirectory).map((e) => e.name)).toEqual([
      'a.txt',
      'README.md',
    ]);

    state = reducer(state, { type: 'REVERSE_SORT' });
    expect(state.visible.filter((e) => !e.isDirectory).map((e) => e.name)).toEqual([
      'README.md',
      'a.txt',
    ]);
  });

  it('keeps directories first even when reversed', () => {
    const state = reducer(loaded(), { type: 'REVERSE_SORT' });
    expect(state.visible[0]?.isDirectory).toBe(true);
  });
});

describe('filter mode', () => {
  it('is case-insensitive and matches substrings', () => {
    const state = reducer(loaded(), { type: 'FILTER_INPUT', value: 'readme' });
    expect(state.visible.map((e) => e.name)).toEqual(['README.md']);
  });

  it('restores both the list and the previous selection on cancel', () => {
    let state = reducer(loaded(), { type: 'MOVE', delta: 3 });
    expect(selectedEntry(state)?.name).toBe('README.md');

    state = reducer(state, { type: 'SET_MODE', mode: 'filter' });
    state = reducer(state, { type: 'FILTER_INPUT', value: 'doc' });
    expect(state.visible).toHaveLength(1);

    state = reducer(state, { type: 'FILTER_CANCEL' });
    expect(state.mode).toBe('normal');
    expect(state.filter).toBe('');
    expect(state.visible).toHaveLength(4);
    expect(selectedEntry(state)?.name).toBe('README.md');
  });

  it('keeps the filter and returns to normal mode on commit', () => {
    let state = reducer(loaded(), { type: 'SET_MODE', mode: 'filter' });
    state = reducer(state, { type: 'FILTER_INPUT', value: 'doc' });
    state = reducer(state, { type: 'FILTER_COMMIT' });

    expect(state.mode).toBe('normal');
    expect(state.filter).toBe('doc');
    expect(state.visible).toHaveLength(1);
  });

  it('clears the filter when navigating to a new directory', () => {
    let state = reducer(loaded(), { type: 'FILTER_INPUT', value: 'doc' });
    state = reducer(state, { type: 'NAVIGATE', dir: '/tmp/docs' });
    expect(state.filter).toBe('');
    expect(state.dir).toBe('/tmp/docs');
  });
});

describe('preferences survive navigation', () => {
  it('keeps sort key and hidden-file visibility across directories', () => {
    let state = reducer(loaded(), { type: 'CYCLE_SORT' });
    state = reducer(state, { type: 'TOGGLE_HIDDEN' });

    state = reducer(state, { type: 'NAVIGATE', dir: '/tmp/docs' });
    expect(state.sortKey).toBe('size');
    expect(state.showHidden).toBe(true);
  });
});
