/**
 * `warrant-mcp init` — from an empty folder to enforced, in one command.
 *
 * What it does, in order, and nothing else:
 *   1. copies the starter policy — it never compiles, so no API key is needed
 *      and enforcement is live the moment this returns;
 *   2. puts the COMPILED policy in a vault outside the project, read-only,
 *      because a compiled policy inside the agent's own workspace is one the
 *      agent can delete (M4 attack 8) — and because the policy's own
 *      "stay inside the project" clause then guards the vault (M5);
 *   3. merges a PreToolUse hook into `.claude/settings.json` and the MCP server
 *      into `.mcp.json`, preserving every key already there;
 *   4. records exactly what it created and the original bytes of anything it
 *      modified, so `warrant-mcp remove` can put the machine back.
 *
 * Every failure path names the fix.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { readPolicyCache } from '../compiler/cache.ts';
import {
  PACKAGE_ROOT,
  TEMPLATE_POLICY_COMPILED,
  TEMPLATE_POLICY_SOURCE,
  projectConfig,
  projectDir,
  projectPolicySource,
  vaultFor,
  vaultManifest,
  vaultPolicy,
} from '../config/paths.ts';
import {
  UnsafeMerge,
  addMcpServer,
  addPreToolUseHook,
  serialize,
} from '../config/settings.ts';
import type { HookEntry } from '../config/settings.ts';

const out = (text = '') => process.stdout.write(`${text}\n`);
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';
const colour = process.stdout.isTTY ?? false;
const paint = (code: string, text: string) => (colour ? `${code}${text}${OFF}` : text);

const fwd = (path: string): string => path.replace(/\\/g, '/');
const rel = (path: string, from: string): string => {
  const r = relative(from, path);
  return r.startsWith('..') ? path : r;
};

/** Stop with a reason and the thing to do about it. Never one without the other. */
function stop(problem: string, fix: string): never {
  out();
  out(`  ${paint(RED + BOLD, 'warrant-mcp init stopped.')}`);
  out(`  ${problem}`);
  out();
  out(`  ${paint(BOLD, 'Fix:')} ${fix}`);
  out();
  process.exit(1);
}

const cwd = resolve(process.cwd());
const force = process.argv.includes('--force');
const home = process.env.WARRANT_MCP_HOME ?? homedir();

const SETTINGS = resolve(cwd, '.claude', 'settings.json');
const MCP_CONFIG = resolve(cwd, '.mcp.json');
const vault = vaultFor(cwd, home);
const compiled = vaultPolicy(vault);
const policySource = projectPolicySource(cwd);
const pointer = projectConfig(cwd);
const launcher = fwd(resolve(PACKAGE_ROOT, 'bin', 'warrant-mcp.mjs'));

if (!existsSync(TEMPLATE_POLICY_SOURCE) || !existsSync(TEMPLATE_POLICY_COMPILED)) {
  stop(
    `the starter policy is missing from the installed package at ${PACKAGE_ROOT}.`,
    'reinstall the package: npm install -g warrant-mcp',
  );
}

if (existsSync(pointer) && !force) {
  stop(
    `this project is already initialised — ${rel(pointer, cwd)} exists.`,
    'run "warrant-mcp remove" first, or re-run with --force to overwrite.',
  );
}

/** Parse a JSON file we are about to merge into, or stop with the reason. */
function readJson(path: string, label: string): { value: unknown; raw: string } | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  try {
    return { value: JSON.parse(raw), raw };
  } catch (cause) {
    return stop(
      `${label} at ${rel(path, cwd)} is not valid JSON (${(cause as Error).message}).`,
      `open ${rel(path, cwd)}, fix the JSON, and run init again — warrant will not rewrite a file it cannot parse.`,
    );
  }
}

const settingsBefore = readJson(SETTINGS, 'the Claude Code settings file');
const mcpBefore = readJson(MCP_CONFIG, 'the MCP config');

const hookEntry: HookEntry = {
  matcher: 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|WebFetch|mcp__.*',
  hooks: [
    {
      type: 'command',
      command: `WARRANT_MCP_POLICY='${fwd(compiled)}' node '${launcher}' hook`,
      timeout: 60,
    },
  ],
};

const mcpServer = {
  command: 'node',
  args: [launcher, 'serve'],
  env: { WARRANT_MCP_POLICY: fwd(compiled) },
};

