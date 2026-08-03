import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, sep } from 'node:path';
import { describeRule } from './describe.ts';
import { behaviourDiff, refusedByPolicy } from './diff.ts';
import { CORPUS } from './corpus.ts';
import { guidanceFor } from './guidance.ts';
import { isPhraseError, parsePhrase } from './phrase.ts';
import { evaluate, toEvaluable } from '../engine/evaluate.ts';
import type { CompiledPolicy, EvaluationContext, Rule } from '../engine/types.ts';

const CTX: EvaluationContext = { workspaceRoot: resolve(sep + 'ws'), caseInsensitivePaths: true };

const policyOf = (rules: ReadonlyArray<{ clause: string; rule: Rule }>, texts: Record<string, string>): CompiledPolicy => ({
  clauses: Object.entries(texts).map(([id, text]) => ({ id, text })),
  rules: [...rules],
});

test('describeRule renders every rule type as a sentence, with no JSON leaking through', () => {
  const rules: Rule[] = [
    { type: 'file_delete_outside_workspace' },
    { type: 'file_delete_protected', segments: ['.git'], basenames: ['.env'], suffixes: ['.pem'] },
    { type: 'file_write_scope', allowedRoots: ['src', 'tests'] },
    { type: 'shell_forbidden_token', tokens: ['sudo', 'su'] },
    { type: 'shell_forbidden_sequence', sequences: [['rm', '-rf']] },
    { type: 'shell_forbidden_invocation', command: 'git', subcommands: ['push'], anyFlag: ['--force'], anyArgument: [] },
    { type: 'http_host_allowlist', hosts: ['api.github.com'] },
    { type: 'http_method_allowlist', methods: ['GET', 'HEAD'] },
  ];
  for (const rule of rules) {
    const described = describeRule(rule);
    assert.ok(described.startsWith('Refuses '), `"${described}" should start with Refuses`);
    assert.ok(described.endsWith('.'), `"${described}" should end in a full stop`);
    for (const jsonish of ['{', '}', '[', ']', '"type"', '_']) {
      assert.ok(!described.includes(jsonish), `"${described}" leaks JSON syntax: ${jsonish}`);
    }
  }
});

test('describeRule names the parts a human needs to check', () => {
  assert.match(
    describeRule({ type: 'file_delete_protected', segments: ['.git'], basenames: ['.env'], suffixes: ['.pem', '.key'] }),
    /\.git[\s\S]*\.env[\s\S]*\.pem[\s\S]*\.key/,
  );
  assert.match(
    describeRule({ type: 'shell_forbidden_invocation', command: 'git', subcommands: ['push'], anyFlag: ['--force', '-f'], anyArgument: [] }),
    /git push[\s\S]*--force[\s\S]*-f[\s\S]*argument order/,
  );
  // Suffixes are optional on older caches; the sentence must still read well.
  assert.equal(
    describeRule({ type: 'file_delete_protected', segments: [], basenames: ['.env'] }),
    'Refuses creating, overwriting or deleting any file named ".env".',
  );
});

const V1 = policyOf(
  [
    { clause: 'W1', rule: { type: 'file_delete_protected', segments: [], basenames: ['.env'], suffixes: [] } },
    { clause: 'W2', rule: { type: 'shell_forbidden_token', tokens: ['sudo'] } },
  ],
  { W1: 'Leave .env alone.', W2: 'No root.' },
);

const V2 = policyOf(
  [
    { clause: 'W2', rule: { type: 'shell_forbidden_token', tokens: ['sudo'] } },
    { clause: 'W3', rule: { type: 'shell_forbidden_invocation', command: 'npm', subcommands: ['install', 'i'], anyFlag: [], anyArgument: [] } },
  ],
  { W2: 'No root.', W3: 'No installs.' },
);

test('behaviourDiff reports what changed in behaviour, in both directions', () => {
  const diff = behaviourDiff(V1, V2, CTX);
  assert.ok(diff.nowAllowed.some((change) => change.label === 'delete .env' && change.before === 'DENY W1' && change.after === 'ALLOW'));
  assert.ok(diff.nowRefused.some((change) => change.label === 'install a dependency' && change.after === 'DENY W3'));
  assert.equal(diff.nowRefused.some((change) => change.label === 'run as root'), false, 'unchanged rules must not appear');
});

test('behaviourDiff on a reworded but identical policy reports nothing', () => {
  const reworded = policyOf([...V1.rules], { W1: 'Completely different wording.', W2: 'Also reworded.' });
  const diff = behaviourDiff(V1, reworded, CTX);
  assert.deepEqual([diff.nowRefused, diff.nowAllowed, diff.reclassified], [[], [], []]);
  assert.equal(diff.unchanged, CORPUS.length);
});

