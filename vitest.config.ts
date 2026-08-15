import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    // Explicit imports from 'vitest' — no implicit globals. Matches the
    // pattern in CLAUDE.md §5.
    globals: false,
    // Ink renders on a timer (maxFps). A test that hangs on a frame that
    // never arrives should fail, not stall the suite.
    testTimeout: 10_000,
  },
  // No `esbuild:` block. Vitest 4 transforms with oxc, which ignores esbuild
  // options and warns when both are set. oxc picks up `jsx: react-jsx` from
  // tsconfig.json, so JSX needs no configuration here.
});
