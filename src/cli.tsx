import process from 'node:process';
import { render } from 'ink';
import meow from 'meow';
import { App, resolveTarget, sanitizeName } from './app.js';

const HELP = `
  Usage
    $ glim [path]

  Keys
    ↑ ↓  k j     move the cursor
    ⏎ →  l       open the highlighted directory
    ←    h       go to the parent directory
    q            quit

  Examples
    $ glim
    $ glim ~/projects
`;

/**
 * Exit codes. 2 for a bad invocation matches the shell convention for usage
 * errors; 130/143 are the standard 128+signal values, so `echo $?` after
 * Ctrl-C reads the way a user expects.
 */
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const EXIT_SIGINT = 130;
const EXIT_SIGTERM = 143;

const cli = meow(HELP, {
  importMeta: import.meta,
  flags: {},
});

// Validate BEFORE Ink mounts. Failing after mount would mean printing an error
// over a terminal already switched into raw mode and the alternate screen.
const target = await resolveTarget(cli.input.at(0) ?? process.cwd());

if (target.ok) {
  const instance = render(<App cwd={target.path} />);

  // AGENTS.md §8: a crash must not leave the terminal without a cursor or
  // stuck in raw mode. unmount() is what restores it, so every exit path runs it.
  const restoreAndExit = (code: number): void => {
    instance.unmount();
    process.exitCode = code;
  };

  // In raw mode Ctrl-C arrives as a byte and Ink handles it (exitOnCtrlC).
  // These cover the other route: an actual signal from kill(1) or a parent.
  process.once('SIGINT', () => {
    restoreAndExit(EXIT_SIGINT);
  });
  process.once('SIGTERM', () => {
    restoreAndExit(EXIT_SIGTERM);
  });

  process.once('uncaughtException', (error: Error) => {
    // Restore the terminal first — a user staring at a dead screen cannot read
    // the message anyway. Then report, sanitized: the message may embed a path.
    instance.unmount();
    process.stderr.write(`glim: ${sanitizeName(error.message)}\n`);
    process.exit(EXIT_FAILURE);
  });

  await instance.waitUntilExit();
} else {
  // stderr, not stdout: stdout is the canvas, and `glim bad-path > out` should
  // leave `out` empty rather than containing an error.
  process.stderr.write(`glim: ${target.message}\n`);
  process.exitCode = EXIT_USAGE;
}
