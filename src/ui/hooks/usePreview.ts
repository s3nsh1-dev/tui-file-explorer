import { useEffect, useState } from 'react';
import { readPreview } from '../../core/preview.js';
import type { PreviewState } from '../../core/types.js';

/**
 * Reads the preview for `target`, discarding results that arrive after a change.
 *
 * The stored value carries the target it belongs to, so "loading" is DERIVED
 * during render — a stored result that belongs to a previous target *is* the
 * loading state. The obvious alternative, `setPreview({kind:'loading'})` at the
 * top of the effect, is a synchronous setState inside an effect: it schedules a
 * second render pass for information already available during the first, and
 * React's hooks lint rejects it as a cascading render.
 *
 * All reading logic lives in `core/preview.ts`; this file is only the React
 * lifecycle around it.
 */
export const usePreview = (target: string | null): PreviewState => {
  const [result, setResult] = useState<{
    readonly target: string | null;
    readonly preview: PreviewState;
  }>({ target: null, preview: { kind: 'idle' } });

  useEffect(() => {
    if (target === null) return;

    let cancelled = false;
    // setResult runs in the async continuation, never synchronously here.
    void readPreview(target).then((preview) => {
      if (!cancelled) setResult({ target, preview });
    });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (target === null) return { kind: 'idle' };
  return result.target === target ? result.preview : { kind: 'loading' };
};
