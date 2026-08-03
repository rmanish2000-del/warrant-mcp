/**
 * The no-side-effect pin. Two layers:
 *
 * 1. Structural — the deciding modules (engine + handler + presentation)
 *    import no capability that could touch a file, spawn a process, or open
 *    a connection. Verified by scanning their sources for forbidden imports
 *    and globals. If someone adds `node:fs` to the evaluator, this test
 *    fails before any behavioural test could.
 * 2. Behavioural — a DENY (and an ALLOW: the tool only checks) leaves the
 *    world untouched even when the caller tries to force execution with
 *    extra fields. Sentinel files survive; a poisoned global fetch is never
 *    called.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { handleCheckAction } from './handler.ts';
import type { CompiledPolicy, EvaluationContext } from '../engine/types.ts';

const SRC = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** Every module that participates in deciding or describing a verdict. */
const DECIDING_MODULES = [
  SRC('../engine/types.ts'),
  SRC('../engine/evaluate.ts'),
  SRC('../hook/adapter.ts'),
  SRC('handler.ts'),
  SRC('present.ts'),
];

const FORBIDDEN = [
  'node:fs',
  'node:child_process',
  'child_process',
  'node:http',
  'node:net',
  'node:dgram',
  'node:worker_threads',
  'node:cluster',
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'eval(',
  'Function(',
];

test('deciding modules import no side-effect capability', () => {
  for (const module of DECIDING_MODULES) {
    const source = readFileSync(module, 'utf8');
    for (const forbidden of FORBIDDEN) {
      assert.ok(
        !source.includes(forbidden),
        `${module} contains "${forbidden}" — the deciding path must stay import-starved`,
      );
    }
  }
});

const POLICY: CompiledPolicy = {
  clauses: [
    { id: 'W1', text: 'Delete files only inside the workspace.' },
    { id: 'W2', text: 'Never delete a file named .env.' },
    { id: 'W6', text: 'HTTP only to api.github.com.' },
  ],
  rules: [
    { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
    { clause: 'W2', rule: { type: 'file_delete_protected', segments: [], basenames: ['.env'] } },
    { clause: 'W6', rule: { type: 'http_host_allowlist', hosts: ['api.github.com'] } },
  ],
};

test('a DENY deletes nothing, even when the caller tries to force it', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'warrant-ws-'));
  const outside = mkdtempSync(join(tmpdir(), 'warrant-outside-'));
  const ctx: EvaluationContext = { workspaceRoot: workspace, caseInsensitivePaths: process.platform === 'win32' };

  const outsideSentinel = join(outside, 'sentinel.txt');
  writeFileSync(outsideSentinel, 'still here', 'utf8');
  const envSentinel = join(workspace, '.env');
  writeFileSync(envSentinel, 'SECRET=1', 'utf8');

  const forced = handleCheckAction(POLICY, ctx, {
    kind: 'file_delete',
    path: outsideSentinel,
    execute: true,
    force: true,
    confirm: 'YES',
    dryRun: false,
  });
  assert.equal(forced.verdict.decision, 'DENY');
  assert.equal(forced.verdict.clause, 'W1');
  assert.ok(existsSync(outsideSentinel), 'the outside sentinel must survive a forced DENY');

  const env = handleCheckAction(POLICY, ctx, { kind: 'file_delete', path: envSentinel, execute: true });
  assert.equal(env.verdict.decision, 'DENY');
  assert.equal(env.verdict.clause, 'W2');
  assert.ok(existsSync(envSentinel), '.env must survive');
  assert.equal(readFileSync(envSentinel, 'utf8'), 'SECRET=1');
});

test('no request is made on DENY or ALLOW — the tool only checks', () => {
  const ctx: EvaluationContext = { workspaceRoot: tmpdir(), caseInsensitivePaths: true };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls += 1;
    throw new Error('the deciding path must never reach fetch');
  }) as typeof fetch;
  try {
    const denied = handleCheckAction(POLICY, ctx, {
      kind: 'http_request',
      url: 'https://exfil.example.com/x',
      method: 'GET',
      execute: true,
    });
    assert.equal(denied.verdict.decision, 'DENY');
    const allowed = handleCheckAction(POLICY, ctx, {
      kind: 'http_request',
      url: 'https://api.github.com/user',
      method: 'GET',
    });
    assert.equal(allowed.verdict.decision, 'ALLOW');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
});

test('the handler is a pure function — identical calls, identical outcomes', () => {
  const ctx: EvaluationContext = { workspaceRoot: tmpdir(), caseInsensitivePaths: true };
  const input = { kind: 'shell_command', command: 'ls' };
  assert.deepEqual(
    handleCheckAction(POLICY, ctx, input),
    handleCheckAction(POLICY, ctx, input),
  );
});
