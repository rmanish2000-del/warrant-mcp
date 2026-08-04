/**
 * The record's own guarantees: it survives being torn, it refuses what it
 * cannot read, it identifies a policy by what decides rather than by what
 * explains, and — the one that matters most — it can never break the thing it
 * observes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  describeAction,
  fingerprintPolicy,
  parseDecisions,
  parsePolicySnapshots,
  serializeLine,
  RECORD_VERSION,
  type DecisionEntry,
} from './types.ts';
import { appendDecision, appendPolicySnapshotIfNew, decisionsPath, loadRecord, policiesPath } from './store.ts';
import { observeDecision } from './observe.ts';
import { resolveRecordDir } from '../config/paths.ts';
import type { CompiledPolicy } from '../engine/types.ts';

const POLICY: CompiledPolicy = {
  clauses: [
    { id: 'W1', text: 'Delete files only inside the workspace.' },
    { id: 'W2', text: 'Never delete a file named .env.' },
  ],
  rules: [
    { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
    { clause: 'W2', rule: { type: 'file_delete_protected', segments: [], basenames: ['.env'], suffixes: [] } },
  ],
};

const entry = (over: Partial<DecisionEntry> = {}): DecisionEntry => ({
  v: RECORD_VERSION,
  at: '2026-08-01T09:00:00.000Z',
  source: 'hook',
  tool: 'Bash',
  kind: 'shell_command',
  target: 'rm -rf build',
  decision: 'ALLOW',
  clause: null,
  reason: null,
  policy: 'abc123abc123',
  ...over,
});

const scratch = () => mkdtempSync(join(tmpdir(), 'warrant-record-'));

test('a line survives a round trip', () => {
  const original = entry({ decision: 'DENY', clause: 'W2' });
  const { entries, skipped } = parseDecisions(serializeLine(original));
  assert.equal(skipped, 0);
  assert.deepEqual(entries, [original]);
});

test('a torn final line is skipped and counted, and the rest survives', () => {
  // A hook process killed mid-append is the normal case, not the exceptional
  // one. The record must degrade by one line, never by the whole file.
  const text = serializeLine(entry()) + serializeLine(entry({ at: '2026-08-01T09:00:01.000Z' })) + '{"v":1,"at":"2026-08';
  const { entries, skipped } = parseDecisions(text);
  assert.equal(entries.length, 2);
  assert.equal(skipped, 1);
});

test('a line from an unknown record version is refused, not guessed at', () => {
  const { entries, skipped } = parseDecisions(`${JSON.stringify({ ...entry(), v: 99 })}\n`);
  assert.deepEqual(entries, []);
  assert.equal(skipped, 1);
});

test('a line with a wrong-shaped field is refused', () => {
  for (const broken of [{ decision: 'MAYBE' }, { at: 'yesterday' }, { source: 'cron' }, { policy: 7 }]) {
    const { entries, skipped } = parseDecisions(`${JSON.stringify({ ...entry(), ...broken })}\n`);
    assert.deepEqual(entries, [], `accepted a line with ${JSON.stringify(broken)}`);
    assert.equal(skipped, 1);
  }
});

test('a policy is identified by the rules that decide, not the prose that explains', () => {
  const reworded: CompiledPolicy = {
    ...POLICY,
    clauses: POLICY.clauses.map((clause) => ({ ...clause, text: `${clause.text} Please.` })),
  };
  assert.equal(
    fingerprintPolicy(reworded),
    fingerprintPolicy(POLICY),
    'rewording a clause changes no behaviour, so it must not read as a policy change',
  );

  const reordered: CompiledPolicy = {
    ...POLICY,
    rules: [
      { clause: 'W1', rule: { type: 'file_delete_outside_workspace' } },
      { clause: 'W2', rule: { basenames: ['.env'], suffixes: [], segments: [], type: 'file_delete_protected' } },
    ],
  };
  assert.equal(fingerprintPolicy(reordered), fingerprintPolicy(POLICY), 'key order is not meaning');

  const changed: CompiledPolicy = {
    ...POLICY,
    rules: [
      POLICY.rules[0]!,
      { clause: 'W2', rule: { type: 'file_delete_protected', segments: [], basenames: ['.env', '.pem'], suffixes: [] } },
    ],
  };
  assert.notEqual(fingerprintPolicy(changed), fingerprintPolicy(POLICY), 'a new protected name is a policy change');
});

test('an action is described from what the engine evaluated', () => {
  assert.deepEqual(describeAction({ kind: 'file_delete', path: '.env' }), { kind: 'file_delete', target: '.env' });
  assert.deepEqual(describeAction({ kind: 'shell_command', command: 'rm -rf /' }), {
    kind: 'shell_command',
    target: 'rm -rf /',
  });
  assert.deepEqual(describeAction({ kind: 'http_request', url: 'https://x.test/a', method: 'POST' }), {
    kind: 'http_request',
    target: 'POST https://x.test/a',
  });
  assert.deepEqual(describeAction('nonsense'), { kind: 'unmapped', target: '' });
});

test('appending and loading round-trips through a real directory', () => {
  const dir = join(scratch(), 'record');
  assert.equal(loadRecord(dir).exists, false, 'a directory with no decisions file is not an empty record');

  assert.ok(appendDecision(dir, entry()));
  assert.ok(appendDecision(dir, entry({ at: '2026-08-01T09:00:05.000Z', decision: 'DENY', clause: 'W2' })));
  assert.ok(
    appendPolicySnapshotIfNew(dir, {
      v: RECORD_VERSION,
      at: '2026-08-01T09:00:00.000Z',
      policy: 'abc123abc123',
      clauses: POLICY.clauses,
      ruleCount: 2,
    }),
  );
  // A second call with the same fingerprint must not add a line: the snapshot
  // file is one line per policy version, and every hook process calls it.
  appendPolicySnapshotIfNew(dir, {
    v: RECORD_VERSION,
    at: '2026-08-01T09:09:00.000Z',
    policy: 'abc123abc123',
    clauses: POLICY.clauses,
    ruleCount: 2,
  });

  const loaded = loadRecord(dir);
  assert.equal(loaded.exists, true);
  assert.equal(loaded.decisions.length, 2);
  assert.equal(loaded.skipped, 0);
  assert.equal(loaded.policies.length, 1);
  assert.equal(parsePolicySnapshots(readFileSync(policiesPath(dir), 'utf8')).length, 1);
});

test('observing never throws, whatever the disk does', () => {
  // Three ways to fail, all of which must be silent. If any of these threw,
  // an unwritable record would turn into a blocked tool call.
  const nowhere = { recordDir: null, policy: POLICY, source: 'hook' as const, tool: 'Bash', action: {}, verdict: { decision: 'ALLOW' as const, clause: null, reason: null, evidence: null }, at: new Date(0) };
  assert.doesNotThrow(() => observeDecision(nowhere));

  const dir = scratch();
  const blocked = join(dir, 'blocked');
  writeFileSync(blocked, 'a file where a directory must go', 'utf8');
  assert.doesNotThrow(() => observeDecision({ ...nowhere, recordDir: blocked }));
  assert.equal(readFileSync(blocked, 'utf8'), 'a file where a directory must go', 'the record must not have written anything');

  assert.equal(appendDecision(blocked, entry()), false, 'a failed append reports false rather than throwing');
});

test('observing writes one decision line and one policy line', () => {
  const dir = join(scratch(), 'record');
  observeDecision({
    recordDir: dir,
    policy: POLICY,
    source: 'tool',
    tool: 'check_action',
    action: { kind: 'file_delete', path: '.env' },
    verdict: { decision: 'DENY', clause: 'W2', reason: null, evidence: 'the file is named ".env"' },
    at: new Date('2026-08-02T10:00:00.000Z'),
  });
  const loaded = loadRecord(dir);
  assert.equal(loaded.decisions.length, 1);
  const [only] = loaded.decisions;
  assert.equal(only?.decision, 'DENY');
  assert.equal(only?.clause, 'W2');
  assert.equal(only?.source, 'tool');
  assert.equal(only?.target, '.env');
  assert.equal(only?.policy, fingerprintPolicy(POLICY));
  assert.equal(loaded.policies[0]?.clauses.length, 2, 'the clause English is recorded once, with the policy');

  // The evidence sentence is deliberately absent: it can quote a path or a
  // command fragment, and the record is read by whoever is handed the report.
  assert.ok(!readFileSync(decisionsPath(dir), 'utf8').includes('evidence'));
});

test('the record location follows the policy, and refuses to write into an installed package', () => {
  const env = (over: Record<string, string | undefined>) => ({ ...over });
  assert.equal(
    resolveRecordDir({ path: join('/vault', 'policy-compiled.json'), source: 'vault' }, env({})),
    join('/vault', 'record'),
  );
  assert.equal(
    resolveRecordDir({ path: join('/pkg', 'policy-compiled.json'), source: 'package' }, env({})),
    null,
    'a source checkout must not have a record written into the package directory',
  );
  assert.equal(resolveRecordDir(null, env({})), null);
  assert.equal(
    resolveRecordDir({ path: '/vault/policy-compiled.json', source: 'vault' }, env({ WARRANT_MCP_RECORD: '/elsewhere' })),
    resolve('/elsewhere'),
    'an explicit record location wins',
  );
});

test('a decision line names nothing beyond what the report shows', () => {
  // The record's field set is the report's column set plus the join key. This
  // pins that a future field cannot be added without someone deciding it is
  // safe to hand to an auditor.
  const dir = join(scratch(), 'record');
  appendDecision(dir, entry());
  const written = JSON.parse(readFileSync(decisionsPath(dir), 'utf8').trim()) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(written).sort(),
    ['at', 'clause', 'decision', 'kind', 'policy', 'reason', 'source', 'target', 'tool', 'v'],
  );
});

test('interleaved appends from concurrent writers keep every line readable', () => {
  // Two hook processes for one session is normal. The format's only defence is
  // that a line is written whole and terminated, so this pins that appending
  // out of order costs nothing but ordering, which the model sorts out.
  const dir = join(scratch(), 'record');
  const path = decisionsPath(dir);
  appendDecision(dir, entry({ at: '2026-08-01T09:00:02.000Z' }));
  appendFileSync(path, serializeLine(entry({ at: '2026-08-01T09:00:01.000Z' })), 'utf8');
  const loaded = loadRecord(dir);
  assert.equal(loaded.decisions.length, 2);
  assert.equal(loaded.skipped, 0);
});
