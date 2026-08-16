/**
 * Cross-cutting primitives with no better home.
 *
 * Deliberately tiny, and deliberately capped. A file called `util` is a magnet
 * for anything that resists naming, and the usual result is a grab-bag that
 * everything imports and nothing understands. The rule for adding here:
 *
 *   1. it is used by **at least two** modules in **different** directories, and
 *   2. it has no domain of its own — it is not really about files, or terminals,
 *      or state.
 *
 * Anything that fails (2) belongs in a named module instead: text safety lives
 * in `sanitize.ts`, errno translation in `errors.ts`, byte sizes in `format.ts`.
 * If this file grows past a handful of functions, that is the signal to split
 * it, not to keep adding.
 */

/**
 * Constrain a number to an inclusive range.
 *
 * Replaces 16 hand-rolled `Math.min(Math.max(…))` expressions found in the
 * Stage 3 audit. Those were individually obvious and collectively a place for
 * an argument-order mistake to hide — `Math.max(x, lo)` and `Math.min(x, hi)`
 * look identical at a glance and swap silently.
 *
 * `low` wins if the range is inverted, so a viewport with `height < 0` degrades
 * to a fixed value rather than returning something nonsensical.
 */
export const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(value, high));

/**
 * `1 item` / `3 items`.
 *
 * English-only and knowingly so: the plural is formed by appending `s`, which
 * is wrong for most of the world's languages and for many English nouns. It is
 * correct for the two words this app pluralises ("item", "match"→ not used),
 * and a full `Intl.PluralRules` treatment would be a dependency-free but
 * substantial detour for two call sites. Revisit if the app is ever localised.
 */
export const pluralise = (count: number, singular: string, plural = `${singular}s`): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

/**
 * Type guard for `Array.prototype.filter` that removes `null` and `undefined`
 * *and narrows the element type*.
 *
 * `list.filter(Boolean)` does not narrow — TypeScript still types the result as
 * possibly-nullable, and it also drops `0` and `''`, which is a real bug when
 * filtering numbers or strings. This drops only the two nullish values.
 */
export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;
