import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixture.js';

const run = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const BINARY = path.join(here, '..', 'dist', 'cli.js');

/**
 * These drive the BUILT binary, not the components — the only way to observe
 * exit codes, stream separation and non-TTY behaviour, none of which exist
 * inside a component test.
 *
 * Skipped when `dist/` is absent so `pnpm test` alone still works on a fresh
 * clone. CI runs `pnpm build` first, so they always execute there.
 */
const built = existsSync(BINARY);

type Result = { stdout: string; stderr: string; code: number };

const glim = async (args: readonly string[]): Promise<Result> => {
  try {
    const { stdout, stderr } = await run(process.execPath, [BINARY, ...args]);
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', code: failure.code ?? -1 };
  }
};

describe.skipIf(!built)('the built binary', () => {
  describe('non-TTY stdout', () => {
    it('prints a plain listing a pipe can consume, not a box-drawn frame', async () => {
      const { stdout, stderr, code } = await glim([fixture('basic')]);

      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toContain('README.md');
      // No frame, no borders, no padding.
      expect(stdout).not.toContain('╭');
      expect(stdout).not.toContain('│');
      // No alternate-screen switch into a pipe.
      expect(stdout).not.toContain('[?1049');
    });

    it('marks directories and keeps the interactive sort order', async () => {
      const { stdout } = await glim([fixture('basic')]);
      const lines = stdout.trimEnd().split('\n');

      expect(lines.slice(0, 2)).toEqual(['docs/', 'src/']);
      expect(lines).toContain('README.md');
    });

    it('hides dotfiles, matching the interactive default', async () => {
      const { stdout } = await glim([fixture('basic')]);
      expect(stdout).not.toContain('.hidden-file');
    });

    it('sanitizes hostile filenames even when piped', async () => {
      const { stdout } = await glim([fixture('basic')]);

      // stdout is a pipe today; it may be a terminal tomorrow.
      expect(stdout).not.toContain(String.fromCharCode(0x202e));
      expect(stdout).toContain('invoice<U+202E>gpj.txt');
    });
  });

  describe('exit codes and stream separation', () => {
    it('exits 2 with a message on stderr for a missing path', async () => {
      const { stdout, stderr, code } = await glim(['/nonexistent/path/for/glim']);

      expect(code).toBe(2);
      expect(stderr).toMatch(/no such directory/);
      // `glim bad-path > out` must leave `out` empty.
      expect(stdout).toBe('');
    });

    it('exits 2 when the target is a file, not a directory', async () => {
      const { stderr, code } = await glim([path.join(fixture('basic'), 'README.md')]);

      expect(code).toBe(2);
      expect(stderr).toMatch(/not a directory/);
    });

    it('never leaks a stack trace', async () => {
      const { stderr } = await glim(['/nonexistent/path/for/glim']);

      expect(stderr).not.toContain('    at ');
      expect(stderr.trimEnd().split('\n')).toHaveLength(1);
    });

    it('prints help and exits 0', async () => {
      const { stdout, code } = await glim(['--help']);

      expect(code).toBe(0);
      expect(stdout).toContain('Usage');
      expect(stdout).toContain('glim');
    });
  });
});
