/**
 * The report page's own stylesheet and script, as strings inlined into the
 * generated HTML.
 *
 * They are strings and not files because the output must be one self-contained
 * `.html` — no CDN, no external stylesheet, no font request, nothing that
 * touches a network when the file is opened. An auditor opens it on a machine
 * with no connection and it must render completely.
 *
 * `CLIENT_CORE` is deliberately DOM-free: filtering, sorting, the URL fragment
 * and the description of the active filter are plain functions over plain data.
 * That split is what lets `report.test.ts` evaluate this exact source and drive
 * every filter combination directly — the tests exercise the code that ships,
 * not a TypeScript re-implementation of it that could quietly disagree.
 */

export const REPORT_CSS = `
/* Prava-family identity, carried over from the warrant operator console:
   warm off-white paper, near-black ink, teal accent, Inter + IBM Plex Mono,
   pill controls, softly rounded panels. Every colour is a token — no
   hardcoded colour below this block.

   Two deliberate departures from the console, both forced by what this file
   is. The console loads Inter and IBM Plex Mono from a font CDN; a report
   must open with the network off, so the same two families are named and the
   system stack catches the fall — identical when they are installed, close
   when they are not, and never a request either way. And the console is read
   from three metres at 16px, while this is a dense document somebody prints:
   the scale steps down, the palette does not. */
:root {
  --font-sans: "Inter", system-ui, "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --paper: #faf9f7;
  --panel: #ffffff;
  --ink: #171717;
  --muted: #6b6b6b;
  --line: #e5e4e0;
  --accent: #0f766e;
  --accent-tint: #e8f4f1;
  --chip-bg: #f0efec;
  --row-hover: #f4f3f0;
  --row-selected: #ecebe7;
  --on-dark: #ffffff;
  /* Semantic verdicts keep the console's colours: these are product
     semantics, not skin. ALLOW and DENY also differ by fill and weight, so
     the pair never rests on hue alone. */
  --allow: #1e6f40;
  --allow-tint: #eef6ef;
  --deny: #9c1f2e;
  --deny-tint: #fbf1ee;
  --shadow: 0 1px 2px rgba(31, 42, 36, 0.06);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 var(--font-sans); }
main { max-width: 1180px; margin: 0 auto; padding: 20px 24px 72px; }
h1 { font-size: 22px; font-weight: 800; letter-spacing: .3px; margin: 0 0 2px; }
h2 { font-size: 15px; font-weight: 700; letter-spacing: .04em; margin: 26px 0 4px; }
p { margin: 6px 0; }
a { color: var(--accent); }
code, .mono { font-family: var(--font-mono); overflow-wrap: anywhere; }
.meta { color: var(--muted); margin: 0 0 16px; font-size: 13px; }
.orient { margin: -2px 0 10px; color: var(--muted); font-size: 13px; }
.note { color: var(--ink); background: var(--panel); border: 1px solid var(--line);
        border-left: 4px solid var(--accent); border-radius: 9px; padding: 10px 14px; margin: 10px 0; }
.warn { border-left-color: var(--deny); background: var(--deny-tint); border-color: var(--deny); }

/* Summary strip: numbers, not gauges. */
.strip { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; padding: 0; }
.strip div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
             box-shadow: var(--shadow); padding: 12px 18px; flex: 1 1 140px; }
.strip dt { color: var(--muted); font-size: 12px; letter-spacing: .04em; margin: 0 0 4px; }
.strip dd { margin: 0; font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums;
            font-family: var(--font-mono); }
.strip dd small { font-size: 13px; font-weight: 600; color: var(--muted); font-family: var(--font-sans); }
.strip .d dd { color: var(--deny); }
.strip .a dd { color: var(--allow); }

/* Panels */
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
         box-shadow: var(--shadow); padding: 16px 18px; margin-top: 8px; }

/* Filters */
.filters .controls { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; }
.filters label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; letter-spacing: .03em; }
.filters select, .filters input {
  font: 14px var(--font-sans); padding: 7px 10px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--panel); color: var(--ink); min-width: 128px; accent-color: var(--accent);
}
.filters input[type=search] { min-width: 230px; }
.filters button {
  font: 600 14px var(--font-sans); padding: 7px 18px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer;
}
.filters button:hover:enabled { border-color: var(--accent); color: var(--accent); }
.filters button:disabled { opacity: .45; cursor: not-allowed; }
select:focus, input:focus, button:focus, th button:focus, tbody tr:focus {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

.state { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; font-size: 13px; }
.state strong { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.chip { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
        border: 1px solid var(--accent); background: var(--accent-tint); color: var(--accent);
        padding: 4px 6px 4px 14px; font-size: 13px; font-weight: 600; }
.chip b { font-weight: 800; }
.chip button { border: 0; background: transparent; color: inherit; cursor: pointer;
               font: 700 15px var(--font-sans); line-height: 1; padding: 2px 8px 3px; border-radius: 999px; }
.chip button:hover { background: var(--accent); color: var(--on-dark); }
.hidden-note { color: var(--deny); font-weight: 600; }

/* Tables scroll inside their own container; the page itself never widens. */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%;
                background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
                box-shadow: var(--shadow); margin-top: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
.table-scroll table { min-width: 640px; }
caption { text-align: left; color: var(--muted); padding: 12px 16px 8px; font-size: 13px; }
th, td { text-align: left; padding: 8px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
thead th { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: .04em;
           white-space: nowrap; border-bottom: 2px solid var(--line); background: var(--panel); }
thead th button { all: unset; cursor: pointer; display: block; width: 100%; }
thead th[aria-sort=ascending] button::after { content: " ↑"; color: var(--accent); }
thead th[aria-sort=descending] button::after { content: " ↓"; color: var(--accent); }
tbody tr.row { cursor: pointer; }
tbody tr.row:hover { background: var(--row-hover); }
tbody tr:last-child > td { border-bottom: 0; }
td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
td.t { white-space: nowrap; color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
td.target { font-family: var(--font-mono); overflow-wrap: anywhere; }
/* Verdict chips: filled for DENY, tinted-outline for ALLOW — fill and weight
   separate them, never hue alone. */
.v { display: inline-block; min-width: 62px; text-align: center; padding: 2px 10px;
     border-radius: 6px; font-size: 12px; font-weight: 800; letter-spacing: .03em; }
.v.DENY { background: var(--deny); color: var(--on-dark); }
.v.ALLOW { background: var(--allow-tint); color: var(--allow); border: 1px solid var(--allow); font-weight: 700; }
td.clause, th.cid { font-family: var(--font-mono); font-weight: 800; }
td.clause a, th[scope=row] a { color: var(--accent); text-decoration: none; }
td.clause a:hover, th[scope=row] a:hover { text-decoration: underline; }
tr.detail > td { background: var(--row-selected); padding: 14px 18px 16px 34px; }
tr.detail dl { display: grid; grid-template-columns: 150px 1fr; gap: 4px 14px; margin: 0; }
tr.detail dt { color: var(--muted); }
tr.detail dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono); font-size: 12.5px; }
tr.detail blockquote { margin: 12px 0 0; padding: 10px 14px; background: var(--panel);
                       border: 1px solid var(--line); border-left: 4px solid var(--accent);
                       border-radius: 9px; font-family: var(--font-sans); font-size: 13px; }
tr.unfired td, tr.unfired th { color: var(--muted); }
td.freq { width: 132px; }
/* Clause frequency: the shape beside the number, in the row it belongs to. */
.freq-bar { display: block; height: 9px; min-width: 2px; border-radius: 999px;
            background: var(--accent); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
tr.unfired .freq-bar { background: var(--chip-bg); border: 1px solid var(--line); }

/* Charts: only where a shape beats a number. */
.chart { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
         box-shadow: var(--shadow); padding: 14px 16px; margin-top: 8px; overflow-x: auto; }
.chart svg { display: block; }
.chart .bar-a { fill: var(--allow); }
.chart .bar-d { fill: var(--deny); }
.chart .axis { stroke: var(--line); }
.chart text { font: 10px var(--font-mono); fill: var(--muted); }
.chart .era { stroke: var(--accent); stroke-dasharray: 3 2; }
.chart .era-label { fill: var(--accent); font-weight: 700; }
.legend { color: var(--muted); margin-top: 8px; font-size: 13px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px;
            margin-right: 5px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.legend i.a { background: var(--allow); } .legend i.d { background: var(--deny); }

.empty { background: var(--panel); border: 1px dashed var(--line); border-left: 4px solid var(--accent);
         border-radius: 12px; padding: 22px 24px; color: var(--ink); }
.empty h3 { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
.empty code { background: var(--chip-bg); border-radius: 6px; padding: 2px 7px; }
footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid var(--line);
         color: var(--muted); font-size: 13px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media print {
  body { background: var(--panel); font-size: 10.5px; }
  main { max-width: none; padding: 0; }
  .filters .controls, thead th button::after, .chip button { display: none; }
  .panel, .chart, .table-scroll, .strip div { box-shadow: none; }
  .table-scroll { overflow: visible; border: 0; }
  .table-scroll table { min-width: 0; }
  thead { display: table-header-group; }
  tr, .chart, .strip, .panel { page-break-inside: avoid; }
  tr.detail { display: none; }
  a { text-decoration: none; color: inherit; }
  footer { page-break-before: avoid; }
}
@media (max-width: 620px) {
  main { padding: 16px 14px 48px; }
  .strip div { flex-basis: 100%; }
  .filters select, .filters input, .filters input[type=search] { min-width: 0; width: 100%; }
  .filters .controls > div { flex: 1 1 100%; }
}
`;

