import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompilerRejection, parseCompiledPolicy } from './schema.ts';

const VALID = {
  clauses: [
    { id: 'W1', text: 'Delete files only inside the workspace.' },
    { id: 'W2', text: 'Never run sudo.' },
  ],
  rules: [
    { clause: 'W2', rule: { type: 'shell_forbidden_token', tokens: ['sudo'] } },
    { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
  ],
  unmapped: [],
};

test('a valid compile passes and rules come back in ascending clause order', () => {
  const policy = parseCompiledPolicy(JSON.stringify(VALID));
  assert.deepEqual(
    policy.rules.map((r) => r.clause),
    ['W1', 'W2'],
  );
});

const expectRejection = (mutate: (draft: typeof VALID) => unknown, stage: CompilerRejection['stage']) => {
  const draft = structuredClone(VALID);
  const mutated = mutate(draft) ?? draft;
  assert.throws(
    () => parseCompiledPolicy(typeof mutated === 'string' ? mutated : JSON.stringify(mutated)),
    (error: unknown) => error instanceof CompilerRejection && error.stage === stage,
  );
};

test('non-JSON is refused', () => {
  expectRejection(() => 'not json {', 'json');
});

test('unmapped sentences refuse the whole policy', () => {
  expectRejection((d) => {
    (d.unmapped as string[]).push('Never be rude.');
  }, 'unmapped');
});

test('a clause without a rule is refused, not ignored — as an unmapped sentence', () => {
  // Reported as `unmapped` rather than `schema` so the review screen can give
  // the same rewrite guidance either way the model reports the failure.
  expectRejection((d) => {
    d.rules.splice(1, 1);
  }, 'unmapped');
});

test('a rule-less clause carries its own sentence into the refusal message', () => {
  const draft = structuredClone(VALID);
  draft.rules.splice(1, 1);
  assert.throws(
    () => parseCompiledPolicy(JSON.stringify(draft)),
    (error: unknown) =>
      error instanceof CompilerRejection && error.message.includes('Delete files only inside the workspace.'),
  );
});

test('a rule citing an unknown clause is refused', () => {
  expectRejection((d) => {
    (d.rules[0] as { clause: string }).clause = 'W9';
  }, 'schema');
});

test('an unknown rule type is refused — the rule set is closed', () => {
  expectRejection((d) => {
    (d.rules[0] as { rule: unknown }).rule = { type: 'shell_regex', pattern: '.*' };
  }, 'schema');
});

test('a rule that protects nothing is refused', () => {
  expectRejection((d) => {
    (d.rules[0] as { rule: unknown }).rule = { type: 'file_delete_protected', segments: [], basenames: [] };
  }, 'schema');
});

test('duplicate clause ids are refused', () => {
  expectRejection((d) => {
    (d.clauses[1] as { id: string }).id = 'W1';
  }, 'schema');
});

/** M6 fail-closed cases: a new rule that would decide nothing is refused, not defaulted. */
const withRule = (rule: unknown) => ({
  clauses: [{ id: 'W1', text: 'x' }],
  rules: [{ clause: 'W1', rule }],
  unmapped: [],
});

const rejects = (rule: unknown, label: string) => {
  assert.throws(
    () => parseCompiledPolicy(JSON.stringify(withRule(rule))),
    (error: unknown) => error instanceof CompilerRejection && error.stage === 'schema',
    label,
  );
};

test('M6 fail-closed — file_write_scope with no roots is refused', () => {
  rejects({ type: 'file_write_scope', allowedRoots: [] }, 'empty allowedRoots');
});

test('M6 fail-closed — an absolute write-scope root is refused', () => {
  // A machine path in the policy is the failure mode the workspace stamp exists to prevent.
  rejects({ type: 'file_write_scope', allowedRoots: ['C:\\Users\\me\\repo'] }, 'absolute root');
  rejects({ type: 'file_write_scope', allowedRoots: ['/var/www'] }, 'posix absolute root');
});

test('M6 fail-closed — an invocation rule with no command is refused', () => {
  rejects({ type: 'shell_forbidden_invocation', command: '', subcommands: ['push'], anyFlag: [], anyArgument: [] }, 'empty command');
});

test('M6 fail-closed — protection that protects nothing is refused', () => {
  rejects({ type: 'file_delete_protected', segments: [], basenames: [], suffixes: [] }, 'nothing protected');
});

test('M6 — the new rules validate and survive a cache round-trip', () => {
  const policy = parseCompiledPolicy(
    JSON.stringify({
      clauses: [
        { id: 'W1', text: 'no force push' },
        { id: 'W2', text: 'write only in src' },
        { id: 'W3', text: 'no pem files' },
      ],
      rules: [
        { clause: 'W1', rule: { type: 'shell_forbidden_invocation', command: 'git', subcommands: ['push'], anyFlag: ['--force', '-f'], anyArgument: [] } },
        { clause: 'W2', rule: { type: 'file_write_scope', allowedRoots: ['src'] } },
        { clause: 'W3', rule: { type: 'file_delete_protected', segments: [], basenames: [], suffixes: ['.pem'] } },
      ],
      unmapped: [],
    }),
  );
  assert.equal(policy.rules.length, 3);
  assert.deepEqual(parseCompiledPolicy(JSON.stringify(policy)).rules, policy.rules);
});

test('a cached CompiledPolicy re-validates without an unmapped field', () => {
  const { unmapped, ...cachedShape } = VALID;
  const policy = parseCompiledPolicy(JSON.stringify(cachedShape));
  assert.equal(policy.clauses.length, 2);
});
