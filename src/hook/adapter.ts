/**
 * Hook adapter — pure mapping from a Claude Code tool call to the engine's
 * action kinds, and the decision over the mapped checks. No I/O here: the
 * stdin/stdout boundary lives in pretooluse.ts. Evaluation itself is the
 * unchanged M1 engine via handleCheckAction — this module only translates.
 *
 * Mapping:
 * - Bash            → one shell_command check for the whole command, plus a
 *                     file_delete check per path an rm-family command deletes,
 *                     plus a file_delete check per redirect target (`> file`
 *                     overwrites — destructive to existing content).
 * - Write/Edit/
 *   NotebookEdit    → a file_delete check on the target path: an overwrite
 *                     destroys what was there, so the destructive-file-op
 *                     clauses govern it.
 *
 * The lexer is a tokenizer, not a shell parser — same honesty as the engine's
 * shell rules; the README names the limits.
 */
import { handleCheckAction } from '../server/handler.ts';
import type { CheckOutcome } from '../server/handler.ts';
import type { CompiledPolicy, EvaluationContext } from '../engine/types.ts';

export interface MappedCheck {
  /** What the banner shows as "refused:" — tool-level, human wording. */
  readonly display: Readonly<Record<string, string>>;
  /** The structured action the engine evaluates. */
  readonly action: unknown;
}

const DELETERS = new Set(['rm', 'rimraf', 'unlink']);
const COMMAND_SEPARATORS = new Set([';', '&&', '||', '|', '&']);
/** Redirect targets that are sinks, not files — never treated as writes. */
const NULL_SINKS = new Set(['/dev/null', 'nul']);

const stripQuotes = (value: string): string => value.replace(/^['"]|['"]$/g, '');

/** Isolate shell operators even when unspaced; `>>` stays one token. */
function lex(command: string): string[] {
  return command
    .replace(/(>>|\|\||&&|[;|&<>])/g, ' $1 ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function bashChecks(toolName: string, command: string): MappedCheck[] {
  const checks: MappedCheck[] = [
    {
      display: { kind: `${toolName} command`, command },
      action: { kind: 'shell_command', command },
    },
  ];

  const tokens = lex(command);

  // Simple commands between separators; rm-family arguments are deletions.
  let current: string[] = [];
  const simples: string[][] = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (current.length > 0) simples.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) simples.push(current);
  for (const simple of simples) {
    const head = simple[0]?.toLowerCase();
    if (head === undefined || !DELETERS.has(head)) continue;
    for (const argument of simple.slice(1)) {
      if (argument.startsWith('-') || argument === '>' || argument === '>>' || argument === '<') continue;
      const path = stripQuotes(argument);
      if (path.length === 0) continue;
      checks.push({
        display: { kind: `${toolName} — ${head} deletes`, path },
        action: { kind: 'file_delete', path },
      });
    }
  }

  // Redirect targets are overwrites of the target file.
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (token !== '>' && token !== '>>') continue;
    const target = tokens[i + 1];
    if (target === undefined || COMMAND_SEPARATORS.has(target) || target === '>' || target === '>>' || target === '<') continue;
    const path = stripQuotes(target);
    if (path.length === 0 || NULL_SINKS.has(path.toLowerCase())) continue;
    checks.push({
      display: { kind: `${toolName} — writes (redirect)`, path },
      action: { kind: 'file_delete', path },
    });
  }

  return checks;
}

/** file-writing tools and the field naming their target path. */
const FILE_TOOL_PATH_FIELDS: Readonly<Record<string, string>> = {
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

/**
 * All checks a tool call must pass, in citation-priority order (whole-command
 * clauses before extracted file operations). Unknown tools map to nothing —
 * the hook stays silent and the normal permission flow applies.
 */
export function mapToolCall(toolName: string, toolInput: unknown): MappedCheck[] {
  const input =
    typeof toolInput === 'object' && toolInput !== null ? (toolInput as Record<string, unknown>) : {};
  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    return bashChecks(toolName, command);
  }
  const pathField = FILE_TOOL_PATH_FIELDS[toolName];
  if (pathField !== undefined) {
    // A missing/empty path maps to an invalid action, which fails closed.
    const path = typeof input[pathField] === 'string' ? (input[pathField] as string) : '';
    return [
      {
        display: { kind: `${toolName} — writes the file`, path },
        action: { kind: 'file_delete', path },
      },
    ];
  }
  return [];
}

/**
 * Evaluate every mapped check; the first DENY decides the tool call. Returns
 * null when nothing is denied — the hook then expresses NO opinion (it never
 * auto-approves; Claude Code's own permission flow still applies).
 */
export function decideToolCall(
  policy: CompiledPolicy,
  ctx: EvaluationContext,
  toolName: string,
  toolInput: unknown,
): CheckOutcome | null {
  for (const check of mapToolCall(toolName, toolInput)) {
    const outcome = handleCheckAction(policy, ctx, check.action);
    if (outcome.verdict.decision === 'DENY') {
      return { ...outcome, requested: check.display };
    }
  }
  return null;
}

/** The exact PreToolUse deny shape from the hooks reference (code.claude.com/docs/en/hooks). */
export function denyHookOutput(reason: string): {
  readonly hookSpecificOutput: {
    readonly hookEventName: 'PreToolUse';
    readonly permissionDecision: 'deny';
    readonly permissionDecisionReason: string;
  };
} {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}
