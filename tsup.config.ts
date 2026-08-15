import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  outDir: 'dist',
  format: ['esm'],
  // ADR-0003: Node 22 is the floor. Matching the target to `engines` means
  // the bundler will not silently emit syntax the floor cannot parse.
  target: 'node22',
  platform: 'node',
  // The bin entry is executed directly, so it needs a shebang. tsup strips
  // one from source, so it is reattached here rather than written in cli.tsx.
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  sourcemap: true,
  // This is an application, not a library — nobody imports our types.
  dts: false,
  splitting: false,
  minify: false,
});
