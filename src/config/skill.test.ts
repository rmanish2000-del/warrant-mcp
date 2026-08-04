/**
 * The skill describes the rule vocabulary to a model. The schema *is* the rule
 * vocabulary. They ship in the same package, from different files, and nothing
 * stops one changing without the other — which is the failure that matters,
 * because a skill teaching a rule type the compiler does not have produces
 * policies that are refused, and a skill missing a type produces policies that
 * are needlessly narrow.
 *
 * `rule-set.md` says "if this file and the schema ever disagree, the schema
 * wins". This is what enforces that sentence.
 *
 * Read as source text rather than imported, the same way guard.test.ts reads
 * the deciding modules: `RULE_TYPES` is module-local and should stay that way.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const SCHEMA = read('../compiler/schema.ts');
const RULE_SET_DOC = read('../../skills/warrant-policy-author/references/rule-set.md');
const SKILL = read('../../skills/warrant-policy-author/SKILL.md');

/** The closed rule set, taken from the schema's own list. */
function ruleTypesFromSchema(): string[] {
  const block = /const RULE_TYPES = \[([\s\S]*?)\] as const;/.exec(SCHEMA);
  assert.ok(block?.[1], 'could not find RULE_TYPES in schema.ts — this test needs updating, not deleting');
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
}

test('the skill documents exactly the rule types the schema accepts', () => {
  const schemaTypes = ruleTypesFromSchema();
  assert.ok(schemaTypes.length > 0);

  // Every type the compiler accepts must be documented, or the skill writes
  // policies that are narrower than they need to be.
  for (const type of schemaTypes) {
    assert.ok(
      RULE_SET_DOC.includes(`\`${type}\``),
      `rule type "${type}" exists in schema.ts but is not documented in the skill's rule-set.md`,
    );
  }

  // And every type the skill documents must exist, or it teaches a vocabulary
  // the compiler will refuse.
  const documented = [...RULE_SET_DOC.matchAll(/^### `([a-z_]+)`/gm)].map((m) => m[1] as string);
  assert.ok(documented.length > 0, 'no rule-type headings found in rule-set.md');
  for (const type of documented) {
    assert.ok(
      schemaTypes.includes(type),
      `the skill documents "${type}", which schema.ts does not accept`,
    );
  }
  assert.deepEqual([...documented].sort(), [...schemaTypes].sort());
});

test('the counts the skill and the README state match the schema', () => {
  const n = ruleTypesFromSchema().length;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const spelled = words[n] ?? String(n);
  // "Eight rule types" appears in the skill, and in the README's table intro.
  assert.match(
    RULE_SET_DOC,
    new RegExp(`${spelled} rule types`, 'i'),
    `rule-set.md should say "${spelled} rule types" — the schema has ${n}`,
  );
  const README = read('../../README.md');
  // Tolerant of wording ("eight rule types", "eight closed rule types"), strict
  // about the number — the number is the thing that goes stale.
  assert.match(
    README,
    new RegExp(`${spelled}[^.\n]{0,20}rule types`, 'i'),
    `README should say "${spelled} … rule types" — the schema has ${n}`,
  );
});

test('the invocation rule fields the skill names are the fields the schema requires', () => {
  // The one rule with a non-obvious shape, and the one most likely to drift.
  const required = /required: \['type', 'command', 'subcommands', 'anyFlag', 'anyArgument'\]/.test(SCHEMA);
  assert.ok(required, 'shell_forbidden_invocation required fields changed in schema.ts');
  for (const field of ['command', 'subcommands', 'anyFlag', 'anyArgument']) {
    assert.ok(
      RULE_SET_DOC.includes(`\`${field}\``),
      `the skill's rule-set.md does not name the "${field}" field`,
    );
  }
});

test('the skill never promises that a sentence will compile', () => {
  // Its own constraint 2, and the README repeats it. A description that
  // promises first-attempt compilation contradicts both, and the compiler is
  // the only thing entitled to say a policy compiles.
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(SKILL)?.[1] ?? '';
  assert.doesNotMatch(
    frontmatter,
    /compiles? on the first attempt/i,
    'the skill description promises first-attempt compilation, which only `warrant-mcp review` can determine',
  );
  const manifest = fileURLToPath(new URL('../../.claude-plugin/marketplace.json', import.meta.url));
  if (existsSync(manifest)) {
    assert.doesNotMatch(
      readFileSync(manifest, 'utf8'),
      /compiles? on the first attempt/i,
      'the marketplace manifest promises first-attempt compilation',
    );
  }
});

test('the skill is reachable where the package and the plugin both say it is', () => {
  // `files` ships `skills/`, `init --skill` copies this folder, and the
  // marketplace manifest points at this path. All three break together.
  for (const file of ['SKILL.md', 'references/rule-set.md', 'references/failure-shapes.md']) {
    assert.ok(
      existsSync(fileURLToPath(new URL(`../../skills/warrant-policy-author/${file}`, import.meta.url))),
      `${file} is missing from the skill folder`,
    );
  }
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../.claude-plugin/marketplace.json', import.meta.url)), 'utf8'),
  ) as { plugins: Array<{ skills?: string[] }> };
  const declared = manifest.plugins.flatMap((p) => p.skills ?? []);
  assert.deepEqual(declared, ['./skills/warrant-policy-author']);
});
