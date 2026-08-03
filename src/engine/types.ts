/**
 * Core types for the deterministic action-evaluation engine.
 *
 * Conventions, fixed for the whole engine (same discipline as warrant):
 * - The engine is pure: no clock, no I/O, no environment reads. Everything it
 *   needs arrives as a parameter.
 * - The model never decides. Claude compiles the plain-English policy into
 *   the structured `Rule` values below; at runtime the evaluator reads
 *   structured fields only.
 */

/** The three action kinds this skeleton checks. No more, by assignment. */
export type ActionKind = 'file_delete' | 'shell_command' | 'http_request';

/** An intended action, as validated structured data. */
export type Action =
  | { readonly kind: 'file_delete'; readonly path: string }
  | { readonly kind: 'shell_command'; readonly command: string }
  | { readonly kind: 'http_request'; readonly url: string; readonly method: string };

/** One clause of the compiled policy — id plus display text ("W3 — Never run…"). */
export interface ClauseText {
  readonly id: string;
  readonly text: string;
}

/**
 * The closed set of machine-readable prohibitions the compiler may emit.
 * Every variant is pure data matched structurally — no clause English, no
 * regular expressions, no code. If a policy sentence cannot be expressed
 * here, the compiler must list it as unmapped and the loader refuses to
 * serve the policy (fail closed), rather than approximating.
 */
export type Rule =
  /** Denies a file_delete whose resolved path is not inside the workspace root. */
  | { readonly type: 'file_delete_outside_workspace' }
  /**
   * Denies a file_delete whose path contains a protected segment (e.g.
   * ".git"), a protected basename (e.g. ".env"), or a protected suffix
   * (e.g. ".pem"). Suffix matching is `endsWith` on the basename — pure
   * data, not a pattern language. Optional at runtime so caches compiled
   * before suffixes existed still validate.
   */
  | {
      readonly type: 'file_delete_protected';
      readonly segments: readonly string[];
      readonly basenames: readonly string[];
      readonly suffixes?: readonly string[];
    }
  /**
   * Denies a file_delete whose path is not inside one of these roots
   * (relative to the workspace). The positive form people actually write —
   * "only write inside src/ and tests/" — expressed, like every rule here,
   * as a prohibition: anything outside every listed root is refused.
   */
  | { readonly type: 'file_write_scope'; readonly allowedRoots: readonly string[] }
  /**
   * Denies a shell_command matching a command/subcommand/flag shape,
   * order-independently. This is what `shell_forbidden_sequence` could not
   * say: `git push origin main --force` and `git push --force origin main`
   * are the same intent with different token order.
   *
   * Empty array means "don't constrain this dimension". All non-empty
   * dimensions must match for the rule to fire:
   * - `command`     — the command word (required, exact).
   * - `subcommands` — the first non-flag argument must be one of these.
   * - `anyFlag`     — at least one of these flag tokens appears anywhere.
   * - `anyArgument` — at least one of these non-flag arguments appears.
   */
  | {
      readonly type: 'shell_forbidden_invocation';
      readonly command: string;
      readonly subcommands: readonly string[];
      readonly anyFlag: readonly string[];
      readonly anyArgument: readonly string[];
    }
  /** Denies a shell_command containing any of these tokens (case-insensitive, word-level). */
  | { readonly type: 'shell_forbidden_token'; readonly tokens: readonly string[] }
  /** Denies a shell_command containing any of these contiguous token sequences (e.g. ["rm","-rf"] or ["|","sh"]). */
  | {
      readonly type: 'shell_forbidden_sequence';
      readonly sequences: ReadonlyArray<readonly string[]>;
    }
  /** Denies an http_request whose hostname is not on this list. */
  | { readonly type: 'http_host_allowlist'; readonly hosts: readonly string[] }
  /** Denies an http_request whose method is not on this list. */
  | { readonly type: 'http_method_allowlist'; readonly methods: readonly string[] };

/** One structured prohibition, attached to the clause it enforces. Carries no English. */
export interface CompiledRule {
  readonly clause: string;
  readonly rule: Rule;
}

/**
 * The compiled policy as confirmed by the human. `clauses` is display text
 * for the console and the record; evaluation never reads it.
 */
export interface CompiledPolicy {
  /** Structured prohibitions, in clause order. What the evaluator enforces. */
  readonly rules: readonly CompiledRule[];
  /**
   * Clause display text ("W1 — Delete files only inside the workspace.").
   * Display-only: the evaluator's parameter type (`EvaluablePolicy`) excludes
   * this field, so compiled English cannot influence a verdict.
   */
  readonly clauses: readonly ClauseText[];
}

/**
 * What the evaluator is allowed to see: structured rules only. `clauses`
 * (English text) is typed out of reach — "Claude compiles, code decides" is
 * enforced at the type boundary, not by convention. `evaluate` cannot read a
 * clause sentence without a compile error.
 */
export type EvaluablePolicy = Omit<CompiledPolicy, 'clauses'>;

/**
 * System-stamped evaluation context — the analogue of warrant's injected
 * clock. The compiler never emits a machine path (a policy that names its own
 * workspace has no portability and invites fabrication); the server stamps
 * the workspace at startup and passes it in here.
 */
export interface EvaluationContext {
  /** Absolute path of the workspace the agent is confined to. */
  readonly workspaceRoot: string;
  /** True on platforms with case-insensitive filesystems (win32). */
  readonly caseInsensitivePaths: boolean;
}

/**
 * The evaluator's result. Exactly one determining clause is ever cited, and
 * the union enforces it:
 *
 * - ALLOW → clause null, nothing breached.
 * - DENY with a clause → that clause's rule matched; `evidence` is the
 *   engine-produced fact (e.g. `the command contains the forbidden token "sudo"`).
 * - DENY with reason INVALID_ACTION → malformed input the engine refuses to
 *   reason about at all (fail closed). No clause, because no clause was needed.
 */
export type Verdict =
  | { readonly decision: 'ALLOW'; readonly clause: null; readonly reason: null; readonly evidence: null }
  | { readonly decision: 'DENY'; readonly clause: string; readonly reason: null; readonly evidence: string }
  | {
      readonly decision: 'DENY';
      readonly clause: null;
      readonly reason: 'INVALID_ACTION';
      readonly evidence: string;
    };
