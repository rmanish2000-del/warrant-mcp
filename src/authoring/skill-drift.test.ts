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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_JSON_SCHEMA } from '../compiler/schema.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SKILL_DIR = resolve(PACKAGE_ROOT, 'skills', 'warrant-policy-author');
const RULE_SET_REFERENCE = resolve(SKILL_DIR, 'references', 'rule-set.md');
const SPEC = resolve(PACKAGE_ROOT, 'SPEC.md');
const README = resolve(PACKAGE_ROOT, 'README.md');
const CLAUDE = resolve(PACKAGE_ROOT, 'CLAUDE.md');
const TEST_REGISTRATION = /(?<![\w.])test\s*\(/g;

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

test('the corpus case count in prose matches the corpus', () => {
  // README.md and spec/README.md both quote a number of conformance checks.
  // Both said 76 from the commit that created the corpus until 2026-08-19,
  // while the corpus has held 73 cases the whole time — nothing pinned it, so
  // nobody could notice. On a project whose positioning is that its author
  // counts honestly, a miscounted count on the landing page is the expensive
  // kind of wrong. Adding a case now updates this in the same commit.
  const corpus = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'spec', 'corpus.json'), 'utf8')) as {
    readonly cases: readonly unknown[];
  };
  const actual = corpus.cases.length;
  for (const doc of ['README.md', resolve('spec', 'README.md')]) {
    const text = readFileSync(resolve(PACKAGE_ROOT, doc), 'utf8');
    for (const quoted of text.matchAll(/(\d+)\s+(?:language-agnostic\s+)?checks\b/g)) {
      assert.equal(
        Number(quoted[1]),
        actual,
        `${doc} says ${quoted[1]} conformance checks; spec/corpus.json holds ${actual}`,
      );
    }
  }
});

test('the suite test count in prose matches the derived count', () => {
  // The npm test comment in README.md and the local operator guidance in
  // CLAUDE.md are both present-tense promises about the suite size. The count
  // is derivable from package.json plus the conformance corpus, so letting the
  // prose float separately is exactly the kind of drift this test file exists
  // to close.
  const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    scripts?: { test?: string };
  };
  const files = pkg.scripts?.test?.match(/\bsrc\/[^\s]+\.test\.ts\b/g) ?? [];
  assert.ok(files.length > 0, 'package.json script "test" does not enumerate any test files');

  const corpus = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'spec', 'corpus.json'), 'utf8')) as {
    readonly cases: readonly unknown[];
  };

  const stripComments = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const findBalanced = (source: string, start: number, open: string, close: string) => {
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) return i;
    }
    return -1;
  };
  const corpusLoopBodies = (source: string) => {
    const bodies: string[] = [];
    for (let i = 0; i < source.length; i += 1) {
      if (source.slice(i, i + 3) !== 'for' || /\w/.test(source[i - 1] ?? '') || /\w/.test(source[i + 3] ?? '')) continue;

      let cursor = i + 3;
      while (/\s/.test(source[cursor] ?? '')) cursor += 1;
      if (source[cursor] !== '(') continue;

      const headerEnd = findBalanced(source, cursor, '(', ')');
      assert.notEqual(headerEnd, -1, 'a for-loop header should close');
      const header = source.slice(cursor + 1, headerEnd);
      if (!/\bof\s+corpus\.cases\b/.test(header)) {
        i = headerEnd;
        continue;
      }

      cursor = headerEnd + 1;
      while (/\s/.test(source[cursor] ?? '')) cursor += 1;
      assert.equal(source[cursor], '{', 'a corpus.cases loop should open a block');

      const bodyEnd = findBalanced(source, cursor, '{', '}');
      assert.notEqual(bodyEnd, -1, 'a corpus.cases loop should close its block');
      bodies.push(source.slice(cursor + 1, bodyEnd));
      i = bodyEnd;
    }
    return bodies;
  };

  const derived = files.reduce((total, file) => {
    const stripped = stripComments(readFileSync(resolve(PACKAGE_ROOT, file), 'utf8'));
    const staticRegistrations = [...stripped.matchAll(TEST_REGISTRATION)].length;
    if (file !== 'src/spec/conformance.test.ts') return total + staticRegistrations;

    const templateLoops = corpusLoopBodies(stripped)
      .map((body) => [...body.matchAll(TEST_REGISTRATION)].length)
      .filter((count) => count > 0);
    assert.equal(
      templateLoops.length,
      1,
      'conformance.test.ts should have exactly one corpus.cases loop that registers template tests',
    );
    const templateRegistrations = templateLoops[0] ?? assert.fail('the conformance template loop should exist');
    assert.equal(
      templateRegistrations,
      1,
      'conformance.test.ts should register exactly one template test inside `for (const … of corpus.cases)`',
    );
    return total + staticRegistrations - templateRegistrations + corpus.cases.length;
  }, 0);

  // Ignore historical counts near the current-suite prose: the migration
  // labels (`M1` etc.), the retrospective "ending with … tests" sentence, and
  // any future "Suite N" captions in write-ups are not present-tense promises.
  const historicalWindow = /\bending with\b|\bM\d+\b|\bSuite \d+\b/i;
  for (const file of [README, CLAUDE]) {
    const text = readFileSync(file, 'utf8');
    const presentCounts = [...text.matchAll(/\b(\d+)\s+tests\b/g)].filter((match) => {
      const index = match.index ?? 0;
      const lineStart = text.lastIndexOf('\n', index) + 1;
      const lineEnd = text.indexOf('\n', index);
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      return !historicalWindow.test(line);
    });
    assert.ok(presentCounts.length > 0, `${file} does not contain a present-tense suite count`);
    for (const match of presentCounts) {
      assert.equal(Number(match[1]), derived, `${file} says ${match[1]} tests; the derived suite count is ${derived}`);
    }
  }
});
