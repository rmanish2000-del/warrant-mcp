/**
 * `warrant-mcp report` — render the authorization record as one local HTML file.
 *
 * A system boundary: this is where the clock, the environment, the home
 * directory and the filesystem are read. Everything that decides what the page
 * says is pure and lives under `src/report/`.
 *
 * The shape of the command is set by one constraint, and it is the product's
 * strongest claim: **nothing leaves the machine.** There is no server to start,
 * no bundle to fetch, no telemetry ping, no upload. The output is a single
 * `.html` with the stylesheet, the script and the data inlined, so it opens
 * with the network off, attaches to an email, and survives being copied to a
 * reviewer's laptop.
 *
 * Order of operations matters. The HTML is rendered in memory, scanned for
 * secrets and machine identity, and only then written. A report that would
 * leak is never a file on disk, not even briefly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadRecord } from '../record/store.ts';
import { buildModel, parseSince } from '../report/model.ts';
import { renderReport } from '../report/html.ts';
import { describeFindings, redact, scan, type RedactionContext } from '../report/redact.ts';
import { resolvePolicy, resolveRecordDir } from '../config/paths.ts';

const DEFAULT_OUT = 'warrant-report.html';

interface Options {
  readonly since: string | null;
  readonly out: string;
}

function parseArgs(argv: readonly string[], now: Date): Options | Error {
  let since: string | null = null;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--since' || argument === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return new Error(`${argument} needs a value`);
      i += 1;
      if (argument === '--out') {
        out = value;
      } else {
        const parsed = parseSince(value, now);
        if (parsed instanceof Error) return parsed;
        since = parsed;
      }
      continue;
    }
    const inline = /^--(since|out)=(.+)$/.exec(argument ?? '');
    if (inline) {
      if (inline[1] === 'out') {
        out = inline[2] as string;
      } else {
        const parsed = parseSince(inline[2] as string, now);
        if (parsed instanceof Error) return parsed;
        since = parsed;
      }
      continue;
    }
    return new Error(
      `unknown argument "${argument}".\n\n` +
        'Usage: warrant-mcp report [--since 7d] [--out <path>]\n' +
        '  --since  30m | 12h | 7d | 2w | 2026-08-01 | an ISO instant\n' +
        '  --out    where to write the HTML (default: ./warrant-report.html)',
    );
  }
  return { since, out };
}

const fail = (message: string): never => {
  process.stderr.write(`warrant-mcp report: ${message}\n`);
  process.exit(1);
};

const packageVersion = (): string => {
  try {
    const root = process.env.WARRANT_MCP_PACKAGE_ROOT ?? fileURLToPath(new URL('../..', import.meta.url));
    return (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
};

const now = new Date();
const options = parseArgs(process.argv.slice(2), now);
if (options instanceof Error) fail(options.message);

const cwd = process.cwd();
const policy = resolvePolicy(cwd, process.env);
const recordDir = resolveRecordDir(policy, process.env);
if (recordDir === null) {
  fail(
    `no record location for ${cwd}.\n` +
      'The record lives beside the compiled policy, so a project must be initialised first:\n' +
      '  warrant-mcp init\n' +
      'Set WARRANT_MCP_RECORD to read a record from somewhere else.',
  );
}

const record = loadRecord(recordDir!);

const redaction: RedactionContext = {
  home: homedir(),
  workspaceRoot: resolve(cwd),
  caseInsensitivePaths: process.platform === 'win32',
};

const model = buildModel({
  decisions: record.decisions,
  policies: record.policies,
  skipped: record.skipped,
  since: (options as Options).since,
  redaction,
});

const html = renderReport({
  model,
  generatedAt: now.toISOString(),
  // The project name is a basename, and it is redacted like everything else —
  // a report is judged as if it were public, including its title.
  project: redact(resolve(cwd), redaction),
  recordDir: redact(recordDir!, redaction),
  recordExists: record.exists,
  version: packageVersion(),
});

// Screen safety, on the finished bytes, before any of them reach a disk.
const findings = scan(html);
if (findings.length > 0) fail(describeFindings(findings));

const outPath = isAbsolute((options as Options).out)
  ? (options as Options).out
  : resolve(cwd, (options as Options).out);
try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
} catch (cause) {
  fail(`could not write ${outPath} — ${(cause as Error).message}`);
}

const summary = record.exists
  ? `${model.summary.total} decision(s), ${model.summary.denied} denied, ${model.summary.clausesFired} of ${model.summary.clausesTotal} clauses fired`
  : 'no decisions recorded yet — the report explains how the record fills';

process.stdout.write(
  [
    `  Wrote ${outPath}`,
    `  ${summary}`,
    `  Read from ${recordDir}`,
    '',
    '  Self-contained: no network request when opened, nothing uploaded, record unmodified.',
    '  Screen-safety scan passed: no credential shapes, no home paths, no login names.',
    '',
  ].join('\n'),
);
