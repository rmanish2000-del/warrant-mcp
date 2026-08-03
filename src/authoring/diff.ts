/**
 * Behaviour diff: what a policy change does, not what it says.
 *
 * Text diffs of clause English are useless for review — a reworded clause
 * reads as a change while enforcing the identical thing, and a one-word edit
 * to a host list reads as trivial while opening the network. So the diff is
 * derived by evaluating a fixed corpus (corpus.ts) against both policies
 * with the same pure evaluator the hook uses. If it says nothing changed,
 * nothing changed for those actions.
 */
import { handleCheckAction } from '../server/handler.ts';
import type { CompiledPolicy, EvaluationContext } from '../engine/types.ts';
import { CORPUS } from './corpus.ts';
import type { CorpusEntry } from './corpus.ts';

export interface BehaviourChange {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

export interface BehaviourDiff {
  /** Allowed before, refused now. */
  readonly nowRefused: readonly BehaviourChange[];
  /** Refused before, allowed now — the direction that widens authority. */
  readonly nowAllowed: readonly BehaviourChange[];
  /** Refused before and after, but a different clause governs it. */
  readonly reclassified: readonly BehaviourChange[];
  readonly unchanged: number;
}

/** ALLOW, or DENY plus the governing clause / fail-closed reason. */
function outcomeOf(policy: CompiledPolicy, ctx: EvaluationContext, action: unknown): string {
  const { verdict } = handleCheckAction(policy, ctx, action);
  if (verdict.decision === 'ALLOW') return 'ALLOW';
  return verdict.clause !== null ? `DENY ${verdict.clause}` : `DENY (${verdict.reason})`;
}

export function behaviourDiff(
  before: CompiledPolicy,
  after: CompiledPolicy,
  ctx: EvaluationContext,
  corpus: readonly CorpusEntry[] = CORPUS,
): BehaviourDiff {
  const nowRefused: BehaviourChange[] = [];
  const nowAllowed: BehaviourChange[] = [];
  const reclassified: BehaviourChange[] = [];
  let unchanged = 0;

  for (const entry of corpus) {
    const wasOutcome = outcomeOf(before, ctx, entry.action);
    const isOutcome = outcomeOf(after, ctx, entry.action);
    if (wasOutcome === isOutcome) {
      unchanged += 1;
      continue;
    }
    const change: BehaviourChange = { label: entry.label, before: wasOutcome, after: isOutcome };
    if (wasOutcome === 'ALLOW') nowRefused.push(change);
    else if (isOutcome === 'ALLOW') nowAllowed.push(change);
    else reclassified.push(change);
  }

  return { nowRefused, nowAllowed, reclassified, unchanged };
}

/** Every corpus action a single policy refuses — the "what will this stop?" view for a first policy. */
export function refusedByPolicy(
  policy: CompiledPolicy,
  ctx: EvaluationContext,
  corpus: readonly CorpusEntry[] = CORPUS,
): ReadonlyArray<{ readonly label: string; readonly outcome: string }> {
  return corpus
    .map((entry) => ({ label: entry.label, outcome: outcomeOf(policy, ctx, entry.action) }))
    .filter((row) => row.outcome !== 'ALLOW');
}
