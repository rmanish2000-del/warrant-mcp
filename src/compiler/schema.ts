/**
 * Compiled-policy schema: the shape the model is constrained to produce and
 * the runtime validation that refuses anything else. Fail closed: schema
 * invalid → refuse; sentence unmappable to the closed rule set → the model
 * must list it under `unmapped` and the loader refuses to serve the policy.
 * Approximating a rule it cannot express is the one thing the compiler is
 * never allowed to do.
 */
import type { ClauseText, CompiledPolicy, CompiledRule, Rule } from '../engine/types.ts';

/** A compile output the system refuses. `stage` says which gate refused it. */
export class CompilerRejection extends Error {
  readonly stage: 'json' | 'schema' | 'unmapped';
  constructor(stage: 'json' | 'schema' | 'unmapped', message: string) {
    super(message);
    this.name = 'CompilerRejection';
    this.stage = stage;
  }
}

/** The model's output shape: compiled policy plus its honest remainder. */
export interface ModelCompiledPolicy extends CompiledPolicy {
  /** Sentences the closed rule set cannot express. Non-empty → the whole policy is refused. */
  readonly unmapped: readonly string[];
}

const CLAUSE_ID_PATTERN = '^W[0-9]+$';

const stringArray = (description: string) => ({
  type: 'array',
  minItems: 1,
  items: { type: 'string', minLength: 1 },
  description,
});

/**
 * JSON Schema sent to the API via `output_config.format`.
 * `additionalProperties: false` at every level. The rule variants are a
 * closed anyOf — there is no free-text rule and no regex rule, deliberately.
 */
export const POLICY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clauses', 'rules', 'unmapped'],
  properties: {
    clauses: {
      type: 'array',
      minItems: 1,
      description: 'One clause per policy sentence, numbered W1, W2, … in the order the sentences appear.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text'],
        properties: {
          id: { type: 'string', pattern: CLAUSE_ID_PATTERN },
          text: { type: 'string', minLength: 1, description: 'The clause restated as one plain-English sentence, faithful to the source.' },
        },
      },
    },
    rules: {
      type: 'array',
      minItems: 1,
      description: 'Structured prohibitions, in clause order. Every clause must have at least one rule.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['clause', 'rule'],
        properties: {
          clause: { type: 'string', pattern: CLAUSE_ID_PATTERN },
          rule: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['type'],
                properties: { type: { const: 'file_delete_outside_workspace' } },
                description: 'A destructive file operation (delete, overwrite, create) outside the workspace is refused. Carries no path — the system stamps the workspace at runtime.',
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'segments', 'basenames', 'suffixes'],
                properties: {
                  type: { const: 'file_delete_protected' },
                  segments: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Directory names protected from deletion/overwrite, e.g. ".git". May be empty.' },
                  basenames: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'File names protected from deletion/overwrite, e.g. ".env". May be empty.' },
                  suffixes: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'File-name endings protected from deletion/overwrite, e.g. ".pem", ".key". Plain endsWith matching — never a pattern or wildcard. May be empty.' },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'allowedRoots'],
                properties: {
                  type: { const: 'file_write_scope' },
                  allowedRoots: stringArray('Workspace-relative directories the agent may create, overwrite or delete inside, e.g. ["src","tests"]. Everything else is refused. Use ONLY when the policy names the writable area positively.'),
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'command', 'subcommands', 'anyFlag', 'anyArgument'],
                properties: {
                  type: { const: 'shell_forbidden_invocation' },
                  command: { type: 'string', minLength: 1, description: 'The command word, e.g. "git" or "npm".' },
                  subcommands: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'The first non-flag argument must be one of these, e.g. ["push"] or ["install","i","add"]. Empty means any.' },
                  anyFlag: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Fires when any of these flags appears ANYWHERE in the command, e.g. ["--force","-f"]. Order-independent. Empty means any.' },
                  anyArgument: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Fires when any of these non-flag arguments appears, e.g. ["main","master"]. Empty means any.' },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'tokens'],
                properties: {
                  type: { const: 'shell_forbidden_token' },
                  tokens: stringArray('Single forbidden command words, e.g. "sudo".'),
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'sequences'],
                properties: {
                  type: { const: 'shell_forbidden_sequence' },
                  sequences: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
                    description: 'Forbidden contiguous token sequences, e.g. [["rm","-rf"],["|","sh"]]. Emit every common spelling.',
                  },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'hosts'],
                properties: {
                  type: { const: 'http_host_allowlist' },
                  hosts: stringArray('Exactly the hostnames the policy names. Never add one.'),
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'methods'],
                properties: {
                  type: { const: 'http_method_allowlist' },
                  methods: stringArray('Exactly the HTTP methods the policy allows, upper-case.'),
                },
              },
            ],
          },
        },
      },
    },
    unmapped: {
      type: 'array',
      items: { type: 'string' },
      description: 'Policy sentences the closed rule set cannot express. Never approximate — list them here and the system will refuse to activate the policy.',
    },
  },
} as const;

