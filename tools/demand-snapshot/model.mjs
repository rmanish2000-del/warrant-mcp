/**
 * The weekly demand snapshot — pure model. No network, no clock, no filesystem;
 * every input arrives as a parameter, which is what makes the fixture tests
 * possible and the output reproducible.
 *
 * WHAT THIS IS FOR. The first post-launch pass had to be re-derived by hand from
 * contaminated npm counts and inaccessible GitHub traffic, and a second hand
 * pass would not have been comparable with the first. This turns the snapshot
 * into a deterministic artefact so a later pass is a diff rather than a fresh
 * scrape and a fresh interpretation.
 *
 * WHAT A DOWNLOAD IS. A download is a download. It is not a user, not a
 * customer, not intent, not conversion and not revenue: the registry cannot
 * distinguish a person from CI, a mirror, a retry or the maintainer's own
 * install-verify loop, and this project's own publish days are known to be
 * contaminated by exactly that. The renderer refuses to emit any of those words
 * (see FORBIDDEN_CLAIM_WORDS) so the artefact cannot quietly acquire a meaning
 * the data does not carry.
 *
 * FAIL CLOSED. A provider that refuses, or returns something this module cannot
 * parse, produces an explicit UNOBSERVABLE or NOT FOUND field — never a zero, an
 * empty list, or a value carried over from an earlier run. A missing observation
 * and an observed absence are different facts and are recorded differently.
 */

/**
 * Bumped when the record shape changes, so later passes can tell shapes apart.
 * v2: `launch` became a list of recorded surfaces rather than a single link, and
 * a NOT FOUND launch now carries the scope searched.
 */
export const SCHEMA_VERSION = 2;

/**
 * A field the provider would not give us: the question is open, not answered.
 * Distinct from NOT_FOUND, which is an observed absence.
 */
export const UNOBSERVABLE = 'UNOBSERVABLE';

/** A field we could look at, and the thing was not there. */
export const NOT_FOUND = 'NOT FOUND';

/**
 * Words the rendered artefact must never contain about download figures. Listed
 * rather than left to judgement, because the whole failure mode is a number
 * acquiring a meaning between one report and the next.
 */
export const FORBIDDEN_CLAIM_WORDS = [
  'users',
  'customers',
  'demand',
  'intent',
  'conversion',
  'revenue',
  'adoption',
  'traction',
];

/**
 * The one sentence in which the forbidden words may legitimately appear, because
 * it is the sentence denying them. Exempted from the scan by exact string, not
 * by a loose pattern, so nothing else can hide behind it.
 */
export const DOWNLOADS_DISCLAIMER =
  'downloads only — not users, customers, intent, conversion or revenue';

class SnapshotError extends Error {}

/** Fail closed: refuse rather than guess at a shape we did not expect. */
function refuse(what, detail) {
  throw new SnapshotError(`${what}: ${detail}`);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the npm downloads range payload into day → count.
 *
 * Refuses an absent payload, a non-array `downloads`, a malformed day, or a
 * count that is not a non-negative integer. A provider that answered with an
 * error object rather than data reaches here as a missing `downloads` array and
 * is refused, which is the intended behaviour: no data is not zero downloads.
 */
export function parseNpmRange(payload) {
  if (payload === null || typeof payload !== 'object') refuse('npm range', 'payload is not an object');
  const rows = payload.downloads;
  if (!Array.isArray(rows)) refuse('npm range', 'payload has no downloads array');
  const byDay = new Map();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') refuse('npm range', 'a row is not an object');
    const { day, downloads } = row;
    if (typeof day !== 'string' || !DAY.test(day)) refuse('npm range', `bad day ${JSON.stringify(day)}`);
    if (!Number.isInteger(downloads) || downloads < 0) {
      refuse('npm range', `bad count ${JSON.stringify(downloads)} for ${day}`);
    }
    if (byDay.has(day)) refuse('npm range', `duplicate day ${day}`);
    byDay.set(day, downloads);
  }
  if (byDay.size === 0) refuse('npm range', 'no days in payload');
  return byDay;
}

/** The UTC calendar day of an ISO timestamp — the day boundary npm reports on. */
export function utcDay(isoTimestamp) {
  if (typeof isoTimestamp !== 'string') refuse('timestamp', 'not a string');
  const at = new Date(isoTimestamp);
  if (Number.isNaN(at.getTime())) refuse('timestamp', `unparseable ${isoTimestamp}`);
  return at.toISOString().slice(0, 10);
}

/**
 * Split daily downloads into three windows that must never be added together.
 *
 * `prePublish` predates the release under observation and cannot describe it.
 * `publishDay` contains the maintainer's own publish and verification installs —
 * this repository's own record shows exactly that. `postPublish` is the only
 * window that could carry anything about the released version, and it still says
 * only how many times bytes were fetched.
 */
