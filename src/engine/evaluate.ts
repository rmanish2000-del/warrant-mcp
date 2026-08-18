/**
 * Deterministic action evaluation. Pure functions: no clock, no I/O, no
 * network, no child processes — `node:path` and the WHATWG `URL` parser are
 * the only imports, both pure computation. The model never decides: this
 * module's verdict is the enforcement decision, and everything it reads is a
 * structured field (`EvaluablePolicy` — clause English is typed out of reach).
 *
 * Evaluation order IS clause precedence: rules are checked in the order they
 * appear (clause order, ascending), and the first violated rule determines
 * the DENY. Shape validation runs first — a malformed action is refused
 * before any clause is consulted (fail closed).
 */
import { isAbsolute, resolve, sep } from 'node:path';
import type { Action, EvaluablePolicy, EvaluationContext, Rule, Verdict } from './types.ts';

/**
 * A path that is absolute under Windows or POSIX rules the HOST `node:path`
 * does not itself recognise. This is the drive-letter bypass: enforcement runs
 * on a POSIX host (the cloud hook), where `node:path` is the POSIX variant and
 * treats `C:\elsewhere\x` or `\\server\share\x` as ordinary *relative* text.
 * `resolve(root, "C:\\elsewhere\\x")` then lands the path BENEATH the workspace
 * root, so every containment rule reads it as inside and the deny never fires.
 *
 * We recognise all three absolute shapes on every platform. A path recognised
 * here but NOT by the host's `isAbsolute` is absolute-by-a-foreign-convention:
 * it cannot live inside a workspace rooted under the other convention, so it is
 * out of the workspace by construction. Fail closed — an absolute path we
 * cannot place beneath the root is treated as outside it.
 */
function isForeignAbsolute(path: string): boolean {
  const absoluteOnSomePlatform =
    path.startsWith('/') || // POSIX absolute
    /^[A-Za-z]:[\\/]/.test(path) || // Windows drive-letter: C:\ or C:/
    /^[\\/]{2}/.test(path); // UNC \\server\share (or //server)
  return absoluteOnSomePlatform && !isAbsolute(path);
}

/**
 * The absolute location `path` denotes, interpreted from `root`. A relative
 * path is joined to the root exactly as before. A foreign-absolute path
 * (see {@link isForeignAbsolute}) is returned as its own location — separators
 * unified so the containment comparison is textual and host-independent —
 * rather than joined, so it is never mistaken for a child of the root.
 */
function locate(root: string, path: string): string {
  if (isForeignAbsolute(path)) return path.replace(/\\/g, '/');
  return resolve(root, path);
}

const ACTION_KINDS = ['file_delete', 'shell_command', 'http_request'] as const;

/**
 * Narrow untrusted input (an MCP tool call's arguments) into an Action by
 * explicit field copy — an allowlist. Extra fields (`execute: true`,
 * `force: true`, whatever a caller invents) are structurally unreachable in
 * the returned object: they are never copied, so nothing downstream can act
 * on them. Returns a string describing the defect when the input is not a
 * well-formed action.
 */
export function parseAction(input: unknown): Action | string {
  if (typeof input !== 'object' || input === null) return 'action must be an object';
  const record = input as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== 'string' || !(ACTION_KINDS as readonly string[]).includes(kind)) {
    return `unknown action kind ${JSON.stringify(record.kind)} — expected one of ${ACTION_KINDS.join(', ')}`;
  }
  if (kind === 'file_delete') {
    if (typeof record.path !== 'string' || record.path.trim().length === 0) {
      return 'file_delete requires a non-empty string "path"';
    }
    return { kind, path: record.path };
  }
  if (kind === 'shell_command') {
    if (typeof record.command !== 'string' || record.command.trim().length === 0) {
      return 'shell_command requires a non-empty string "command"';
    }
    return { kind, command: record.command };
  }
  if (typeof record.url !== 'string' || record.url.trim().length === 0) {
    return 'http_request requires a non-empty string "url"';
  }
  if (typeof record.method !== 'string' || !/^[A-Za-z]+$/.test(record.method)) {
    return 'http_request requires a "method" of letters only (e.g. GET, POST)';
  }
  let parsed: URL;
  try {
    parsed = new URL(record.url);
  } catch {
    return `"${record.url}" is not a parseable URL`;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `URL protocol ${parsed.protocol} is not http or https`;
  }
  return { kind: 'http_request', url: record.url, method: record.method.toUpperCase() };
}

