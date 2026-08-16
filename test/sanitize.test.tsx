import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app.js';
import { sanitizeName } from '../src/core/sanitize.js';
import { fixture } from './helpers/fixture.js';
import { cleanup, render, stripAnsi } from './helpers/render.js';

afterEach(cleanup);

const ch = (code: number): string => String.fromCharCode(code);

/**
 * ADR-0005: a filename is attacker-controlled input, and the terminal executes
 * every byte printed to it. Each case below is a real attack, not a hypothetical.
 */
describe('sanitizeName', () => {
  it('escapes the RTL override used to spoof file extensions', () => {
    // "invoice<RLO>gpj.txt" displays as "invoicetxt.jpg" in a naive UI.
    expect(sanitizeName(`invoice${ch(0x202e)}gpj.txt`)).toBe('invoice<U+202E>gpj.txt');
  });

  it('escapes ESC so a filename cannot repaint the screen', () => {
    expect(sanitizeName(`${ch(0x1b)}[2Jgotcha`)).toBe('<U+001B>[2Jgotcha');
  });

  it('escapes carriage return, which would overwrite the row to its left', () => {
    expect(sanitizeName(`real${ch(0x0d)}fake`)).toBe('real<U+000D>fake');
  });

  it('escapes C1 controls, which are CSI equivalents on some terminals', () => {
    expect(sanitizeName(`a${ch(0x9b)}b`)).toBe('a<U+009B>b');
  });

  it('escapes zero-width characters that make two files look identical', () => {
    expect(sanitizeName(`ab${ch(0x200b)}c`)).toBe('ab<U+200B>c');
  });

  it('escapes the BOM', () => {
    expect(sanitizeName(`a${ch(0xfeff)}b`)).toBe('a<U+FEFF>b');
  });

  it('leaves ordinary names byte-identical', () => {
    expect(sanitizeName('README.md')).toBe('README.md');
    expect(sanitizeName('file with space.txt')).toBe('file with space.txt');
    expect(sanitizeName('.hidden-file')).toBe('.hidden-file');
  });

  it('leaves legitimate non-ASCII alone — this is not an ASCII filter', () => {
    expect(sanitizeName('café.txt')).toBe('café.txt');
    expect(sanitizeName('日本語.md')).toBe('日本語.md');
    expect(sanitizeName('emoji-🎉.png')).toBe('emoji-🎉.png');
  });
});

describe('the listing never emits raw hostile bytes', () => {
  it('renders the RTL-override fixture escaped', async () => {
    const { lastFrame, settled } = render(<App cwd={fixture('basic')} />);
    await settled();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).not.toContain(ch(0x202e));
    expect(frame).toContain('invoice<U+202E>gpj.txt');
  });
});
