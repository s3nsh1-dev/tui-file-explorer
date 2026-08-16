import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import { cleanup, render, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

describe('directory listing', () => {
  it('renders every entry in the target directory', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('README.md');
    expect(frame).toContain('package.json');
    expect(frame).toContain('docs');
    expect(frame).toContain('src');
  });

  it('marks directories with a trailing slash and files without one', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toMatch(/docs\//);
    expect(frame).toMatch(/src\//);
    expect(frame).not.toMatch(/README\.md\//);
  });

  it('sorts directories before files, then by name case-insensitively', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame.indexOf('docs/')).toBeLessThan(frame.indexOf('src/'));
    expect(frame.indexOf('src/')).toBeLessThan(frame.indexOf('README.md'));
  });
});
