/**
 * Hook latency, measured rather than asserted.
 *
 *   node demo/bench.mjs
 *
 * Reports three things, because only the first is warrant's to improve:
 *   A  the decision itself, with the policy already in memory
 *   B  end to end — a spawned hook process, stdin to exit, which is what Claude
 *      Code actually pays per matched tool call
 *   C  `node -e 0` on the same machine, so you can see how much of B is simply
 *      Node starting up
 *
 * Run it on a quiet machine. Process spawn times move by a factor of three
 * under load, and the numbers in RESPONSES.md say which machine they came from
 * for exactly that reason.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const built = (p) => join(ROOT, 'dist', p);
const HOOK = built('hook/pretooluse.js');

if (!existsSync(HOOK)) {
  process.stderr.write('Run "npm run build" first — this measures the shipped dist/ build.\n');
  process.exit(1);
}

const { readPolicyCache } = await import(new URL('../dist/compiler/cache.js', import.meta.url));
const { decideToolCall } = await import(new URL('../dist/hook/adapter.js', import.meta.url));

const POLICY = process.env.BENCH_POLICY ?? join(ROOT, 'policy-compiled.json');
const cached = readPolicyCache(POLICY);
if (!cached) {
  process.stderr.write(`No policy at ${POLICY}. Set BENCH_POLICY, or run this from a checkout.\n`);
  process.exit(1);
}

const CWD = mkdtempSync(join(tmpdir(), 'warrant-bench-'));
writeFileSync(join(CWD, '.env'), 'x\n', 'utf8');
const ctx = { workspaceRoot: CWD, caseInsensitivePaths: process.platform === 'win32' };

const CASES = [
  ['file_delete   Write, denied', 'Write', { file_path: `${CWD}/.env`, content: 'x' }],
  ['file_delete   Write, allowed', 'Write', { file_path: `${CWD}/notes.md`, content: 'x' }],
  ['shell_command Bash, denied', 'Bash', { command: 'rm -rf build' }],
  ['shell_command Bash, allowed', 'Bash', { command: 'npm test' }],
  ['http_request  WebFetch, denied', 'WebFetch', { url: 'https://example.com' }],
  ['http_request  WebFetch, allowed', 'WebFetch', { url: 'https://api.github.com/user' }],
];

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { median: at(0.5), p95: at(0.95), max: s[s.length - 1] };
};
const ms = (n) => n.toFixed(n < 1 ? 3 : 1);
const line = (label, s) => `   ${label.padEnd(34)} median ${ms(s.median)}ms  p95 ${ms(s.p95)}ms  max ${ms(s.max)}ms`;

const IN = Number(process.env.BENCH_DECIDE ?? 20000);
const OUT = Number(process.env.BENCH_RUNS ?? 40);

console.log(`\nA. Decision only, policy already in memory (n=${IN} each)\n`);
const decideAll = [];
for (const [label, tool, input] of CASES) {
  for (let i = 0; i < 2000; i++) decideToolCall(cached.compiled, ctx, tool, input);
  const xs = [];
  for (let i = 0; i < IN; i++) {
    const t = performance.now();
    decideToolCall(cached.compiled, ctx, tool, input);
    xs.push(performance.now() - t);
  }
  decideAll.push(...xs);
  console.log(line(label, stats(xs)));
}
const dAll = stats(decideAll);
console.log(`\n   ALL ${ms(dAll.median)}ms median, ${ms(dAll.p95)}ms p95`);

console.log(`\nB. End to end: spawned hook process, stdin to exit (n=${OUT} each)\n`);
const e2eAll = [];
for (const [label, tool, input] of CASES) {
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: CWD });
  const run = () =>
    spawnSync(process.execPath, [HOOK], {
      input: payload,
      env: { ...process.env, WARRANT_MCP_POLICY: POLICY },
      encoding: 'utf8',
    });
  run();
  const xs = [];
  for (let i = 0; i < OUT; i++) {
    const t = performance.now();
    run();
    xs.push(performance.now() - t);
  }
  e2eAll.push(...xs);
  console.log(line(label, stats(xs)));
}
const eAll = stats(e2eAll);
console.log(`\n   ALL ${ms(eAll.median)}ms median, ${ms(eAll.p95)}ms p95`);

const bare = [];
for (let i = 0; i < OUT; i++) {
  const t = performance.now();
  spawnSync(process.execPath, ['-e', '0'], { encoding: 'utf8' });
  bare.push(performance.now() - t);
}
const b = stats(bare);
console.log(`\nC. Bare "node -e 0" on this machine: ${ms(b.median)}ms median, ${ms(b.p95)}ms p95`);
console.log(
  `\nAt the median: Node startup ${ms(b.median)}ms | warrant's own work ${ms(eAll.median - b.median)}ms | the decision ${ms(dAll.median)}ms`,
);
console.log(`node ${process.version} · ${process.platform} ${process.arch}\n`);