/**
 * Pure filter/sort/URL logic. No DOM, no globals — every function takes what it
 * needs and returns a value, so the test suite can run this exact source.
 */
export const CLIENT_CORE = String.raw`
var FILTER_KEYS = ['verdict', 'clause', 'kind', 'tool', 'from', 'to', 'q'];

function emptyFilter() {
  return { verdict: '', clause: '', kind: '', tool: '', from: '', to: '', q: '' };
}

/** Read the filter from a URL fragment. Unknown keys are ignored, never guessed at. */
function parseHash(hash) {
  var filter = emptyFilter();
  var raw = String(hash || '').replace(/^#/, '');
  if (raw.length === 0) return filter;
  var parts = raw.split('&');
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split('=');
    var key = decodeURIComponent(pair[0] || '');
    if (FILTER_KEYS.indexOf(key) === -1) continue;
    filter[key] = decodeURIComponent((pair.slice(1).join('=') || '').replace(/\+/g, ' '));
  }
  return filter;
}

/** Write the filter back to a fragment, key order fixed so the same view yields the same URL. */
function toHash(filter) {
  var out = [];
  for (var i = 0; i < FILTER_KEYS.length; i++) {
    var key = FILTER_KEYS[i];
    var value = filter[key];
    if (value === undefined || value === null || value === '') continue;
    out.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
  }
  return out.join('&');
}

/**
 * Every active criterion must hold. There is no "or" and no implicit widening:
 * an auditor reading a filtered table has to be able to say exactly what is
 * excluded, and AND is the only combinator with that property.
 */
function matchesRow(row, filter) {
  if (filter.verdict && row.decision !== filter.verdict) return false;
  if (filter.clause) {
    if (filter.clause === '(none)') { if (row.clause !== null) return false; }
    else if (row.clause !== filter.clause) return false;
  }
  if (filter.kind && row.kind !== filter.kind) return false;
  if (filter.tool && row.tool !== filter.tool) return false;
  if (filter.from && row.day < filter.from) return false;
  if (filter.to && row.day > filter.to) return false;
  if (filter.q) {
    var needle = String(filter.q).toLowerCase();
    var hay = (row.target + ' ' + row.tool + ' ' + row.kind + ' ' + (row.clause || '')).toLowerCase();
    if (hay.indexOf(needle) === -1) return false;
  }
  return true;
}

function applyFilters(rows, filter) {
  var out = [];
  for (var i = 0; i < rows.length; i++) if (matchesRow(rows[i], filter)) out.push(rows[i]);
  return out;
}

/**
 * One chip per active criterion — the contract the interface rests on. If a
 * criterion is excluding rows it has a chip, and the chip says which criterion
 * and which value. A filter that hides rows without showing a chip would let a
 * reader draw a conclusion from a partial table believing it was the whole one.
 */
function describeFilter(filter) {
  var labels = { verdict: 'verdict', clause: 'clause', kind: 'action kind', tool: 'tool',
                 from: 'from', to: 'to', q: 'target contains' };
  var chips = [];
  for (var i = 0; i < FILTER_KEYS.length; i++) {
    var key = FILTER_KEYS[i];
    var value = filter[key];
    if (value === undefined || value === null || value === '') continue;
    chips.push({ key: key, label: labels[key], value: String(value) });
  }
  return chips;
}

function sortRows(rows, key, direction) {
  var sorted = rows.slice();
  var sign = direction === 'desc' ? -1 : 1;
  sorted.sort(function (a, b) {
    var left = a[key], right = b[key];
    if (left === null) left = '';
    if (right === null) right = '';
    if (key === 'i') return sign * (a.i - b.i);
    left = String(left).toLowerCase();
    right = String(right).toLowerCase();
    if (left < right) return -sign;
    if (left > right) return sign;
    return a.i - b.i;
  });
  return sorted;
}
`;

