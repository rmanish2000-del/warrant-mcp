/**
 * The authorization record: what was proposed, what was decided, and which
 * clause decided it.
 *
 * Two append-only JSONL files sit next to the compiled policy, outside the
 * workspace when the policy is vaulted — so the same clause that protects the
 * policy protects its record:
 *
 *   decisions.jsonl  one line per tool call the hook (or the MCP tool) checked
 *   policies.jsonl   one line the first time a distinct compiled policy is seen
 *
 * Splitting them is what makes question four answerable. A decision line
 * carries only a policy *fingerprint*; the clause English lives once per
 * policy version. When the fingerprint changes mid-record, the policy was
 * edited, and the report can say so and show what shifted — without repeating
 * every clause on every line.
 *
 * This module is pure data and pure functions. Nothing here writes; see
 * `store.ts` for the filesystem boundary. Nothing in the deciding path imports
 * either one (`guard.test.ts` pins that), because recording must never become
 * something a verdict depends on.
 */
import { createHash } from 'node:crypto';
import type { ClauseText, CompiledPolicy } from '../engine/types.ts';

/** Bumped only if a reader would misread an older line. Readers refuse what they do not know. */
export const RECORD_VERSION = 1;

export type DecisionSource = 'hook' | 'tool';

/** One checked tool call. One line of `decisions.jsonl`. */
export interface DecisionEntry {
  readonly v: number;
  /** ISO 8601, UTC, millisecond precision. Supplied by the caller — this module reads no clock. */
  readonly at: string;
  /** Which boundary observed it: the enforcing hook, or the advisory MCP tool. */
  readonly source: DecisionSource;
  /** The client's name for what was attempted ("Bash", "Write", "check_action"). */
  readonly tool: string;
  /** The engine action kind the tool call mapped to. */
  readonly kind: string;
  /** What was aimed at: a path, a command line, or "GET https://…". Redacted at report time, not here. */
  readonly target: string;
  readonly decision: 'ALLOW' | 'DENY';
  /** The governing clause id, or null on ALLOW and on malformed-action denials. */
  readonly clause: string | null;
  readonly reason: 'INVALID_ACTION' | null;
  /** Fingerprint of the compiled policy in force. Joins to a `policies.jsonl` line. */
  readonly policy: string;
}

/** One compiled policy version, recorded the first time it decides anything. */
export interface PolicySnapshot {
  readonly v: number;
  readonly at: string;
  readonly policy: string;
  readonly clauses: readonly ClauseText[];
  readonly ruleCount: number;
}

/**
 * A stable identity for a compiled policy: the rules that decide, not the
 * prose that explains them. Two policies whose English differs but whose rules
 * are identical enforce identically, and the report should not claim behaviour
 * changed when it did not. Clause ids are included because a rule's citation is
 * part of what an auditor sees.
 */
export function fingerprintPolicy(policy: Pick<CompiledPolicy, 'rules'>): string {
  const canonical = JSON.stringify(
    policy.rules.map(({ clause, rule }) => [clause, canonicalise(rule)]),
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

/** Key-sorted deep copy, so a re-serialised policy fingerprints the same. */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, canonicalise(inner)]),
    );
  }
  return value;
}

/**
 * The two fields a reader scans: what kind of thing was attempted, and at what.
 * Derived from the structured action rather than from any display string, so a
 * line says what the engine actually evaluated.
 */
export function describeAction(action: unknown): { kind: string; target: string } {
  if (typeof action !== 'object' || action === null) return { kind: 'unmapped', target: '' };
  const record = action as Record<string, unknown>;
  const kind = typeof record.kind === 'string' ? record.kind : 'unmapped';
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  if (kind === 'shell_command') return { kind, target: text(record.command) };
  if (kind === 'http_request') return { kind, target: `${text(record.method)} ${text(record.url)}`.trim() };
  return { kind, target: text(record.path) };
}

/** One record line. Newline-terminated so an interrupted append cannot corrupt the previous line. */
export function serializeLine(entry: DecisionEntry | PolicySnapshot): string {
  return `${JSON.stringify(entry)}\n`;
}

const isIsoInstant = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);

/**
 * Read decision lines, skipping what cannot be trusted.
 *
 * A record is appended to by short-lived hook processes that may be killed
 * mid-write, so a truncated last line is normal rather than exceptional. A
 * malformed line is dropped and counted — never guessed at, and never a reason
 * to refuse the whole file, because a report that vanishes when one line is
 * torn is a report nobody relies on. The count is surfaced so the report can
 * say so out loud rather than quietly under-reporting.
 */
export function parseDecisions(text: string): { entries: DecisionEntry[]; skipped: number } {
  const entries: DecisionEntry[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.v !== RECORD_VERSION ||
      !isIsoInstant(record.at) ||
      (record.source !== 'hook' && record.source !== 'tool') ||
      typeof record.tool !== 'string' ||
      typeof record.kind !== 'string' ||
      typeof record.target !== 'string' ||
      (record.decision !== 'ALLOW' && record.decision !== 'DENY') ||
      (record.clause !== null && typeof record.clause !== 'string') ||
      (record.reason !== null && record.reason !== 'INVALID_ACTION') ||
      typeof record.policy !== 'string'
    ) {
      skipped += 1;
      continue;
    }
    entries.push(record as unknown as DecisionEntry);
  }
  return { entries, skipped };
}

export function parsePolicySnapshots(text: string): PolicySnapshot[] {
  const snapshots: PolicySnapshot[] = [];
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (
        record.v === RECORD_VERSION &&
        isIsoInstant(record.at) &&
        typeof record.policy === 'string' &&
        Array.isArray(record.clauses) &&
        typeof record.ruleCount === 'number'
      ) {
        snapshots.push(record as unknown as PolicySnapshot);
      }
    } catch {
      // Same reasoning as above: a torn line is not a corrupt record.
    }
  }
  return snapshots;
}
