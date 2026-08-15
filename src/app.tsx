import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import { useEffect, useState } from 'react';

/**
 * Stage 1 is deliberately one file. See v1_STAGE_1.md §4 — the correct module
 * boundaries are not knowable until Stage 2 shows which pieces vary together,
 * and a boundary guessed now is demolition work in Stage 3.
 */

export type Entry = {
  readonly name: string;
  readonly isDirectory: boolean;
};

export type AppProps = {
  readonly cwd: string;
};

/**
 * Codepoint ranges that must never reach the terminal verbatim (ADR-0005).
 * A filename is attacker-controlled input and the terminal executes what it
 * is printed. Written as numeric ranges rather than a regex literal so no
 * invisible control byte ends up in this source file.
 */
const DANGEROUS_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], // C0 controls — includes CR (row overwrite) and ESC (CSI/OSC)
  [0x7f, 0x9f], // DEL and the C1 controls, which are 8-bit CSI on some terminals
  [0x200b, 0x200f], // zero-width space/joiners and LRM/RLM
  [0x202a, 0x202e], // bidi embedding and override — the RLO extension spoof
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
];

const isDangerous = (code: number): boolean =>
  DANGEROUS_RANGES.some(([low, high]) => code >= low && code <= high);

/**
 * Render an untrusted string safely. Escapes to `<U+XXXX>` rather than
 * stripping, so the user can see that something was there — a silently
 * removed character is its own kind of spoof.
 *
 * Deliberately NOT an ASCII filter: accented text, CJK and emoji are ordinary
 * filenames and pass through untouched. Iterating with for..of walks whole
 * codepoints, so surrogate pairs are never split.
 *
 * Stage 2 promotes this to src/core/sanitize.ts with width-aware truncation
 * (S2-06). The behaviour lives here now because the very first frame that
 * renders a filename is already rendering untrusted input.
 */
export const sanitizeName = (name: string): string => {
  let result = '';
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    result += isDangerous(code)
      ? `<U+${code.toString(16).toUpperCase().padStart(4, '0')}>`
      : character;
  }
  return result;
};

/** Directories first, then case-insensitive by name. Fixed order in Stage 1. */
const compareEntries = (a: Entry, b: Entry): number => {
  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

export type TargetResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message: string };

/**
 * Narrow an unknown thrown value to its errno code without asserting.
 * AGENTS.md §7 bans `any`; a caught value is genuinely `unknown`.
 */
const errnoOf = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

/**
 * Turn a filesystem errno into one sanitized line a user can act on.
 * Shared by startup validation and the in-app load, because the two must not
 * describe the same failure two different ways.
 */
const describeFsError = (error: unknown, target: string): string => {
  const shown = sanitizeName(target);
  switch (errnoOf(error)) {
    case 'ENOENT':
      return `no such directory: ${shown}`;
    case 'ENOTDIR':
      return `not a directory: ${shown}`;
    case 'EACCES':
    case 'EPERM':
      return `permission denied: ${shown}`;
    default:
      return `cannot read: ${shown}`;
  }
};

/**
 * Validate the CLI path argument before Ink mounts.
 *
 * Failing here means the user gets one clean line on stderr and a non-zero
 * exit — not a React error boundary, not a stack trace, and not a half-drawn
 * TUI over a terminal already switched into raw mode.
 *
 * The reported path is sanitized: an error message is a render path too, and
 * ADR-0005 makes no exception for it.
 */
export const resolveTarget = async (input: string): Promise<TargetResult> => {
  const resolved = path.resolve(input);
  const shown = sanitizeName(resolved);

  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, message: `not a directory: ${shown}` };
    }
    return { ok: true, path: resolved };
  } catch (error) {
    return { ok: false, message: describeFsError(error, resolved) };
  }
};

/** `/home/you/projects` → `~/projects`. Cosmetic only; never used for I/O. */
const displayPath = (target: string): string => {
  const home = os.homedir();
  if (target === home) return '~';
  if (target.startsWith(home + path.sep)) return `~${target.slice(home.length)}`;
  return target;
};

