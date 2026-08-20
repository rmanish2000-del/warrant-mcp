/**
 * The coupling the skill's placement rests on, enforced. The
 * policy-authoring skill ships inside this package BECAUSE the rule
 * vocabulary and the text that teaches it must change in the same commit —
 * this test is what makes that an invariant instead of an intention.
 *
 * Names only, never prose: it fails when a rule type exists in the schema
 * that the skill's reference does not document, when the reference documents
 * a type the schema no longer has, or when a rule's field name never appears
 * in the reference. It cannot tell whether an explanation is right, whether
 * matching semantics are described accurately, or whether SKILL.md,
 * failure-shapes.md and worked-example.md have gone stale — a human reading
 * the diff is still the check for those.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_JSON_SCHEMA } from '../compiler/schema.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKILL_DIR = resolve(PACKAGE_ROOT, 'skills', 'warrant-policy-author');
const RULE_SET_REFERENCE = resolve(SKILL_DIR, 'references', 'rule-set.md');
const SPEC = resolve(PACKAGE_ROOT, 'SPEC.md');

interface RuleVariant {
  readonly required: readonly string[];
  readonly properties: { readonly type: { readonly const: string } };
}

const variants = POLICY_JSON_SCHEMA.properties.rules.items.properties.rule
  .anyOf as ReadonlyArray<RuleVariant>;

test('every schema rule type is documented in the skill reference, and none extra', () => {
  const schemaTypes = variants.map((variant) => variant.properties.type.const).sort();
  assert.ok(schemaTypes.length > 0, 'no rule variants found in the schema — the extraction is broken, not the skill');

  const reference = readFileSync(RULE_SET_REFERENCE, 'utf8');
  const documented = [...reference.matchAll(/^### `([a-z_]+)`/gm)].map((match) => match[1] as string).sort();

  assert.deepEqual(new Set(documented).size, documented.length, 'the reference documents a rule type twice');
  for (const type of schemaTypes) {
    assert.ok(
      documented.includes(type),
      `schema rule type "${type}" is not documented in the skill reference — add a \`### ${type}\` section to ${RULE_SET_REFERENCE}`,
    );
  }
  for (const type of documented) {
    assert.ok(
      schemaTypes.includes(type),
      `the skill reference documents "${type}", which no longer exists in schema.ts — the skill is teaching a vocabulary the compiler does not speak`,
    );
  }
});

test('every rule field name appears in the skill reference', () => {
  const reference = readFileSync(RULE_SET_REFERENCE, 'utf8');
  for (const variant of variants) {
    for (const field of variant.required.filter((name) => name !== 'type')) {
      assert.ok(
        reference.includes(`\`${field}\``),
        `field "${field}" of rule "${variant.properties.type.const}" is never named in the skill reference`,
      );
    }
  }
});

test('SPEC.md specifies exactly the rule types the schema defines, and no others', () => {
  // SPEC.md is versioned separately and invites implementations in other
  // languages. A rule type the schema has and the spec does not is behaviour
  // nobody outside this repo could reproduce; a rule type the spec has and the
  // schema does not is a promise to an implementer that this codebase breaks.
  // Names only — whether section 3.3.5 describes matching correctly is a
  // human's read, and the conformance corpus is what makes it checkable.
  const schemaTypes = variants.map((variant) => variant.properties.type.const).sort();
  const spec = readFileSync(SPEC, 'utf8');
  const specified = [...spec.matchAll(/^#### 3\.3\.\d+ `([a-z_]+)`/gm)].map((match) => match[1] as string).sort();

  assert.equal(new Set(specified).size, specified.length, 'SPEC.md gives a rule type two sections');
  for (const type of schemaTypes) {
    assert.ok(
      specified.includes(type),
      `schema rule type "${type}" has no section in SPEC.md — add a "#### 3.3.N \`${type}\`" section, and a case in spec/corpus.json`,
    );
  }
  for (const type of specified) {
    assert.ok(
      schemaTypes.includes(type),
      `SPEC.md specifies "${type}", which schema.ts no longer defines — the specification is describing a format this implementation does not implement`,
    );
  }
});

test('every rule field name is named in SPEC.md', () => {
  const spec = readFileSync(SPEC, 'utf8');
  for (const variant of variants) {
    for (const field of variant.required.filter((name) => name !== 'type')) {
      assert.ok(
        spec.includes(`\`${field}\``),
        `field "${field}" of rule "${variant.properties.type.const}" is never named in SPEC.md — an implementer reading only the spec would omit it`,
      );
    }
  }
});

test('SPEC.md and the conformance corpus agree on the spec version', () => {
  const spec = readFileSync(SPEC, 'utf8');
  const declared = /\*\*Spec version (\d+\.\d+\.\d+)\.\*\*/.exec(spec)?.[1];
  assert.ok(declared, 'SPEC.md does not declare a spec version in the expected form');
  const corpus = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'spec', 'corpus.json'), 'utf8')) as {
    specVersion: string;
  };
  assert.equal(
    corpus.specVersion,
    declared,
    'spec/corpus.json pins a different spec version than SPEC.md declares — a suite that claims to test a version it was not written for',
  );
});

