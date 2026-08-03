/**
 * Terminal presentation. The DENY banner is built to be read on a projector
 * from three metres: generous whitespace, short lines, the four facts that
 * matter — verdict, clause id, clause text, what was refused — and nothing
 * else. Calm and final, not an alarm: one colour, no flashing, a closing
 * line that states the consequence in past tense.
 *
 * Pure string building — no I/O in this module; callers decide the stream.
 */
import type { CheckOutcome } from './handler.ts';

const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const WIDTH = 64;
const RULE = '─'.repeat(WIDTH);

/** Describe the requested action in one short line per field. */
function describeRequest(requested: unknown): string[] {
  if (typeof requested !== 'object' || requested === null) return [JSON.stringify(requested)];
  const record = requested as Record<string, unknown>;
  const kind = typeof record.kind === 'string' ? record.kind : '(unknown kind)';
  const detail = ['path', 'command', 'method', 'url']
    .filter((key) => typeof record[key] === 'string')
    .map((key) => String(record[key]));
  return [kind, ...detail];
}

export function renderOutcome(outcome: CheckOutcome, color: boolean): string {
  const paint = (code: string, text: string) => (color ? `${code}${text}${OFF}` : text);
  const lines: string[] = ['', paint(DIM, RULE), ''];

  if (outcome.verdict.decision === 'ALLOW') {
    lines.push(`   ${paint(BOLD + GREEN, 'ALLOW')}`);
    lines.push('');
    for (const line of describeRequest(outcome.requested)) lines.push(`   ${line}`);
    lines.push('');
    lines.push(`   ${outcome.sentence}`);
  } else {
    const clause = outcome.verdict.clause;
    lines.push(`   ${paint(BOLD + RED, 'DENY')}${clause ? paint(DIM, `   ·   clause ${clause}`) : ''}`);
    lines.push('');
    if (clause && outcome.clauseText) {
      lines.push(`   ${paint(BOLD, `${clause} — ${outcome.clauseText}`)}`);
      lines.push('');
    }
    lines.push(`   ${paint(DIM, 'refused:')}`);
    for (const line of describeRequest(outcome.requested)) lines.push(`      ${line}`);
    lines.push('');
    lines.push(`   ${outcome.sentence}`);
    lines.push('');
    lines.push(`   ${paint(DIM, 'The action was not performed.')}`);
  }

  lines.push('', paint(DIM, RULE), '');
  return lines.join('\n');
}

/** The structured result returned to the calling agent through MCP. */
export function toolResultText(outcome: CheckOutcome): string {
  return JSON.stringify(
    {
      decision: outcome.verdict.decision,
      clause: outcome.verdict.clause,
      clauseText: outcome.clauseText,
      reason: outcome.sentence,
    },
    null,
    2,
  );
}
