// devtools/panel.js

const rowsEl = document.getElementById('rows');
const theadEl = document.getElementById('thead');
const subtitleEl = document.getElementById('subtitle');

const viewLiveBtn = document.getElementById('viewLive');
const viewGroupedBtn = document.getElementById('viewGrouped');

const exportJsonBtn = document.getElementById('exportJson');
const exportCsvBtn = document.getElementById('exportCsv');
const saveSessionBtn = document.getElementById('saveSession');
const pauseBtn = document.getElementById('pause');
const clearBtn = document.getElementById('clear');

const searchEl = document.getElementById('search');
const onlySuccessEl = document.getElementById('onlySuccess');
const onlyErrorsEl = document.getElementById('onlyErrors');
const onlySlowEl = document.getElementById('onlySlow');

const proBarEl = document.getElementById('probar');
const openOptionsBtn = document.getElementById('openOptions');

const SLOW_THRESHOLD_MS = 500;
const MAX_EVENTS = 2500;

let paused = false;
let viewMode = 'live';     // 'live' | 'grouped'
let proActive = false;

const events = [];         // normalized events
const grouped = new Map(); // key -> aggregation

function safePath(url) {
  try { return new URL(url, location.href).pathname || String(url || ''); }
  catch { return String(url || ''); }
}
function safeMethod(m) { return String(m || 'GET').toUpperCase(); }
function safeNum(n, fb = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fb;
}
function fmtMs(ms) { return `${Math.round(safeNum(ms, 0))}ms`; }
function fmtRel(ts) {
  const d = Date.now() - ts;
  if (!Number.isFinite(d)) return '—';
  if (d < 1000) return `${d}ms ago`;
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function clampEvents() {
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

function matchSearch(method, path) {
  const q = (searchEl.value || '').trim().toLowerCase();
  if (!q) return true;
  return method.toLowerCase().includes(q) || path.toLowerCase().includes(q);
}

function passFilters(statusCode, durationMs) {
  const ok = statusCode >= 200 && statusCode < 400;
  const err = statusCode >= 400 || statusCode === 0;
  const slow = durationMs >= SLOW_THRESHOLD_MS;

  if (onlySuccessEl.checked && !ok) return false;
  if (onlyErrorsEl.checked && !err) return false;
  if (onlySlowEl.checked && !slow) return false;
  return true;
}

function setSubtitle() {
  subtitleEl.textContent = paused ? 'Paused' : 'Streaming';
}

// ---- PRO state (license)
async function loadProState() {
  const { proLicenseKey } = await chrome.storage.sync.get(['proLicenseKey']);
  proActive = isValidKey(proLicenseKey);
  proBarEl.classList.toggle('hidden', proActive);
  renderHeader();
  render();
}

function isValidKey(k) {
  const key = String(k || '').trim().toUpperCase();
  if (!key.startsWith('API-OBS-')) return false;
  const parts = key.split('-');
  if (parts.length !== 5) return false; // API / OBS / A / B / C
  if (parts[2].length < 3 || parts[3].length < 3 || parts[4].length < 3) return false;
  return true;
}

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---- header rendering
function renderHeader() {
  if (viewMode === 'live') {
    theadEl.innerHTML = `
      <tr>
        <th style="width:90px;">Method</th>
        <th>Path</th>
        <th style="width:90px;">Status</th>
        <th style="width:120px;" class="right">Duration</th>
        <th style="width:140px;">Time</th>
      </tr>
    `;
  } else {
    theadEl.innerHTML = `
      <tr>
        <th style="width:90px;">Method</th>
        <th>Path</th>
        <th style="width:90px;" class="right">Calls</th>
        <th style="width:90px;" class="right">Errors</th>
        <th style="width:120px;" class="right">Err%</th>
        <th style="width:120px;" class="right">Avg</th>
        <th style="width:140px;">Last</th>
      </tr>
    `;
  }
}

function renderLive() {
  rowsEl.innerHTML = '';

  // show latest first
  let shown = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const method = safeMethod(e.method);
    const path = safePath(e.url);
    const status = safeNum(e.statusCode, 0);
    const dur = safeNum(e.durationMs, 0);

    if (!matchSearch(method, path)) continue;
    if (!passFilters(status, dur)) continue;

    const tr = document.createElement('tr');
    if (status >= 400 || status === 0) tr.classList.add('row-error');
    if (dur >= SLOW_THRESHOLD_MS) tr.classList.add('row-slow');

    const abs = new Date(e.timestamp).toLocaleString();
    const rel = fmtRel(e.timestamp);

    tr.innerHTML = `
      <td class="mono">${method}</td>
      <td class="mono">${path}</td>
      <td>
        <span class="badge ${status >= 400 || status === 0 ? 'err' : (dur >= SLOW_THRESHOLD_MS ? 'warn' : 'ok')}">${status}</span>
      </td>
      <td class="right mono">${fmtMs(dur)}</td>
      <td class="muted" title="${abs}">${rel}</td>
    `;

    rowsEl.appendChild(tr);
    shown++;
    if (shown >= 450) break;
  }
}

function rebuildGrouped() {
  grouped.clear();

  for (const e of events) {
    const method = safeMethod(e.method);
    const path = safePath(e.url);
    const status = safeNum(e.statusCode, 0);
    const dur = safeNum(e.durationMs, 0);

    if (!matchSearch(method, path)) continue;
    if (!passFilters(status, dur)) continue;

    const key = `${method} ${path}`;
    let g = grouped.get(key);
    if (!g) {
      g = { method, path, count: 0, errors: 0, totalDuration: 0, durCount: 0, lastTs: 0, lastStatus: 0 };
      grouped.set(key, g);
    }

    g.count++;
    if (status >= 400 || status === 0) g.errors++;
    if (dur > 0) { g.totalDuration += dur; g.durCount++; }

    if (e.timestamp >= g.lastTs) {
      g.lastTs = e.timestamp;
      g.lastStatus = status;
    }
  }
}

function renderGrouped() {
  rowsEl.innerHTML = '';
  rebuildGrouped();

  const arr = Array.from(grouped.values());
  arr.sort((a, b) => {
    // hot first
    if (b.count !== a.count) return b.count - a.count;
    if (b.errors !== a.errors) return b.errors - a.errors;
    const aAvg = a.durCount ? a.totalDuration / a.durCount : 0;
    const bAvg = b.durCount ? b.totalDuration / b.durCount : 0;
    return bAvg - aAvg;
  });

  for (const g of arr) {
    const tr = document.createElement('tr');

    const avg = g.durCount ? g.totalDuration / g.durCount : 0;
    const errPct = g.count ? (g.errors / g.count) * 100 : 0;

    if (g.errors > 0) tr.classList.add('row-error');
    if (avg >= SLOW_THRESHOLD_MS) tr.classList.add('row-slow');

    const abs = g.lastTs ? new Date(g.lastTs).toLocaleString() : '—';
    const rel = g.lastTs ? fmtRel(g.lastTs) : '—';

    tr.innerHTML = `
      <td class="mono">${g.method}</td>
      <td class="mono">${g.path}</td>
      <td class="right mono">${g.count}</td>
      <td class="right mono">${g.errors}</td>
      <td class="right mono">${errPct.toFixed(0)}%</td>
      <td class="right mono">${fmtMs(avg)}</td>
      <td class="muted" title="${abs}">
        <span class="badge ${g.lastStatus >= 400 || g.lastStatus === 0 ? 'err' : (avg >= SLOW_THRESHOLD_MS ? 'warn' : 'ok')}">${rel}</span>
      </td>
    `;
    rowsEl.appendChild(tr);
  }
}

function render() {
  setSubtitle();
  renderHeader();

  if (viewMode === 'live') {
    renderLive();
  } else {
    // Pro gating
    if (!proActive) {
      // show locked message in table
      rowsEl.innerHTML = `
        <tr>
          <td colspan="7" style="padding:14px;color:#94a3b8;">
            <b style="color:#e6edf3;">Grouped view is Pro</b><br/>
            Activate Pro in <b>Extension Options</b> to unlock Grouped view, Export, Sessions.
          </td>
        </tr>
      `;
      return;
    }
    renderGrouped();
  }
}

// ---- UI actions
viewLiveBtn.addEventListener('click', () => {
  viewMode = 'live';
  viewLiveBtn.classList.add('active');
  viewGroupedBtn.classList.remove('active');
  render();
});

viewGroupedBtn.addEventListener('click', () => {
  viewMode = 'grouped';
  viewGroupedBtn.classList.add('active');
  viewLiveBtn.classList.remove('active');
  render();
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  render();
});

clearBtn.addEventListener('click', () => {
  events.length = 0;
  grouped.clear();
  render();
});

searchEl.addEventListener('input', render);
onlySuccessEl.addEventListener('change', render);
onlyErrorsEl.addEventListener('change', render);
onlySlowEl.addEventListener('change', render);

// ---- Pro feature buttons
function requirePro(actionName) {
  if (proActive) return true;
  proBarEl.classList.remove('hidden');
  alert(`${actionName} is a Pro feature. Open Options to activate Pro.`);
  return false;
}

function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

exportJsonBtn.addEventListener('click', () => {
  if (!requirePro('Export JSON')) return;
  const data = {
    exportedAt: new Date().toISOString(),
    events: events.slice(-MAX_EVENTS).map(e => ({
      method: e.method, url: e.url, statusCode: e.statusCode, durationMs: e.durationMs, timestamp: e.timestamp
    })),
    grouped: Array.from(grouped.values())
  };
  downloadText('api-observatory-export.json', JSON.stringify(data, null, 2), 'application/json');
});

exportCsvBtn.addEventListener('click', () => {
  if (!requirePro('Export CSV')) return;

  // ensure grouped view matches filters/search
  rebuildGrouped();
  const lines = [
    'method,path,calls,errors,error_pct,avg_ms,last_seen'
  ];

  for (const g of grouped.values()) {
    const avg = g.durCount ? g.totalDuration / g.durCount : 0;
    const errPct = g.count ? (g.errors / g.count) * 100 : 0;
    const last = g.lastTs ? new Date(g.lastTs).toISOString() : '';
    const esc = (s) => `"${String(s).replaceAll('"', '""')}"`;
    lines.push([
      esc(g.method),
      esc(g.path),
      g.count,
      g.errors,
      errPct.toFixed(2),
      Math.round(avg),
      esc(last)
    ].join(','));
  }

  downloadText('api-observatory-grouped.csv', lines.join('\n'), 'text/csv');
});

saveSessionBtn.addEventListener('click', async () => {
  if (!requirePro('Sessions')) return;

  const tabId = chrome.devtools.inspectedWindow.tabId;
  const key = `session_${tabId}_${Date.now()}`;
  const payload = { savedAt: Date.now(), events: events.slice(-MAX_EVENTS) };

  await chrome.storage.local.set({ [key]: payload });
  alert('Session saved locally.');
});

// ---- connect to background
const port = chrome.runtime.connect({ name: 'api-observatory-devtools' });
port.postMessage({ type: 'REGISTER', tabId: chrome.devtools.inspectedWindow.tabId });

port.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'LOG') return;
  if (paused) return;

  const p = msg.payload || {};
  const method = safeMethod(p.method);
  const url = String(p.url || '');
  const statusCode = safeNum(p.statusCode, 0);
  const durationMs = safeNum(p.durationMs, safeNum(p.duration, 0));
  const timestamp = safeNum(p.timestamp, Date.now());

  if (!url) return;

  events.push({ method, url, statusCode, durationMs, timestamp, kind: p.kind, error: p.error });
  clampEvents();

  render();
});

// init
(async function init() {
  await loadProState();

  // react to license changes live
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.proLicenseKey) loadProState();
  });

  render();
})();