const RULE_TYPES = [
  'file_delete_outside_workspace',
  'file_delete_protected',
  'file_write_scope',
  'shell_forbidden_token',
  'shell_forbidden_sequence',
  'shell_forbidden_invocation',
  'http_host_allowlist',
  'http_method_allowlist',
] as const;

function isStringArray(value: unknown, minItems: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  );
}

function validateRule(value: unknown): Rule {
  if (typeof value !== 'object' || value === null) throw new CompilerRejection('schema', 'rule is not an object');
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !(RULE_TYPES as readonly string[]).includes(type)) {
    throw new CompilerRejection('schema', `unknown rule type ${JSON.stringify(type)}`);
  }
  switch (type as Rule['type']) {
    case 'file_delete_outside_workspace':
      return { type: 'file_delete_outside_workspace' };
    case 'file_delete_protected': {
      // `suffixes` post-dates the first compiled caches; absent reads as empty.
      const suffixes = record.suffixes ?? [];
      if (!isStringArray(record.segments, 0) || !isStringArray(record.basenames, 0) || !isStringArray(suffixes, 0)) {
        throw new CompilerRejection('schema', 'file_delete_protected requires string arrays "segments", "basenames" and "suffixes"');
      }
      if (record.segments.length === 0 && record.basenames.length === 0 && suffixes.length === 0) {
        throw new CompilerRejection('schema', 'file_delete_protected protects nothing — empty segments, basenames and suffixes');
      }
      return { type: 'file_delete_protected', segments: record.segments, basenames: record.basenames, suffixes };
    }
    case 'file_write_scope': {
      if (!isStringArray(record.allowedRoots, 1)) {
        throw new CompilerRejection('schema', 'file_write_scope requires a non-empty string array "allowedRoots"');
      }
      // An absolute root would hard-code a machine path into the policy —
      // the same rule that keeps the workspace itself system-stamped.
      for (const root of record.allowedRoots) {
        if (/^([A-Za-z]:[\\/]|[\\/])/.test(root)) {
          throw new CompilerRejection('schema', `file_write_scope root "${root}" is absolute — roots are workspace-relative`);
        }
      }
      return { type: 'file_write_scope', allowedRoots: record.allowedRoots };
    }
    case 'shell_forbidden_invocation': {
      if (typeof record.command !== 'string' || record.command.trim().length === 0) {
        throw new CompilerRejection('schema', 'shell_forbidden_invocation requires a non-empty string "command"');
      }
      const subcommands = record.subcommands ?? [];
      const anyFlag = record.anyFlag ?? [];
      const anyArgument = record.anyArgument ?? [];
      if (!isStringArray(subcommands, 0) || !isStringArray(anyFlag, 0) || !isStringArray(anyArgument, 0)) {
        throw new CompilerRejection('schema', 'shell_forbidden_invocation requires string arrays "subcommands", "anyFlag" and "anyArgument"');
      }
      return { type: 'shell_forbidden_invocation', command: record.command, subcommands, anyFlag, anyArgument };
    }
    case 'shell_forbidden_token': {
      if (!isStringArray(record.tokens, 1)) throw new CompilerRejection('schema', 'shell_forbidden_token requires a non-empty string array "tokens"');
      return { type: 'shell_forbidden_token', tokens: record.tokens };
    }
    case 'shell_forbidden_sequence': {
      const sequences = record.sequences;
      if (!Array.isArray(sequences) || sequences.length === 0 || !sequences.every((s) => isStringArray(s, 1))) {
        throw new CompilerRejection('schema', 'shell_forbidden_sequence requires a non-empty array of non-empty string arrays');
      }
      return { type: 'shell_forbidden_sequence', sequences: sequences as string[][] };
    }
    case 'http_host_allowlist': {
      if (!isStringArray(record.hosts, 1)) throw new CompilerRejection('schema', 'http_host_allowlist requires a non-empty string array "hosts"');
      return { type: 'http_host_allowlist', hosts: record.hosts };
    }
    case 'http_method_allowlist': {
      if (!isStringArray(record.methods, 1)) throw new CompilerRejection('schema', 'http_method_allowlist requires a non-empty string array "methods"');
      return { type: 'http_method_allowlist', methods: record.methods };
    }
  }
}

