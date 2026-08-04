/**
 * The report, rendered. A pure function from a `ReportModel` to one string of
 * self-contained HTML.
 *
 * Two properties this module exists to guarantee:
 *
 * - **Self-contained.** Every byte the page needs is in the page: the
 *   stylesheet, the script, the data. No CDN, no font request, no fetch. Open
 *   it on an aeroplane and it is complete.
 * - **Deterministic.** The same model renders the same bytes. The only value
 *   that varies between two runs over the same record is `generatedAt`, which
 *   the caller passes in — this module never reads a clock. `report.test.ts`
 *   pins that by rendering twice and substituting the timestamp.
 *
 * The section order is the order of the four questions in the assignment, and
 * that is the only ordering principle: what an auditor asks first appears
 * first. Anything that served none of the four was cut — see the note in the
 * page footer, which says the same thing to the reader.
 */
import { CLIENT_CORE, CLIENT_UI, REPORT_CSS } from './client.ts';
import type { ClauseRow, PolicyEra, ReportModel } from './model.ts';

export interface RenderInput {
  readonly model: ReportModel;
  /** ISO instant, supplied by the caller. The one value allowed to vary between runs. */
  readonly generatedAt: string;
  /** Display name of the audited project, already redacted. */
  readonly project: string;
  /** Where the record was read from, already redacted. */
  readonly recordDir: string;
  /** False when no decisions file exists at all — a different empty state from "no rows". */
  readonly recordExists: boolean;
  readonly version: string;
}

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** JSON safe to sit inside a <script> element: no tag can be closed from within the data. */
const BACKSLASH = String.fromCharCode(92);
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/** The six-character escape a JavaScript string literal accepts for any code point. */
const unicodeEscape = (character: string): string =>
  BACKSLASH + 'u' + character.charCodeAt(0).toString(16).padStart(4, '0');

const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, unicodeEscape('<'))
    .replace(/>/g, unicodeEscape('>'))
    .replace(/&/g, unicodeEscape('&'))
    // Raw line separators are legal in JSON and fatal inside a script element.
    .replace(LINE_SEPARATORS, unicodeEscape);

const instant = (value: string): string => value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');

