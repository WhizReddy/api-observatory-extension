const rowsEl = document.getElementById('rows');
const subtitleEl = document.getElementById('subtitle');
const clearBtn = document.getElementById('clear');
const clearDataBtn = document.getElementById('clear-data');
const toggleStreamBtn = document.getElementById('toggle-stream');
const onlySuccessEl = document.getElementById('only-success');
const viewToggleBtn = document.getElementById('view-toggle');
const emptyEl = document.getElementById('empty');

// ---- grouped view thresholds (tune as needed)
const GROUP_HIGHLIGHT_SLOW_AVG_MS = 500;

const port = chrome.runtime.connect({ name: 'api-observatory-devtools' });
const tabId = chrome.devtools.inspectedWindow.tabId;
port.postMessage({ type: 'REGISTER', tabId });

let streaming = true;
let viewMode = 'live'; // 'live' | 'grouped'

// Keep in-memory list for grouped view (client-side only)
const liveEvents = [];

function showEmpty(message) {
  if (!emptyEl) return;
  emptyEl.textContent = message;
  emptyEl.classList.remove('hidden');
}

function hideEmpty() {
  if (!emptyEl) return;
  emptyEl.classList.add('hidden');
}

function updateEmptyState() {
  // In live mode we consider the current rendered rows.
  // In grouped mode we consider whether there is any aggregatable data after filters.
  if (viewMode === 'live') {
    if (rowsEl.children.length === 0) {
      showEmpty('No API requests captured yet');
    } else {
      hideEmpty();
    }
    return;
  }

  // grouped
  const anyVisible = liveEvents.some((e) => shouldShow(e));
  if (!anyVisible) {
    showEmpty('No API data to aggregate');
  } else {
    hideEmpty();
  }
}

function ensureGroupedHighlightStyles() {
  if (document.getElementById('api-observatory-grouped-styles')) return;
  const style = document.createElement('style');
  style.id = 'api-observatory-grouped-styles';
  style.textContent = `
    /* grouped view emphasis */
    tr.group-has-errors { background: rgba(239, 68, 68, 0.08); }
    tr.group-slow { background: rgba(245, 158, 11, 0.10); }

    /* if both apply, stack emphasis */
    tr.group-has-errors.group-slow { background: rgba(239, 68, 68, 0.10); }

    td.group-errors strong { color: var(--red); }
    td.group-avg-slow strong { color: #f59e0b; }
  `;
  document.head.appendChild(style);
}

ensureGroupedHighlightStyles();

function renderHeaderForMode() {
  const theadRow = document.querySelector('table thead tr');
  if (!theadRow) return;

  if (viewMode === 'live') {
    theadRow.innerHTML = `
      <th style="width: 90px;">Time</th>
      <th style="width: 70px;">Method</th>
      <th>Path</th>
      <th style="width: 70px;">Status</th>
      <th style="width: 80px;">Dur (ms)</th>
    `;
  } else {
    theadRow.innerHTML = `
      <th style="width: 70px;">Method</th>
      <th>Path</th>
      <th style="width: 80px;">Count</th>
      <th style="width: 80px;">Errors</th>
      <th style="width: 90px;">Avg (ms)</th>
    `;
  }
}

function setViewMode(next) {
  viewMode = next;
  viewToggleBtn.textContent = viewMode === 'live' ? 'Grouped view' : 'Live view';
  renderHeaderForMode();
  rowsEl.innerHTML = '';
  if (viewMode === 'grouped') {
    renderGrouped();
  }
  updateEmptyState();
}

function clearData() {
  // Demo/reset: clear all client-side captured history and the current table.
  liveEvents.length = 0;
  rowsEl.innerHTML = '';

  // If grouped view is active, renderGrouped() will show an empty grouped list.
  // If live view is active, table stays empty until new events arrive.
  if (viewMode === 'grouped') {
    renderGrouped();
  }

  updateEmptyState();
}

viewToggleBtn.addEventListener('click', () => {
  setViewMode(viewMode === 'live' ? 'grouped' : 'live');
});

toggleStreamBtn.addEventListener('click', () => {
  streaming = !streaming;
  toggleStreamBtn.textContent = streaming ? 'Pause' : 'Resume';
});

// Clear only the visible rows (keeps history for grouped view)
clearBtn.addEventListener('click', () => {
  rowsEl.innerHTML = '';
  updateEmptyState();
});

// Clear all demo data (history + current view)
clearDataBtn?.addEventListener('click', clearData);

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

function toPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url || '');
  }
}

function rowClass(statusCode) {
  if (typeof statusCode !== 'number') return 'row-bad';
  return statusCode < 400 ? 'row-ok' : 'row-bad';
}

