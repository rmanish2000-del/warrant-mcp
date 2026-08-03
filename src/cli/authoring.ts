/**
 * The authoring loop — review, accept, test.
 *
 *   npm run policy:review          compile the policy source LIVE, show every
 *                                  clause and rule in plain English, show what
 *                                  changes in behaviour, then ask. Nothing that
 *                                  the hook reads is written unless accepted.
 *   npm run policy:accept          promote the reviewed draft to active.
 *                                  NEVER compiles — a file copy.
 *   npm run policy:test "<action>" dry-run one action against the active (or
 *                                  --pending) policy. Touches nothing.
 *
 * Review is the ONE place a live compile is correct: a human is present,
 * reading the result, and deciding. Enforcement never compiles, and no demo
 * path reaches this file.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { compilePolicy, COMPILER_MODEL } from '../compiler/compile.ts';
import { CACHE_PATH, readPolicyCache, writePolicyCache } from '../compiler/cache.ts';
import type { CachedPolicy } from '../compiler/cache.ts';
import { CompilerRejection } from '../compiler/schema.ts';
import { handleCheckAction } from '../server/handler.ts';
import { describeRule } from '../authoring/describe.ts';
import { behaviourDiff, refusedByPolicy } from '../authoring/diff.ts';
import { guidanceFor } from '../authoring/guidance.ts';
import { isPhraseError, parsePhrase } from '../authoring/phrase.ts';
import type { CompiledPolicy, EvaluationContext } from '../engine/types.ts';

const POLICY_PATH = fileURLToPath(new URL('../../policy.md', import.meta.url));
/** The reviewed-but-not-active draft. The server and the hook never read this file. */
const PENDING_PATH = fileURLToPath(new URL('../../policy-compiled.pending.json', import.meta.url));

const out = (text = '') => process.stdout.write(`${text}\n`);
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const OFF = '\x1b[0m';
const colour = process.stdout.isTTY ?? false;
const paint = (code: string, text: string) => (colour ? `${code}${text}${OFF}` : text);
const RULE_LINE = '─'.repeat(64);

const ctx = (): EvaluationContext => ({
  workspaceRoot: process.env.WARRANT_MCP_WORKSPACE ?? process.cwd(),
  caseInsensitivePaths: process.platform === 'win32',
});

function showPolicy(policy: CompiledPolicy): void {
  for (const clause of policy.clauses) {
    out();
    out(`  ${paint(BOLD, clause.id)}  ${paint(BOLD, clause.text)}`);
    for (const { rule } of policy.rules.filter((entry) => entry.clause === clause.id)) {
      out(`      ${paint(DIM, '→')} ${describeRule(rule)}`);
    }
  }
}

/** The unmapped experience — the moment the human most needs to be taught something. */
function showUnmapped(sentences: readonly string[]): void {
  out();
  out(paint(RED + BOLD, '  COMPILE REFUSED — nothing was written, the active policy is untouched.'));
  out();
  out(`  ${sentences.length} sentence(s) could not be expressed as an enforceable rule.`);
  out('  A policy is refused whole rather than partly enforced: a sentence that');
  out('  silently compiled to nothing would read as protection you do not have.');
  for (const sentence of sentences) {
    const guidance = guidanceFor(sentence);
    out();
    out(paint(DIM, RULE_LINE));
    out(`  ${paint(BOLD, 'This sentence:')}`);
    out(`      "${sentence}"`);
    out();
    out(`  ${paint(BOLD, 'What the rule set can express nearby:')}`);
    for (const capability of guidance.canExpress) out(`      • ${capability}`);
    out();
    out(`  ${paint(BOLD, 'Try instead:')}`);
    for (const line of guidance.suggestion.split('\n')) out(`      ${paint(GREEN, line)}`);
  }
  out(paint(DIM, RULE_LINE));
  out();
  out(`  Edit ${POLICY_PATH} and run npm run policy:review again.`);
}

function showDiff(before: CompiledPolicy, after: CompiledPolicy): void {
  const diff = behaviourDiff(before, after, ctx());
  out();
  out(paint(BOLD, '  WHAT CHANGES IN BEHAVIOUR'));
  out(paint(DIM, '  (evaluated over the repo corpus — behaviour, not wording)'));
  const rows = (title: string, changes: ReadonlyArray<{ label: string; before: string; after: string }>) => {
    if (changes.length === 0) return;
    out();
    out(`  ${paint(BOLD, title)}`);
    for (const change of changes) out(`      ${change.label}: ${change.before} → ${change.after}`);
  };
  rows('Now refused (was allowed):', diff.nowRefused);
  rows('Now allowed (was refused) — this widens authority:', diff.nowAllowed);
  rows('Still refused, different clause:', diff.reclassified);
  if (diff.nowRefused.length + diff.nowAllowed.length + diff.reclassified.length === 0) {
    out();
    out('      No behaviour change across the corpus — the wording moved, the enforcement did not.');
  }
  out();
  out(paint(DIM, `      ${diff.unchanged} of ${diff.unchanged + diff.nowRefused.length + diff.nowAllowed.length + diff.reclassified.length} corpus actions unchanged.`));
}

function showFirstPolicy(policy: CompiledPolicy): void {
  out();
  out(paint(BOLD, '  WHAT THIS POLICY WILL REFUSE'));
  out(paint(DIM, '  (evaluated over the repo corpus — there is no previous policy to compare)'));
  out();
  for (const row of refusedByPolicy(policy, ctx())) out(`      ${row.label}: ${row.outcome}`);
}