// Compute both merges BEFORE writing anything, so a rejection leaves the
// machine untouched rather than half-configured.
let mergedSettings;
let mergedMcp;
try {
  mergedSettings = addPreToolUseHook(settingsBefore?.value, hookEntry);
  mergedMcp = addMcpServer(mcpBefore?.value, 'warrant', mcpServer);
} catch (cause) {
  if (cause instanceof UnsafeMerge) {
    out();
    out(`  ${paint(RED + BOLD, 'warrant-mcp init stopped — nothing was changed.')}`);
    out(`  ${cause.message}`);
    out();
    out(`  ${paint(BOLD, 'Fix:')} ${cause.fix}`);
    out();
    out(`  ${paint(BOLD, 'Or add this to hooks.PreToolUse yourself:')}`);
    for (const line of serialize(hookEntry).trimEnd().split('\n')) out(`      ${line}`);
    out();
    process.exit(1);
  }
  throw cause;
}

// ---- from here on, we write ------------------------------------------------

const created: string[] = [];
const modified: Array<{ path: string; backup: string }> = [];

mkdirSync(vault, { recursive: true });
mkdirSync(projectDir(cwd), { recursive: true });

if (existsSync(compiled)) chmodSync(compiled, 0o644);
copyFileSync(TEMPLATE_POLICY_COMPILED, compiled);
chmodSync(compiled, 0o444);

if (!existsSync(policySource) || force) {
  copyFileSync(TEMPLATE_POLICY_SOURCE, policySource);
  created.push(policySource);
}

writeFileSync(pointer, serialize({ policy: fwd(compiled), vault: fwd(vault) }), 'utf8');
created.push(pointer);

// Validate what was actually written, rather than trusting the copy.
const cached = readPolicyCache(compiled);
if (!cached) {
  stop(
    'the policy copied into the vault did not pass validation, so nothing is enforcing.',
    'reinstall the package: npm install -g warrant-mcp',
  );
}

for (const [path, before, merged, label] of [
  [SETTINGS, settingsBefore, mergedSettings, 'settings'],
  [MCP_CONFIG, mcpBefore, mergedMcp, 'mcp'],
] as const) {
  if (merged.alreadyPresent) continue;
  if (before === null) {
    mkdirSync(dirname(path), { recursive: true });
    created.push(path);
  } else {
    const backup = resolve(vault, `${label}.backup.json`);
    writeFileSync(backup, before.raw, 'utf8');
    modified.push({ path, backup });
  }
  writeFileSync(path, serialize(merged.settings), 'utf8');
}

writeFileSync(
  vaultManifest(vault),
  serialize({
    version: 1,
    project: cwd,
    vault,
    installedAt: new Date().toISOString(),
    created,
    modified,
    hookEntry,
    mcpServer: { name: 'warrant', server: mcpServer },
  }),
  'utf8',
);

// ---- tell the human what just happened -------------------------------------

out();
out(`  ${paint(GREEN + BOLD, 'Enforced.')} ${cached.compiled.clauses.length} clauses, ${cached.compiled.rules.length} rules — no API key was needed and nothing was compiled.`);
out();
out(paint(BOLD, '  What changed'));
out();
out(`    ${rel(policySource, cwd)}          your policy, in plain English — edit this`);
out(`    ${rel(pointer, cwd)}         points at the compiled policy`);
out(`    ${rel(SETTINGS, cwd)}   PreToolUse hook added${settingsBefore ? paint(DIM, ' (merged — your other settings are untouched)') : ''}`);
out(`    ${rel(MCP_CONFIG, cwd)}                 warrant exposed as an MCP tool${mcpBefore ? paint(DIM, ' (merged)') : ''}`);
out();
out(`    ${paint(BOLD, 'the compiled policy is NOT in this project:')}`);
out(`    ${compiled}`);
out(`    ${paint(DIM, 'read-only, and outside the workspace on purpose — an agent that could')}`);
out(`    ${paint(DIM, 'delete its own policy could disarm the thing that stops it.')}`);
out();
out(paint(BOLD, '  Try this — it refuses, and tells you which clause did it:'));
out();
out(`      ${paint(GREEN + BOLD, 'warrant-mcp test "delete .env"')}`);
out();
out(`  ${paint(DIM, 'That is a dry run. For the real thing, start Claude Code here and ask it to')}`);
out(`  ${paint(DIM, 'delete .env — the hook blocks the tool call before it executes.')}`);
out();
out(`  ${paint(DIM, 'Undo everything:')} warrant-mcp remove`);
out();
