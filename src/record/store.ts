/**
 * The filesystem boundary for the authorization record. The only module that
 * writes it.
 *
 * Two rules govern everything here, and both are about not becoming load
 * bearing:
 *
 * 1. **Recording never changes a verdict.** It happens after the decision is
 *    made, and every failure is swallowed. A full disk, a read-only vault or a
 *    revoked permission must not turn an ALLOW into a block or a DENY into a
 *    pass. The cost is honest and stated in the report: the record is evidence
 *    of what was decided, not proof that everything decided was recorded.
 * 2. **Nothing in the deciding path may import this.** `guard.test.ts` scans
 *    the engine, adapter, handler and presentation for `node:fs`; this module
 *    is imported only by `hook/pretooluse.ts` and `server/main.ts`, which are
 *    already I/O boundaries.
 *
 * Appends are `appendFileSync` of one newline-terminated line. Concurrent hook
 * processes are the normal case — a session can run several tool calls at once
 * — so the format is chosen to survive interleaving rather than to be locked:
 * a torn line is dropped by the reader and counted, and no earlier line can be
 * damaged by a later append.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseDecisions,
  parsePolicySnapshots,
  serializeLine,
  type DecisionEntry,
  type PolicySnapshot,
} from './types.ts';

export const DECISIONS_FILE = 'decisions.jsonl';
export const POLICIES_FILE = 'policies.jsonl';

export const decisionsPath = (recordDir: string): string => join(recordDir, DECISIONS_FILE);
export const policiesPath = (recordDir: string): string => join(recordDir, POLICIES_FILE);

/**
 * Append one decision. Returns true if it landed, false if anything at all went
 * wrong — callers on the enforcement path ignore the result on purpose; the
 * `report` command uses it to tell the user their record is not being written.
 */
export function appendDecision(recordDir: string, entry: DecisionEntry): boolean {
  try {
    mkdirSync(recordDir, { recursive: true });
    appendFileSync(decisionsPath(recordDir), serializeLine(entry), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a policy snapshot the first time this fingerprint is seen. Reading the
 * whole snapshot file before appending is affordable because it holds one line
 * per policy *version*, not per decision — a heavily edited policy has tens of
 * lines, not millions.
 */
export function appendPolicySnapshotIfNew(recordDir: string, snapshot: PolicySnapshot): boolean {
  try {
    mkdirSync(recordDir, { recursive: true });
    const path = policiesPath(recordDir);
    if (existsSync(path)) {
      const known = parsePolicySnapshots(readFileSync(path, 'utf8'));
      if (known.some((entry) => entry.policy === snapshot.policy)) return true;
    }
    appendFileSync(path, serializeLine(snapshot), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export interface LoadedRecord {
  readonly decisions: readonly DecisionEntry[];
  readonly policies: readonly PolicySnapshot[];
  /** Lines that could not be read. Surfaced in the report rather than hidden. */
  readonly skipped: number;
  /** False when no decisions file exists yet — a different empty state from "no matches". */
  readonly exists: boolean;
}

/** Read the record. Never writes, never creates the directory. */
export function loadRecord(recordDir: string): LoadedRecord {
  const decisionsFile = decisionsPath(recordDir);
  if (!existsSync(decisionsFile)) {
    return { decisions: [], policies: [], skipped: 0, exists: false };
  }
  const { entries, skipped } = parseDecisions(readFileSync(decisionsFile, 'utf8'));
  const policiesFile = policiesPath(recordDir);
  const policies = existsSync(policiesFile) ? parsePolicySnapshots(readFileSync(policiesFile, 'utf8')) : [];
  return { decisions: entries, policies, skipped, exists: true };
}
