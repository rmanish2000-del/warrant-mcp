import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_ROOT,
  TEMPLATE_POLICY_COMPILED,
  TEMPLATE_POLICY_SOURCE,
  noPolicyMessage,
  projectPolicyCompiled,
  resolvePolicy,
} from './paths.ts';
import { readPolicyCache } from '../compiler/cache.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

test('the package root resolves from this file, never from the cwd', () => {
  // A client may spawn the server from anywhere; the package must still find itself.
  assert.equal(resolve(PACKAGE_ROOT), resolve(REPO));
});

test('an explicit WARRANT_MCP_POLICY wins, and a relative one is resolved against the cwd', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'warrant-cwd-'));
  const absolute = resolve(sep + 'somewhere', 'policy.json');
  assert.deepEqual(resolvePolicy(cwd, { WARRANT_MCP_POLICY: absolute }), { path: absolute, source: 'env' });
  assert.deepEqual(resolvePolicy(cwd, { WARRANT_MCP_POLICY: 'rel/policy.json' }), {
    path: resolve(cwd, 'rel/policy.json'),
    source: 'env',
  });
  // An empty value is not a value — it must not shadow the project rule.
  assert.notEqual(resolvePolicy(cwd, { WARRANT_MCP_POLICY: '  ' })?.source, 'env');
});

test('a project with .warrant/ is preferred over the package copy', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'warrant-cwd-'));
  mkdirSync(join(cwd, '.warrant'), { recursive: true });
  writeFileSync(projectPolicyCompiled(cwd), '{}', 'utf8');
  assert.deepEqual(resolvePolicy(cwd, {}), { path: projectPolicyCompiled(cwd), source: 'project' });
});

test('a source checkout falls back to the repo policy — this is what keeps the demo working', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'warrant-cwd-'));
  const located = resolvePolicy(cwd, {});
  assert.ok(located);
  assert.equal(located.source, 'package');
  assert.equal(located.path, join(PACKAGE_ROOT, 'policy-compiled.json'));
});

test('the refusal message names both places it looked', () => {
  const cwd = resolve(sep + 'project');
  const message = noPolicyMessage(cwd);
  assert.match(message, /WARRANT_MCP_POLICY/);
  assert.match(message, /\.warrant/);
  assert.match(message, /warrant-mcp init/);
});

test('the shipped starter policy exists and validates', () => {
  // `init` copies these; if either is broken, a fresh install enforces nothing.
  const cached = readPolicyCache(TEMPLATE_POLICY_COMPILED);
  assert.ok(cached, 'templates/policy-compiled.json must load');
  assert.ok(cached.compiled.clauses.length > 0);
  assert.ok(cached.compiled.rules.length > 0);
  assert.ok(readFileSync(TEMPLATE_POLICY_SOURCE, 'utf8').trim().length > 0);
});

test('the starter policy matches the repo policy it was copied from', () => {
  // Two copies exist because the repo root file is deliberately not shipped —
  // an installed package must never silently enforce the sample. This test is
  // what stops the two drifting apart.
  const norm = (text: string) => text.replace(/\r\n/g, '\n');
  assert.equal(
    norm(readFileSync(TEMPLATE_POLICY_SOURCE, 'utf8')),
    norm(readFileSync(join(PACKAGE_ROOT, 'policy.md'), 'utf8')),
    'templates/policy.md has drifted from policy.md — re-copy it',
  );
  assert.equal(
    norm(readFileSync(TEMPLATE_POLICY_COMPILED, 'utf8')),
    norm(readFileSync(join(PACKAGE_ROOT, 'policy-compiled.json'), 'utf8')),
    'templates/policy-compiled.json has drifted from policy-compiled.json — re-copy it',
  );
});
