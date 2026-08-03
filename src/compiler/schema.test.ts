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

test('a clause without a rule is refused, not ignored', () => {
  expectRejection((d) => {
    d.rules.splice(1, 1);
  }, 'schema');
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

test('a cached CompiledPolicy re-validates without an unmapped field', () => {
  const { unmapped, ...cachedShape } = VALID;
  const policy = parseCompiledPolicy(JSON.stringify(cachedShape));
  assert.equal(policy.clauses.length, 2);
});
