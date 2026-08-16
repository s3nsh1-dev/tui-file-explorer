import { sanitizeName } from './sanitize.js';

/**
 * Narrow an unknown thrown value to its errno code without asserting.
 * AGENTS.md §7 bans `any`; a caught value is genuinely `unknown`.
 */
export const errnoOf = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

/**
 * Turn a filesystem errno into one sanitized line a user can act on.
 *
 * Shared by startup validation, the directory load, and the preview reader, so
 * the same errno cannot be described three different ways. It lives in `core/`
 * rather than `app.tsx` because `usePreview` needs it too, and importing it
 * from `app.tsx` would make the module graph circular.
 *
 * The path is sanitized: an error message is a render path, and ADR-0005 makes
 * no exception for it.
 */
export const describeFsError = (error: unknown, target: string): string => {
  const shown = sanitizeName(target);
  switch (errnoOf(error)) {
    case 'ENOENT':
      return `no such directory: ${shown}`;
    case 'ENOTDIR':
      return `not a directory: ${shown}`;
    case 'EACCES':
    case 'EPERM':
      return `permission denied: ${shown}`;
    case 'ELOOP':
      return `too many symbolic links: ${shown}`;
    case 'EMFILE':
    case 'ENFILE':
      return `too many open files: ${shown}`;
    case 'ENAMETOOLONG':
      return `name too long: ${shown}`;
    default:
      return `cannot read: ${shown}`;
  }
};
