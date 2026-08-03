/**
 * The check_action handler — a pure function from (policy, context, untrusted
 * args) to an outcome. Deliberately import-starved: this module and the
 * engine it calls import no filesystem, no process spawning, no network. A DENY
 * cannot perform a side effect because the code that decides has no
 * capability to perform one — guard.test.ts pins this structurally.
 */
import { evaluate, toEvaluable } from '../engine/evaluate.ts';
import type { CompiledPolicy, EvaluationContext, Verdict } from '../engine/types.ts';

export interface CheckOutcome {
  readonly verdict: Verdict;
  /** Display text of the governing clause, joined by id — null on ALLOW and on invalid-action denials. */
  readonly clauseText: string | null;
  /** One plain-English sentence, built only from facts the evaluator produced. */
  readonly sentence: string;
  /** What was checked, echoed back for the record. */
  readonly requested: unknown;
}

export function handleCheckAction(
  policy: CompiledPolicy,
  ctx: EvaluationContext,
  args: unknown,
): CheckOutcome {
  // Explicit narrowing: the evaluator receives an object that physically
  // lacks the clause English, over and above the type-level Omit.
  const verdict = evaluate(toEvaluable(policy), args, ctx);

  if (verdict.decision === 'ALLOW') {
    return {
      verdict,
      clauseText: null,
      sentence: 'No clause of the confirmed policy forbids this action.',
      requested: args,
    };
  }
  if (verdict.clause === null) {
    return {
      verdict,
      clauseText: null,
      sentence: `Refused without evaluation: ${verdict.evidence} — a malformed action fails closed.`,
      requested: args,
    };
  }
  const clauseText = policy.clauses.find((clause) => clause.id === verdict.clause)?.text ?? null;
  return {
    verdict,
    clauseText,
    sentence: `Refused under clause ${verdict.clause}: ${verdict.evidence}.`,
    requested: args,
  };
}
