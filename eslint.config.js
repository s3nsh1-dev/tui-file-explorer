import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Named exports of node:fs / node:fs/promises that mutate the filesystem.
 * ADR-0005: glim is read-only by construction. This list is the mechanism —
 * without it, "we don't write to disk" is a promise instead of a property.
 */
const MUTATING_FS = [
  'appendFile',
  'appendFileSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'createWriteStream',
  'ftruncate',
  'ftruncateSync',
  'link',
  'linkSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'rename',
  'renameSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'symlink',
  'symlinkSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'utimes',
  'utimesSync',
  'write',
  'writeFile',
  'writeFileSync',
  'writeSync',
];

const NO_EXEC = 'ADR-0005: glim never executes code. No shell-outs, no VM, no workers.';
const NO_NET = 'ADR-0005: glim makes no network calls. Not telemetry, not update checks.';
const NO_WRITE = 'ADR-0005: glim is read-only by construction. Reads only.';

export default tseslint.config(
  // test/fixtures is data the app reads, not source we own. Some of it is
  // deliberately malformed or hostile (see the U+202E filename).
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test/fixtures/**'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Config files are plain JS and outside the TS project graph.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // ── src/ — the production surface. Everything below is load-bearing. ──
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,

      // AGENTS.md §7 — stdout is the canvas. A console.log anywhere in the
      // tree corrupts the frame Ink is drawing.
      'no-console': 'error',

      // AGENTS.md §7 — zero `any`. Use `unknown` + narrowing.
      '@typescript-eslint/no-explicit-any': 'error',

      // ADR-0005 — the security boundary, enforced rather than intended.
      'no-eval': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'child_process', message: NO_EXEC },
            { name: 'node:child_process', message: NO_EXEC },
            { name: 'node:worker_threads', message: NO_EXEC },
            { name: 'node:vm', message: NO_EXEC },
            { name: 'node:http', message: NO_NET },
            { name: 'node:https', message: NO_NET },
            { name: 'node:net', message: NO_NET },
            { name: 'node:dgram', message: NO_NET },
            { name: 'node:fs', importNames: MUTATING_FS, message: NO_WRITE },
            { name: 'node:fs/promises', importNames: MUTATING_FS, message: NO_WRITE },
          ],
        },
      ],
    },
  },

  // ── src/core/ and src/state/ — the PURE half of the codebase. ──
  //
  // The whole value of the core ⟂ ui split is that this logic can be tested
  // without a renderer: 31 of the tests import no React at all. That property
  // erodes the first time someone adds `import { useState }` to a core module
  // "just for this one thing", and nobody notices until the day the tests need
  // a terminal. This rule makes the erosion fail the build instead.
  {
    files: ['src/core/**/*.ts', 'src/state/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'core/ and state/ are pure. React belongs in src/ui/.',
            },
            {
              name: 'ink',
              message: 'core/ and state/ are pure. Ink belongs in src/ui/.',
            },
          ],
          patterns: [
            {
              group: ['../ui/*', '**/ui/*'],
              message: 'The dependency arrow points ui → core, never the reverse.',
            },
          ],
        },
      ],
    },
  },

  // ── test/ — may mutate the filesystem to build fixtures, and will spawn a
  // PTY in Stage 3. The src/ boundary does not apply to the harness. ──
  {
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
