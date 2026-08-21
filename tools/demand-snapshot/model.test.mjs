/**
 * Fixture tests for the demand-snapshot model. Every input is a literal in this
 * file: the suite never reaches the network, so it cannot go red because npm was
 * slow, and it cannot go green because a cached success was lying around.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORBIDDEN_CLAIM_WORDS,
  NOT_FOUND,
  SCHEMA_VERSION,
  SnapshotError,
  UNOBSERVABLE,
  buildSnapshot,
  parseGitHubRepo,
  parseNpmRange,
  parseOwnerTraffic,
  renderSnapshot,
  separateWindows,
  utcDay,
  windowTotal,
} from './model.mjs';

const NPM_RANGE = {
  downloads: [
    { day: '2026-08-17', downloads: 272 },
    { day: '2026-08-18', downloads: 134 },
    { day: '2026-08-19', downloads: 56 },
    { day: '2026-08-20', downloads: 0 },
  ],
};

const PUBLISHED_AT = '2026-08-18T23:44:51.480Z';

const BASE = {
  observedAt: '2026-08-21T09:30:00.000Z',
  packageName: 'warrant-mcp',
  version: '0.2.6',
  publishedAt: PUBLISHED_AT,
  npmPayload: NPM_RANGE,
  npmProviderNote: null,
  gitHubPayload: { stargazers_count: 1, forks_count: 0, subscribers_count: 1, open_issues_count: 1, has_discussions: false, pushed_at: '2026-08-20T04:06:10Z' },
  ownerTrafficPayload: null,
  launchLink: { status: NOT_FOUND, searched: ['news.ycombinator.com'], note: 'no launch link recorded' },
};

test('npm range parses into day-keyed counts', () => {
  const byDay = parseNpmRange(NPM_RANGE);
  assert.equal(byDay.size, 4);
  assert.equal(byDay.get('2026-08-17'), 272);
  assert.equal(byDay.get('2026-08-20'), 0);
});

test('the publish day is the UTC day of the publish timestamp, not the local one', () => {
  // 23:44Z on the 18th is already the 19th in IST; npm reports on UTC days, and
  // getting this wrong would move a contaminated day into the clean window.
  assert.equal(utcDay(PUBLISHED_AT), '2026-08-18');
});

test('windows separate pre-publish, publish-day and post-publish, and are totalled apart', () => {
  const windows = separateWindows(parseNpmRange(NPM_RANGE), utcDay(PUBLISHED_AT));
  assert.deepEqual(windows.prePublish.map((r) => r.day), ['2026-08-17']);
  assert.deepEqual(windows.publishDay.map((r) => r.day), ['2026-08-18']);
  assert.deepEqual(windows.postPublish.map((r) => r.day), ['2026-08-19', '2026-08-20']);
  assert.equal(windowTotal(windows.prePublish), 272);
  assert.equal(windowTotal(windows.publishDay), 134);
  assert.equal(windowTotal(windows.postPublish), 56);
});

test('the record never offers a combined total across windows', () => {
  const snapshot = buildSnapshot(BASE);
  assert.equal(typeof snapshot.npm.combinedTotal, 'string');
  assert.match(snapshot.npm.combinedTotal, /NOT COMPUTED/);
  assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
});

test('missing owner traffic is UNOBSERVABLE with a reason, never zero', () => {
  const traffic = parseOwnerTraffic(null);
  assert.equal(traffic.available, false);
  assert.equal(traffic.views, UNOBSERVABLE);
  assert.equal(traffic.uniques, UNOBSERVABLE);
  assert.match(traffic.reason, /no owner credential/);
  // and when it IS supplied, the numbers come through
  const withToken = parseOwnerTraffic({ count: 40, uniques: 9 });
  assert.equal(withToken.available, true);
  assert.equal(withToken.views, 40);
  assert.equal(withToken.uniques, 9);
});

test('a provider refusal fails closed rather than reading as zero downloads', () => {
  // What api.npmjs.org actually returns for a range it will not serve.
  assert.throws(() => parseNpmRange({ error: 'no stats for this package for this range (0008-08-21:2026-08-21)' }), SnapshotError);
  assert.throws(() => parseNpmRange(null), SnapshotError);
  assert.throws(() => parseNpmRange({ downloads: 'nope' }), SnapshotError);
});

test('malformed rows are refused, not coerced', () => {
  assert.throws(() => parseNpmRange({ downloads: [{ day: '17-08-2026', downloads: 1 }] }), SnapshotError);
  assert.throws(() => parseNpmRange({ downloads: [{ day: '2026-08-17', downloads: -1 }] }), SnapshotError);
  assert.throws(() => parseNpmRange({ downloads: [{ day: '2026-08-17', downloads: 1.5 }] }), SnapshotError);
  assert.throws(() => parseNpmRange({ downloads: [{ day: '2026-08-17', downloads: null }] }), SnapshotError);
  assert.throws(
    () => parseNpmRange({ downloads: [{ day: '2026-08-17', downloads: 1 }, { day: '2026-08-17', downloads: 2 }] }),
    SnapshotError,
  );
});

test('absent GitHub fields become UNOBSERVABLE rather than defaults', () => {
  const parsed = parseGitHubRepo({ stargazers_count: 3 });
  assert.equal(parsed.stars, 3);
  assert.equal(parsed.forks, UNOBSERVABLE);
  assert.equal(parsed.watchers, UNOBSERVABLE);
  assert.equal(parsed.hasDiscussions, UNOBSERVABLE);
  // a whole-payload refusal is recorded as UNOBSERVABLE by the builder
  const snapshot = buildSnapshot({ ...BASE, gitHubPayload: null });
  assert.equal(snapshot.github.public, UNOBSERVABLE);
});

test('a missing launch link is NOT FOUND with the places searched, not silence', () => {
  const snapshot = buildSnapshot(BASE);
  assert.equal(snapshot.launch.status, NOT_FOUND);
  assert.deepEqual(snapshot.launch.searched, ['news.ycombinator.com']);
});

test('the rendering says downloads are downloads and refuses every claim word', () => {
  const text = renderSnapshot(buildSnapshot(BASE));
  assert.match(text, /downloads only — not users, customers, intent, conversion or revenue/);
  const body = text.toLowerCase();
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    // the disclaimer line is the one legitimate mention; strip it before checking
    const withoutDisclaimer = body.replace(/downloads only[^\n]*\n/g, '');
    assert.ok(!withoutDisclaimer.includes(word), `rendering used the claim word "${word}"`);
  }
});

test('the renderer refuses output that acquired a claim word', () => {
  // Prove the guard is real: smuggle one in through a field the template prints.
  const snapshot = buildSnapshot(BASE);
  snapshot.npm.providerNote = 'adoption is up';
  assert.throws(() => renderSnapshot(snapshot), SnapshotError);
});

test('identical inputs render identical bytes', () => {
  assert.equal(renderSnapshot(buildSnapshot(BASE)), renderSnapshot(buildSnapshot(BASE)));
});