export const App = ({ cwd }: AppProps): React.JSX.Element => {
  const { exit } = useApp();
  const stdin = useStdin();

  // Ink types isRawModeSupported as `boolean`, but it is assigned straight
  // from `stdin.isTTY` (App.js:121), and Node sets that to UNDEFINED — never
  // `false` — on a non-TTY stream. Passing it through unchanged gives
  // useInput `{ isActive: undefined }`, which falls back to its default of
  // `true`, calls setRawMode, and throws. Coerce, do not trust the type.
  //
  // Routed through `unknown` deliberately. Boolean() would be flagged as a
  // redundant conversion — correctly, according to Ink's declared type — and
  // that lint error is the type system confidently repeating Ink's mistake.
  // Treating the value as unknown and narrowing states the distrust in code
  // instead of suppressing the rule.
  const rawModeFlag: unknown = stdin.isRawModeSupported;
  const canReadInput = rawModeFlag === true;
  const [dir, setDir] = useState(cwd);
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const dirents = await readdir(dir, { withFileTypes: true });
        if (cancelled) return;

        const loaded = dirents.map((dirent) => ({
          name: dirent.name,
          isDirectory: dirent.isDirectory(),
        }));

        setEntries([...loaded].sort(compareEntries));
        setError(undefined);
      } catch (caught) {
        // AGENTS.md §7: handle or rethrow with context, never swallow. An
        // uncaught rejection here terminates the process and leaves the
        // terminal in raw mode — the worst possible failure for a TUI.
        if (cancelled) return;
        setEntries([]);
        setError(describeFsError(caught, dir));
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [dir]);

  // One input owner for the whole app — AGENTS.md §8. Stacking a second
  // useInput anywhere in the tree makes every keypress fire twice.
  //
  // The { isActive } gate is load-bearing, not defensive: Ink 7's useInput
  // calls setRawMode(true) in an effect (use-input.js:34), and setRawMode
  // THROWS when raw mode is unsupported (App.js handleSetRawMode). Without
  // this gate, piping stdin renders an empty frame instead of the listing.
  useInput(
    (input, key) => {
      if (input === 'q') {
        exit();
        return;
      }

      if (key.downArrow || input === 'j') {
        setCursor((current) => Math.min(current + 1, Math.max(entries.length - 1, 0)));
        return;
      }

      if (key.upArrow || input === 'k') {
        setCursor((current) => Math.max(current - 1, 0));
        return;
      }

      if (key.return || key.rightArrow || input === 'l') {
        const entry = entries[cursor];
        // noUncheckedIndexedAccess makes the undefined case explicit: an empty
        // directory has no entry under the cursor at all.
        if (entry?.isDirectory === true) {
          setDir(path.join(dir, entry.name));
          setCursor(0);
        }
        return;
      }

      if (key.leftArrow || input === 'h') {
        const parent = path.dirname(dir);
        // At the filesystem root, dirname('/') === '/'. Stop rather than loop.
        if (parent !== dir) {
          setDir(parent);
          setCursor(0);
        }
      }
    },
    { isActive: canReadInput },
  );

  return (
    <Box flexDirection="column">
      {/* truncate-start keeps the tail of a long path — the part that says
          where you actually are. Wrapping would reflow the whole listing. */}
      <Text bold wrap="truncate-start">
        glim {sanitizeName(displayPath(dir))}
      </Text>
      {!canReadInput && (
        <Text dimColor>input unavailable — stdin is not a TTY (read-only listing)</Text>
      )}
      {/* Colour is Stage 2 (v1 §3). Plain text still says what went wrong,
          and the keymap stays alive so the user can navigate back out. */}
      {error !== undefined && <Text>! {error}</Text>}
      {entries.map((entry, index) => (
        <Text key={entry.name}>
          {index === cursor ? '❯ ' : '  '}
          {sanitizeName(entry.name)}
          {entry.isDirectory ? '/' : ''}
        </Text>
      ))}
    </Box>
  );
};
