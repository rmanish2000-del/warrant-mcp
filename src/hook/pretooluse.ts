/**
 * PreToolUse hook entry point — the enforcement boundary. Claude Code runs
 * this before executing a matched tool call and pipes the call's JSON on
 * stdin; a deny emitted on stdout blocks execution outright (it overrides
 * even an --allowedTools allowlist — hooks reference,
 * code.claude.com/docs/en/hooks).
 *
 * Decision surface, deliberately asymmetric:
 * - DENY  → stdout JSON permissionDecision "deny" with the projector banner
 *           as the reason. The tool call never executes.
 * - ALLOW → exit 0 with no output. The hook expresses no opinion, so Claude
 *           Code's own permission flow still applies — Warrant vetoes, it
 *           never approves.
 * - Any internal failure (no compiled policy, unreadable input) → DENY.
 *   Fail closed: this process only runs for tool calls the policy is meant
 *   to check, so "cannot check" must mean "does not run".
 *
 * Offline by construction: cached policy from disk, no network, no API.
 */
import process from 'node:process';
import { readPolicyCache } from '../compiler/cache.ts';
import { noPolicyMessage, resolvePolicy } from '../config/paths.ts';
import { assessToolCall, denyHookOutput } from './adapter.ts';
import { renderOutcome } from '../server/present.ts';
import { observeDecision } from '../record/observe.ts';
import { resolveRecordDir } from '../config/paths.ts';
import type { EvaluationContext } from '../engine/types.ts';

const deny = (reason: string): never => {
  process.stdout.write(`${JSON.stringify(denyHookOutput(reason))}\n`);
  process.stderr.write(`${reason}\n`);
  process.exit(0);
};

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

let input: Record<string, unknown>;
try {
  const parsed: unknown = JSON.parse(await readStdin());
  if (typeof parsed !== 'object' || parsed === null) throw new Error('hook input is not an object');
  input = parsed as Record<string, unknown>;
} catch (cause) {
  deny(`warrant-mcp: refusing the tool call — unreadable hook input (${(cause as Error).message}). Fail closed.`);
  throw cause; // unreachable; satisfies control flow
}

// The session's own directory decides which project's policy applies, so a
// hook shared across projects still enforces the right one.
const sessionCwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
const located = resolvePolicy(sessionCwd, process.env);
if (located === null) {
  deny(`warrant-mcp: refusing the tool call — ${noPolicyMessage(sessionCwd)}\nFail closed.`);
}
const cached = (() => {
  try {
    return readPolicyCache(located!.path);
  } catch (cause) {
    return deny(`warrant-mcp: refusing the tool call — the compiled policy failed validation (${(cause as Error).message}). Fail closed.`);
  }
})();
const policyCache =
  cached === null
    ? deny(
        `warrant-mcp: refusing the tool call — no compiled policy at ${located!.path}. ` +
          'The hook never compiles. Run "warrant-mcp init", review it, and retry. Fail closed.',
      )
    : cached;

const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';
const ctx: EvaluationContext = {
  workspaceRoot: process.env.WARRANT_MCP_WORKSPACE ?? sessionCwd,
  caseInsensitivePaths: process.platform === 'win32',
};

const assessment = assessToolCall(policyCache.compiled, ctx, toolName, input.tool_input);

// Record before deciding: `deny` exits the process, and a refusal is the line
// an auditor most needs. Recording cannot throw and its result is not read —
// a record that could block a tool call would have stopped being a record.
if (assessment.governing !== null) {
  observeDecision({
    recordDir: resolveRecordDir(located, process.env),
    policy: policyCache.compiled,
    source: 'hook',
    tool: toolName,
    action: assessment.governing.check.action,
    verdict: assessment.governing.outcome.verdict,
    at: new Date(),
  });
}

if (assessment.denied !== null) {
  deny(renderOutcome(assessment.denied, false));
}
// Nothing denied: no output, no opinion — normal permission flow applies.
process.exit(0);
