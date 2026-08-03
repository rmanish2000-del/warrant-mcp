import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, sep } from 'node:path';
import { decideToolCall, denyHookOutput, mapToolCall } from './adapter.ts';
import type { CompiledPolicy, EvaluationContext } from '../engine/types.ts';

const POLICY: CompiledPolicy = {
  clauses: [
    { id: 'W1', text: 'Create, overwrite, or delete files only inside the workspace.' },
    { id: 'W2', text: 'Never delete or overwrite .git or .env.' },
    { id: 'W3', text: 'Never run a shell command that invokes sudo or su.' },
  ],
  rules: [
    { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
    { clause: 'W2', rule: { type: 'file_delete_protected', segments: ['.git'], basenames: ['.env'] } },
    { clause: 'W3', rule: { type: 'shell_forbidden_token', tokens: ['sudo', 'su'] } },
  ],
};

const WS = resolve(sep + 'ws');
const CTX: EvaluationContext = { workspaceRoot: WS, caseInsensitivePaths: true };

const decide = (toolName: string, toolInput: unknown) => decideToolCall(POLICY, CTX, toolName, toolInput);

test('a Bash rm maps its targets to file_delete checks, quotes stripped', () => {
  const checks = mapToolCall('Bash', { command: 'rm -f ".env" build/x.txt' });
  assert.deepEqual(
    checks.map((c) => c.action),
    [
      { kind: 'shell_command', command: 'rm -f ".env" build/x.txt' },
      { kind: 'file_delete', path: '.env' },
      { kind: 'file_delete', path: 'build/x.txt' },
    ],
  );
});

test('redirect targets map to overwrite checks; /dev/null is a sink, not a file', () => {
  const checks = mapToolCall('Bash', { command: 'echo pwned > .env 2>/dev/null' });
  assert.deepEqual(
    checks.map((c) => c.action).filter((a) => (a as { kind: string }).kind === 'file_delete'),
    [{ kind: 'file_delete', path: '.env' }],
  );
});

test('Write and NotebookEdit map their target path; unknown tools map to nothing', () => {
  assert.deepEqual(mapToolCall('Write', { file_path: 'notes.md', content: 'x' })[0]?.action, {
    kind: 'file_delete',
    path: 'notes.md',
  });
  assert.deepEqual(mapToolCall('NotebookEdit', { notebook_path: 'a.ipynb' })[0]?.action, {
    kind: 'file_delete',
    path: 'a.ipynb',
  });
  assert.deepEqual(mapToolCall('Read', { file_path: 'x' }), []);
  assert.deepEqual(mapToolCall('WebFetch', { url: 'https://x' }), []);
});

test('rm .env is denied on W2 even though the command itself breaches no shell clause', () => {
  const denied = decide('Bash', { command: 'rm .env' });
  assert.ok(denied);
  assert.equal(denied.verdict.decision, 'DENY');
  assert.equal(denied.verdict.clause, 'W2');
});

test('the whole-command clause is cited before extracted file operations', () => {
  const denied = decide('Bash', { command: 'sudo rm -f .env' });
  assert.ok(denied);
  assert.equal(denied.verdict.clause, 'W3');
});

test('a Write outside the workspace is denied on W1', () => {
  const denied = decide('Write', { file_path: resolve(sep + 'elsewhere', 'x.txt'), content: 'hi' });
  assert.ok(denied);
  assert.equal(denied.verdict.clause, 'W1');
});

test('a Write with a missing path fails closed as an invalid action', () => {
  const denied = decide('Write', { content: 'hi' });
  assert.ok(denied);
  assert.equal(denied.verdict.reason, 'INVALID_ACTION');
});

test('harmless calls produce no opinion — null, never an approval', () => {
  assert.equal(decide('Bash', { command: 'git status' }), null);
  assert.equal(decide('Write', { file_path: 'notes.md', content: 'x' }), null);
  assert.equal(decide('Read', { file_path: '.env' }), null);
});

test('PowerShell deletions map like Bash — the rehearsal bypass stays closed', () => {
  const checks = mapToolCall('PowerShell', {
    command: 'Remove-Item -Force -Confirm:$false "C:\\stage\\.env"',
  });
  assert.deepEqual(
    checks.map((c) => c.action).filter((a) => (a as { kind: string }).kind === 'file_delete'),
    [{ kind: 'file_delete', path: 'C:\\stage\\.env' }],
  );
  const denied = decide('PowerShell', { command: 'Remove-Item -Force .env' });
  assert.ok(denied);
  assert.equal(denied.verdict.clause, 'W2');
  assert.equal(decide('PowerShell', { command: 'Get-ChildItem' }), null);
});

test('denyHookOutput emits the documented PreToolUse deny shape', () => {
  assert.deepEqual(denyHookOutput('because'), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'because',
    },
  });
});