/**
 * Parse and validate a compile output. Every gate fails closed with a
 * CompilerRejection; nothing partially-valid is ever returned. Rules are
 * re-sorted into ascending clause order so evaluation order (= precedence)
 * is a property of the validated artifact, not of model output ordering.
 */
export function parseCompiledPolicy(raw: string): ModelCompiledPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new CompilerRejection('json', `compile output is not JSON: ${(cause as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new CompilerRejection('schema', 'compile output is not an object');
  const record = parsed as Record<string, unknown>;

  const rawClauses = record.clauses;
  if (!Array.isArray(rawClauses) || rawClauses.length === 0) throw new CompilerRejection('schema', 'clauses must be a non-empty array');
  const clauses: ClauseText[] = rawClauses.map((entry) => {
    const clause = entry as Record<string, unknown>;
    if (typeof clause?.id !== 'string' || !new RegExp(CLAUSE_ID_PATTERN).test(clause.id)) {
      throw new CompilerRejection('schema', `clause id ${JSON.stringify(clause?.id)} does not match ${CLAUSE_ID_PATTERN}`);
    }
    if (typeof clause.text !== 'string' || clause.text.length === 0) {
      throw new CompilerRejection('schema', `clause ${clause.id} has no text`);
    }
    return { id: clause.id, text: clause.text };
  });
  const clauseIds = new Set(clauses.map((c) => c.id));
  if (clauseIds.size !== clauses.length) throw new CompilerRejection('schema', 'duplicate clause ids');

  const rawRules = record.rules;
  if (!Array.isArray(rawRules) || rawRules.length === 0) throw new CompilerRejection('schema', 'rules must be a non-empty array');
  const rules: CompiledRule[] = rawRules.map((entry) => {
    const item = entry as Record<string, unknown>;
    if (typeof item?.clause !== 'string' || !clauseIds.has(item.clause)) {
      throw new CompilerRejection('schema', `rule references unknown clause ${JSON.stringify(item?.clause)}`);
    }
    return { clause: item.clause, rule: validateRule(item.rule) };
  });
  // A clause with no rule is the same failure as a sentence the model listed
  // under `unmapped`: it could not be expressed. Both converge here so the
  // human gets one refusal and one explanation — the review screen's
  // guidance keys off the sentence, and it must not matter which way the
  // model happened to report it.
  const ruledClauses = new Set(rules.map((r) => r.clause));
  const unenforceable = clauses.filter((clause) => !ruledClauses.has(clause.id)).map((clause) => clause.text);
  const clauseNumber = (id: string) => Number.parseInt(id.slice(1), 10);
  const sortedRules = [...rules].sort((a, b) => clauseNumber(a.clause) - clauseNumber(b.clause));

  // Missing `unmapped` (a cached CompiledPolicy being re-validated) reads as
  // empty; the model's own output always carries the field (schema-required).
  const unmapped = record.unmapped ?? [];
  if (!Array.isArray(unmapped) || !unmapped.every((s) => typeof s === 'string')) {
    throw new CompilerRejection('schema', 'unmapped must be an array of strings');
  }
  // Deduped: a model that both lists a sentence under `unmapped` AND emits a
  // rule-less clause for it must not make the human read it twice.
  const allUnmapped = [...new Set([...unmapped, ...unenforceable])];
  if (allUnmapped.length > 0) {
    throw new CompilerRejection(
      'unmapped',
      `the policy contains ${allUnmapped.length} sentence(s) the rule set cannot express — refusing the whole policy:\n  - ${allUnmapped.join('\n  - ')}`,
    );
  }

  return { clauses, rules: sortedRules, unmapped: [] };
}
