/**
 * Hook adapter — pure mapping from a Claude Code tool call to the engine's
 * action kinds, and the decision over the mapped checks. No I/O here: the
 * stdin/stdout boundary lives in pretooluse.ts. Evaluation itself is the
 * unchanged M1 engine via handleCheckAction — this module only translates.
 *
 * Mapping:
 * - Bash/PowerShell → one shell_command check for the whole command, plus a
 *                     file_delete check per candidate path the command could
 *                     destroy (see candidatePaths).
 * - Write/Edit/
 *   NotebookEdit    → a file_delete check on the target path: an overwrite
 *                     destroys what was there, so the destructive-file-op
 *                     clauses govern it.
 * - WebFetch        → an http_request GET check on the URL.
 * - mcp__*          → a file_delete check on the path argument of any tool
 *                     whose name says it writes, deletes, moves, or creates.
 *
 * Extraction policy, set by the M4 adversarial pass: **known readers are
 * skipped; everything else is swept.** For a command word that is not on the
 * reader allowlist, every quoted literal and every path-shaped argument is
 * checked. Over-checking is safe (a checked path the policy permits stays
 * permitted) and under-checking is a bypass, so ambiguity resolves toward
 * checking. This still cannot be complete — the lexer is a tokenizer, not a
 * shell parser, and it cannot see through variables, globs, or encodings.
 * README "Honest limits" names exactly what remains open.
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

/**
 * Command words that delete their path arguments. Covers the Bash spellings
 * and the PowerShell cmdlet + aliases: the M3 rehearsal caught the model
 * deleting a protected file via the PowerShell tool, which the first cut of
 * this adapter did not map at all — the hook never fired. Extraction errs
 * toward checking too much (a checked path that is allowed stays allowed).
 */
const DELETERS = new Set(['rm', 'rimraf', 'unlink', 'remove-item', 'del', 'ri', 'erase', 'rd', 'rmdir']);

/**
 * Commands that destroy or overwrite whatever their path arguments name:
 * every non-flag argument is a candidate. Found by the M4 pass — `mv`, `cp`,
 * `tee`, `sed -i`, `truncate` and the PowerShell Set-Content family each
 * achieved a forbidden outcome the earlier adapter had no opinion about.
 */
const WRITERS = new Set([
  'mv', 'move', 'move-item', 'mi',
  'cp', 'copy', 'copy-item', 'cpi', 'install',
  'tee', 'truncate', 'dd', 'sed', 'touch', 'ln',
  'set-content', 'sc', 'add-content', 'ac', 'out-file', 'clear-content', 'clc', 'new-item',
]);

/**
 * Commands that only read. These are skipped entirely, so `cat .env` is not
 * reported as a destructive operation — the refusal sentence must stay true.
 * Anything NOT on this list is swept for path-shaped arguments, which is why
 * the list is deliberately short and boring.
 */
const READERS = new Set([
  'cat', 'type', 'less', 'more', 'head', 'tail', 'wc', 'file', 'stat', 'ls', 'dir', 'pwd',
  // `find` is deliberately NOT here: `find . -name .env -delete` destroys.
  'grep', 'egrep', 'fgrep', 'rg', 'which', 'where', 'echo', 'printf', 'date', 'whoami',
  'get-content', 'gc', 'select-string', 'get-childitem', 'gci', 'get-item', 'test-path', 'measure-object',
]);

