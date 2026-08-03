/**
 * Stage-demo management: reset | check | permit. Fully offline — the only
 * inputs are files already in this repo; nothing here compiles, and nothing
 * here talks to a network.
 *
 *   demo:reset  — rebuild the stage sandbox to a pristine byte-exact start
 *                 (policy v1 active, sentinels in place, strays removed).
 *   demo:check  — read-only verification; prints exactly one READY /
 *                 NOT READY line last (details above it when NOT READY).
 *   demo:permit — the on-stage "policy change": copy the pre-compiled v2
 *                 cache over the active one. A file copy, never a compile.
 *
 * The sandbox lives OUTSIDE the repo (sibling directory) on purpose: Claude
 * Code resolves project settings from the git root, so a sandbox inside this
 * repo would not load its own .claude/settings.json. Proven placement in M2.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { readPolicyCache } from '../compiler/cache.ts';
import { handleCheckAction } from '../server/handler.ts';
import { renderOutcome } from '../server/present.ts';
import type { EvaluationContext } from '../engine/types.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const STAGE = resolve(REPO, '..', 'warrant-mcp-demo');
const V1_CACHE = join(REPO, 'policy-compiled.json');
const V2_CACHE = join(REPO, 'demo', 'policy-compiled.v2.json');
const HOOK = join(REPO, 'src', 'hook', 'pretooluse.ts');

const ACTIVE_POLICY = join(STAGE, 'warrant-policy.json');
const SENTINEL = join(STAGE, '.env');
const SENTINEL_CONTENT = 'DEMO_SENTINEL=still-here-because-warrant-blocked-the-delete\n';
const JUNK_FILE = join(STAGE, 'junk-dir', 'file.txt');

/** Exactly what a pristine stage contains at its top level. Anything else is a stray and is removed. */
const MANIFEST = ['.claude', '.env', 'junk-dir', 'warrant-policy.json', 'warrant-policy.v2.json'];

const fwd = (path: string): string => path.replace(/\\/g, '/');

const settingsJson = (): string =>
  `${JSON.stringify(
    {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit',
            hooks: [
              {
                type: 'command',
                command: `WARRANT_MCP_POLICY='${fwd(ACTIVE_POLICY)}' node --experimental-strip-types '${fwd(HOOK)}'`,
                timeout: 60,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  )}\n`;

const out = (text: string) => process.stdout.write(`${text}\n`);

function reset(): number {
  const started = Date.now();
  mkdirSync(join(STAGE, '.claude'), { recursive: true });
  mkdirSync(join(STAGE, 'junk-dir'), { recursive: true });

  // Remove strays so "pristine" means exactly the manifest, nothing more.
  for (const entry of readdirSync(STAGE)) {
    if (!MANIFEST.includes(entry)) rmSync(join(STAGE, entry), { recursive: true, force: true });
  }
  for (const entry of readdirSync(join(STAGE, 'junk-dir'))) {
    if (entry !== 'file.txt') rmSync(join(STAGE, 'junk-dir', entry), { recursive: true, force: true });
  }

  writeFileSync(join(STAGE, '.claude', 'settings.json'), settingsJson(), 'utf8');
  writeFileSync(SENTINEL, SENTINEL_CONTENT, 'utf8');
  writeFileSync(JUNK_FILE, 'junk\n', 'utf8');
  copyFileSync(V1_CACHE, ACTIVE_POLICY);
  copyFileSync(V2_CACHE, join(STAGE, 'warrant-policy.v2.json'));

  // Sanity: both staged caches must load and disagree about the .env delete.
  const ctx: EvaluationContext = { workspaceRoot: STAGE, caseInsensitivePaths: process.platform === 'win32' };
  const v1 = readPolicyCache(ACTIVE_POLICY);
  const v2 = readPolicyCache(join(STAGE, 'warrant-policy.v2.json'));
  if (!v1 || !v2) throw new Error('staged policy caches failed to load');
  if (handleCheckAction(v1.compiled, ctx, { kind: 'file_delete', path: '.env' }).verdict.clause !== 'W2') {
    throw new Error('staged v1 does not protect .env — wrong cache?');
  }
  if (handleCheckAction(v2.compiled, ctx, { kind: 'file_delete', path: '.env' }).verdict.decision !== 'ALLOW') {
    throw new Error('staged v2 does not permit the .env delete — wrong cache?');
  }

  out(`PRISTINE — stage reset at ${STAGE} in ${Date.now() - started}ms (policy v1 active).`);
  return 0;
}

function permit(): number {
  copyFileSync(join(STAGE, 'warrant-policy.v2.json'), ACTIVE_POLICY);
  out('POLICY v2 ACTIVE — .env is no longer protected.');
  out('(A file copy of a pre-compiled, human-reviewed cache. Nothing compiled.)');
  return 0;
}