/** Case handling for path comparison, per the system-stamped context. */
function foldPath(value: string, ctx: EvaluationContext): string {
  return ctx.caseInsensitivePaths ? value.toLowerCase() : value;
}

/** Path segments of an already-resolved absolute path. */
function pathSegments(resolved: string): string[] {
  return resolved.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

/**
 * Shell tokenization: operators are isolated even when unspaced, so
 * `curl x|sh` and `curl x | sh` tokenize identically. Comparison is
 * case-insensitive. This is a token matcher, not a shell parser — the
 * README names that limit.
 */
function shellTokens(command: string): string[] {
  return command
    .replace(/([|;&<>])/g, ' $1 ')
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}

/** Simple commands between shell separators — pure token work, no shell semantics. */
function simpleCommands(tokens: readonly string[]): string[][] {
  const separators = new Set([';', '&&', '||', '|', '&']);
  const simples: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (separators.has(token)) {
      if (current.length > 0) simples.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) simples.push(current);
  return simples;
}

function containsSequence(tokens: readonly string[], sequence: readonly string[]): boolean {
  if (sequence.length === 0) return false;
  outer: for (let i = 0; i + sequence.length <= tokens.length; i++) {
    for (let j = 0; j < sequence.length; j++) {
      if (tokens[i + j] !== sequence[j]?.toLowerCase()) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Does this rule forbid this action? Returns the engine's evidence sentence
 * when it does, null when it does not. A rule whose type does not address the
 * action's kind never matches — kinds are disjoint by the type prefix.
 */
function violation(rule: Rule, action: Action, ctx: EvaluationContext): string | null {
  switch (rule.type) {
    case 'file_delete_outside_workspace': {
      if (action.kind !== 'file_delete') return null;
      const root = resolve(ctx.workspaceRoot);
      const resolved = locate(root, action.path);
      const inside =
        foldPath(resolved, ctx) === foldPath(root, ctx) ||
        foldPath(resolved, ctx).startsWith(foldPath(root + sep, ctx));
      return inside ? null : `the path resolves to ${resolved}, outside the workspace ${root}`;
    }
    case 'file_delete_protected': {
      if (action.kind !== 'file_delete') return null;
      const resolved = locate(resolve(ctx.workspaceRoot), action.path);
      const segments = pathSegments(resolved).map((segment) => foldPath(segment, ctx));
      for (const protectedSegment of rule.segments) {
        if (segments.includes(foldPath(protectedSegment, ctx))) {
          return `the path contains the protected segment "${protectedSegment}"`;
        }
      }
      const basename = segments[segments.length - 1];
      for (const protectedBasename of rule.basenames) {
        if (basename === foldPath(protectedBasename, ctx)) {
          return `the file is named "${protectedBasename}", which is protected`;
        }
      }
      for (const suffix of rule.suffixes ?? []) {
        if (basename !== undefined && basename.endsWith(foldPath(suffix, ctx))) {
          return `the file ends in "${suffix}", which is protected`;
        }
      }
      return null;
    }
    case 'file_write_scope': {
      if (action.kind !== 'file_delete') return null;
      const root = resolve(ctx.workspaceRoot);
      const resolved = locate(root, action.path);
      const inside = rule.allowedRoots.some((allowed) => {
        const allowedRoot = locate(root, allowed);
        return (
          foldPath(resolved, ctx) === foldPath(allowedRoot, ctx) ||
          foldPath(resolved, ctx).startsWith(foldPath(allowedRoot + sep, ctx))
        );
      });
      return inside
        ? null
        : `${resolved} is not inside ${rule.allowedRoots.length === 1 ? 'the writable area' : 'any writable area'} (${rule.allowedRoots.join(', ')})`;
    }
    case 'shell_forbidden_invocation': {
      if (action.kind !== 'shell_command') return null;
      const wanted = rule.command.toLowerCase();
      for (const simple of simpleCommands(shellTokens(action.command))) {
        if (simple[0] !== wanted) continue;
        const args = simple.slice(1);
        const flags = args.filter((token) => token.startsWith('-'));
        const plain = args.filter((token) => !token.startsWith('-'));

        if (rule.subcommands.length > 0) {
          const subcommand = plain[0];
          if (subcommand === undefined || !rule.subcommands.some((s) => s.toLowerCase() === subcommand)) continue;
        }
        if (rule.anyFlag.length > 0 && !rule.anyFlag.some((flag) => flags.includes(flag.toLowerCase()))) continue;
        if (rule.anyArgument.length > 0 && !rule.anyArgument.some((argument) => plain.includes(argument.toLowerCase()))) {
          continue;
        }

        const described = [
          `"${rule.command}`,
          rule.subcommands.length > 0 ? ` ${rule.subcommands.find((s) => plain.includes(s.toLowerCase())) ?? rule.subcommands[0]}` : '',
          rule.anyFlag.length > 0 ? ` ${rule.anyFlag.find((f) => flags.includes(f.toLowerCase()))}` : '',
          rule.anyArgument.length > 0 ? ` ${rule.anyArgument.find((a) => plain.includes(a.toLowerCase()))}` : '',
          '"',
        ].join('');
        return `the command is ${described}, which is forbidden`;
      }
      return null;
    }
    case 'shell_forbidden_token': {
      if (action.kind !== 'shell_command') return null;
      const tokens = shellTokens(action.command);
      for (const forbidden of rule.tokens) {
        if (tokens.includes(forbidden.toLowerCase())) {
          return `the command contains the forbidden token "${forbidden}"`;
        }
      }
      return null;
    }
    case 'shell_forbidden_sequence': {
      if (action.kind !== 'shell_command') return null;
      const tokens = shellTokens(action.command);
      for (const sequence of rule.sequences) {
        if (containsSequence(tokens, sequence)) {
          return `the command contains the forbidden sequence "${sequence.join(' ')}"`;
        }
      }
      return null;
    }
    case 'http_host_allowlist': {
      if (action.kind !== 'http_request') return null;
      const host = new URL(action.url).hostname.toLowerCase();
      const allowed = rule.hosts.some((candidate) => candidate.toLowerCase() === host);
      return allowed ? null : `the host "${host}" is not on the approved list (${rule.hosts.join(', ')})`;
    }
    case 'http_method_allowlist': {
      if (action.kind !== 'http_request') return null;
      const allowed = rule.methods.some((candidate) => candidate.toUpperCase() === action.method);
      return allowed
        ? null
        : `the method ${action.method} is not on the approved list (${rule.methods.map((m) => m.toUpperCase()).join(', ')})`;
    }
  }
}

/**
 * The enforcement decision. Input is untrusted: shape validation happens
 * here, inside the engine, so a malformed action fails closed no matter how
 * the caller reached us. First violated rule (clause order) determines the
 * DENY; if no rule forbids the action, it is allowed.
 */
export function evaluate(
  policy: EvaluablePolicy,
  input: unknown,
  ctx: EvaluationContext,
): Verdict {
  const action = parseAction(input);
  if (typeof action === 'string') {
    return { decision: 'DENY', clause: null, reason: 'INVALID_ACTION', evidence: action };
  }
  for (const { clause, rule } of policy.rules) {
    const evidence = violation(rule, action, ctx);
    if (evidence !== null) {
      return { decision: 'DENY', clause, reason: null, evidence };
    }
  }
  return { decision: 'ALLOW', clause: null, reason: null, evidence: null };
}

/**
 * Explicit-field-copy narrowing from the full compiled policy to what the
 * evaluator may see. Beyond the type-level `Omit`, the returned object
 * physically lacks `clauses` — the English is absent at runtime too, not
 * merely invisible to the type checker.
 */
export function toEvaluable(policy: { readonly rules: readonly EvaluablePolicy['rules'][number][] }): EvaluablePolicy {
  return { rules: policy.rules.map(({ clause, rule }) => ({ clause, rule })) };
}
