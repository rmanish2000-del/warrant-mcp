/**
 * Adversarial hardening — the classes an HN reader hunts for. Each test names
 * the attack it pins. Recreated locally after a fleet cloud audit (CODEX,
 * 2026-08-18) found the drive-letter bypass on a POSIX host the day before
 * launch; its added coverage was stranded in a cloud checkout with no remote,
 * so it lives here now.
 *
 * The headline case is the drive-letter bypass: a Windows-style absolute path
 * is treated as absolute on EVERY platform, so it cannot be resolved beneath a
 * POSIX workspace root and slip a containment rule. On a Windows host the host
 * `node:path` already handled these; on the POSIX host the hook actually runs
 * on, it did not. The context below uses a POSIX-style root on purpose, so the
 * assertion states the contract that must hold wherever enforcement runs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, toEvaluable } from './evaluate.ts';
import type { CompiledPolicy, EvaluationContext, Verdict } from './types.ts';
import { parseCompiledPolicy, CompilerRejection } from '../compiler/schema.ts';

const POLICY: CompiledPolicy = {
  clauses: [
    { id: 'W1', text: 'Delete files only inside the workspace.' },
    { id: 'W2', text: 'Never delete .git or .env.' },
    { id: 'W3', text: 'No sudo or su.' },
    { id: 'W4', text: 'Only write inside src/.' },
    { id: 'W5', text: 'HTTP only to api.github.com.' },
    { id: 'W6', text: 'GET and HEAD only.' },
  ],
  rules: [
    { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
    { clause: 'W2', rule: { type: 'file_delete_protected', segments: ['.git'], basenames: ['.env'] } },
    { clause: 'W3', rule: { type: 'shell_forbidden_token', tokens: ['sudo', 'su'] } },
    { clause: 'W4', rule: { type: 'file_write_scope', allowedRoots: ['src'] } },
    { clause: 'W5', rule: { type: 'http_host_allowlist', hosts: ['api.github.com'] } },
    { clause: 'W6', rule: { type: 'http_method_allowlist', methods: ['GET', 'HEAD'] } },
  ],
};

// A POSIX-style workspace root: the shape the hook sees when it runs in the
// cloud, and the shape the drive-letter bypass escaped under.
const CTX: EvaluationContext = { workspaceRoot: '/ws', caseInsensitivePaths: false };
const verdict = (input: unknown): Verdict => evaluate(toEvaluable(POLICY), input, CTX);

test('drive-letter bypass — a Windows absolute path is outside a POSIX workspace, not beneath it', () => {
  // POSIX resolve() treats "C:\..." as relative and joins it under /ws; the fix
  // recognises the drive letter as absolute on every platform.
  assert.equal(verdict({ kind: 'file_delete', path: 'C:\\elsewhere\\notes.md' }).clause, 'W1');
  assert.equal(verdict({ kind: 'file_delete', path: 'C:/elsewhere/out.txt' }).clause, 'W1');
});

test('drive-letter bypass — a UNC path is outside the workspace too', () => {
  assert.equal(verdict({ kind: 'file_delete', path: '\\\\server\\share\\x.txt' }).clause, 'W1');
  assert.equal(verdict({ kind: 'file_delete', path: '//server/share/x.txt' }).clause, 'W1');
});

test('drive-letter bypass — a Windows path to a protected name is still denied', () => {
  // A drive-letter .env is outside the POSIX workspace, so W1 (outside) fires
  // before W2 (protected) by clause order — either way it does not slip through.
  assert.equal(verdict({ kind: 'file_delete', path: 'C:\\elsewhere\\.env' }).decision, 'DENY');
  assert.equal(verdict({ kind: 'file_delete', path: 'C:\\repo\\.git\\HEAD' }).decision, 'DENY');
});

test('protected-name rule reads backslash separators — a Windows-relative .env is caught as W2', () => {
  // A workspace-relative path written with backslashes stays inside the
  // workspace (so W1 does not fire) and must still hit the protected basename.
  assert.equal(verdict({ kind: 'file_delete', path: 'nested\\.env' }).clause, 'W2');
  assert.equal(verdict({ kind: 'file_delete', path: 'repo\\.git\\HEAD' }).clause, 'W2');
});

test('drive-letter bypass — a Windows path is outside a write-scope root', () => {
  // src/ is the only writable root; a drive path is not inside it.
  assert.equal(verdict({ kind: 'file_delete', path: 'C:\\elsewhere\\evil.ts' }).clause, 'W1');
  // ...and a workspace-relative path outside src/ still trips the scope rule.
  assert.equal(verdict({ kind: 'file_delete', path: 'docs/readme.md' }).clause, 'W4');
});

test('homoglyph hostname — a Unicode lookalike of an allowed host stays outside the allowlist', () => {
  // "аpi.github.com" leads with Cyrillic U+0430, a different string entirely.
  const homoglyph = 'https://\u0430pi.github.com/x';
  assert.equal(verdict({ kind: 'http_request', url: homoglyph, method: 'GET' }).clause, 'W5');
});

test('mixed-case shell tokens cannot evade a forbidden-token rule', () => {
  assert.equal(verdict({ kind: 'shell_command', command: 'SuDo rm -rf /' }).clause, 'W3');
  assert.equal(verdict({ kind: 'shell_command', command: 'echo x && SU root' }).clause, 'W3');
});

test('mixed-case HTTP methods cannot evade the method allowlist', () => {
  // "pOsT" normalises to POST, which is not GET/HEAD.
  assert.equal(verdict({ kind: 'http_request', url: 'https://api.github.com/x', method: 'pOsT' }).clause, 'W6');
});

test('an oversized command is fully evaluated — no truncation hides a forbidden token', () => {
  const padding = 'a'.repeat(200_000);
  const command = `echo ${padding} && sudo rm -rf /`;
  assert.equal(verdict({ kind: 'shell_command', command }).clause, 'W3');
});

test('an empty rule set forbids nothing, but a malformed policy fails closed at load', () => {
  // An empty rule set is a valid policy that allows everything — enforcement of
  // "deny by default" is the caller's job, not a silent engine behaviour.
  const empty = toEvaluable({ rules: [] });
  assert.deepEqual(evaluate(empty, { kind: 'file_delete', path: 'anything' }, CTX), {
    decision: 'ALLOW',
    clause: null,
    reason: null,
    evidence: null,
  });
  // A malformed compiled policy is refused at parse time — it never becomes an
  // evaluable object that could quietly allow everything.
  assert.throws(() => parseCompiledPolicy('{}'), CompilerRejection);
  assert.throws(() => parseCompiledPolicy(''), CompilerRejection);
  assert.throws(
    () => parseCompiledPolicy(JSON.stringify({ clauses: [], rules: [{ clause: 'W1', rule: { type: 'nope' } }] })),
    CompilerRejection,
  );
});

test('a malformed action fails closed with INVALID_ACTION, never ALLOW', () => {
  assert.equal(verdict({ kind: 'file_delete' }).reason, 'INVALID_ACTION');
  assert.equal(verdict({ kind: 'file_delete' }).decision, 'DENY');
  assert.equal(verdict({ nonsense: true }).decision, 'DENY');
  assert.equal(verdict('not even an object').decision, 'DENY');
});
