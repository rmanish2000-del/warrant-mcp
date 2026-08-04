/**
 * One call, used by both boundaries that see a verdict — the enforcing hook
 * and the advisory MCP server — so the record has a single shape regardless of
 * which one wrote a line.
 *
 * Everything is wrapped. `observeDecision` cannot throw, and its callers do not
 * check its result: the moment recording can fail a tool call, the record has
 * stopped being an observer and started being a dependency. That is the trade,
 * and the report states it to the reader rather than burying it here.
 */
import { appendDecision, appendPolicySnapshotIfNew } from './store.ts';
import { describeAction, fingerprintPolicy, RECORD_VERSION, type DecisionSource } from './types.ts';
import type { CompiledPolicy, Verdict } from '../engine/types.ts';

export interface ObserveInput {
  /** Null when this installation has nowhere to record — then nothing happens at all. */
  readonly recordDir: string | null;
  readonly policy: CompiledPolicy;
  readonly source: DecisionSource;
  /** The client's name for the tool call, or `check_action` for the MCP tool. */
  readonly tool: string;
  /** The structured action the engine evaluated. */
  readonly action: unknown;
  readonly verdict: Verdict;
  /** Supplied by the caller — this module reads no clock. */
  readonly at: Date;
}

export function observeDecision(input: ObserveInput): void {
  if (input.recordDir === null) return;
  try {
    const fingerprint = fingerprintPolicy(input.policy);
    const at = input.at.toISOString();
    const { kind, target } = describeAction(input.action);

    appendPolicySnapshotIfNew(input.recordDir, {
      v: RECORD_VERSION,
      at,
      policy: fingerprint,
      clauses: input.policy.clauses,
      ruleCount: input.policy.rules.length,
    });
    appendDecision(input.recordDir, {
      v: RECORD_VERSION,
      at,
      source: input.source,
      tool: input.tool,
      kind,
      target,
      decision: input.verdict.decision,
      clause: input.verdict.clause,
      reason: input.verdict.decision === 'DENY' ? input.verdict.reason : null,
      policy: fingerprint,
    });
  } catch {
    // Recording is an observation, never a gate. See the module note.
  }
}
