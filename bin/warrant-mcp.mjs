#!/usr/bin/env node
/**
 * The single entry point an installed warrant-mcp exposes.
 *
 * This file is plain JavaScript on purpose, and it re-execs rather than
 * importing. A bin script cannot ask for a node flag portably — npm's Windows
 * shim and a POSIX shebang disagree about `env -S` — so the launcher runs under
 * plain node and then spawns the same node binary with whatever the resolved
 * entry point needs. One extra process, identical behaviour on every platform.
 *
 * stdio is inherited, so `warrant-mcp serve` speaks MCP over the parent's own
 * stdin and stdout with nothing in between.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const entry = (relative) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * A published package ships compiled JavaScript in `dist/`, because Node
 * refuses to strip types for anything under `node_modules`
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING) — an installed copy would
 * simply not run. A source checkout has no `dist/`, so it runs the TypeScript
 * directly with the flag, exactly as it always has. The emit is pure type
 * erasure: `erasableSyntaxOnly` is on, so there is no transform to disagree
 * about.
 */
const BUILT = existsSync(fileURLToPath(new URL('../dist/server/main.js', import.meta.url)));
const from = (relative) => entry(BUILT ? `../dist/${relative}.js` : `../src/${relative}.ts`);
const NODE_ARGS = BUILT ? [] : ['--experimental-strip-types'];

/** subcommand → [entry file, ...fixed args prepended to the user's own] */
const COMMANDS = {
  init: [from('cli/init')],
  serve: [from('server/main')],
  hook: [from('hook/pretooluse')],
  review: [from('cli/authoring'), 'review'],
  accept: [from('cli/authoring'), 'accept'],
  test: [from('cli/authoring'), 'test'],
};

const USAGE = `warrant-mcp — a policy firewall for AI agent tool calls

  warrant-mcp init                 create .warrant/ in this project and print the
                                   MCP and hook configuration to paste
  warrant-mcp serve                run the MCP server on stdio (a client spawns this)
  warrant-mcp hook                 the PreToolUse hook entry (a hook config spawns this)

  warrant-mcp review               compile .warrant/policy.md and show what changes
                                   [the only command that calls the model]
  warrant-mcp accept               adopt the reviewed draft as the active policy
  warrant-mcp test "<action>"      dry-run one action against the active policy

  warrant-mcp --version | --help

Docs: https://github.com/rmanish2000-del/warrant-mcp`;

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 6)) {
  process.stderr.write(
    `warrant-mcp needs Node 22.6 or newer (found ${process.versions.node}) — it runs TypeScript directly, with no build step.\n`,
  );
  process.exit(1);
}

const [subcommand, ...rest] = process.argv.slice(2);

if (subcommand === undefined || subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(subcommand === undefined ? 1 : 0);
}

if (subcommand === '--version' || subcommand === '-v') {
  const { version } = JSON.parse(
    await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

const command = COMMANDS[subcommand];
if (command === undefined) {
  process.stderr.write(`warrant-mcp: unknown command "${subcommand}"\n\n${USAGE}\n`);
  process.exit(2);
}

const [file, ...fixedArgs] = command;
const child = spawn(process.execPath, [...NODE_ARGS, file, ...fixedArgs, ...rest], {
  stdio: 'inherit',
  // The package's own root, so relative imports inside the package resolve;
  // every command that needs the USER's directory reads process.cwd() itself,
  // which spawn inherits.
  env: { ...process.env, WARRANT_MCP_PACKAGE_ROOT: PACKAGE_ROOT },
});

child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (cause) => {
  process.stderr.write(`warrant-mcp: could not start ${subcommand} — ${cause.message}\n`);
  process.exit(1);
});
