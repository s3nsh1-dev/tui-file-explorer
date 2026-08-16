import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import { KEY, cleanup, render, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

const markerCount = (frame: string): number => (frame.match(/❯/g) ?? []).length;

describe('cursor', () => {
  it('marks exactly one row, starting on the first entry', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(markerCount(frame)).toBe(1);
    // Directories sort first, and "docs" precedes "src".
    expect(frame).toMatch(/❯\s*docs\//);
  });

  it('moves down with the down arrow', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    stdin.write(KEY.down);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(markerCount(frame)).toBe(1);
    expect(frame).toMatch(/❯\s*src\//);
    expect(frame).not.toMatch(/❯\s*docs\//);
  });

  it('moves with j and k as well as the arrows', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    stdin.write('j');
    await settled();
    expect(stripAnsi(lastFrame() ?? '')).toMatch(/❯\s*src\//);

    stdin.write('k');
    await settled();
    expect(stripAnsi(lastFrame() ?? '')).toMatch(/❯\s*docs\//);
  });

  it('clamps at the top instead of wrapping to the bottom', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const before = lastFrame();
    stdin.write(KEY.up);
    await settled();

    expect(lastFrame()).toBe(before);
  });

  it('clamps at the bottom instead of wrapping to the top', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    // More presses than the fixture has entries.
    for (let i = 0; i < 20; i += 1) {
      stdin.write(KEY.down);
    }
    await settled();

    const atBottom = lastFrame();
    expect(markerCount(atBottom ?? '')).toBe(1);

    stdin.write(KEY.down);
    await settled();

    expect(lastFrame()).toBe(atBottom);
  });
});
