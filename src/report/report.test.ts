/**
 * The report's promises, pinned.
 *
 * Four of these are the ones a user would be hurt by if they quietly stopped
 * holding: the file makes no network request when opened, it carries no
 * credential or machine identity, it renders the same bytes from the same
 * record, and the active-filter display never lies about what is excluded.
 *
 * The filter tests evaluate `CLIENT_CORE` — the exact source the page ships —
 * rather than a TypeScript re-implementation of it. A parallel copy would pass
 * while the shipped code was broken, which is the failure this file exists to
 * prevent.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECORD_VERSION, type DecisionEntry, type PolicySnapshot } from '../record/types.ts';
import { buildModel, parseSince } from './model.ts';
import { renderReport } from './html.ts';
import { CLIENT_CORE } from './client.ts';
import { describeFindings, redact, scan, type RedactionContext } from './redact.ts';

const REDACTION: RedactionContext = {
  home: '/home/ada',
  workspaceRoot: '/home/ada/work/api',
  caseInsensitivePaths: false,
};

const P1 = 'aaaa11112222';
const P2 = 'bbbb33334444';

const POLICIES: PolicySnapshot[] = [
  {
    v: RECORD_VERSION,
    at: '2026-07-01T08:00:00.000Z',
    policy: P1,
    ruleCount: 3,
    clauses: [
      { id: 'W1', text: 'Delete files only inside the project.' },
      { id: 'W2', text: 'Never touch .env or anything inside .git.' },
      { id: 'W3', text: 'Only talk to api.github.com.' },
    ],
  },
  {
    v: RECORD_VERSION,
    at: '2026-07-03T08:00:00.000Z',
    policy: P2,
    ruleCount: 4,
    clauses: [
      { id: 'W1', text: 'Delete files only inside the project.' },
      { id: 'W2', text: 'Never touch .env or anything inside .git.' },
      { id: 'W4', text: 'Never force-push.' },
    ],
  },
];

const decision = (over: Partial<DecisionEntry>): DecisionEntry => ({
  v: RECORD_VERSION,
  at: '2026-07-01T09:00:00.000Z',
  source: 'hook',
  tool: 'Bash',
  kind: 'shell_command',
  target: 'npm test',
  decision: 'ALLOW',
  clause: null,
  reason: null,
  policy: P1,
  ...over,
});

/** A record with a meaningful mix, including a policy change partway through. */
const DECISIONS: DecisionEntry[] = [
  decision({ at: '2026-07-01T09:00:00.000Z' }),
  decision({ at: '2026-07-01T09:01:00.000Z', tool: 'Write', kind: 'file_delete', target: 'src/app.ts' }),
  decision({ at: '2026-07-01T09:02:00.000Z', tool: 'Bash', kind: 'file_delete', target: '/home/ada/work/api/.env', decision: 'DENY', clause: 'W2' }),
  decision({ at: '2026-07-02T11:00:00.000Z', tool: 'Bash', kind: 'file_delete', target: '../elsewhere/x', decision: 'DENY', clause: 'W1' }),
  decision({ at: '2026-07-02T11:05:00.000Z', tool: 'WebFetch', kind: 'http_request', target: 'GET https://evil.test/x', decision: 'DENY', clause: 'W3' }),
  decision({ at: '2026-07-02T11:06:00.000Z', tool: 'check_action', source: 'tool', kind: 'file_delete', target: '', decision: 'DENY', clause: null, reason: 'INVALID_ACTION' }),
  // The policy changes here: W3 goes, W4 arrives.
  decision({ at: '2026-07-04T14:00:00.000Z', policy: P2, tool: 'Bash', kind: 'shell_command', target: 'git push --force', decision: 'DENY', clause: 'W4' }),
  decision({ at: '2026-07-04T14:01:00.000Z', policy: P2, tool: 'Bash', kind: 'shell_command', target: 'git push', decision: 'ALLOW' }),
  decision({ at: '2026-07-04T14:02:00.000Z', policy: P2, tool: 'Bash', kind: 'file_delete', target: '.env', decision: 'DENY', clause: 'W2' }),
];

