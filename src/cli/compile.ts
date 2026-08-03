/**
 * Policy compile CLI.
 *
 *   npm run policy:fresh — the ONE live compile. Calls the API (needs
 *     ANTHROPIC_API_KEY), streams the model's output, validates, writes the
 *     cache. A failed compile caches nothing and leaves any existing cache
 *     untouched.
 *   npm run policy:show — prints the cached compile. Never calls the API.
 *
 * This file is a system boundary: the only place the compiler's clock or
 * environment is read. The key stays in the environment — never printed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { compilePolicy, COMPILER_MODEL } from '../compiler/compile.ts';
import { CACHE_PATH, readPolicyCache, writePolicyCache } from '../compiler/cache.ts';
import type { CachedPolicy } from '../compiler/cache.ts';
import { CompilerRejection } from '../compiler/schema.ts';

/** Defaults compile the canonical policy; `fresh <policy.md> <out.json>` compiles a variant (e.g. the demo's v2). */
const DEFAULT_POLICY_PATH = fileURLToPath(new URL('../../policy.md', import.meta.url));
const POLICY_PATH = process.argv[3] ?? DEFAULT_POLICY_PATH;
const OUT_PATH = process.argv[4] ?? CACHE_PATH;

const out = (text: string) => process.stdout.write(text);

const COLOR = { green: '\x1b[1;32m', cyan: '\x1b[1;36m', red: '\x1b[1;31m', off: '\x1b[0m' };

const banner = (color: string, lines: string[]) => {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  out(`\n${color}${'='.repeat(width)}\n`);
  for (const line of lines) out(`  ${line}\n`);
  out(`${'='.repeat(width)}${COLOR.off}\n\n`);
};

const describe = (cache: CachedPolicy) => {
  out(`policy source: ${POLICY_PATH}\n`);
  out(`compiled at:   ${cache.compiledAt} by ${cache.model} (prompt v${cache.promptVersion})\n\n`);
  out('clauses:\n');
  for (const clause of cache.compiled.clauses) out(`  ${clause.id}  ${clause.text}\n`);
  out('\nrules (what the evaluator actually enforces):\n');
  for (const { clause, rule } of cache.compiled.rules) out(`  ${clause}  ${JSON.stringify(rule)}\n`);
  out('\n');
};

async function fresh(): Promise<number> {
  const policyText = readFileSync(POLICY_PATH, 'utf8');
  out(`Compiling ${POLICY_PATH} via ${COMPILER_MODEL} — streaming live.\n\n`);
  let inOutput = false;
  let result;
  try {
    result = await compilePolicy(policyText, {
      onThinking: (chunk) => out(chunk),
      onText: (chunk) => {
        if (!inOutput) {
          inOutput = true;
          out('\n\n--- structured policy, streaming ---\n');
        }
        out(chunk);
      },
    });
  } catch (cause) {
    if (cause instanceof CompilerRejection) {
      banner(COLOR.red, [
        'COMPILE REFUSED — FAIL CLOSED',
        `stage: ${cause.stage}`,
        ...cause.message.split('\n'),
        'Nothing was cached. Fix the policy or the prompt and re-run policy:fresh.',
      ]);
      return 1;
    }
    banner(COLOR.red, [
      'COMPILE FAILED — FAIL CLOSED',
      (cause as Error).message,
      'Nothing was cached. There is no stub fallback, deliberately.',
    ]);
    return 1;
  }
  out('\n');

  const cache: CachedPolicy = {
    policyText,
    compiled: { clauses: result.compiled.clauses, rules: result.compiled.rules },
    model: result.model,
    promptVersion: result.promptVersion,
    compiledAt: new Date().toISOString(),
  };
  writePolicyCache(cache, OUT_PATH);
  banner(COLOR.green, [`LIVE COMPILE — served by ${result.model}, cached to ${OUT_PATH}`]);
  describe(cache);
  out('Review the clauses above. The server replays this cache; it never compiles.\n');
  return 0;
}

function show(): number {
  const cached = readPolicyCache(OUT_PATH);
  if (!cached) {
    banner(COLOR.red, [
      'NO CACHED COMPILE',
      `${OUT_PATH} does not exist. policy:show NEVER compiles.`,
      'Run "npm run policy:fresh" once, review it, then use show/start freely.',
    ]);
    return 1;
  }
  banner(COLOR.cyan, [`CACHED REPLAY — compiled ${cached.compiledAt}. No API call was made.`]);
  describe(cached);
  return 0;
}

const mode = process.argv[2];
if (mode !== 'fresh' && mode !== 'show') {
  out('usage: compile.ts <fresh|show>\n');
  process.exit(2);
}
process.exit(mode === 'fresh' ? await fresh() : show());
