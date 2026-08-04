/**
 * `warrant-mcp remove` — put the machine back.
 *
 * Files init modified are restored from the exact bytes it saved, so a
 * settings file comes back byte-identical, formatting and all. Files init
 * created are deleted. Directories are removed only if they are empty and only
 * if init made them.
 *
 * People try things they can undo. A tool that installs itself into somebody's
 * settings and offers no way out is a tool people are right to refuse.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { projectConfig, projectDir, vaultFor, vaultManifest } from '../config/paths.ts';
import { removeMcpServer, removePreToolUseHook, serialize } from '../config/settings.ts';
import type { HookEntry } from '../config/settings.ts';

const out = (text = '') => process.stdout.write(`${text}\n`);
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';
const colour = process.stdout.isTTY ?? false;
const paint = (code: string, text: string) => (colour ? `${code}${text}${OFF}` : text);

const cwd = resolve(process.cwd());
const home = process.env.WARRANT_MCP_HOME ?? homedir();
const vault = vaultFor(cwd, home);
const manifestPath = vaultManifest(vault);
const rel = (path: string) => {
  const r = relative(cwd, path);
  return r.startsWith('..') ? path : r;
};

interface Manifest {
  readonly created: string[];
  /** Directories init made (the optional skill) — absent in older manifests. */
  readonly createdDirs?: string[];
  readonly modified: Array<{ path: string; backup: string }>;
  readonly hookEntry: HookEntry;
  readonly mcpServer: { name: string; server: Record<string, unknown> };
}

if (!existsSync(manifestPath)) {
  out();
  out(`  ${paint(RED + BOLD, 'Nothing to remove.')}`);
  out(`  No warrant install is recorded for ${cwd}.`);
  out(`  (Looked for ${manifestPath})`);
  out();
  out(`  ${paint(BOLD, 'Fix:')} if you configured warrant by hand, remove the hook from`);
  out('  .claude/settings.json and the "warrant" entry from .mcp.json yourself.');
  out();
  process.exit(1);
}

let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
} catch (cause) {
  out();
  out(`  ${paint(RED + BOLD, 'The install record is unreadable.')} (${(cause as Error).message})`);
  out();
  out(`  ${paint(BOLD, 'Fix:')} delete ${vault} by hand, then remove the warrant hook from`);
  out('  .claude/settings.json and the "warrant" entry from .mcp.json.');
  out();
  process.exit(1);
}

const restored: string[] = [];
const cleaned: string[] = [];
const leftAlone: string[] = [];

// 1. Restore modified files from the bytes init saved. Byte-identical, always.
for (const { path, backup } of manifest.modified ?? []) {
  if (!existsSync(backup)) {
    // No backup means we cannot promise byte-identical, so edit structurally
    // instead and say so rather than guessing.
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const isSettings = path.endsWith('settings.json');
      const result = isSettings
        ? removePreToolUseHook(parsed, manifest.hookEntry)
        : removeMcpServer(parsed, manifest.mcpServer.name, manifest.mcpServer.server);
      writeFileSync(path, serialize(result.settings), 'utf8');
      leftAlone.push(`${rel(path)} — backup missing, warrant's entry was removed but formatting may differ`);
    }
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, readFileSync(backup, 'utf8'), 'utf8');
  restored.push(rel(path));
}

// 2. Delete what init created — but only if warrant's entry is still the only
//    thing there. A file the user has since edited is left, minus our entry.
for (const path of manifest.created ?? []) {
  if (!existsSync(path)) continue;
  if (path.endsWith('settings.json') || path.endsWith('.mcp.json')) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    const isSettings = path.endsWith('settings.json');
    const result = isSettings
      ? removePreToolUseHook(parsed, manifest.hookEntry)
      : removeMcpServer(parsed, manifest.mcpServer.name, manifest.mcpServer.server);
    const remaining = Object.keys(result.settings).length;
    if (remaining === 0) {
      rmSync(path, { force: true });
      cleaned.push(rel(path));
    } else {
      writeFileSync(path, serialize(result.settings), 'utf8');
      leftAlone.push(`${rel(path)} — kept, because you added other settings to it`);
    }
    continue;
  }
  rmSync(path, { force: true });
  cleaned.push(rel(path));
}

// 2b. Directories init made for the optional skill — deepest last in the
//     manifest, so walk them in reverse, and only take one away when it is
//     empty again. A file the user added is theirs, and so is the directory
//     holding it.
for (const dir of [...(manifest.createdDirs ?? [])].reverse()) {
  if (!existsSync(dir)) continue;
  if (readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true, force: true });
    cleaned.push(rel(dir));
  } else {
    leftAlone.push(`${rel(dir)} — kept, you added files to it`);
  }
}

// 3. The vault, and then any empty directories init made.
rmSync(vault, { recursive: true, force: true });
cleaned.push(vault);

for (const dir of [projectDir(cwd), resolve(cwd, '.claude')]) {
  if (existsSync(dir) && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true, force: true });
    cleaned.push(rel(dir));
  } else if (existsSync(dir) && dir === projectDir(cwd)) {
    leftAlone.push(`${rel(dir)} — kept, it still has files in it (your policy.md lives here)`);
  }
}

out();
out(`  ${paint(GREEN + BOLD, 'Removed.')} warrant is no longer enforcing in ${cwd}.`);
out();
if (restored.length > 0) {
  out(paint(BOLD, '  Restored byte-for-byte from the backup taken at init:'));
  for (const path of restored) out(`    ${path}`);
  out();
}
if (cleaned.length > 0) {
  out(paint(BOLD, '  Deleted:'));
  for (const path of cleaned) out(`    ${path}`);
  out();
}
if (leftAlone.length > 0) {
  out(paint(BOLD, '  Left in place:'));
  for (const note of leftAlone) out(`    ${note}`);
  out();
}
out(`  ${paint(DIM, 'Start again any time with:')} warrant-mcp init`);
out();
if (existsSync(projectConfig(cwd))) {
  out(`  ${paint(RED, 'Note:')} ${rel(projectConfig(cwd))} still exists — remove it by hand if you did not expect that.`);
  out();
}