function check(): number {
  const problems: string[] = [];
  const note = (ok: boolean, problem: string) => {
    if (!ok) problems.push(problem);
  };

  const [major, minor] = process.versions.node.split('.').map(Number);
  note((major ?? 0) > 22 || ((major ?? 0) === 22 && (minor ?? 0) >= 6), `Node >=22.6 required, found ${process.versions.node}`);

  note(existsSync(STAGE), `stage directory missing: ${STAGE} — run npm run demo:reset`);
  if (existsSync(STAGE)) {
    const entries = readdirSync(STAGE).sort();
    note(
      JSON.stringify(entries) === JSON.stringify([...MANIFEST].sort()),
      `stage is not pristine (found: ${entries.join(', ')}) — run npm run demo:reset`,
    );
    note(
      existsSync(SENTINEL) && readFileSync(SENTINEL, 'utf8') === SENTINEL_CONTENT,
      'sentinel .env missing or altered — run npm run demo:reset',
    );
    note(existsSync(JUNK_FILE), 'junk-dir/file.txt missing — run npm run demo:reset');

    const settingsPath = join(STAGE, '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      note(
        readFileSync(settingsPath, 'utf8') === settingsJson(),
        'hook settings.json does not match the expected wiring — run npm run demo:reset',
      );
    } else {
      note(false, 'hook settings.json missing — run npm run demo:reset');
    }
    note(existsSync(HOOK), `hook entry point missing: ${HOOK}`);

    if (existsSync(ACTIVE_POLICY) && existsSync(V1_CACHE)) {
      note(
        readFileSync(ACTIVE_POLICY, 'utf8') === readFileSync(V1_CACHE, 'utf8'),
        'active policy is not v1 — run npm run demo:reset',
      );
    } else {
      note(false, 'active policy cache missing — run npm run demo:reset');
    }

    // Engine pins against the staged caches (pure evaluation, no side effects).
    try {
      const ctx: EvaluationContext = { workspaceRoot: STAGE, caseInsensitivePaths: process.platform === 'win32' };
      const v1 = readPolicyCache(ACTIVE_POLICY);
      const v2 = readPolicyCache(join(STAGE, 'warrant-policy.v2.json'));
      note(v1 !== null && v2 !== null, 'staged policy caches failed validation');
      if (v1 && v2) {
        note(
          handleCheckAction(v1.compiled, ctx, { kind: 'file_delete', path: '.env' }).verdict.clause === 'W2',
          'v1 does not deny the .env delete on W2',
        );
        note(
          handleCheckAction(v1.compiled, ctx, { kind: 'shell_command', command: 'rm -rf junk-dir' }).verdict.clause === 'W4',
          'v1 does not deny rm -rf on W4',
        );
        note(
          handleCheckAction(v2.compiled, ctx, { kind: 'file_delete', path: '.env' }).verdict.decision === 'ALLOW',
          'v2 does not permit the .env delete',
        );
        // Projector legibility: the rendered DENY banner must fit 80 columns.
        const banner = renderOutcome(
          handleCheckAction(v1.compiled, ctx, { kind: 'file_delete', path: '.env' }),
          false,
        );
        const lines = banner.split('\n');
        note(
          lines.every((line) => line.length <= 80) && lines.length <= 24,
          'DENY banner no longer fits an 80x24 terminal',
        );
      }
    } catch (cause) {
      note(false, `policy validation threw: ${(cause as Error).message}`);
    }

    // Hook smoke test: feed the real hook process a synthetic PreToolUse
    // payload and require the documented deny JSON. Proves the exact command
    // the settings file runs, end to end, without a network or a session.
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm .env' },
      cwd: STAGE,
    });
    const denyRun = spawnSync(process.execPath, ['--experimental-strip-types', HOOK], {
      input: payload,
      env: { ...process.env, WARRANT_MCP_POLICY: ACTIVE_POLICY },
      encoding: 'utf8',
      timeout: 30_000,
    });
    try {
      const parsed = JSON.parse(denyRun.stdout || 'null') as {
        hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
      } | null;
      note(
        parsed?.hookSpecificOutput?.permissionDecision === 'deny' &&
          (parsed.hookSpecificOutput.permissionDecisionReason ?? '').includes('W2'),
        'hook smoke test did not deny rm .env with clause W2',
      );
    } catch {
      note(false, `hook smoke test produced no deny JSON (stderr: ${denyRun.stderr?.slice(0, 200)})`);
    }
    const allowRun = spawnSync(process.execPath, ['--experimental-strip-types', HOOK], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
        cwd: STAGE,
      }),
      env: { ...process.env, WARRANT_MCP_POLICY: ACTIVE_POLICY },
      encoding: 'utf8',
      timeout: 30_000,
    });
    note(
      allowRun.status === 0 && (allowRun.stdout ?? '').trim() === '',
      'hook smoke test: harmless command should produce no opinion (silent exit 0)',
    );
  }

  for (const problem of problems) out(`  - ${problem}`);
  if (problems.length === 0) {
    out(`READY — stage pristine at ${STAGE}, policy v1 active, hook fires, banner fits 80x24.`);
    return 0;
  }
  out(`NOT READY — ${problems.length} problem(s) above. Usual fix: npm run demo:reset`);
  return 1;
}

const mode = process.argv[2];
if (mode !== 'reset' && mode !== 'check' && mode !== 'permit') {
  out('usage: stage.ts <reset|check|permit>');
  process.exit(2);
}
process.exit(mode === 'reset' ? reset() : mode === 'permit' ? permit() : check());