function statusClass(statusCode) {
  if (typeof statusCode !== 'number') return 'bad';
  return statusCode < 400 ? 'ok' : 'bad';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- client-side noise reduction
function isStatusZero(log) {
  return (log?.statusCode === 0);
}

// Optional: heuristically hide common "blocked" URLs (ad/tracker lists, extensions, etc.)
function isProbablyBlockedByClient(log) {
  const url = String(log?.url || '');
  const err = String(log?.error || '').toLowerCase();

  // Common patterns seen when blocked by extensions / client
  if (err.includes('blocked')) return true;
  if (err.includes('err_blocked_by_client')) return true;

  // Heuristic URL noise (keep conservative)
  if (url.startsWith('chrome-extension://')) return true;

  return false;
}

function shouldShow(log) {
  // Always hide status 0 (usually aborted/blocked/noise)
  if (isStatusZero(log)) return false;

  // Optionally hide blocked-by-client style noise
  if (isProbablyBlockedByClient(log)) return false;

  // Toggle: show only successful requests
  if (onlySuccessEl?.checked) {
    const s = typeof log?.statusCode === 'number' ? log.statusCode : 0;
    if (!(s >= 200 && s < 400)) return false;
  }

  return true;
}

function addLiveRow(log) {
  const tr = document.createElement('tr');
  tr.className = rowClass(log.statusCode);

  const path = toPathname(log.url);

  tr.innerHTML = `
    <td><span class="pill">${fmtTime(log.timestamp)}</span></td>
    <td><span class="pill">${escapeHtml(log.method || '')}</span></td>
    <td class="url">${escapeHtml(path)}</td>
    <td><span class="pill ${statusClass(log.statusCode)}">${String(log.statusCode)}</span></td>
    <td><span class="pill">${String(log.duration ?? '')}</span></td>
  `;

  rowsEl.prepend(tr);

  // keep last 300 in-panel
  while (rowsEl.children.length > 300) {
    rowsEl.removeChild(rowsEl.lastChild);
  }

  hideEmpty();
}

function renderGrouped() {
  // Aggregate visible events only (respects filters)
  const groups = new Map();

  for (const e of liveEvents) {
    if (!shouldShow(e)) continue;

    const method = String(e.method || '').toUpperCase();
    const path = toPathname(e.url);
    const key = `${method} ${path}`;

    let g = groups.get(key);
    if (!g) {
      g = { method, path, count: 0, errors: 0, totalDuration: 0, durationCount: 0 };
      groups.set(key, g);
    }

    g.count += 1;
    if (typeof e.statusCode === 'number' && e.statusCode >= 400) g.errors += 1;

    if (typeof e.duration === 'number') {
      g.totalDuration += e.duration;
      g.durationCount += 1;
    }
  }

  const sorted = Array.from(groups.values()).sort((a, b) => {
    // primary: count desc, secondary: errors desc, tertiary: avg desc
    const c = b.count - a.count;
    if (c !== 0) return c;
    const e = b.errors - a.errors;
    if (e !== 0) return e;
    const aAvg = a.durationCount ? a.totalDuration / a.durationCount : 0;
    const bAvg = b.durationCount ? b.totalDuration / b.durationCount : 0;
    return bAvg - aAvg;
  });

  rowsEl.innerHTML = '';

  for (const g of sorted) {
    const avg = g.durationCount ? (g.totalDuration / g.durationCount) : null;
    const avgRounded = avg == null ? '' : Math.round(avg);

    const hasErrors = g.errors > 0;
    const isSlow = avg != null && avg > GROUP_HIGHLIGHT_SLOW_AVG_MS;

    const tr = document.createElement('tr');

    // Keep overall row ok/bad color + add grouped emphasis classes
    const baseRow = hasErrors ? 'row-bad' : 'row-ok';
    tr.className = [
      baseRow,
      hasErrors ? 'group-has-errors' : '',
      isSlow ? 'group-slow' : ''
    ].filter(Boolean).join(' ');

    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(g.method)}</span></td>
      <td class="url">${escapeHtml(g.path)}</td>
      <td><span class="pill">${String(g.count)}</span></td>
      <td class="group-errors"><span class="pill ${hasErrors ? 'bad' : 'ok'}"><strong>${String(g.errors)}</strong></span></td>
      <td class="${isSlow ? 'group-avg-slow' : ''}"><span class="pill"><strong>${String(avgRounded)}</strong></span></td>
    `;

    rowsEl.appendChild(tr);
  }

  updateEmptyState();
}

// Re-render grouped view when filters change
onlySuccessEl?.addEventListener('change', () => {
  if (viewMode === 'grouped') {
    renderGrouped();
  } else {
    updateEmptyState();
  }
});

// initial header
renderHeaderForMode();
updateEmptyState();

port.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'STATE') {
    subtitleEl.textContent = msg.origin
      ? `${msg.origin} • ${msg.enabled ? 'tracking on' : 'tracking off'}`
      : 'Unsupported tab (open an http/https page)';
    return;
  }

  if (msg.type === 'LOG') {
    if (!streaming) return;

    const ev = msg.payload;

    // keep a client-side copy for grouping
    liveEvents.push(ev);
    if (liveEvents.length > 2000) {
      liveEvents.splice(0, liveEvents.length - 2000);
    }

    if (viewMode === 'live') {
      if (!shouldShow(ev)) {
        updateEmptyState();
        return;
      }
      addLiveRow(ev);
      updateEmptyState();
      return;
    }

    // grouped
    renderGrouped();
  }
});