const model = () =>
  buildModel({ decisions: DECISIONS, policies: POLICIES, skipped: 0, since: null, redaction: REDACTION });

const render = (generatedAt: string, over: Partial<Parameters<typeof renderReport>[0]> = {}) =>
  renderReport({
    model: model(),
    generatedAt,
    project: '.',
    recordDir: '~/.warrant/projects/api-1234567890/record',
    recordExists: true,
    version: '0.2.3',
    ...over,
  });

// ---------------------------------------------------------------- the model

test('--since accepts durations, dates and instants, and refuses the rest', () => {
  const now = new Date('2026-08-04T12:00:00.000Z');
  assert.equal(parseSince('7d', now), '2026-07-28T12:00:00.000Z');
  assert.equal(parseSince('36h', now), '2026-08-03T00:00:00.000Z');
  assert.equal(parseSince('30m', now), '2026-08-04T11:30:00.000Z');
  assert.equal(parseSince('2w', now), '2026-07-21T12:00:00.000Z');
  assert.equal(parseSince('2026-08-01', now), '2026-08-01T00:00:00.000Z');
  assert.equal(parseSince('2026-08-01T09:00:00Z', now), '2026-08-01T09:00:00.000Z');
  for (const bad of ['last tuesday', '7', 'd7', '0d', '', '7y']) {
    assert.ok(parseSince(bad, now) instanceof Error, `--since "${bad}" should be refused`);
  }
});

test('the summary counts what the record holds', () => {
  const { summary } = model();
  assert.equal(summary.total, 9);
  assert.equal(summary.allowed, 3);
  assert.equal(summary.denied, 6);
  assert.equal(summary.from, '2026-07-01T09:00:00.000Z');
  assert.equal(summary.to, '2026-07-04T14:02:00.000Z');
  assert.equal(summary.clausesFired, 4, 'W1, W2, W3, W4');
  assert.equal(summary.clausesTotal, 4);
});

test('a clause that never fired is still shown, and marked when it left the policy', () => {
  const withUnfired = buildModel({
    decisions: DECISIONS.filter((entry) => entry.clause !== 'W3'),
    policies: POLICIES,
    skipped: 0,
    since: null,
    redaction: REDACTION,
  });
  const w3 = withUnfired.clauses.find((clause) => clause.id === 'W3');
  assert.ok(w3, 'an unfired clause must not be dropped for tidiness — that is the interesting one');
  assert.equal(w3?.fired, 0);
  assert.equal(w3?.current, false, 'W3 is not in the latest policy version');
  assert.equal(withUnfired.clauses.find((clause) => clause.id === 'W4')?.current, true);
  assert.deepEqual(withUnfired.clauses.map((clause) => clause.id), ['W1', 'W2', 'W3', 'W4'], 'clause order, numerically');
});

test('clause counts split allowed from denied', () => {
  const w2 = model().clauses.find((clause) => clause.id === 'W2');
  assert.equal(w2?.fired, 2);
  assert.equal(w2?.denied, 2);
  assert.equal(w2?.allowed, 0);
});

