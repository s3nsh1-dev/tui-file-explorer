import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to a committed fixture directory.
 *
 * Resolved from this file rather than from `process.cwd()` so the suite does
 * not depend on where vitest happens to be invoked from.
 */
export const fixture = (name: string): string => path.join(here, '..', 'fixtures', name);