const COMMAND_SEPARATORS = new Set([';', '&&', '||', '|', '&']);
/** Redirect targets that are sinks, not files — never treated as writes. */
const NULL_SINKS = new Set(['/dev/null', 'nul', '$null']);

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

  // Split into simple commands on shell separators.
  const simples: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (COMMAND_SEPARATORS.has(token)) {
      if (current.length > 0) simples.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) simples.push(current);

  const add = (why: string, raw: string) => {
    const path = stripQuotes(raw).trim();
    if (path.length === 0 || NULL_SINKS.has(path.toLowerCase())) return;
    if (checks.some((check) => check.display.path === path)) return;
    checks.push({
      display: { kind: `${toolName} — ${why}`, path },
      action: { kind: 'file_delete', path },
    });
  };

  for (const simple of simples) {
    const head = simple[0]?.toLowerCase();
    if (head === undefined) continue;
    const bare = head.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat|ps1)$/, '');
    if (READERS.has(bare)) continue;

    const args = simple.slice(1).filter((token) => token !== '<');
    const nonFlag = args.filter((token) => !token.startsWith('-') && !token.startsWith('/'));
    const sweepsEveryArgument = DELETERS.has(bare) || WRITERS.has(bare);
    const why = DELETERS.has(bare) ? `${bare} deletes` : WRITERS.has(bare) ? `${bare} writes` : `${bare} may write`;

    // `dd of=target`, and `sed -i` treats its script as an argument, not a path.
    for (const token of args) {
      const of = /^of=(.+)$/i.exec(token);
      if (of?.[1]) add('dd writes', of[1]);
    }
    const sedInPlace = bare === 'sed' && args.some((token) => /^--?i/i.test(token));

    for (const [index, argument] of nonFlag.entries()) {
      if (sedInPlace && index === 0) continue; // the s/// script
      if (/^of=/i.test(argument)) continue; // already handled
      // Known writer/deleter: every argument is a candidate. Unknown command:
      // only path-shaped arguments, so `git status` stays quiet while
      // `find . -name .env -delete` does not.
      const pathShaped = /[\\/]/.test(argument) || argument.startsWith('.') || /\w\.\w/.test(argument);
      if (sweepsEveryArgument || pathShaped) add(why, argument);
    }

    // Quoted literals anywhere in the command — this is what catches
    // interpreter one-liners (`node -e "...unlinkSync('.env')"`) and .NET
    // static calls ([System.IO.File]::Delete("…")), both of which the M4
    // pass used to delete a protected file.
    // Nested scan: an outer "…" swallows the inner '…' of
    // `node -e "require('fs').unlinkSync('.env')"`, so each literal is
    // re-scanned for literals of the other quote style until none remain.
    let pending = [...simple];
    for (let depth = 0; depth < 4 && pending.length > 0; depth++) {
      const found: string[] = [];
      for (const token of pending) {
        for (const match of token.matchAll(/'([^']{1,400})'|"([^"]{1,400})"/g)) {
          const literal = match[1] ?? match[2] ?? '';
          if (literal.length > 0) found.push(literal);
        }
      }
      for (const literal of found) add(why, literal);
      pending = found;
    }
  }

  // Redirect targets are overwrites of the target file.
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (token !== '>' && token !== '>>') continue;
    const target = tokens[i + 1];
    if (target === undefined || COMMAND_SEPARATORS.has(target) || target === '>' || target === '>>' || target === '<') continue;
    add('writes (redirect)', target);
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
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const command = typeof input.command === 'string' ? input.command : '';
    return bashChecks(toolName, command);
  }
  // Network egress by tool. The policy's host/method clauses governed only
  // actions routed through check_action until the M4 pass fetched a
  // non-allowlisted host through the unmapped WebFetch tool.
  if (toolName === 'WebFetch') {
    const url = typeof input.url === 'string' ? input.url : '';
    return [
      { display: { kind: 'WebFetch — requests', method: 'GET', url }, action: { kind: 'http_request', url, method: 'GET' } },
    ];
  }

  // Third-party MCP tools. A connected filesystem-style server deleted a
  // protected file in the M4 pass because `mcp__*` was matched by nothing.
  // Only tools whose name says they mutate are mapped; read tools stay quiet.
  if (toolName.startsWith('mcp__')) {
    const bare = toolName.slice(toolName.lastIndexOf('__') + 2).toLowerCase();
    if (!/(delete|remove|unlink|write|create|update|edit|move|copy|rename|put|upload|save|append|truncate)/.test(bare)) {
      return [];
    }
    for (const field of ['path', 'file_path', 'filePath', 'filename', 'fileName', 'file', 'target', 'destination', 'notebook_path']) {
      const value = input[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        return [
          { display: { kind: `${toolName} — mutates`, path: value }, action: { kind: 'file_delete', path: value } },
        ];
      }
    }
    return [];
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