/** DOM wiring. Everything it decides, it decides by calling the functions above. */
export const CLIENT_UI = String.raw`
(function () {
  var rows = window.__WARRANT_ROWS__ || [];
  var filter = parseHash(window.location.hash);
  var sortKey = 'i', sortDir = 'asc';
  var body = document.getElementById('rows');
  var chips = document.getElementById('chips');
  var state = document.getElementById('state');
  var empty = document.getElementById('table-empty');
  var controls = {};

  function esc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderRows(visible) {
    var html = '';
    for (var i = 0; i < visible.length; i++) {
      var row = visible[i];
      html += '<tr class="row" id="d' + row.i + '" tabindex="0" aria-expanded="false" data-i="' + row.i + '">'
        + '<td class="t" data-label="Time"><time datetime="' + esc(row.at) + '">' + esc(row.at.replace('T', ' ').replace('.000Z', '').replace('Z', '')) + '</time></td>'
        + '<td data-label="Tool">' + esc(row.tool) + '</td>'
        + '<td data-label="Kind">' + esc(row.kind) + '</td>'
        + '<td class="target" data-label="Target">' + esc(row.target) + '</td>'
        + '<td data-label="Verdict"><span class="v ' + row.decision + '">' + row.decision + '</span></td>'
        + '<td class="clause" data-label="Clause">' + (row.clause ? esc(row.clause) : '<span class="sr">none</span>—') + '</td>'
        + '</tr>';
    }
    body.innerHTML = html;
  }

  function renderChips() {
    var described = describeFilter(filter);
    chips.innerHTML = '';
    for (var i = 0; i < described.length; i++) {
      (function (chip) {
        var node = document.createElement('span');
        node.className = 'chip';
        node.innerHTML = '<b>' + esc(chip.label) + '</b> ' + esc(chip.value);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove filter: ' + chip.label + ' ' + chip.value);
        remove.textContent = '×';
        remove.onclick = function () { filter[chip.key] = ''; sync(); };
        node.appendChild(remove);
        chips.appendChild(node);
      })(described[i]);
    }
    chips.hidden = described.length === 0;
  }

  function render() {
    var visible = sortRows(applyFilters(rows, filter), sortKey, sortDir);
    renderRows(visible);
    renderChips();
    var hidden = rows.length - visible.length;
    state.innerHTML = 'Showing <strong>' + visible.length + '</strong> of <strong>' + rows.length + '</strong> decisions'
      + (hidden > 0 ? ' &middot; <span class="hidden-note"><strong>' + hidden + '</strong> hidden by the filters below</span>' : '')
      + '.';
    empty.hidden = visible.length > 0;
    document.getElementById('reset').disabled = describeFilter(filter).length === 0;
    var heads = document.querySelectorAll('thead th[data-key]');
    for (var i = 0; i < heads.length; i++) {
      heads[i].setAttribute('aria-sort', heads[i].getAttribute('data-key') === sortKey
        ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
  }

  function sync() {
    for (var key in controls) if (controls[key]) controls[key].value = filter[key] || '';
    var hash = toHash(filter);
    var url = window.location.pathname + window.location.search + (hash ? '#' + hash : '#');
    window.history.replaceState(null, '', url);
    render();
  }

  var ids = { verdict: 'f-verdict', clause: 'f-clause', kind: 'f-kind', tool: 'f-tool',
              from: 'f-from', to: 'f-to', q: 'f-q' };
  for (var key in ids) {
    (function (name) {
      var node = document.getElementById(ids[name]);
      if (!node) return;
      controls[name] = node;
      node.addEventListener('input', function () { filter[name] = node.value; sync(); });
    })(key);
  }

  document.getElementById('reset').addEventListener('click', function () { filter = emptyFilter(); sync(); });

  var heads = document.querySelectorAll('thead th[data-key] button');
  for (var h = 0; h < heads.length; h++) {
    (function (button) {
      button.addEventListener('click', function () {
        var key = button.parentNode.getAttribute('data-key');
        if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = key; sortDir = 'asc'; }
        render();
      });
    })(heads[h]);
  }

  function toggle(tr) {
    var index = tr.getAttribute('data-i');
    var next = tr.nextSibling;
    if (next && next.className === 'detail') { next.parentNode.removeChild(next); tr.setAttribute('aria-expanded', 'false'); return; }
    var row = null;
    for (var i = 0; i < rows.length; i++) if (String(rows[i].i) === index) row = rows[i];
    if (!row) return;
    var detail = document.createElement('tr');
    detail.className = 'detail';
    var cell = document.createElement('td');
    cell.colSpan = 6;
    var html = '<dl>'
      + '<dt>Recorded at</dt><dd>' + esc(row.at) + ' (UTC)</dd>'
      + '<dt>Observed by</dt><dd>' + esc(row.source === 'hook' ? 'PreToolUse hook (enforcing)' : 'check_action tool (advisory)') + '</dd>'
      + '<dt>Tool</dt><dd>' + esc(row.tool) + '</dd>'
      + '<dt>Action kind</dt><dd>' + esc(row.kind) + '</dd>'
      + '<dt>Target</dt><dd>' + esc(row.target) + '</dd>'
      + '<dt>Verdict</dt><dd><span class="v ' + row.decision + '">' + row.decision + '</span></dd>'
      + '<dt>Governing clause</dt><dd>' + (row.clause ? esc(row.clause) : 'none') + '</dd>'
      + (row.reason ? '<dt>Reason</dt><dd>' + esc(row.reason) + ' — the action was malformed and was refused before any clause was consulted</dd>' : '')
      + '<dt>Policy in force</dt><dd>' + esc(row.policy) + '</dd>'
      + '</dl>';
    if (row.clauseText) html += '<blockquote>' + esc(row.clause) + ' — ' + esc(row.clauseText) + '</blockquote>';
    cell.innerHTML = html;
    detail.appendChild(cell);
    tr.parentNode.insertBefore(detail, tr.nextSibling);
    tr.setAttribute('aria-expanded', 'true');
  }

  body.addEventListener('click', function (event) {
    var tr = event.target;
    while (tr && tr.className !== 'row') tr = tr.parentNode;
    if (tr) toggle(tr);
  });
  body.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var tr = event.target;
    while (tr && tr.className !== 'row') tr = tr.parentNode;
    if (tr) { event.preventDefault(); toggle(tr); }
  });

  var links = document.querySelectorAll('[data-filter-clause]');
  for (var l = 0; l < links.length; l++) {
    (function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        filter = emptyFilter();
        filter.clause = link.getAttribute('data-filter-clause');
        sync();
        document.getElementById('decisions').scrollIntoView();
      });
    })(links[l]);
  }

  window.addEventListener('hashchange', function () { filter = parseHash(window.location.hash); sync(); });
  sync();
})();
`;
