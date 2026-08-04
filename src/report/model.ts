/**
 * The report's model: record in, answers out. Pure — no clock, no filesystem,
 * no formatting. `html.ts` renders this and adds nothing to it.
 *
 * The shape follows the four questions an auditor actually asks, in order, and
 * nothing else was allowed in:
 *
 *   1. What did the agent try, and what happened?      → `rows`, `summary`
 *   2. What was refused, and by which of my rules?      → `rows.clause`, `clauses`
 *   3. Is anything repeating?                           → `clauses` counts, `daily`
 *   4. When did behaviour change?                       → `policyEras`
 */
import type { DecisionEntry, PolicySnapshot } from '../record/types.ts';
import { redact, type RedactionContext } from './redact.ts';

export interface ReportRow {
  /** Stable index in the filtered set — the anchor an expanded row uses. */
  readonly i: number;
  readonly at: string;
  readonly day: string;
  readonly source: string;
  readonly tool: string;
  readonly kind: string;
  readonly target: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly clause: string | null;
  readonly clauseText: string | null;
  readonly reason: 'INVALID_ACTION' | null;
  readonly policy: string;
}

export interface ClauseRow {
  readonly id: string;
  readonly text: string;
  readonly fired: number;
  readonly denied: number;
  readonly allowed: number;
  /** False when the clause exists only in an older policy version. */
  readonly current: boolean;
}

export interface DayBucket {
  readonly day: string;
  readonly allowed: number;
  readonly denied: number;
}

/**
 * A stretch of the record governed by one compiled policy. The boundary
 * between two eras is a policy edit, which is the only honest way to answer
 * "did behaviour change" from a record alone: correlation with an edit, shown
 * plainly, not a causal claim.
 */
export interface PolicyEra {
  readonly policy: string;
  readonly from: string;
  readonly to: string;
  readonly decisions: number;
  readonly denied: number;
  readonly clauseCount: number;
  readonly ruleCount: number | null;
  /** Clause ids this era has that the previous era did not, and vice versa. */
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface ReportSummary {
  readonly total: number;
  readonly allowed: number;
  readonly denied: number;
  readonly clausesFired: number;
  readonly clausesTotal: number;
  readonly from: string | null;
  readonly to: string | null;
  readonly skipped: number;
}

export interface ReportModel {
  readonly summary: ReportSummary;
  readonly rows: readonly ReportRow[];
  readonly clauses: readonly ClauseRow[];
  readonly daily: readonly DayBucket[];
  readonly policyEras: readonly PolicyEra[];
  /** Kinds and tools present, so the filter offers only what exists. */
  readonly kinds: readonly string[];
  readonly tools: readonly string[];
  /** Null when no --since was given. ISO instant. */
  readonly since: string | null;
  /** How many entries the window excluded. Shown, so the reader knows the report is partial. */
  readonly excludedByWindow: number;
}

const DURATION = /^(\d+)([mhdw])$/;
const DAY_MS = 86_400_000;
const UNIT_MS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: DAY_MS, w: 7 * DAY_MS };

/**
 * `--since 7d`, `--since 36h`, or an ISO date/instant. `now` is a parameter,
 * not a call to the clock, so the whole model stays pure and testable.
 * Returns an ISO instant, or an error string the CLI prints verbatim.
 */
