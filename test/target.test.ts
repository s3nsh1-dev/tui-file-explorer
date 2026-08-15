import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTarget } from '../src/app.js';
import { fixture } from './helpers/fixture.js';

describe('resolveTarget', () => {
  it('accepts an existing directory and returns an absolute path', async () => {
    const result = await resolveTarget(fixture('basic'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.isAbsolute(result.path)).toBe(true);
      expect(result.path).toBe(fixture('basic'));
    }
  });

  it('resolves a relative path against the process working directory', async () => {
    const result = await resolveTarget('.');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.isAbsolute(result.path)).toBe(true);
    }
  });

  it('rejects a path that does not exist', async () => {
    const result = await resolveTarget('/nonexistent/path/for/glim');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/no such directory/i);
      expect(result.message).toContain('/nonexistent/path/for/glim');
    }
  });

  it('rejects a file with a not-a-directory message', async () => {
    const result = await resolveTarget(path.join(fixture('basic'), 'README.md'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/not a directory/i);
    }
  });

  it('never leaks a stack trace into the message', async () => {
    const result = await resolveTarget('/nonexistent/path/for/glim');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain('    at ');
      expect(result.message).not.toContain('Error:');
      expect(result.message.split('\n')).toHaveLength(1);
    }
  });

  it('sanitizes hostile characters in the path it reports back', async () => {
    const hostile = `/nonexistent/${String.fromCharCode(0x1b)}[2Jgotcha`;
    const result = await resolveTarget(hostile);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // An error message is a render path too — ADR-0005 applies to it.
      expect(result.message).not.toContain(String.fromCharCode(0x1b));
      expect(result.message).toContain('<U+001B>');
    }
  });
});