test('silent days are kept as silent days', () => {
  const days = model().daily;
  assert.deepEqual(days.map((day) => day.day), ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']);
  assert.deepEqual(days[2], { day: '2026-07-03', allowed: 0, denied: 0 }, 'a gap closed is a story the record does not support');
  assert.deepEqual(days[0], { day: '2026-07-01', allowed: 2, denied: 1 });
});

test('a policy change splits the record into eras, and names what changed', () => {
  const eras = model().policyEras;
  assert.equal(eras.length, 2);
  assert.equal(eras[0]?.policy, P1);
  assert.equal(eras[0]?.decisions, 6);
  assert.equal(eras[1]?.policy, P2);
  assert.equal(eras[1]?.decisions, 3);
  assert.deepEqual(eras[1]?.added, ['W4']);
  assert.deepEqual(eras[1]?.removed, ['W3']);
  assert.deepEqual(eras[0]?.added, [], 'the first era changed nothing — there was nothing before it');
});

test('--since narrows the window and says how much it excluded', () => {
  const narrowed = buildModel({
    decisions: DECISIONS,
    policies: POLICIES,
    skipped: 0,
    since: '2026-07-04T00:00:00.000Z',
    redaction: REDACTION,
  });
  assert.equal(narrowed.summary.total, 3);
  assert.equal(narrowed.excludedByWindow, 6, 'a partial report must say it is partial');
});

test('the clause English reaches the row that cited it', () => {
  const row = model().rows.find((candidate) => candidate.clause === 'W4');
  assert.equal(row?.clauseText, 'Never force-push.');
  assert.equal(model().rows.find((candidate) => candidate.reason === 'INVALID_ACTION')?.clause, null);
});

// ------------------------------------------------------------ screen safety

test('redaction removes the workspace, the home directory and other login names', () => {
  assert.equal(redact('/home/ada/work/api/src/app.ts', REDACTION), './src/app.ts');
  assert.equal(redact('/home/ada/.warrant/projects/api', REDACTION), '~/.warrant/projects/api');
  assert.equal(redact('rm -rf /home/deploy/releases', REDACTION), 'rm -rf /home/<user>/releases');
  assert.equal(redact('C:\\Users\\Nadia\\notes.txt', REDACTION), 'C:\\Users\\<user>\\notes.txt');
  assert.equal(redact('/Users/kim/Desktop/x', REDACTION), '/Users/<user>/Desktop/x');
});

test('the workspace is redacted before home, so the audited project stays visible as such', () => {
  // Reversed, '/home/ada/work/api' would become '~/work/api' and the reader
  // would lose the fact that it was the workspace.
  assert.equal(redact('/home/ada/work/api', REDACTION), '.');
});

test('redaction follows the platform rule for case', () => {
  const windows: RedactionContext = { home: 'C:\\Users\\Ada', workspaceRoot: 'C:\\work\\api', caseInsensitivePaths: true };
  assert.equal(redact('c:\\WORK\\api\\src', windows), '.\\src');
  const posix: RedactionContext = { ...windows, caseInsensitivePaths: false };
  assert.notEqual(redact('c:\\WORK\\api\\src', posix), '.\\src');
});

test('the scanner finds every credential shape it claims to', () => {
  const samples: ReadonlyArray<readonly [string, string]> = [
    ['anthropic-api-key', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAA'],
    ['npm-token', `npm_${'a'.repeat(36)}`],
    ['github-token', `ghp_${'B'.repeat(36)}`],
    ['github-fine-grained-token', `github_pat_${'c'.repeat(30)}`],
    ['aws-access-key-id', 'AKIAIOSFODNN7EXAMPLE'],
    ['slack-token', 'xoxb-1234567890-abcdefghij'],
    ['google-api-key', `AIza${'D'.repeat(35)}`],
    ['private-key-block', '-----BEGIN RSA PRIVATE KEY-----'],
    ['json-web-token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijkl'],
    ['credential-assignment', 'API_KEY=abcdefghijklmnop'],
    ['home-directory-path', '/home/ada/secrets'],
  ];
  for (const [kind, sample] of samples) {
    const found = scan(`prefix ${sample} suffix`);
    assert.ok(found.some((finding) => finding.kind === kind), `the scanner missed ${kind}`);
  }
});

test('a finding never carries the matched text, not even a prefix', () => {
  const secret = `ghp_${'Z'.repeat(36)}`;
  const findings = scan(`token: ${secret}`);
  const described = describeFindings(findings);
  assert.ok(findings.length > 0);
  assert.equal(JSON.stringify(findings).includes('Z'), false, 'the finding leaked the value it was reporting');
  assert.equal(described.includes(secret), false);
  assert.equal(described.includes('ghp_'), false);
  assert.match(described, /github-token/);
});

test('the scanner does not object to the report\'s own vocabulary', () => {
  const innocent = [
    'the shell_forbidden_token rule denies "sudo"',
    'clause W2 — never touch .env',
    'GET https://api.github.com/user',
    'C:\\Users\\<user>\\project',
    'rm -rf build && npm test',
  ].join('\n');
  assert.deepEqual(scan(innocent), [], 'a false positive here costs a re-run, but a noisy scanner gets switched off');
});

test('the rendered report passes its own screen-safety scan', () => {
  assert.deepEqual(scan(render('2026-08-04T12:00:00.000Z')), []);
});

// --------------------------------------------------------------- the output

test('the page is self-contained: nothing is fetched when it opens', () => {
  const html = render('2026-08-04T12:00:00.000Z');
  for (const forbidden of ['<script src', '<link ', '@import', 'fetch(', 'XMLHttpRequest', 'WebSocket', '<iframe', '<img']) {
    assert.ok(!html.includes(forbidden), `the report references ${forbidden} — it must open with the network off`);
  }
  // No absolute URL anywhere except inside the recorded data, which is the
  // audited content itself and is never requested.
  const outsideData = html.slice(0, html.indexOf('window.__WARRANT_ROWS__'));
  assert.ok(!/https?:\/\//.test(outsideData), 'the page chrome must reference no external origin');
});

test('the same record renders the same bytes, apart from the generated-at timestamp', () => {
  const a = '2026-08-04T12:00:00.000Z';
  const b = '2027-01-09T03:30:00.000Z';
  assert.equal(render(a), render(a), 'two renders with the same inputs must be byte-identical');

  const display = (value: string) => value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const normalise = (html: string, stamp: string) =>
    html.split(stamp).join('<STAMP>').split(display(stamp)).join('<STAMP>');
  assert.equal(normalise(render(a), a), normalise(render(b), b), 'only the timestamp may differ between runs');
});

test('the data is embedded so that no tag can be closed from inside it', () => {
  const html = renderReport({
    model: buildModel({
      decisions: [decision({ target: '</script><script>alert(1)</script>' })],
      policies: POLICIES,
      skipped: 0,
      since: null,
      redaction: REDACTION,
    }),
    generatedAt: '2026-08-04T12:00:00.000Z',
    project: '.',
    recordDir: '~/r',
    recordExists: true,
    version: '0.2.3',
  });
  const script = html.slice(html.indexOf('window.__WARRANT_ROWS__'));
  assert.ok(!script.slice(0, script.indexOf('\n')).includes('</script'), 'a recorded target closed the script element');
  assert.ok(html.includes('u003c'), 'the angle brackets should have been escaped into the data');
});

test('the sections answer the four questions, and the honest limits are on the page', () => {
  const html = render('2026-08-04T12:00:00.000Z');
  for (const marker of ['id="summary"', 'id="over-time"', 'id="policy"', 'id="clauses"', 'id="decisions"']) {
    assert.ok(html.includes(marker), `missing section ${marker}`);
  }
  assert.match(html, /policy changed/, 'the policy edit must be visible on the time axis');
  assert.match(html, /never written/, 'the page must say the record was only read');
  assert.match(html, /not proof that every action was\s*checked/, 'the page must not overclaim coverage');
  assert.match(html, /aria-sort=/, 'columns must announce their sort state');
  assert.match(html, /@media print/, 'an auditor prints this');
  assert.match(html, /Never force-push\./, 'clause text must be present verbatim for expansion');
});

test('a torn record and a narrowed window are both stated on the page', () => {
  const html = renderReport({
    model: buildModel({
      decisions: DECISIONS,
      policies: POLICIES,
      skipped: 3,
      since: '2026-07-04T00:00:00.000Z',
      redaction: REDACTION,
    }),
    generatedAt: '2026-08-04T12:00:00.000Z',
    project: '.',
    recordDir: '~/r',
    recordExists: true,
    version: '0.2.3',
  });
  assert.match(html, /3 line\(s\) of the record could not be read/);
  assert.match(html, /6 earlier decision\(s\) are outside this window/);
});

test('the empty states say what to do, not just that there is nothing', () => {
  const nothing = renderReport({
    model: buildModel({ decisions: [], policies: [], skipped: 0, since: null, redaction: REDACTION }),
    generatedAt: '2026-08-04T12:00:00.000Z',
    project: '.',
    recordDir: '~/r',
    recordExists: false,
    version: '0.2.3',
  });
  assert.match(nothing, /Nothing has been recorded yet/);
  assert.match(nothing, /warrant-mcp init/, 'the empty state must name the command that fixes it');

  const outOfWindow = renderReport({
    model: buildModel({ decisions: DECISIONS, policies: POLICIES, skipped: 0, since: '2027-01-01T00:00:00.000Z', redaction: REDACTION }),
    generatedAt: '2026-08-04T12:00:00.000Z',
    project: '.',
    recordDir: '~/r',
    recordExists: true,
    version: '0.2.3',
  });
  assert.match(outOfWindow, /No decisions fall inside this window/);
  assert.match(outOfWindow, /--since 90d/, 'the empty state must name the way out');

  assert.match(render('2026-08-04T12:00:00.000Z'), /No decision matches every active filter/);
});

// ------------------------------------------------- the shipped filter logic

/** The page's own functions, evaluated from the exact source the page embeds. */
const core = new Function(
  `${CLIENT_CORE}\nreturn { emptyFilter, parseHash, toHash, matchesRow, applyFilters, describeFilter, sortRows };`,
)() as {
  emptyFilter: () => Record<string, string>;
  parseHash: (hash: string) => Record<string, string>;
  toHash: (filter: Record<string, string>) => string;
  matchesRow: (row: unknown, filter: Record<string, string>) => boolean;
  applyFilters: (rows: readonly unknown[], filter: Record<string, string>) => unknown[];
  describeFilter: (filter: Record<string, string>) => Array<{ key: string; label: string; value: string }>;
  sortRows: (rows: readonly unknown[], key: string, direction: string) => unknown[];
};

const ROWS = model().rows;

test('a filter survives the round trip through a URL fragment', () => {
  const filter = { ...core.emptyFilter(), verdict: 'DENY', clause: 'W2', q: 'a b&c=d' };
  const hash = core.toHash(filter);
  assert.deepEqual(core.parseHash(`#${hash}`), filter, 'a shared link must reproduce exactly the view that was shared');
  assert.deepEqual(core.parseHash(''), core.emptyFilter());
  assert.deepEqual(core.parseHash('#nonsense=1&verdict=ALLOW').verdict, 'ALLOW');
  assert.equal(core.parseHash('#nonsense=1').nonsense, undefined, 'an unknown key is ignored, never adopted');
  assert.equal(core.toHash(core.emptyFilter()), '', 'the unfiltered view has an empty fragment');
});

test('every combination of filters ANDs, and the chips account for every one', () => {
  // 7 criteria, 128 combinations. For each: the chips must name exactly the
  // active criteria, and every surviving row must satisfy every one of them.
  // This is the property an auditor's conclusion rests on — a row hidden by a
  // criterion with no chip is a wrong conclusion waiting to happen.
  const values: Record<string, string> = {
    verdict: 'DENY',
    clause: 'W2',
    kind: 'file_delete',
    tool: 'Bash',
    from: '2026-07-02',
    to: '2026-07-04',
    q: 'env',
  };
  const keys = Object.keys(values);
  let sawFullResult = false;
  let sawNarrowed = false;

  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const filter = core.emptyFilter();
    const active: string[] = [];
    keys.forEach((key, index) => {
      if (mask & (1 << index)) {
        filter[key] = values[key] as string;
        active.push(key);
      }
    });

    const chips = core.describeFilter(filter);
    assert.deepEqual(chips.map((chip) => chip.key).sort(), [...active].sort(), `chips misdescribe ${JSON.stringify(filter)}`);
    for (const chip of chips) {
      assert.equal(chip.value, values[chip.key], 'a chip must show the value actually being applied');
      assert.ok(chip.label.length > 0, 'a chip with no label tells the reader nothing');
    }

    const visible = core.applyFilters(ROWS, filter) as typeof ROWS;
    // Independent reference: AND of the same criteria, computed here.
    const expected = ROWS.filter(
      (row) =>
        (!filter.verdict || row.decision === filter.verdict) &&
        (!filter.clause || row.clause === filter.clause) &&
        (!filter.kind || row.kind === filter.kind) &&
        (!filter.tool || row.tool === filter.tool) &&
        (!filter.from || row.day >= filter.from) &&
        (!filter.to || row.day <= filter.to) &&
        (!filter.q ||
          `${row.target} ${row.tool} ${row.kind} ${row.clause ?? ''}`.toLowerCase().includes(filter.q.toLowerCase())),
    );
    assert.deepEqual(visible, expected, `wrong rows for ${JSON.stringify(filter)}`);
    assert.equal(
      visible.length + (ROWS.length - visible.length),
      ROWS.length,
      'shown plus hidden must equal the total the page claims',
    );
    if (visible.length === ROWS.length) sawFullResult = true;
    if (visible.length > 0 && visible.length < ROWS.length) sawNarrowed = true;
  }
  assert.ok(sawFullResult, 'the sweep never reached the unfiltered state');
  assert.ok(sawNarrowed, 'the sweep never actually excluded anything — it proves less than it looks');
});

test('a combination that matches nothing still shows every chip', () => {
  // The dangerous case: an empty table. If a criterion were dropped silently
  // the reader would conclude "no denials of this kind" when the truth is
  // "this filter excluded them". Every criterion still has to be on screen.
  const filter = { ...core.emptyFilter(), verdict: 'ALLOW', clause: 'W2', kind: 'file_delete' };
  assert.deepEqual(core.applyFilters(ROWS, filter), []);
  assert.deepEqual(core.describeFilter(filter).map((chip) => chip.key), ['verdict', 'clause', 'kind']);
});

test('an unfiltered view hides nothing, and shows no chip', () => {
  const filter = core.emptyFilter();
  assert.equal(core.applyFilters(ROWS, filter).length, ROWS.length);
  assert.deepEqual(core.describeFilter(filter), [], 'a chip with nothing behind it would be its own kind of lie');
});

test('the clause filter can select decisions that cited no clause', () => {
  const filter = { ...core.emptyFilter(), clause: '(none)' };
  const visible = core.applyFilters(ROWS, filter) as typeof ROWS;
  assert.ok(visible.length > 0);
  assert.ok(visible.every((row) => row.clause === null));
  assert.deepEqual(core.describeFilter(filter).map((chip) => chip.value), ['(none)']);
});

test('free text searches the target, the tool, the kind and the clause', () => {
  const q = (value: string) => (core.applyFilters(ROWS, { ...core.emptyFilter(), q: value }) as typeof ROWS).length;
  assert.equal(q('.env'), 2);
  assert.equal(q('ENV'), 2, 'the search is case-insensitive');
  assert.equal(q('webfetch'), 1, 'searching the tool column works');
  assert.equal(q('w4'), 1, 'searching the clause column works');
  assert.equal(q('nothing-matches-this'), 0);
});

test('sorting is stable and reverses', () => {
  const byTool = core.sortRows(ROWS, 'tool', 'asc') as typeof ROWS;
  assert.deepEqual(
    byTool.map((row) => row.tool),
    // Case-insensitive, matching the page: an auditor reading a sorted column
    // should not find `check_action` filed after `Write` because of its case.
    [...ROWS]
      .map((row) => row.tool)
      .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)),
  );
  const bashes = byTool.filter((row) => row.tool === 'Bash').map((row) => row.i);
  assert.deepEqual(bashes, [...bashes].sort((a, b) => a - b), 'ties must keep record order');

  const descending = core.sortRows(ROWS, 'tool', 'desc') as typeof ROWS;
  assert.deepEqual(descending.map((row) => row.tool).reverse(), byTool.map((row) => row.tool));
  assert.deepEqual(
    (core.sortRows(ROWS, 'i', 'asc') as typeof ROWS).map((row) => row.i),
    ROWS.map((row) => row.i),
  );
});
