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
const RULE_SET_REFERENCE = resolve(PACKAGE_ROOT, 'skills', 'warrant-policy-author', 'references', 'rule-set.md');

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