export function separateWindows(byDay, publishDayUtc) {
  if (!DAY.test(publishDayUtc)) refuse('window split', `bad publish day ${publishDayUtc}`);
  const windows = { prePublish: [], publishDay: [], postPublish: [] };
  for (const day of [...byDay.keys()].sort()) {
    const bucket = day < publishDayUtc ? 'prePublish' : day === publishDayUtc ? 'publishDay' : 'postPublish';
    windows[bucket].push({ day, downloads: byDay.get(day) });
  }
  return windows;
}

/** Total for one window only. Deliberately never offered across windows. */
export function windowTotal(rows) {
  return rows.reduce((sum, row) => sum + row.downloads, 0);
}

/**
 * Public GitHub repository metadata, reduced to the fields we record. Anything
 * the payload does not carry becomes UNOBSERVABLE rather than a default.
 */
export function parseGitHubRepo(payload) {
  if (payload === null || typeof payload !== 'object') refuse('github repo', 'payload is not an object');
  const pick = (value) => (Number.isInteger(value) && value >= 0 ? value : UNOBSERVABLE);
  return {
    stars: pick(payload.stargazers_count),
    forks: pick(payload.forks_count),
    watchers: pick(payload.subscribers_count),
    openIssuesIncludingPullRequests: pick(payload.open_issues_count),
    hasDiscussions: typeof payload.has_discussions === 'boolean' ? payload.has_discussions : UNOBSERVABLE,
    pushedAt: typeof payload.pushed_at === 'string' ? payload.pushed_at : UNOBSERVABLE,
  };
}

/**
 * Owner traffic (unique visitors, clones) is not public. Without an owner token
 * the honest record is UNOBSERVABLE, and this function never asks for, creates,
 * stores or echoes a token — it is handed an already-fetched payload or null.
 */
export function parseOwnerTraffic(payload) {
  if (payload === null || payload === undefined) {
    return { available: false, reason: 'no owner credential supplied to this run', views: UNOBSERVABLE, uniques: UNOBSERVABLE };
  }
  if (typeof payload !== 'object') refuse('owner traffic', 'payload is not an object');
  const { count, uniques } = payload;
  if (!Number.isInteger(count) || !Number.isInteger(uniques)) {
    refuse('owner traffic', 'count/uniques missing or not integers');
  }
  return { available: true, reason: null, views: count, uniques };
}

/**
 * Launch records — the event that starts the counting window.
 *
 * This exists because the fleet spent two days reasoning about a launch that had
 * not happened: "launched" was carried as an inferred state rather than as an
 * event with a link and a timestamp, and nothing could be checked against it.
 * The runner used to hard-code the absence, which would have frozen that
 * absence into every future snapshot. Records are now input.
 *
 * Zero records is a legitimate answer and stays explicit: NOT FOUND, carrying
 * the scope that was searched, so a later reader can tell "we looked there and
 * found nothing" from "nobody looked". Surfaces are kept apart and never pooled
 * — a null result on a narrow, well-targeted audience means something a null
 * result on a broad one does not.
 */
export function parseLaunchRecords(records, searched) {
  if (records === null || records === undefined) {
    return { status: NOT_FOUND, searched: searched ?? [], surfaces: [] };
  }
  if (!Array.isArray(records)) refuse('launch records', 'not an array');
  if (records.length === 0) {
    return { status: NOT_FOUND, searched: searched ?? [], surfaces: [] };
  }
  const seen = new Set();
  const surfaces = records.map((record) => {
    if (record === null || typeof record !== 'object') refuse('launch record', 'not an object');
    const { surface, url, postedAt } = record;
    if (typeof surface !== 'string' || surface.trim() === '') refuse('launch record', 'surface missing');
    if (seen.has(surface)) refuse('launch record', `duplicate surface ${surface}`);
    seen.add(surface);
    if (typeof url !== 'string') refuse('launch record', `url missing for ${surface}`);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      refuse('launch record', `unparseable url for ${surface}: ${url}`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      refuse('launch record', `url for ${surface} is not http(s)`);
    }
    // Throws on a malformed timestamp, which is the point: a fabricated or
    // unreadable time would silently move the window this record starts.
    const at = utcDay(postedAt);
    return { surface, url, postedAt, postedDayUtc: at };
  });
  return { status: 'RECORDED', searched: searched ?? [], surfaces };
}

/**
 * Assemble the versioned record. `observedAt` and every provider timestamp are
 * passed in, so the same inputs always produce the same record.
 */
