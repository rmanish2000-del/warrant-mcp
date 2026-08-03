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
/** Content width for wrapped lines: 3-space indent + 60 ≤ 64, so every banner line fits an 80-column terminal. */
const WRAP = 60;

/** Greedy word wrap. A single token longer than the width stays on its own line. */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length === 0) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

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
    for (const entry of describeRequest(outcome.requested)) {
      for (const line of wrapText(entry, WRAP)) lines.push(`   ${line}`);
    }
    lines.push('');
    for (const line of wrapText(outcome.sentence, WRAP)) lines.push(`   ${line}`);
  } else {
    const clause = outcome.verdict.clause;
    lines.push(`   ${paint(BOLD + RED, 'DENY')}${clause ? paint(DIM, `   ·   clause ${clause}`) : ''}`);
    lines.push('');
    if (clause && outcome.clauseText) {
      for (const line of wrapText(`${clause} — ${outcome.clauseText}`, WRAP)) {
        lines.push(`   ${paint(BOLD, line)}`);
      }
      lines.push('');
    }
    lines.push(`   ${paint(DIM, 'refused:')}`);
    for (const entry of describeRequest(outcome.requested)) {
      for (const line of wrapText(entry, WRAP - 3)) lines.push(`      ${line}`);
    }
    lines.push('');
    for (const line of wrapText(outcome.sentence, WRAP)) lines.push(`   ${line}`);
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
