/**
 * The end-to-end promise, exercised against the real CLI: a settings file with
 * somebody else's hooks in it survives init-then-remove BYTE-IDENTICAL.
 *
 * These run the actual `init` and `remove` entry points as child processes, in
 * a throwaway directory with a throwaway home, so nothing here touches the
 * developer's own machine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { vaultFor, vaultPolicy } from './paths.ts';

const INIT = fileURLToPath(new URL('../cli/init.ts', import.meta.url));
const REMOVE = fileURLToPath(new URL('../cli/remove.ts', import.meta.url));
const AUTHORING = fileURLToPath(new URL('../cli/authoring.ts', import.meta.url));

/** A settings file that already belongs to somebody, with deliberate formatting. */
const EXISTING_SETTINGS = `{
    "permissions": { "allow": ["Bash(npm test)"] },
    "hooks": {
        "PreToolUse": [
            { "matcher": "Bash", "hooks": [{ "type": "command", "command": "echo mine" }] }
        ]
    }
}
`;

interface Stage {
  readonly project: string;
  readonly home: string;
}

function stage(withSettings: boolean): Stage {
  const project = mkdtempSync(join(tmpdir(), 'warrant-proj-'));
  const home = mkdtempSync(join(tmpdir(), 'warrant-home-'));
  if (withSettings) {
    mkdirSync(join(project, '.claude'), { recursive: true });
    writeFileSync(join(project, '.claude', 'settings.json'), EXISTING_SETTINGS, 'utf8');
  }
  return { project, home };
}

const run = (entry: string, { project, home }: Stage) =>
  spawnSync(process.execPath, ['--experimental-strip-types', entry], {
    cwd: project,
    env: { ...process.env, WARRANT_MCP_HOME: home },
    encoding: 'utf8',
    timeout: 60_000,
  });

test('init enforces with no API key, and puts the compiled policy outside the project', () => {
  const s = stage(false);
  const result = run(INIT, s);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Enforced\./);

  const compiled = vaultPolicy(vaultFor(s.project, s.home));
  assert.ok(existsSync(compiled), 'the compiled policy must exist in the vault');
  assert.ok(
    !compiled.toLowerCase().startsWith(s.project.toLowerCase()),
    'the compiled policy must NOT sit inside the project the agent works in',
  );
  // The project keeps the source and a pointer — never the enforceable artifact.
  assert.ok(existsSync(join(s.project, '.warrant', 'policy.md')));
  assert.ok(existsSync(join(s.project, '.warrant', 'config.json')));
  assert.ok(!existsSync(join(s.project, '.warrant', 'policy-compiled.json')));
  // And it wired enforcement, rather than printing instructions.
  const settings = JSON.parse(readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8')) as {
    hooks: { PreToolUse: unknown[] };
  };
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.ok(existsSync(join(s.project, '.mcp.json')));
});

test('a settings file with other hooks survives init then remove, byte for byte', () => {
  const s = stage(true);
  const before = readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8');

  assert.equal(run(INIT, s).status, 0);
  const during = readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8');
  assert.notEqual(during, before, 'init must actually add the hook');
  assert.match(during, /echo mine/, "the user's own hook must still be there");

  const removed = run(REMOVE, s);
  assert.equal(removed.status, 0, removed.stderr);
  const after = readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8');
  assert.equal(after, before, 'remove must restore the original bytes exactly');
});

test('remove deletes what init created and leaves the vault gone', () => {
  const s = stage(false);
  assert.equal(run(INIT, s).status, 0);
  const vault = vaultFor(s.project, s.home);
  assert.ok(existsSync(vault));

  assert.equal(run(REMOVE, s).status, 0);
  assert.ok(!existsSync(vault), 'the vault must be gone');
  assert.ok(!existsSync(join(s.project, '.mcp.json')), 'a file init created must be removed');
  assert.ok(
    !existsSync(join(s.project, '.claude', 'settings.json')),
    'a settings file init created must be removed, since it held nothing else',
  );
});

test('init refuses a settings file it cannot parse, and changes nothing', () => {
  const s = stage(false);
  mkdirSync(join(s.project, '.claude'), { recursive: true });
  const broken = '{ this is not json';
  writeFileSync(join(s.project, '.claude', 'settings.json'), broken, 'utf8');

  const result = run(INIT, s);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /not valid JSON/);
  assert.match(result.stdout, /Fix:/, 'every error names the fix');
  assert.equal(readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8'), broken);
  assert.ok(!existsSync(vaultFor(s.project, s.home)), 'a refused init must not leave a vault behind');
});

test('remove with nothing installed says so and names the manual fix', () => {
  const s = stage(false);
  const result = run(REMOVE, s);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Nothing to remove/);
  assert.match(result.stdout, /Fix:/);
});

test('running init twice refuses rather than duplicating the hook', () => {
  const s = stage(false);
  assert.equal(run(INIT, s).status, 0);
  const second = run(INIT, s);
  assert.equal(second.status, 1);
  assert.match(second.stdout, /already initialised/);
  assert.match(second.stdout, /warrant-mcp remove/);
});

test('review without an API key names the fix instead of leaking the SDK error', () => {
  // Found in the published 0.1.0: the client's own message listed five auth
  // mechanisms and no remedy, on the one command the README tells people to run.
  const s = stage(false);
  assert.equal(run(INIT, s).status, 0);
  const env: NodeJS.ProcessEnv = { ...process.env, WARRANT_MCP_HOME: s.home };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', AUTHORING, 'review'], {
    cwd: s.project,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /needs an API key/);
  assert.match(result.stdout, /Fix:/);
  assert.match(result.stdout, /ANTHROPIC_API_KEY/);
  // And it says the rest of the product is unaffected, which is the point.
  assert.match(result.stdout, /enforcement never compiles/i);
  assert.doesNotMatch(result.stdout, /Could not resolve authentication method/);
});