test('the marketplace manifest points at skill folders that exist, and npm ships them', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
  ) as { plugins: Array<{ name: string; skills?: string[] }> };
  for (const plugin of manifest.plugins) {
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = resolve(PACKAGE_ROOT, skillPath);
      assert.ok(existsSync(resolve(skillDir, 'SKILL.md')), `marketplace plugin "${plugin.name}" points at ${skillPath}, which has no SKILL.md`);
    }
  }
  const packageJson = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as { files: string[] };
  assert.ok(packageJson.files.includes('skills/'), 'package.json "files" no longer ships skills/ — npm installs would lose the skill');
});

test('the rule-type count stated in prose matches the schema', () => {
  // The count is written out in words in two places a reader trusts, and a
  // number in prose is the first thing to go stale when a rule type is added.
  const n = variants.length;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const spelled = words[n] ?? String(n);
  for (const [label, file] of [
    ['the skill reference', RULE_SET_REFERENCE],
    ['the README', resolve(PACKAGE_ROOT, 'README.md')],
    ['SPEC.md', SPEC],
  ] as const) {
    assert.match(
      readFileSync(file, 'utf8'),
      // Tolerant of wording ("eight rule types", "eight closed rule types"),
      // strict about the number.
      new RegExp(`${spelled}[^.\n]{0,20}rule types`, 'i'),
      `${label} should say "${spelled} … rule types" — the schema has ${n}`,
    );
  }
});