async function review(): Promise<number> {
  const policyText = readFileSync(POLICY_PATH, 'utf8');
  out(`Compiling ${POLICY_PATH} via ${COMPILER_MODEL}. This is the only command that compiles.`);
  out(paint(DIM, 'Nothing the hook reads is written unless you accept.'));
  out();

  let result;
  try {
    result = await compilePolicy(policyText);
  } catch (cause) {
    if (cause instanceof CompilerRejection && cause.stage === 'unmapped') {
      // The message carries the offending sentences, one per bullet line.
      const sentences = cause.message
        .split('\n')
        .filter((line) => line.trim().startsWith('- '))
        .map((line) => line.trim().slice(2));
      showUnmapped(sentences);
      return 1;
    }
    if (cause instanceof CompilerRejection) {
      out(paint(RED + BOLD, `  COMPILE REFUSED (${cause.stage}) — nothing was written.`));
      out(`  ${cause.message}`);
      return 1;
    }
    out(paint(RED + BOLD, '  COMPILE FAILED — nothing was written.'));
    out(`  ${(cause as Error).message}`);
    return 1;
  }

  const compiled: CompiledPolicy = { clauses: result.compiled.clauses, rules: result.compiled.rules };
  out(paint(BOLD, `  COMPILED — ${compiled.clauses.length} clauses, ${compiled.rules.length} rules, by ${result.model}.`));
  showPolicy(compiled);

  const active = readPolicyCache();
  if (active) showDiff(active.compiled, compiled);
  else showFirstPolicy(compiled);

  const draft: CachedPolicy = {
    policyText,
    compiled,
    model: result.model,
    promptVersion: result.promptVersion,
    compiledAt: new Date().toISOString(),
  };
  writePolicyCache(draft, PENDING_PATH);

  out();
  out(paint(DIM, RULE_LINE));
  out();
  if (!(process.stdin.isTTY ?? false)) {
    // Non-interactive: never guess consent. The draft waits.
    out(`  ${paint(BOLD, 'NOT ACCEPTED')} — no prompt available in a non-interactive shell.`);
    out(`  The draft is held at ${PENDING_PATH} and nothing enforces it.`);
    out('  Try it with:  npm run policy:test -- --pending "delete .env"');
    out('  Adopt it with: npm run policy:accept');
    return 0;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`  Accept this policy and make it the active one? ${paint(BOLD, '[y/N]')} `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') {
    out();
    out(`  ${paint(BOLD, 'REFUSED')} — the active policy is unchanged. Draft kept at ${PENDING_PATH}.`);
    return 0;
  }
  copyFileSync(PENDING_PATH, CACHE_PATH);
  rmSync(PENDING_PATH, { force: true });
  out();
  out(`  ${paint(GREEN + BOLD, 'ACCEPTED')} — written to ${CACHE_PATH}.`);
  out('  Commit it, then npm run demo:reset to load it into the sandbox vault.');
  return 0;
}

function accept(): number {
  if (!existsSync(PENDING_PATH)) {
    out(`No reviewed draft at ${PENDING_PATH}. Run npm run policy:review first.`);
    return 1;
  }
  // Re-validate before adopting: the draft is a file, and files can be edited.
  const draft = readPolicyCache(PENDING_PATH);
  if (!draft) {
    out(`${PENDING_PATH} did not validate — refusing to adopt it.`);
    return 1;
  }
  copyFileSync(PENDING_PATH, CACHE_PATH);
  rmSync(PENDING_PATH, { force: true });
  out(`ACCEPTED — ${CACHE_PATH} now holds the reviewed policy (compiled ${draft.compiledAt}). Nothing was compiled.`);
  out('Commit it, then npm run demo:reset to load it into the sandbox vault.');
  return 0;
}

function test(argv: readonly string[]): number {
  const usePending = argv.includes('--pending');
  const phrase = argv.filter((argument) => argument !== '--pending').join(' ');
  const parsed = parsePhrase(phrase);
  if (isPhraseError(parsed)) {
    out(`Cannot test: ${parsed.error}`);
    return 2;
  }

  const path = usePending ? PENDING_PATH : CACHE_PATH;
  const cached = existsSync(path) ? readPolicyCache(path) : null;
  if (!cached) {
    out(`No ${usePending ? 'pending draft' : 'active policy'} at ${path}.`);
    return 1;
  }

  const outcome = handleCheckAction(cached.compiled, ctx(), parsed);
  out();
  out(`  policy:   ${usePending ? 'PENDING DRAFT' : 'ACTIVE'} (compiled ${cached.compiledAt})`);
  out(`  action:   ${JSON.stringify(parsed)}`);
  out(`  workspace:${ctx().workspaceRoot}`);
  out();
  if (outcome.verdict.decision === 'ALLOW') {
    out(`  ${paint(GREEN + BOLD, 'ALLOW')} — ${outcome.sentence}`);
  } else {
    const clause = outcome.verdict.clause;
    out(`  ${paint(RED + BOLD, 'DENY')}${clause ? `   clause ${clause}` : ''}`);
    if (clause && outcome.clauseText) out(`      ${clause} — ${outcome.clauseText}`);
    out(`      ${outcome.sentence}`);
  }
  out();
  out(paint(DIM, '  Dry run: nothing was enforced, executed, or written.'));
  return 0;
}

const mode = process.argv[2];
const rest = process.argv.slice(3);
if (mode === 'review') process.exit(await review());
else if (mode === 'accept') process.exit(accept());
else if (mode === 'test') process.exit(test(rest));
else {
  out('usage: authoring.ts <review|accept|test> [args]');
  process.exit(2);
}