export function buildSnapshot(input) {
  const {
    observedAt,
    packageName,
    version,
    publishedAt,
    npmPayload,
    npmProviderNote,
    gitHubPayload,
    ownerTrafficPayload,
    launchRecords,
    launchSearched,
  } = input;

  const publishDayUtc = utcDay(publishedAt);
  const windows = separateWindows(parseNpmRange(npmPayload), publishDayUtc);

  return {
    schemaVersion: SCHEMA_VERSION,
    observedAt,
    subject: { packageName, version, publishedAt, publishDayUtc },
    launch: parseLaunchRecords(launchRecords, launchSearched),
    npm: {
      measures: DOWNLOADS_DISCLAIMER,
      provider: 'api.npmjs.org/downloads/range',
      providerNote: npmProviderNote ?? null,
      windows,
      totals: {
        prePublish: windowTotal(windows.prePublish),
        publishDay: windowTotal(windows.publishDay),
        postPublish: windowTotal(windows.postPublish),
      },
      combinedTotal: 'DELIBERATELY NOT COMPUTED — the three windows describe different things',
    },
    github: {
      provider: 'api.github.com/repos',
      public: gitHubPayload === null ? UNOBSERVABLE : parseGitHubRepo(gitHubPayload),
      ownerTraffic: parseOwnerTraffic(ownerTrafficPayload),
      discussionsCount: UNOBSERVABLE,
    },
  };
}

/** Surfaces listed one per line and never pooled into a single figure. */
function renderLaunch(launch) {
  if (launch.status === NOT_FOUND) {
    const where = launch.searched.length > 0 ? ` (searched: ${launch.searched.join(', ')})` : '';
    return `${NOT_FOUND}${where}`;
  }
  const lines = launch.surfaces.map(
    (s) => `    ${s.surface}  ${s.postedAt}  ${s.url}`,
  );
  return [`${launch.surfaces.length} surface(s), reported apart`, ...lines].join('\n');
}

const show = (value) => (typeof value === 'number' ? String(value) : value);

/**
 * Compact Markdown rendering of a record. Throws if the text it produced would
 * contain a forbidden claim word, so the guard cannot be defeated by editing the
 * template later — the check runs on the output, not on the intention.
 */
export function renderSnapshot(snapshot) {
  const rows = (bucket) =>
    snapshot.npm.windows[bucket].length === 0
      ? '    (no days in window)'
      : snapshot.npm.windows[bucket].map((r) => `    ${r.day}  ${r.downloads}`).join('\n');

  const g = snapshot.github.public;
  const t = snapshot.github.ownerTraffic;

  const text = `# Weekly snapshot — ${snapshot.subject.packageName}

Schema v${snapshot.schemaVersion} · observed ${snapshot.observedAt}
Subject: ${snapshot.subject.packageName}@${snapshot.subject.version}, published ${snapshot.subject.publishedAt} (UTC day ${snapshot.subject.publishDayUtc})
Launch: ${renderLaunch(snapshot.launch)}

## npm — ${snapshot.npm.measures}

Provider: ${snapshot.npm.provider}${snapshot.npm.providerNote ? ` (${snapshot.npm.providerNote})` : ''}

  before the publish (cannot describe this release) — total ${snapshot.npm.totals.prePublish}
${rows('prePublish')}
  publish day (includes the maintainer's own publish and verification fetches) — total ${snapshot.npm.totals.publishDay}
${rows('publishDay')}
  after the publish — total ${snapshot.npm.totals.postPublish}
${rows('postPublish')}

The three windows are reported apart and are never summed: ${snapshot.npm.combinedTotal}

## GitHub

  stars                      ${show(g === UNOBSERVABLE ? UNOBSERVABLE : g.stars)}
  forks                      ${show(g === UNOBSERVABLE ? UNOBSERVABLE : g.forks)}
  watchers                   ${show(g === UNOBSERVABLE ? UNOBSERVABLE : g.watchers)}
  open issues (incl. PRs)    ${show(g === UNOBSERVABLE ? UNOBSERVABLE : g.openIssuesIncludingPullRequests)}
  discussions enabled        ${show(g === UNOBSERVABLE ? UNOBSERVABLE : g.hasDiscussions)}
  discussions count          ${snapshot.github.discussionsCount}
  owner unique visitors      ${show(t.uniques)}
  owner views                ${show(t.views)}${t.available ? '' : `\n  owner traffic unavailable   ${t.reason}`}

A figure recorded as ${UNOBSERVABLE} was not answered by the provider on this run. A figure recorded as ${NOT_FOUND} was looked for and was absent. Neither is a zero.
`;

  // Scan everything except the disclaimer itself.
  const lowered = text.split(DOWNLOADS_DISCLAIMER).join('').toLowerCase();
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (lowered.includes(word)) {
      refuse('rendered snapshot', `contains the claim word "${word}" — downloads do not support it`);
    }
  }
  return text;
}

export { SnapshotError };
