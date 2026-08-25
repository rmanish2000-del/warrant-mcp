#!/usr/bin/env node
/**
 * The weekly demand snapshot — the boundary. This is the only file here that
 * reads the clock, the network, the environment or the disk; `model.mjs` is pure
 * and is where the behaviour is tested.
 *
 * READ-ONLY, AND OUTSIDE THE PRODUCT. It performs GET requests against public
 * endpoints and writes two files into a directory you name. It is not part of
 * the published package: `tools/` is outside `files[]` in package.json and
 * outside `tsconfig.build.json`'s `include`, so nothing here can reach a
 * tarball or a user's machine.
 *
 * ON THE OPTIONAL TOKEN. GitHub traffic (unique visitors, clones) is visible
 * only to the repository owner. If — and only if — the caller has already put a
 * token in GITHUB_TOKEN, this reads it to fetch that one endpoint. It never
 * prompts for a token, never creates one, never writes one to the record or to
 * any file, and never prints it or any part of it. Without one, traffic is
 * recorded UNOBSERVABLE, which is the honest answer rather than a gap.
 *
 * Usage:
 *   node tools/demand-snapshot/snapshot.mjs --out <dir> [--days 30] [--launch <file.json>]
 *
 * ON LAUNCH RECORDS. The runner used to hard-code the absence of a launch, which
 * would have frozen a pre-launch fact into every later snapshot. Launch records
 * are input now: --launch names a file of zero or more {surface, url, postedAt}
 * entries. With none, the record says NOT FOUND and lists what was searched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { buildSnapshot, renderSnapshot } from './model.mjs';

const PACKAGE = 'warrant-mcp';
const REPO = 'rmanish2000-del/warrant-mcp';
const VERSION = '0.2.6';

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

/**
 * One GET. Returns the parsed body, or null when the provider refused — the
 * caller turns null into an explicit UNOBSERVABLE. A refusal is never allowed to
 * look like an answer, and a previous run's success is never reused: this
 * process holds no cache and reads no earlier artefact.
 */
async function get(url, headers = {}) {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': `${PACKAGE}-demand-snapshot`, ...headers } });
    if (!response.ok) {
      process.stderr.write(`  provider refused ${url} — HTTP ${response.status}\n`);
      return null;
    }
    return await response.json();
  } catch (cause) {
    process.stderr.write(`  provider unreachable ${url} — ${cause.message}\n`);
    return null;
  }
}

const outDir = arg('out', null);
if (outDir === null) {
  process.stderr.write('usage: node tools/demand-snapshot/snapshot.mjs --out <dir> [--days 30]\n');
  process.exit(2);
}
const days = Number(arg('days', '30'));
if (!Number.isInteger(days) || days < 1) {
  process.stderr.write('--days must be a positive integer\n');
  process.exit(2);
}

// Zero or more launch records, supplied by the caller. A file that cannot be
// read or parsed stops the run: a fabricated or missing event would silently
// move the window every later reading is measured against.
const launchFile = arg('launch', null);
let launchRecords = null;
if (launchFile !== null) {
  try {
    const parsed = JSON.parse(readFileSync(launchFile, 'utf8'));
    launchRecords = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(launchRecords)) throw new Error('no records array');
  } catch (cause) {
    process.stderr.write(`FAILED: cannot read launch records from ${launchFile} — ${cause.message}
`);
    process.exit(1);
  }
}

const observedAt = new Date().toISOString();
const end = observedAt.slice(0, 10);
const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

process.stderr.write(`observing ${PACKAGE} ${start}..${end}\n`);

const npmPayload = await get(`https://api.npmjs.org/downloads/range/${start}:${end}/${PACKAGE}`);
if (npmPayload === null) {
  // Fail closed: without download data there is no snapshot to write. Writing a
  // record with zeroes would be a lie that later passes would diff against.
  process.stderr.write('FAILED: npm download data unavailable — no snapshot written.\n');
  process.exit(1);
}

const gitHubPayload = await get(`https://api.github.com/repos/${REPO}`);

// The token is read, used for one request, and never stored, logged or recorded.
const token = process.env.GITHUB_TOKEN;
const ownerTrafficPayload = token
  ? await get(`https://api.github.com/repos/${REPO}/traffic/views`, { authorization: `Bearer ${token}` })
  : null;

let snapshot;
let rendered;
try {
  snapshot = buildSnapshot({
    observedAt,
    packageName: PACKAGE,
    version: VERSION,
    publishedAt: '2026-08-18T23:44:51.480Z',
    npmPayload,
    npmProviderNote: `range ${start}..${end}`,
    gitHubPayload,
    ownerTrafficPayload,
    launchRecords,
    launchSearched: ['news.ycombinator.com', 'reddit.com/r/mcp', 'AGENT-REPORTS launch records'],
  });
  rendered = renderSnapshot(snapshot);
} catch (cause) {
  process.stderr.write(`FAILED: ${cause.message}\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
// Minute-level identity: a snapshot is one observation, not one per calendar
// day. Date-only names made a second run collide with the first, and the first
// exercise of this tool destroyed a good artefact that way.
const stamp = `${observedAt.slice(0, 10)}T${observedAt.slice(11, 13)}${observedAt.slice(14, 16)}Z`;
const jsonPath = join(outDir, `${stamp}_demand-snapshot.json`);
const mdPath = join(outDir, `${stamp}_demand-snapshot.md`);

// An evidence artefact is not a cache. A second run on the same day would
// silently replace the file a later pass intends to diff against — which
// happened the first time this was exercised, and cost the good snapshot. It
// now refuses unless the caller says explicitly to replace it.
if (!process.argv.includes('--force') && (existsSync(jsonPath) || existsSync(mdPath))) {
  process.stderr.write(
    `REFUSED: a snapshot for ${stamp} already exists in ${outDir}.
  An evidence artefact is not overwritten silently. Move or delete it, or pass --force.
`,
  );
  process.exit(1);
}
writeFileSync(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`);
writeFileSync(mdPath, rendered);
process.stderr.write(`wrote ${jsonPath}\nwrote ${mdPath}\n`);
