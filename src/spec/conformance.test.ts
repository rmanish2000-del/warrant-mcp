/**
 * The conformance suite from SPEC.md, run against this repository's engine.
 *
 * The corpus (`spec/corpus.json`) is language-agnostic data, not TypeScript:
 * an implementation in any language reads the same file and must produce the
 * same decision and governing clause for every case. Running it here is what
 * makes "reference implementation" a checkable claim rather than a courtesy —
 * if the engine and the specification disagree, this goes red.
 *
 * Note what this does NOT do. It never enforces anything, spawns anything, or
 * touches a file beyond reading the corpus. Enforcement is deliberately out of
 * the spec's scope (SPEC.md section 1), so it is out of the suite's scope too.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../engine/evaluate.ts';
import type { CompiledRule, EvaluationContext } from '../engine/types.ts';
import { POLICY_JSON_SCHEMA } from '../compiler/schema.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORPUS_PATH = resolve(PACKAGE_ROOT, 'spec', 'corpus.json');

interface ConformanceCase {
  readonly id: string;
  readonly spec: string;
  readonly description: string;
  readonly context: EvaluationContext;
  readonly rules: readonly CompiledRule[];
  readonly action: unknown;
  readonly expect: {
    readonly decision: 'ALLOW' | 'DENY';
    readonly clause: string | null;
    readonly reason?: 'INVALID_ACTION';
  };
}

interface Corpus {
  readonly specVersion: string;
  readonly cases: readonly ConformanceCase[];
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;

/**
 * SPEC.md section 4.5 requires rules to be ordered by ascending clause number
 * before evaluation, preserving artifact order within a clause. In this
 * implementation that ordering is the loader's job (`parseCompiledPolicy` in
 * src/compiler/schema.ts) rather than the evaluator's, so the runner does it
 * here — the corpus is an artifact, and this is the step that turns an artifact
 * into an evaluable policy.
 */
function toEvaluableInSpecOrder(rules: readonly CompiledRule[]): { readonly rules: readonly CompiledRule[] } {
  const clauseNumber = (id: string) => Number.parseInt(id.slice(1), 10);
  return { rules: [...rules].sort((a, b) => clauseNumber(a.clause) - clauseNumber(b.clause)) };
}

test('the corpus is well formed and its ids are unique', () => {
  assert.equal(corpus.specVersion, '0.1.0', 'corpus specVersion should match the version SPEC.md declares');
  assert.ok(corpus.cases.length > 0, 'the corpus is empty');
  const ids = corpus.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'two conformance cases share an id');
  for (const c of corpus.cases) {
    assert.ok(c.description.length > 0, `case "${c.id}" has no description — a case nobody can read is a case nobody can port`);
    assert.ok(typeof c.spec === 'string' && c.spec.length > 0, `case "${c.id}" does not name the SPEC.md section it pins`);
  }
});

for (const testCase of corpus.cases) {
  test(`conformance: ${testCase.id} — ${testCase.description}`, () => {
    const verdict = evaluate(toEvaluableInSpecOrder(testCase.rules), testCase.action, testCase.context);
    assert.equal(verdict.decision, testCase.expect.decision, `${testCase.id}: wrong decision (SPEC.md ${testCase.spec})`);
    assert.equal(verdict.clause, testCase.expect.clause, `${testCase.id}: wrong governing clause (SPEC.md ${testCase.spec})`);
    assert.equal(verdict.reason, testCase.expect.reason ?? null, `${testCase.id}: wrong reason (SPEC.md ${testCase.spec})`);
  });
}

test('the corpus exercises every rule type the schema defines', () => {
  // A rule type added without a conformance case would be unspecified
  // behaviour that still shipped — the exact drift this suite exists to catch.
  const variants = POLICY_JSON_SCHEMA.properties.rules.items.properties.rule.anyOf as ReadonlyArray<{
    properties: { type: { const: string } };
  }>;
  const exercised = new Set(corpus.cases.flatMap((c) => c.rules.map((r) => r.rule.type)));
  for (const variant of variants) {
    assert.ok(
      exercised.has(variant.properties.type.const as never),
      `rule type "${variant.properties.type.const}" has no conformance case — add one to spec/corpus.json`,
    );
  }
});

test('the corpus covers both verdicts and the invalid-action path', () => {
  const decisions = new Set(corpus.cases.map((c) => c.expect.decision));
  assert.ok(decisions.has('ALLOW') && decisions.has('DENY'), 'a suite that never allows anything proves nothing about denial');
  assert.ok(
    corpus.cases.some((c) => c.expect.reason === 'INVALID_ACTION'),
    'no case pins the fail-closed path (SPEC.md section 5)',
  );
});