export function renderReport(input: RenderInput): string {
  const { model } = input;
  const body =
    !input.recordExists
      ? emptyRecordState(input)
      : model.summary.total === 0
        ? emptyWindowState(model)
        : [
            summaryStrip(model),
            overTime(model),
            policyChanges(model),
            clauseBreakdown(model),
            decisionTable(model),
          ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Warrant authorization record — ${esc(input.project)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<main>
<h1>Authorization record — ${esc(input.project)}</h1>
<p class="meta">
  Generated <time datetime="${esc(input.generatedAt)}">${esc(instant(input.generatedAt))}</time>
  by warrant-mcp ${esc(input.version)} &middot;
  read from <code>${esc(input.recordDir)}</code> &middot;
  ${model.since === null ? 'the whole record' : `window: since ${esc(instant(model.since))}`}
</p>
${notices(model)}
${body}
<footer>
<p><strong>What this file is.</strong> A local, static rendering of decisions this
machine already recorded. It was generated offline, it makes no network request
when opened, and nothing here was uploaded anywhere. The record itself was read,
never written.</p>
<p><strong>What it is not.</strong> It is not proof that every action was
checked. It shows tool calls the policy layer observed; anything outside that
mapping &mdash; another client, a process that outlived the session, a shell
expansion resolved after the verdict &mdash; leaves no line here. Recording is
also best-effort by design, so that a failure to write can never turn a refusal
into a pass. Times are UTC.</p>
</footer>
</main>
<script>
window.__WARRANT_ROWS__ = ${jsonForScript(model.rows)};
${CLIENT_CORE}
${CLIENT_UI}
</script>
</body>
</html>
`;
}

function notices(model: ReportModel): string {
  const notes: string[] = [];
  if (model.summary.skipped > 0) {
    notes.push(
      `<p class="note warn"><strong>${model.summary.skipped} line(s) of the record could not be read</strong> and are
       excluded from every number on this page. A line torn by an interrupted write is the usual cause. The counts
       below are therefore a lower bound.</p>`,
    );
  }
  if (model.excludedByWindow > 0) {
    notes.push(
      `<p class="note"><strong>${model.excludedByWindow} earlier decision(s) are outside this window</strong> and are
       excluded from every number on this page. Re-run without <code>--since</code> for the whole record.</p>`,
    );
  }
  return notes.join('\n');
}

function summaryStrip(model: ReportModel): string {
  const { summary } = model;
  const percent = summary.total === 0 ? 0 : Math.round((summary.denied / summary.total) * 100);
  const range =
    summary.from === null
      ? '—'
      : summary.from.slice(0, 10) === summary.to?.slice(0, 10)
        ? summary.from.slice(0, 10)
        : `${summary.from.slice(0, 10)} → ${summary.to?.slice(0, 10)}`;
  return `<h2 id="summary">Summary</h2>
<dl class="strip">
  <div><dt>Decisions</dt><dd>${summary.total}</dd></div>
  <div class="a"><dt>Allowed</dt><dd>${summary.allowed}</dd></div>
  <div class="d"><dt>Denied</dt><dd>${summary.denied} <small>${percent}%</small></dd></div>
  <div><dt>Clauses fired</dt><dd>${summary.clausesFired} <small>of ${summary.clausesTotal}</small></dd></div>
  <div><dt>Range covered</dt><dd style="font-size:15px">${esc(range)}</dd></div>
</dl>`;
}

/**
 * Question 1 and 4 together: the shape of activity, with policy edits marked on
 * the same axis. A number cannot show "denials started the day the policy
 * changed"; this is the one place a chart earns its space.
 */
function overTime(model: ReportModel): string {
  const days = model.daily;
  if (days.length === 0) return '';
  const width = Math.max(320, Math.min(1120, days.length * 26 + 44));
  const height = 150;
  const plotTop = 12;
  const plotHeight = 100;
  const left = 36;
  const band = (width - left - 8) / days.length;
  const barWidth = Math.max(3, Math.min(20, band - 4));
  const peak = Math.max(1, ...days.map((day) => day.allowed + day.denied));
  const scale = (count: number) => Math.round((count / peak) * plotHeight);

  const bars = days
    .map((day, index) => {
      const x = left + index * band + (band - barWidth) / 2;
      const allowedHeight = scale(day.allowed);
      const deniedHeight = scale(day.denied);
      const base = plotTop + plotHeight;
      return (
        `<rect class="bar-a" x="${round(x)}" y="${base - allowedHeight}" width="${round(barWidth)}" height="${allowedHeight}"><title>${day.day}: ${day.allowed} allowed</title></rect>` +
        `<rect class="bar-d" x="${round(x)}" y="${base - allowedHeight - deniedHeight}" width="${round(barWidth)}" height="${deniedHeight}"><title>${day.day}: ${day.denied} denied</title></rect>`
      );
    })
    .join('');

  // Every day cannot be labelled on a narrow page; label first, last and a
  // regular stride, and never round a date away.
  const stride = Math.max(1, Math.ceil(days.length / 8));
  const labels = days
    .map((day, index) =>
      index % stride === 0 || index === days.length - 1
        ? `<text x="${round(left + index * band + band / 2)}" y="${plotTop + plotHeight + 14}" text-anchor="middle">${esc(day.day.slice(5))}</text>`
        : '',
    )
    .join('');

  const eraMarks = model.policyEras
    .slice(1)
    .map((era) => {
      const index = days.findIndex((day) => day.day >= era.from.slice(0, 10));
      if (index < 0) return '';
      const x = round(left + index * band);
      return `<line class="era" x1="${x}" y1="${plotTop - 6}" x2="${x}" y2="${plotTop + plotHeight}"></line>` +
        `<text class="era-label" x="${x + 3}" y="${plotTop - 1}">policy changed</text>`;
    })
    .join('');

  return `<h2 id="over-time">Decisions over time</h2>
<div class="chart">
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"
     aria-label="Stacked bars: allowed and denied decisions per day, with vertical marks where the compiled policy changed.">
  <line class="axis" x1="${left}" y1="${plotTop + plotHeight}" x2="${width - 8}" y2="${plotTop + plotHeight}"></line>
  <text x="${left - 6}" y="${plotTop + 4}" text-anchor="end">${peak}</text>
  <text x="${left - 6}" y="${plotTop + plotHeight}" text-anchor="end">0</text>
  ${bars}${labels}${eraMarks}
</svg>
</div>
<p class="legend"><i class="a"></i>allowed <i class="d"></i>denied &middot; one bar per UTC day, gaps kept.</p>`;
}

const round = (value: number): string => (Math.round(value * 100) / 100).toString();

/** Question 4, stated rather than implied. Only shown when the policy actually changed. */
function policyChanges(model: ReportModel): string {
  const eras = model.policyEras;
  if (eras.length < 2) {
    return `<h2 id="policy">Policy changes</h2>
<p class="note">One compiled policy governed every decision in this window
${eras[0] ? `(<code>${esc(eras[0].policy)}</code>, ${eras[0].clauseCount} clauses)` : ''}.
Nothing here can be explained by a policy edit.</p>`;
  }
  const rows = eras
    .map((era: PolicyEra, index) => {
      const rate = era.decisions === 0 ? 0 : Math.round((era.denied / era.decisions) * 100);
      const changed =
        index === 0
          ? '<span class="sr">first policy in the record</span>—'
          : [
              era.added.length > 0 ? `added ${era.added.map(esc).join(', ')}` : '',
              era.removed.length > 0 ? `removed ${era.removed.map(esc).join(', ')}` : '',
              era.added.length === 0 && era.removed.length === 0 ? 'same clause ids, different rules' : '',
            ]
              .filter(Boolean)
              .join('; ');
      return `<tr>
  <td class="t">${esc(instant(era.from))}</td>
  <td><code>${esc(era.policy)}</code></td>
  <td>${changed}</td>
  <td class="num">${era.clauseCount}</td>
  <td class="num">${era.decisions}</td>
  <td class="num">${era.denied} <small>(${rate}%)</small></td>
</tr>`;
    })
    .join('\n');
  return `<h2 id="policy">Policy changes</h2>
<p>The compiled policy changed ${eras.length - 1} time(s) inside this window. Each row is the stretch of the record
governed by one policy version; a shift in the denial rate across a boundary is a correlation worth reading, not a
proven cause.</p>
<div class="table-scroll"><table>
  <caption>Policy eras, oldest first.</caption>
  <thead><tr><th scope="col">From</th><th scope="col">Fingerprint</th><th scope="col">What changed</th>
    <th scope="col">Clauses</th><th scope="col">Decisions</th><th scope="col">Denied</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/** Questions 2 and 3: which rule refused it, and is it repeating. */
function clauseBreakdown(model: ReportModel): string {
  const peak = Math.max(1, ...model.clauses.map((clause) => clause.fired));
  const rows = model.clauses
    .map((clause: ClauseRow) => {
      const share = Math.round((clause.fired / peak) * 100);
      return `<tr${clause.fired === 0 ? ' class="unfired"' : ''}>
  <th scope="row" class="cid"><a href="#clause=${esc(clause.id)}" data-filter-clause="${esc(clause.id)}">${esc(clause.id)}</a></th>
  <td>${esc(clause.text)}${clause.current ? '' : ' <small>(not in the current policy)</small>'}</td>
  <td class="num">${clause.fired}</td>
  <td class="num">${clause.denied}</td>
  <td class="num">${clause.allowed}</td>
  <td class="freq"><span class="freq-bar" style="width:${share}%" aria-hidden="true"></span><span class="sr">${clause.fired} of ${peak}</span></td>
</tr>`;
    })
    .join('\n');
  const unfired = model.clauses.filter((clause) => clause.fired === 0).length;
  return `<h2 id="clauses">Clause breakdown</h2>
<p>Every clause in the record, including the ${unfired} that never fired &mdash; a clause nobody has tripped is either
dead weight or untested, and both are worth knowing. Select a clause id to filter the decision table to it.</p>
<div class="table-scroll"><table>
  <caption>Clauses, in clause order. &ldquo;Fired&rdquo; counts decisions this clause governed.</caption>
  <thead><tr><th scope="col">Clause</th><th scope="col">Text</th><th scope="col">Fired</th>
    <th scope="col">Denied</th><th scope="col">Allowed</th><th scope="col">Frequency</th></tr></thead>
  <tbody>${rows}</tbody>
</table></div>`;
}

/** The centre of the page. A table, not a chart. */
function decisionTable(model: ReportModel): string {
  const option = (value: string, selected = false) =>
    `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(value)}</option>`;
  const clauseIds = model.clauses.map((clause) => clause.id);
  const days = model.daily.map((day) => day.day);
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? '';

  const columns: ReadonlyArray<readonly [string, string]> = [
    ['i', 'Time'],
    ['tool', 'Tool'],
    ['kind', 'Kind'],
    ['target', 'Target'],
    ['decision', 'Verdict'],
    ['clause', 'Clause'],
  ];

  return `<h2 id="decisions">Decisions</h2>
<p class="orient">Every criterion below applies at once. Whatever is excluded is named in a chip.</p>
<div class="filters panel">
  <div class="controls">
    <div><label for="f-verdict">Verdict</label><select id="f-verdict">
      <option value="">any</option>${option('ALLOW')}${option('DENY')}</select></div>
    <div><label for="f-clause">Clause</label><select id="f-clause">
      <option value="">any</option><option value="(none)">(none)</option>${clauseIds.map((id) => option(id)).join('')}</select></div>
    <div><label for="f-kind">Action kind</label><select id="f-kind">
      <option value="">any</option>${model.kinds.map((kind) => option(kind)).join('')}</select></div>
    <div><label for="f-tool">Tool</label><select id="f-tool">
      <option value="">any</option>${model.tools.map((tool) => option(tool)).join('')}</select></div>
    <div><label for="f-from">From (UTC day)</label><input id="f-from" type="date" min="${esc(first)}" max="${esc(last)}"></div>
    <div><label for="f-to">To (UTC day)</label><input id="f-to" type="date" min="${esc(first)}" max="${esc(last)}"></div>
    <div><label for="f-q">Target contains</label><input id="f-q" type="search" placeholder="e.g. .env" autocomplete="off"></div>
    <div><button type="button" id="reset">Clear all</button></div>
  </div>
  <div class="state">
    <p id="state" role="status" aria-live="polite">Showing <strong>${model.rows.length}</strong> of
      <strong>${model.rows.length}</strong> decisions.</p>
    <div class="chips" id="chips" hidden aria-label="Active filters"></div>
  </div>
</div>
<div class="table-scroll"><table>
  <caption>Every checked tool call, oldest first. Select a row for its full record entry.</caption>
  <thead><tr>${columns
    .map(([key, label]) => `<th scope="col" data-key="${key}" aria-sort="${key === 'i' ? 'ascending' : 'none'}"><button type="button">${label}</button></th>`)
    .join('')}</tr></thead>
  <tbody id="rows"></tbody>
</table></div>
<div class="empty" id="table-empty" hidden>
  <h3>No decision matches every active filter.</h3>
  <p>The chips above list each criterion currently applied. Remove one with its
  &times;, or <em>Clear all</em> to see the whole window again.</p>
</div>`;
}

function emptyRecordState(input: RenderInput): string {
  return `<div class="empty">
<h3>Nothing has been recorded yet for this project.</h3>
<p>No <code>decisions.jsonl</code> exists at <code>${esc(input.recordDir)}</code>. That is what an
un-exercised install looks like &mdash; not an error.</p>
<p>The record fills itself: every tool call the PreToolUse hook checks appends one line. To
produce the first entries, work in this project with Claude Code as normal, or make one
decision by hand:</p>
<p><code>warrant-mcp test "delete .env"</code></p>
<p>Then run <code>warrant-mcp report</code> again. If tool calls are happening and this file stays
empty, the hook is not wired &mdash; <code>warrant-mcp init</code> is what wires it.</p>
</div>`;
}

function emptyWindowState(model: ReportModel): string {
  return `<div class="empty">
<h3>No decisions fall inside this window.</h3>
<p>The record holds ${model.excludedByWindow} decision(s), all of them older than
<code>${esc(model.since ?? '')}</code>.</p>
<p>Widen the window &mdash; <code>warrant-mcp report --since 90d</code> &mdash; or drop
<code>--since</code> to cover the whole record.</p>
</div>`;
}