test('nothing shipped promises that a policy will compile', () => {
  // SKILL.md's own constraint 2 forbids the skill from claiming a sentence
  // compiles, and the README repeats the promise to the reader. Only
  // `warrant-mcp review` can determine it, so a description that says
  // otherwise is the package contradicting itself in the place a user reads
  // first.
  const PROMISE = /compiles? on the first attempt/i;
  const skill = readFileSync(resolve(SKILL_DIR, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? '';
  assert.ok(frontmatter.length > 0, 'SKILL.md has no frontmatter — the description is what a marketplace shows');
  assert.doesNotMatch(
    frontmatter,
    PROMISE,
    'the skill description promises first-attempt compilation, which only `warrant-mcp review` can determine',
  );
  assert.doesNotMatch(
    readFileSync(resolve(PACKAGE_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'),
    PROMISE,
    'the marketplace manifest promises first-attempt compilation',
  );
});

test('the plugin ships the skill and nothing else that auto-loads', () => {
  // The marketplace entry sets `source: "./"`, so the repository root IS the
  // plugin root — and Claude Code loads a plugin's `.mcp.json` and `hooks/`
  // from there. A `.mcp.json` at the root therefore wires an MCP server into
  // every install, which the README explicitly promises the plugin does not
  // do, and which would point at a policy the installing project has not got.
  //
  // Found by running `claude plugin install` and reading the component
  // inventory: it said "MCP servers (1)". Verified against the plugin cache.
  for (const autoloaded of ['.mcp.json', 'hooks']) {
    assert.ok(
      !existsSync(resolve(PACKAGE_ROOT, autoloaded)),
      `${autoloaded} at the repository root is loaded by the plugin, contradicting the README's promise that the plugin wires neither the MCP server nor the hook. Keep dev config out of the plugin root.`,
    );
  }
});

/*
 * COUNT DRIFT — the guard for a class, not for the two instances that exposed it.
 *
 * A number written in prose is a report about an artefact. Twice now the report
 * was believed and the artefact was never read: README and spec/README.md said
 * the conformance corpus holds 76 checks from the commit that created it, and it
 * has always held 73; STATE.md said 227 tests while the suite stood at 244.
 * Nothing failed, because nothing compared the sentence to the thing.
 *
 * Two kinds of count live in these documents and they need opposite treatment.
 *
 *   PINNED — a count with a cheap, exact source of truth in the repository.
 *   The corpus size and the compiled policy's clause and rule totals are read
 *   from the artefacts themselves below, never from a second constant here: a
 *   guard that needs hand-updating is the same defect wearing a test's clothes.
 *
 *   FORBIDDEN — the suite's own test total. Its only honest source of truth is
 *   running the suite, which this test is inside of, so any derivation would be
 *   a model of the runner rather than a measurement. A number that cannot be
 *   checked should not be asserted, so the documents now point at `npm test`
 *   instead of quoting it, and this guard fails if a quoted total comes back.
 *   That is also what makes the guard indifferent to merge order: a PR that adds
 *   tests cannot invalidate a sentence that no longer states a total.
 *
 * Historical counts are deliberately untouched and must stay readable: README's
 * "M1 through M7, ending with 77 tests", SECURITY-SURFACE's "it is **77** as of
 * M7 — `npm test` is the current figure, and this line is not", and every
 * CHANGELOG entry. Those describe a moment on purpose. The patterns below match
 * the live phrasings only, and CHANGELOG.md is excluded outright, because a
 * changelog that updated itself would stop being a record.
 */

const PROSE_DOCS = ['README.md', 'CLAUDE.md', 'STATE.md', join('spec', 'README.md')];

const readDoc = (relative: string): string =>
  readFileSync(resolve(PACKAGE_ROOT, relative), 'utf8');

test('a prose count of the conformance corpus matches the corpus itself', () => {
  const corpus = JSON.parse(readDoc(join('spec', 'corpus.json'))) as { readonly cases: readonly unknown[] };
  const actual = corpus.cases.length;
  let asserted = 0;
  for (const doc of PROSE_DOCS) {
    for (const quoted of readDoc(doc).matchAll(/(\d+)\s+(?:language-agnostic\s+)?checks\b/g)) {
      asserted += 1;
      assert.equal(
        Number(quoted[1]),
        actual,
        `${doc} says ${quoted[1]} conformance checks; spec/corpus.json holds ${actual}`,
      );
    }
  }
  assert.ok(asserted > 0, 'no document states the corpus size any more — if that was deliberate, delete this test rather than leaving it green over nothing');
});

test('a prose count of the compiled policy matches the compiled policy', () => {
  const cache = JSON.parse(readDoc('policy-compiled.json')) as {
    readonly compiled: { readonly clauses: readonly unknown[]; readonly rules: readonly unknown[] };
  };
  const clauses = cache.compiled.clauses.length;
  const rules = cache.compiled.rules.length;
  for (const doc of PROSE_DOCS) {
    for (const quoted of readDoc(doc).matchAll(/(\d+)\s+clauses?,\s*(\d+)\s+rules?\b/g)) {
      assert.equal(Number(quoted[1]), clauses, `${doc} says ${quoted[1]} clauses; policy-compiled.json has ${clauses}`);
      assert.equal(Number(quoted[2]), rules, `${doc} says ${quoted[2]} rules; policy-compiled.json has ${rules}`);
    }
  }
});

test('no document quotes a suite test total, because nothing can check one', () => {
  // Matches the live phrasings that stated a total — "**244 tests**" and the
  // "# 244 tests" comment in the quickstart block. It does not match the
  // historical sentences, which say "ending with 77 tests" and "**77** as of
  // M7", and CHANGELOG.md is not in PROSE_DOCS at all.
  for (const doc of PROSE_DOCS) {
    for (const pattern of [/\*\*(\d+)\s+tests\*\*/g, /#\s*(\d+)\s+tests\b/g]) {
      for (const quoted of readDoc(doc).matchAll(pattern)) {
        assert.fail(
          `${doc} quotes a suite total of ${quoted[1]} tests. That number goes stale on the next commit that adds a test and nothing can verify it — point at \`npm test\`, which prints its own total, instead.`,
        );
      }
    }
  }
});