test('behaviourDiff catches a reclassification — still refused, different clause', () => {
  const moved = policyOf(
    [{ clause: 'W9', rule: { type: 'file_delete_protected', segments: [], basenames: ['.env'], suffixes: [] } }],
    { W9: 'Leave .env alone.' },
  );
  const diff = behaviourDiff(V1, moved, CTX);
  assert.ok(diff.reclassified.some((change) => change.label === 'delete .env' && change.before === 'DENY W1' && change.after === 'DENY W9'));
});

test('the corpus is well-formed, covers every action kind, and is never executed', () => {
  assert.ok(CORPUS.length >= 30, 'corpus should be broad enough to be evidence');
  const kinds = new Set(CORPUS.map((entry) => (entry.action as { kind?: string }).kind));
  for (const kind of ['file_delete', 'shell_command', 'http_request']) assert.ok(kinds.has(kind), `corpus lacks ${kind}`);
  assert.equal(new Set(CORPUS.map((entry) => entry.label)).size, CORPUS.length, 'labels must be unique');
  // Every entry must be evaluable — a corpus entry that crashes the engine is a broken corpus.
  for (const entry of CORPUS) {
    const verdict = evaluate(toEvaluable(V1), entry.action, CTX);
    assert.ok(['ALLOW', 'DENY'].includes(verdict.decision));
  }
});

test('the corpus carries a malformed action, so every diff proves fail-closed', () => {
  const malformed = CORPUS.filter((entry) => evaluate(toEvaluable(V1), entry.action, CTX).reason === 'INVALID_ACTION');
  assert.ok(malformed.length >= 1, 'corpus must include at least one malformed action');
  // Fail-closed is policy-independent: it must deny under both policies.
  for (const entry of malformed) {
    assert.equal(evaluate(toEvaluable(V2), entry.action, CTX).decision, 'DENY');
  }
});

test('refusedByPolicy lists what a first policy will stop', () => {
  const refused = refusedByPolicy(V1, CTX).map((row) => row.label);
  assert.ok(refused.includes('delete .env'));
  assert.ok(refused.includes('run as root'));
  assert.equal(refused.includes('run the test suite'), false);
});

test('guidance for an unmapped sentence names a capability and a concrete rewrite', () => {
  const history = guidanceFor('Never force-push, and never rewrite history.');
  assert.match(history.suggestion, /git rebase|git commit --amend|git reset --hard/);
  assert.ok(history.canExpress.length > 0);

  assert.match(guidanceFor("Don't install anything without asking.").suggestion, /npm install/);
  assert.match(guidanceFor("Don't delete anything you didn't create.").suggestion, /Provenance|name the files|Name the files/i);
  assert.match(guidanceFor("Don't do anything that costs money.").suggestion, /hosts|endpoints/i);
  assert.match(guidanceFor('Ask me before deleting.').suggestion, /approval verdict|refusal/i);
  // Unknown territory still teaches rather than shrugging.
  const generic = guidanceFor('Be nice to the codebase.');
  assert.ok(generic.canExpress.length >= 3);
  assert.match(generic.suggestion, /name the concrete thing/i);
});

test('parsePhrase understands what a human types, and refuses what it cannot', () => {
  assert.deepEqual(parsePhrase('delete .env'), { kind: 'file_delete', path: '.env' });
  assert.deepEqual(parsePhrase('write src/app.ts'), { kind: 'file_delete', path: 'src/app.ts' });
  assert.deepEqual(parsePhrase('shell git push origin main --force'), {
    kind: 'shell_command',
    command: 'git push origin main --force',
  });
  assert.deepEqual(parsePhrase('http GET https://example.com'), {
    kind: 'http_request',
    url: 'https://example.com',
    method: 'GET',
  });
  assert.deepEqual(parsePhrase('{"kind":"file_delete","path":".env"}'), { kind: 'file_delete', path: '.env' });

  // Fail closed on ambiguity: never guess a kind from content.
  for (const bad of ['', 'rm -rf /', 'delete', 'http GET', '{not json']) {
    assert.ok(isPhraseError(parsePhrase(bad)), `"${bad}" should not parse into an action`);
  }
});

test('a parsed phrase that is nonsense still fails closed in the engine', () => {
  const parsed = parsePhrase('{"kind":"file_delete"}');
  assert.equal(isPhraseError(parsed), false);
  const verdict = evaluate(toEvaluable(V1), parsed, CTX);
  assert.equal(verdict.decision, 'DENY');
  assert.equal(verdict.reason, 'INVALID_ACTION');
});
