import process from 'node:process';
import type { TextProps } from 'ink';

/**
 * Semantic tokens, not colours at call sites. A component asks for
 * `theme.directory`, never for `color="cyan"` — so the palette can change in
 * one place and so NO_COLOR can empty every token at once.
 */
export type Style = Pick<
  TextProps,
  'color' | 'backgroundColor' | 'bold' | 'dimColor' | 'inverse' | 'italic' | 'underline'
>;

/**
 * NO_COLOR is honoured by emptying every token, not just the colours.
 *
 * `bold`, `dimColor` and `inverse` are SGR sequences too, and the Stage 2 DoD
 * requires a frame with ZERO SGR under NO_COLOR. Chalk also drops to level 0 on
 * its own, so this is belt-and-braces — but it makes the intent readable, and
 * it means the guarantee does not depend on a transitive dependency's
 * environment handling.
 *
 * https://no-color.org — any non-empty value means "disable".
 */
const noColor = (process.env['NO_COLOR'] ?? '') !== '';

const style = (styles: Style): Style => (noColor ? {} : styles);

export const theme = {
  /** The selected row. Also marked with a glyph, so selection survives NO_COLOR. */
  selected: style({ inverse: true }),
  directory: style({ color: 'cyan', bold: true }),
  symlink: style({ color: 'magenta' }),
  file: style({}),
  size: style({ dimColor: true }),
  header: style({ bold: true }),
  accent: style({ color: 'yellow' }),
  error: style({ color: 'red', bold: true }),
  muted: style({ dimColor: true }),
} as const satisfies Record<string, Style>;

export const isColorEnabled = !noColor;
