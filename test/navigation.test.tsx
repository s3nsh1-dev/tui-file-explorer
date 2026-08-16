import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import { KEY, cleanup, render, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

describe('header', () => {
  it('shows the current directory path', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    expect(stripAnsi(lastFrame() ?? '')).toContain(path.join('fixtures', 'basic'));
  });

  it('abbreviates the home directory to ~', async () => {
    const { lastFrame, settled } = render(<App cwd={os.homedir()} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('~');
    expect(frame).not.toContain(os.homedir());
  });
});

describe('navigation', () => {
  it('descends into the highlighted directory on enter', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();
    // Cursor starts on "docs/", the first entry.

    stdin.write(KEY.enter);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('guide.md');
    expect(frame).not.toContain('package.json');
  });

  it('also descends on right arrow and l', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    stdin.write(KEY.right);
    await settled();
    expect(stripAnsi(lastFrame() ?? '')).toContain('guide.md');
  });

  it('ascends to the parent on left arrow', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    stdin.write(KEY.enter);
    await settled();
    expect(stripAnsi(lastFrame() ?? '')).toContain('guide.md');

    stdin.write(KEY.left);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('package.json');
    expect(frame).toContain('README.md');
  });

  it('resets the cursor to the first entry after descending', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    // Move off the first row, then descend from "src/".
    stdin.write(KEY.down);
    await settled();
    stdin.write(KEY.enter);
    await settled();

    expect(stripAnsi(lastFrame() ?? '')).toMatch(/❯\s*index\.ts/);
  });

  it('does nothing when enter is pressed on a file', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    // Skip past both directories onto the first file.
    stdin.write(KEY.down);
    stdin.write(KEY.down);
    await settled();
    const beforeEnter = lastFrame();

    stdin.write(KEY.enter);
    await settled();

    expect(lastFrame()).toBe(beforeEnter);
  });
});
