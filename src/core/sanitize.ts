/**
 * The ADR-0005 chokepoint: nothing untrusted reaches a `<Text>` without passing
 * through here. Promoted from `src/app.tsx` at S2-06, unchanged in behaviour,
 * with width measurement added — the preview pane and status bar need to know
 * how many *cells* a string occupies, which is not its `.length`.
 *
 * Pure and React-free by construction; the ESLint boundary rule added in S3-03
 * will make that mechanical.
 */

/**
 * Codepoint ranges that must never reach the terminal verbatim.
 * A filename is attacker-controlled input and the terminal executes what it is
 * printed. Numeric ranges rather than a regex literal, so no invisible control
 * byte ends up in this source file.
 */
const DANGEROUS_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], // C0 controls — includes CR (row overwrite) and ESC (CSI/OSC)
  [0x7f, 0x9f], // DEL and the C1 controls, 8-bit CSI on some terminals
  [0x200b, 0x200f], // zero-width space/joiners and LRM/RLM
  [0x202a, 0x202e], // bidi embedding and override — the RLO extension spoof
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];

/** Codepoints that occupy two terminal cells. Approximates East Asian Wide + emoji. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo initial consonants
  [0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols and punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, CJK compatibility
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe6f], // CJK compatibility forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x1f300, 0x1f64f], // emoji: symbols, pictographs, emoticons
  [0x1f680, 0x1f6ff], // emoji: transport and map
  [0x1f900, 0x1f9ff], // emoji: supplemental pictographs
  [0x20000, 0x3fffd], // CJK Extension B and beyond
];

/** Zero-width: combining marks attach to the preceding cell. */
const ZERO_WIDTH_RANGES: readonly (readonly [number, number])[] = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x1ab0, 0x1aff], // combining diacritical marks extended
  [0x20d0, 0x20ff], // combining marks for symbols
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f], // combining half marks
];

const inRanges = (code: number, ranges: readonly (readonly [number, number])[]): boolean =>
  ranges.some(([low, high]) => code >= low && code <= high);

/**
 * Render an untrusted string safely. Escapes to `<U+XXXX>` rather than
 * stripping, because a silently removed character is its own kind of spoof: if
 * two files differ only by an invisible codepoint, stripping makes them render
 * identically, which is precisely the attack.
 *
 * Deliberately NOT an ASCII filter — accented text, CJK and emoji pass through
 * untouched. `for..of` walks whole codepoints, so surrogate pairs never split.
 */
export const sanitizeName = (name: string): string => {
  let result = '';
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    result += inRanges(code, DANGEROUS_RANGES)
      ? `<U+${code.toString(16).toUpperCase().padStart(4, '0')}>`
      : character;
  }
  return result;
};

/** Terminal cells a string occupies. Not `.length` — emoji and CJK are 2 wide. */
export const displayWidth = (text: string): number => {
  let width = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (inRanges(code, ZERO_WIDTH_RANGES)) continue;
    width += inRanges(code, WIDE_RANGES) ? 2 : 1;
  }
  return width;
};

const ELLIPSIS = '…';

/**
 * Cut a string to a cell budget, appending (or prepending) an ellipsis.
 *
 * Accumulates whole codepoints, so it can neither split a surrogate pair nor
 * leave half of a two-cell character on screen — both of which produce a
 * replacement glyph and shift every column after it.
 *
 * `from: 'start'` keeps the tail, which is what a long path wants: the end of
 * `/very/long/path/to/here` is the part that says where you are.
 */
export const truncateToWidth = (
  text: string,
  budget: number,
  from: 'end' | 'start' = 'end',
): string => {
  if (budget <= 0) return '';
  if (displayWidth(text) <= budget) return text;

  const inner = budget - displayWidth(ELLIPSIS);
  // No room for content beside the ellipsis — show the ellipsis alone.
  if (inner <= 0) return ELLIPSIS;

  const characters = Array.from(text);

  if (from === 'end') {
    let width = 0;
    let result = '';
    for (const character of characters) {
      const next = width + displayWidth(character);
      if (next > inner) break;
      result += character;
      width = next;
    }
    return result + ELLIPSIS;
  }

  let width = 0;
  let result = '';
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? '';
    const next = width + displayWidth(character);
    if (next > inner) break;
    result = character + result;
    width = next;
  }
  return ELLIPSIS + result;
};