export function parseSince(value: string, now: Date): string | Error {
  const trimmed = value.trim();
  const duration = DURATION.exec(trimmed);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = UNIT_MS[duration[2] as string];
    if (amount > 0 && unit !== undefined) return new Date(now.getTime() - amount * unit).toISOString();
    return new Error(`--since "${value}" is out of range`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const instant = new Date(trimmed);
  if (!Number.isNaN(instant.getTime()) && /[T:]/.test(trimmed)) return instant.toISOString();
  return new Error(
    `--since "${value}" is not a duration or a date.\n` +
      'Use 30m, 12h, 7d, 2w, a date (2026-08-01), or an ISO instant (2026-08-01T09:00:00Z).',
  );
}

export interface BuildModelInput {
  readonly decisions: readonly DecisionEntry[];
  readonly policies: readonly PolicySnapshot[];
  readonly skipped: number;
  readonly since: string | null;
  readonly redaction: RedactionContext;
}

export function buildModel(input: BuildModelInput): ReportModel {
  const clean = (value: string) => redact(value, input.redaction);

  // Oldest first. A record is appended in order, but two hook processes can
  // interleave, and an auditor reading top-to-bottom must still see time move
  // forward. Ties keep their arrival order — Array.sort is stable.
  const ordered = [...input.decisions].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const inWindow = input.since === null ? ordered : ordered.filter((entry) => entry.at >= input.since!);

  const clauseTextFor = new Map<string, string>();
  const policyOf = new Map<string, PolicySnapshot>();
  for (const snapshot of input.policies) {
    policyOf.set(snapshot.policy, snapshot);
    for (const clause of snapshot.clauses) clauseTextFor.set(clause.id, clean(clause.text));
  }

  const rows: ReportRow[] = inWindow.map((entry, i) => ({
    i,
    at: entry.at,
    day: entry.at.slice(0, 10),
    source: entry.source,
    tool: entry.tool,
    kind: entry.kind,
    target: clean(entry.target),
    decision: entry.decision,
    clause: entry.clause,
    clauseText: entry.clause === null ? null : clauseTextFor.get(entry.clause) ?? null,
    reason: entry.reason,
    policy: entry.policy,
  }));

  // Clause breakdown over the union of every policy version in the record. A
  // clause that never fired is as interesting as one that fires constantly —
  // it may be dead weight, or it may be the one nobody has tested — so the
  // unfired ones are counted in and marked, never dropped for tidiness.
  const latest = input.policies[input.policies.length - 1];
  const currentIds = new Set((latest?.clauses ?? []).map((clause) => clause.id));
  const seenIds = new Set<string>();
  for (const snapshot of input.policies) for (const clause of snapshot.clauses) seenIds.add(clause.id);
  for (const row of rows) if (row.clause !== null) seenIds.add(row.clause);

  const clauses: ClauseRow[] = [...seenIds]
    .sort((a, b) => clauseOrder(a) - clauseOrder(b))
    .map((id) => {
      const fired = rows.filter((row) => row.clause === id);
      return {
        id,
        text: clauseTextFor.get(id) ?? '(clause text not recorded — the policy version that used it predates this record)',
        fired: fired.length,
        denied: fired.filter((row) => row.decision === 'DENY').length,
        allowed: fired.filter((row) => row.decision === 'ALLOW').length,
        current: currentIds.has(id),
      };
    });

  const byDay = new Map<string, { allowed: number; denied: number }>();
  for (const row of rows) {
    const bucket = byDay.get(row.day) ?? { allowed: 0, denied: 0 };
    if (row.decision === 'ALLOW') bucket.allowed += 1;
    else bucket.denied += 1;
    byDay.set(row.day, bucket);
  }
  const daily: DayBucket[] = fillDays([...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

  return {
    summary: {
      total: rows.length,
      allowed: rows.filter((row) => row.decision === 'ALLOW').length,
      denied: rows.filter((row) => row.decision === 'DENY').length,
      clausesFired: clauses.filter((clause) => clause.fired > 0).length,
      clausesTotal: clauses.length,
      from: rows[0]?.at ?? null,
      to: rows[rows.length - 1]?.at ?? null,
      skipped: input.skipped,
    },
    rows,
    clauses,
    daily,
    policyEras: buildEras(rows, policyOf),
    kinds: [...new Set(rows.map((row) => row.kind))].sort(),
    tools: [...new Set(rows.map((row) => row.tool))].sort(),
    since: input.since,
    excludedByWindow: ordered.length - inWindow.length,
  };
}

/** W2 before W10. Anything unparseable sorts last, in a stable place. */
function clauseOrder(id: string): number {
  const parsed = Number.parseInt(id.replace(/^\D+/, ''), 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Zero-fill the gaps. A week with two silent days should look like a week with
 * two silent days, not like a week of five — a bar chart that closes its own
 * gaps tells a story the record does not support.
 */
function fillDays(sorted: ReadonlyArray<readonly [string, { allowed: number; denied: number }]>): DayBucket[] {
  if (sorted.length === 0) return [];
  const out: DayBucket[] = [];
  const start = Date.parse(`${sorted[0]![0]}T00:00:00.000Z`);
  const end = Date.parse(`${sorted[sorted.length - 1]![0]}T00:00:00.000Z`);
  // A record spanning years must not render thousands of empty bars; past a
  // season, the gaps stop being informative and the page stops being printable.
  if (end - start > 120 * DAY_MS) {
    return sorted.map(([day, counts]) => ({ day, ...counts }));
  }
  const counts = new Map(sorted);
  for (let t = start; t <= end; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const bucket = counts.get(day) ?? { allowed: 0, denied: 0 };
    out.push({ day, allowed: bucket.allowed, denied: bucket.denied });
  }
  return out;
}

/**
 * Split the rows into policy eras. Consecutive rows sharing a fingerprint are
 * one era; a change of fingerprint starts the next. The added/removed clause
 * lists are the concrete "what changed" an auditor needs — a fingerprint on its
 * own says only that something did.
 */
function buildEras(
  rows: readonly ReportRow[],
  policyOf: ReadonlyMap<string, PolicySnapshot>,
): PolicyEra[] {
  const eras: PolicyEra[] = [];
  let previousIds: string[] = [];
  for (const row of rows) {
    const last = eras[eras.length - 1];
    if (last !== undefined && last.policy === row.policy) {
      eras[eras.length - 1] = {
        ...last,
        to: row.at,
        decisions: last.decisions + 1,
        denied: last.denied + (row.decision === 'DENY' ? 1 : 0),
      };
      continue;
    }
    const snapshot = policyOf.get(row.policy);
    const ids = (snapshot?.clauses ?? []).map((clause) => clause.id);
    eras.push({
      policy: row.policy,
      from: row.at,
      to: row.at,
      decisions: 1,
      denied: row.decision === 'DENY' ? 1 : 0,
      clauseCount: ids.length,
      ruleCount: snapshot?.ruleCount ?? null,
      added: eras.length === 0 ? [] : ids.filter((id) => !previousIds.includes(id)),
      removed: eras.length === 0 ? [] : previousIds.filter((id) => !ids.includes(id)),
    });
    previousIds = ids;
  }
  return eras;
}
