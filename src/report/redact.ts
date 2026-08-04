/**
 * Screen safety for the generated report.
 *
 * The report is built to be emailed and attached to a review, so it is treated
 * as public from the moment it exists. Two passes, in this order, and both are
 * pure string work:
 *
 *   1. `redact()`   — rewrite what is merely private: the machine's home
 *                     directory, the workspace path, a login name in a path.
 *                     These are not secrets, but they are nobody's business,
 *                     and an auditor does not need them to read the record.
 *   2. `scan()`     — look for what is actually a secret. This runs on the
 *                     finished HTML, after redaction, as a check rather than a
 *                     cleanup: if it finds anything, the command refuses to
 *                     write the file.
 *
 * A finding never carries the matched text — not even a prefix. The repository
 * rule about never echoing a token back, not even partially, applies to a tool
 * that finds one as much as to a human handling one. A finding is a kind, an
 * offset and a length; that is enough to go and look.
 *
 * The scanner is deliberately shape-based and therefore fallible in both
 * directions: it cannot recognise a credential with no distinctive shape, and
 * it will occasionally object to an innocent-looking string. Refusing on a
 * false positive costs a re-run; missing a real one costs a leaked key, so the
 * bias is set accordingly and stated here rather than tuned quietly.
 */

export interface RedactionContext {
  /** The user's home directory, rewritten to `~`. */
  readonly home: string;
  /** The audited workspace, rewritten to `.` — usually a subdirectory of home. */
  readonly workspaceRoot: string;
  /** Compare prefixes case-insensitively (win32). */
  readonly caseInsensitivePaths: boolean;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace every occurrence of a literal prefix. Windows paths appear in a
 * record in whichever case the caller typed, so the comparison follows the same
 * platform rule the evaluator uses.
 */
function replaceAll(text: string, needle: string, replacement: string, caseInsensitive: boolean): string {
  if (needle.trim().length === 0) return text;
  return text.replace(new RegExp(escapeRegExp(needle), caseInsensitive ? 'gi' : 'g'), replacement);
}

/**
 * Rewrite machine-identifying paths. The workspace goes first because it is
 * the longer, more specific prefix and is normally inside home — reversing the
 * order would turn `/home/ada/work/api` into `~/work/api` and lose the fact
 * that it was the audited project.
 *
 * A home directory belonging to somebody else — `/home/deploy/app` in a command
 * the agent ran — is not rewritten to `~`, because it is not this reader's
 * home and saying so would be false. Its login name is replaced instead, which
 * keeps the shape an auditor needs without naming a person.
 */
export function redact(text: string, ctx: RedactionContext): string {
  const bothSeparators = (value: string): readonly string[] =>
    value.includes('\\') ? [value, value.replace(/\\/g, '/')] : [value];

  let out = text;
  for (const variant of bothSeparators(ctx.workspaceRoot)) {
    out = replaceAll(out, variant, '.', ctx.caseInsensitivePaths);
  }
  for (const variant of bothSeparators(ctx.home)) {
    out = replaceAll(out, variant, '~', ctx.caseInsensitivePaths);
  }
  return out
    .replace(/([A-Za-z]:[\\/])Users([\\/])[^\\/"'<>\s]+/g, '$1Users$2<user>')
    .replace(/\/(Users|home)\/[^/"'<>\s]+/g, '/$1/<user>');
}

interface SecretPattern {
  readonly kind: string;
  readonly pattern: RegExp;
}

/**
 * Shapes that are credentials often enough to be worth stopping the world for.
 * Keyed-assignment is last and deliberately narrow: it needs a credential-ish
 * key, an assignment, and a long enough value, so a clause mentioning the
 * `shell_forbidden_token` rule type does not trip it.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { kind: 'anthropic-api-key', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: 'openai-style-key', pattern: /\bsk-[A-Za-z0-9]{32,}/g },
  { kind: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{30,}/g },
  { kind: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: 'github-fine-grained-token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { kind: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'private-key-block', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { kind: 'json-web-token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    kind: 'credential-assignment',
    pattern:
      /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|password|passwd|bearer)\b\s*[:=]\s*["']?[A-Za-z0-9_\-.+/]{12,}/gi,
  },
  { kind: 'home-directory-path', pattern: /(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/)(?!<user>)[^\\/"'<>\s]+/g },
];

export interface Finding {
  readonly kind: string;
  /** Character offset in the scanned text. Enough to find it; not enough to leak it. */
  readonly offset: number;
  readonly length: number;
}

/**
 * Scan finished output. Returns every match. The matched text is never included
 * in the result, so a caller cannot accidentally print a secret while reporting
 * that it found one.
 */
export function scan(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const { kind, pattern } of SECRET_PATTERNS) {
    // A fresh regex per call: the module-level literals carry /g state.
    const local = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(local)) {
      findings.push({ kind, offset: match.index ?? 0, length: match[0].length });
    }
  }
  return findings.sort((a, b) => a.offset - b.offset);
}

/** The refusal an operator reads. Names kinds and places, never content. */
export function describeFindings(findings: readonly Finding[]): string {
  const byKind = new Map<string, number>();
  for (const finding of findings) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1);
  const lines = [...byKind.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([kind, count]) => `  ${count} × ${kind}`);
  const offsets = findings.slice(0, 8).map((finding) => finding.offset).join(', ');
  return [
    `the generated report contains ${findings.length} value(s) that look like secrets or machine identity:`,
    ...lines,
    '',
    `First offsets in the rendered HTML: ${offsets}${findings.length > 8 ? ', …' : ''}`,
    'Nothing was written. The matched text is deliberately not shown here.',
    'This usually means a command in the record embedded a credential. Fix the',
    'record at the source, or pass --out to a location you control and inspect it.',
  ].join('\n');
}
