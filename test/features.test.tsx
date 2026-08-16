import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { fixture } from './helpers/fixture.js';
import { KEY, cleanup, render, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

const frameOf = (lastFrame: () => string | undefined): string => stripAnsi(lastFrame() ?? '');

const WIDE = { columns: 100, rows: 20 } as const;
const NARROW = { columns: 50, rows: 20 } as const;

describe('two-pane layout', () => {
  it('shows a preview pane beside the listing on a wide terminal', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('README.md');
    // Cursor starts on docs/, so the preview shows that directory's contents.
    expect(frame).toContain('guide.md');
    // The pane divider.
    expect(frame).toMatch(/│/);
  });

  it('drops the preview pane rather than crushing it on a narrow terminal', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />, NARROW);
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('README.md');
    expect(frame).not.toContain('guide.md');
  });

  it('never lets a row exceed the terminal width', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />, NARROW);
    await settled();

    for (const line of frameOf(lastFrame).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(NARROW.columns);
    }
  });
});

describe('hidden files', () => {
  it('hides dotfiles by default and reveals them on "."', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();
    expect(frameOf(lastFrame)).not.toContain('.hidden-file');

    stdin.write('.');
    await settled();
    expect(frameOf(lastFrame)).toContain('.hidden-file');

    stdin.write('.');
    await settled();
    expect(frameOf(lastFrame)).not.toContain('.hidden-file');
  });
});

describe('sorting', () => {
  it('reports the active sort key in the status bar and cycles it', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();
    expect(frameOf(lastFrame)).toContain('sort name');

    stdin.write('s');
    await settled();
    expect(frameOf(lastFrame)).toContain('sort size');

    stdin.write('s');
    await settled();
    expect(frameOf(lastFrame)).toContain('sort mtime');
  });

  it('keeps the selection on the same file across a sort change', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write(KEY.down);
    stdin.write(KEY.down);
    await settled();
    const selectedBefore = /❯ (\S+)/.exec(frameOf(lastFrame))?.[1];
    expect(selectedBefore).toBeDefined();

    stdin.write('s');
    await settled();
    expect(/❯ (\S+)/.exec(frameOf(lastFrame))?.[1]).toBe(selectedBefore);
  });
});

describe('filter mode', () => {
  it('narrows the listing as you type and shows the query', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write('/');
    await settled();
    stdin.write('r');
    await settled();
    stdin.write('e');
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('README.md');
    expect(frame).not.toContain('package.json');
    expect(frame).toContain('/re');
  });

  it('restores the full listing and the previous selection on escape', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write(KEY.down);
    await settled();
    const before = frameOf(lastFrame);

    stdin.write('/');
    await settled();
    stdin.write('r');
    await settled();
    expect(frameOf(lastFrame)).not.toContain('package.json');

    stdin.write(KEY.escape);
    await settled();
    expect(frameOf(lastFrame)).toBe(before);
  });

  it('keeps the filter after enter and reports it in the status bar', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write('/');
    await settled();
    stdin.write('r');
    await settled();
    stdin.write(KEY.enter);
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('filter "r"');
    expect(frame).toContain('↑↓ move');
  });

  it('says so when nothing matches instead of rendering a blank pane', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write('/');
    await settled();
    for (const character of 'zzzz') {
      stdin.write(character);
      await settled();
    }
    await settled();

    expect(frameOf(lastFrame)).toContain('no matches');
  });
});

describe('help overlay', () => {
  it('opens on ? and closes on any key', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('basic')} />, WIDE);
    await settled();

    stdin.write('?');
    await settled();
    const help = frameOf(lastFrame);
    expect(help).toContain('Keys');
    expect(help).toContain('read-only');
    expect(help).not.toContain('README.md');

    stdin.write('x');
    await settled();
    expect(frameOf(lastFrame)).toContain('README.md');
  });
});

describe('preview', () => {
  it('shows the first lines of a text file', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('preview')} />, WIDE);
    await settled();

    // Entries sort as: binary.bin, empty.txt, escape.txt, text.txt
    stdin.write('G');
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('line one');
    expect(frame).toContain('line four');
  });

  it('refuses to render a binary file as text', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('preview')} />, WIDE);
    await settled();

    const frame = frameOf(lastFrame);
    expect(frame).toContain('binary file');
    expect(frame).not.toContain('binary payload');
    expect(frame).not.toContain(String.fromCharCode(0));
  });

  it('escapes control sequences found in FILE CONTENT, not just in names', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('preview')} />, WIDE);
    await settled();

    stdin.write(KEY.down);
    stdin.write(KEY.down);
    await settled();

    const raw = lastFrame() ?? '';
    const frame = stripAnsi(raw);
    expect(frame).toContain('harmless first line');
    // The escape sequence is shown as text, and did not survive as a real one.
    expect(frame).toContain('<U+001B>');
    expect(frame).toContain('I cleared your screen');
  });

  it('says a file is empty rather than showing nothing', async () => {
    const { lastFrame, stdin, settled } = render(<App cwd={fixture('preview')} />, WIDE);
    await settled();

    stdin.write(KEY.down);
    await settled();

    expect(frameOf(lastFrame)).toContain('empty file');
  });
});

describe('viewport windowing', () => {
  it('renders at most the viewport height, not the whole directory', async () => {
    const big = await mkdtemp(path.join(tmpdir(), 'glim-big-'));
    try {
      await Promise.all(
        Array.from({ length: 500 }, (_, index) =>
          writeFile(path.join(big, `entry-${String(index).padStart(4, '0')}.txt`), 'x'),
        ),
      );

      const { lastFrame, settled } = render(<App cwd={big} />, { columns: 100, rows: 24 });
      await settled();

      const frame = frameOf(lastFrame);
      const rendered = (frame.match(/entry-\d{4}\.txt/g) ?? []).length;

      // 24 rows minus border(2), header(1), status(2) = 19.
      expect(rendered).toBeGreaterThan(0);
      expect(rendered).toBeLessThanOrEqual(19);
      expect(frame).toContain('500 items');
    } finally {
      await rm(big, { recursive: true, force: true });
    }
  });

  it('scrolls the window once the cursor passes the bottom margin', async () => {
    const big = await mkdtemp(path.join(tmpdir(), 'glim-scroll-'));
    try {
      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          writeFile(path.join(big, `f-${String(index).padStart(3, '0')}.txt`), 'x'),
        ),
      );

      const { lastFrame, stdin, settled } = render(<App cwd={big} />, { columns: 100, rows: 24 });
      await settled();
      expect(frameOf(lastFrame)).toContain('f-000.txt');

      for (let press = 0; press < 40; press += 1) {
        stdin.write(KEY.down);
      }
      await settled();

      const frame = frameOf(lastFrame);
      expect(frame).not.toContain('f-000.txt');
      expect(frame).toContain('f-040.txt');
    } finally {
      await rm(big, { recursive: true, force: true });
    }
  });
});
