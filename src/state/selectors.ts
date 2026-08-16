/**
 * Viewport windowing. There is no DOM and no `overflow: hidden` — every row
 * handed to Ink is a terminal write, so a 40,000-entry directory must be sliced
 * to viewport height *before* mapping, not after.
 *
 * Both functions are pure and live outside the component so the awkward cases
 * (4-row terminal, empty list) can be tested without rendering anything.
 */

/**
 * Where the viewport should start, given where it started last time.
 *
 * Takes the previous offset rather than deriving one from scratch, because a
 * stateless policy has to pin the cursor to a fixed screen row — which means
 * the list scrolls on every keypress and the cursor never appears to move.
 * This adjusts minimally instead: scroll only when the cursor would cross a
 * margin, and only far enough to put it back.
 *
 * **Idempotent by construction.** After one application the cursor is inside
 * the margins, so a second application with the same inputs changes nothing.
 * That matters because the offset is derived during render, and React may
 * render twice.
 */
export const nextOffset = (
  previous: number,
  cursor: number,
  height: number,
  total: number,
  margin: number,
): number => {
  if (height <= 0 || total <= 0 || cursor < 0) return 0;

  const maxOffset = Math.max(0, total - height);
  // A margin of 2 is meaningless in a 3-row viewport: the cursor would be
  // inside both margins at once and the window would oscillate. Shrink it to
  // whatever the viewport can actually afford. (Stage 3 adversary A5.)
  const effective = Math.min(margin, Math.max(0, Math.floor((height - 1) / 2)));

  let offset = previous;
  if (cursor - effective < offset) {
    offset = cursor - effective;
  }
  if (cursor + effective > offset + height - 1) {
    offset = cursor - height + 1 + effective;
  }

  return Math.min(Math.max(offset, 0), maxOffset);
};

/** The rows actually rendered. Slice before mapping — that is the whole point. */
export const windowSlice = <T>(
  items: readonly T[],
  offset: number,
  height: number,
): readonly T[] => (height <= 0 ? [] : items.slice(offset, offset + height));
