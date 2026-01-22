// devtools/panel.js
window.postMessage({ type: 'PANEL_READY' }, '*');

const rowsEl = document.getElementById('rows');
const theadEl = document.getElementById('thead');
const statusEl = document.getElementById('status');

const pauseBtn = document.getElementById('pause');
const clearBtn = document.getElementById('clear');

const searchInput = document.getElementById('search');

const onlySuccessEl = document.getElementById('onlySuccess');
const onlyErrorsEl = document.getElementById('onlyErrors');
const onlySlowEl = document.getElementById('onlySlow');

const SLOW_THRESHOLD_MS = 500;
const MAX_EVENTS = 2500; // Hard limit
const FREE_LIMIT = 5; // Free users only see last 5 requests in panel
const FREE_MONTHLY_LIMIT = 200; // Free users get 200 requests per month
let IS_PREMIUM = false; // Loaded from storage
let MONTHLY_REQUEST_COUNT = 0; // Tracked for free users

// UI Elements
const proBadge = document.getElementById('pro-badge');

// Search Logic
let searchQuery = '';
searchInput.addEventListener('input', (e) => {
  if (!IS_PREMIUM) {
    e.preventDefault();
    searchInput.value = '';
    alert('🔒 Search is a Pro feature!\n\nUpgrade to unlock search functionality.');
    return;
  }
  searchQuery = e.target.value.toLowerCase().trim();
  render();
});

function updatePremiumUI() {
  // Update PRO badge
  if (IS_PREMIUM) {
    proBadge.style.display = 'inline-block';
  } else {
    proBadge.style.display = 'none';
  }

  // Disable search for free users
  if (!IS_PREMIUM) {
    searchInput.disabled = true;
    searchInput.placeholder = '🔒 Search (Pro Only)';
    searchInput.style.opacity = '0.5';
    searchInput.title = 'Upgrade to Pro to use search';

    // Disable filter checkboxes
    onlySuccessEl.disabled = true;
    onlyErrorsEl.disabled = true;
    onlySlowEl.disabled = true;
    onlySuccessEl.parentElement.style.opacity = '0.5';
    onlyErrorsEl.parentElement.style.opacity = '0.5';
    onlySlowEl.parentElement.style.opacity = '0.5';
    onlySuccessEl.parentElement.title = 'Upgrade to Pro for filters';
    onlyErrorsEl.parentElement.title = 'Upgrade to Pro for filters';
    onlySlowEl.parentElement.title = 'Upgrade to Pro for filters';
  } else {
    searchInput.disabled = false;
    searchInput.placeholder = 'Search method or path...';
    searchInput.style.opacity = '1';
    searchInput.title = '';

    onlySuccessEl.disabled = false;
    onlyErrorsEl.disabled = false;
    onlySlowEl.disabled = false;
    onlySuccessEl.parentElement.style.opacity = '1';
    onlyErrorsEl.parentElement.style.opacity = '1';
    onlySlowEl.parentElement.style.opacity = '1';
    onlySuccessEl.parentElement.title = '';
    onlyErrorsEl.parentElement.title = '';
    onlySlowEl.parentElement.title = '';
  }

  render();
}


let paused = false;          // devtools-only
let trackingEnabled = false; // from popup (storage)
let events = [];

// Monthly Request Counter Management
// Redundant functions removed - background manages this now

function updateMonthlyCounterUI() {
  if (!IS_PREMIUM) {
    const remaining = FREE_MONTHLY_LIMIT - MONTHLY_REQUEST_COUNT;

    if (remaining <= 0) {
      setStatus(`❌ Monthly limit - Upgrade to Pro!`, '#f56c6c');
    } else if (remaining < 50) {
      setStatus(`⚠️ ${remaining}/${FREE_MONTHLY_LIMIT} requests left this month`, '#e6a23c');
    } else {
      setStatus('Connected', '#67c23a');
    }
  }
}



function canStream() {
  return trackingEnabled && !paused;
}

function safePath(url) {
  try { return new URL(url, location.href).pathname || String(url || ''); }
  catch { return String(url || ''); }
}

function fmtMs(ms) { return `${Math.round(ms || 0)}ms`; }

function fmtRel(ts) {
  const d = Date.now() - ts;
  if (d < 1000) return `${d}ms ago`;
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  return `${Math.floor(d / 60000)}m ago`;
}

function clampEvents() {
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

function updateHeader() {
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  pauseBtn.disabled = !trackingEnabled;

  // Update button styling based on state
  if (!trackingEnabled) {
    pauseBtn.style.opacity = '0.5';
    pauseBtn.title = 'Enable tracking in the popup first';
  } else {
    pauseBtn.style.opacity = '1';
    pauseBtn.title = paused ? 'Resume capturing requests' : 'Pause capturing requests';
  }
}

function renderHeader() {
  theadEl.innerHTML = `
    <tr>
      <th>Method</th>
      <th>Path</th>
      <th>Status</th>
      <th>Duration</th>
      <th>Time</th>
    </tr>
  `;
}

function render() {
  updateHeader();
  renderHeader();
  rowsEl.innerHTML = '';

  // console.log('[API Observatory] Render called. Events:', events.length);

  let shown = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];

    const ok = e.statusCode >= 200 && e.statusCode < 400;
    const err = e.statusCode >= 400 || e.statusCode === 0;
    const slow = e.durationMs >= SLOW_THRESHOLD_MS;

    if (onlySuccessEl.checked && !ok) continue;
    if (onlyErrorsEl.checked && !err) continue;
    if (onlySlowEl.checked && !slow) continue;

    // Search Filter
    if (searchQuery) {
      if (!e.url.toLowerCase().includes(searchQuery) && !e.method.toLowerCase().includes(searchQuery)) {
        continue;
      }
    }

    // --- SUBSCRIPTION LIMIT CHECK ---
    if (!IS_PREMIUM && shown >= FREE_LIMIT) {
      // Stop rendering more rows for free users
      const tr = document.createElement('tr');
      tr.className = 'premium-banner';
      tr.innerHTML = `
        <td colspan="5" style="text-align:center; padding: 20px; background: rgba(121, 40, 202, 0.1);">
          <div style="font-weight:700; font-size:14px; margin-bottom:4px; color: #d8b4fe">🔒 Upgrade to Pro</div>
          <div style="color:var(--text-secondary)">Free plan covers last ${FREE_LIMIT} requests.</div>
        </td>
      `;
      rowsEl.appendChild(tr);
      break;
    }

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click to log details to Console';
    tr.onclick = () => {
      if (!IS_PREMIUM && e.requestBody) {
        console.log('[API Observatory] 🔒 Request Body is hidden on Free plan.');
        console.log('[API Observatory] Upgrade to see payloads:', e);
      } else {
        console.log('[API Details]', e);
      }
    };

    // Status Class
    let statusClass = 'status-200';
    if (e.statusCode >= 400 || e.statusCode === 0) statusClass = 'status-400';
    else if (e.statusCode >= 300) statusClass = 'status-300';

    // Obscure Body for Free Users
    let bodyIcon = '';
    if (e.requestBody) {
      if (IS_PREMIUM) {
        bodyIcon = '<span title="Has Request Body">📦</span>';
      } else {
        bodyIcon = '<span title="Upgrade to see payload" style="filter:grayscale(1); opacity:0.5">🔒</span>';
      }
    }

    tr.innerHTML = `
      <td class="method">${e.method}</td>
      <td style="color:var(--text-primary)">${safePath(e.url)} ${bodyIcon}</td>
      <td class="${statusClass}">${e.statusCode === 0 ? 'FAIL' : e.statusCode}</td>
      <td class="duration">${fmtMs(e.durationMs)}</td>
      <td class="time">${fmtRel(e.timestamp)}</td>
    `;
    rowsEl.appendChild(tr);

    if (++shown >= 450) break;
  }
}


pauseBtn.addEventListener('click', () => {
  if (!trackingEnabled) {
    alert('⚠️ Tracking is disabled for this domain.\n\nEnable it in the extension popup first!');
    return;
  }
  paused = !paused;
  render();
});

clearBtn.addEventListener('click', () => {
  events.length = 0;
  render();
});

onlySuccessEl.addEventListener('change', render);
onlyErrorsEl.addEventListener('change', render);
onlySlowEl.addEventListener('change', render);

// Tracking enabled is stored per-domain by popup.
async function loadTrackingGuess() {
  try {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) {
      const domain = new URL(tab.url).hostname;
      const res = await chrome.storage.sync.get(domain);
      trackingEnabled = res[domain] !== false; // Default: ENABLED
      // console.log(`[API Observatory] Tracking Sync: ${domain}, Enabled: ${trackingEnabled}`);
    } else {
      trackingEnabled = true;
    }
  } catch (e) {
    console.warn('[Tracking Sync] Error getting domain:', e);
    trackingEnabled = true;
  }
  render();
}

// ---- Connection Logic (Moved from devtools.js) ----
let port = null;

function setStatus(msg, color = '#888') {
  // console.log('[API Observatory] Status Update:', msg);
  statusEl.textContent = msg;
  statusEl.style.color = color;
}

function connect() {
  setStatus('Connecting...', '#e6a23c'); // Orange
  try {
    port = chrome.runtime.connect({ name: 'api-observatory-devtools' });

    // 🔑 Fix Race Condition: Add listener BEFORE registering
    port.onMessage.addListener((msg) => {
      console.log('[DevTools API] Received message:', msg?.type);
      if (msg?.type !== 'LOG') return;
      if (!canStream()) {
        console.warn('[DevTools API] Stream ignored (Paused or Disabled)');
        return;
      }

      const p = msg.payload || {};
      if (!p.url) return;

      // Monthly limit check (variable updated via storage listener)
      if (!IS_PREMIUM && MONTHLY_REQUEST_COUNT >= FREE_MONTHLY_LIMIT) {
        setStatus(`❌ Monthly limit reached (${FREE_MONTHLY_LIMIT} requests)`, '#f56c6c');
        return;
      }


      // console.log('[API Observatory] Logging event:', p.method, p.url);
      events.push({
        method: String(p.method || 'GET').toUpperCase(),
        url: p.url,
        statusCode: p.statusCode || 0,
        durationMs: p.durationMs || 0,
        timestamp: p.timestamp || Date.now(),
        requestBody: p.requestBody || null
      });

      clampEvents();
      render();
    });

    // Register this panel with the background script for the current tab
    // console.log('[API Observatory] Sending REGISTER for tab:', chrome.devtools.inspectedWindow.tabId);
    port.postMessage({
      type: 'REGISTER',
      tabId: chrome.devtools.inspectedWindow.tabId
    });

    setStatus('Connected', '#67c23a'); // Green

    // Reconnect if disconnected (e.g. background service worker restart)
    port.onDisconnect.addListener(() => {
      console.warn('[DevTools API] Port disconnected');
      port = null;
      setStatus('Disconnected (Re-open DevTools)', '#f56c6c'); // Red
    });

  } catch (e) {
    setStatus('Connection Failed', '#f56c6c');
    console.error('[DevTools API] Connection error:', e);
  }
}

(async function init() {
  // Load premium status
  const data = await chrome.storage.sync.get('is_premium');
  IS_PREMIUM = data.is_premium === true;

  // Load monthly counter for free users
  const localData = await chrome.storage.local.get('monthly_requests');
  MONTHLY_REQUEST_COUNT = localData.monthly_requests || 0;
  updateMonthlyCounterUI();

  updatePremiumUI();

  // Listen for background state changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.is_premium) {
      IS_PREMIUM = changes.is_premium.newValue === true;
      updatePremiumUI();
      if (IS_PREMIUM) setStatus('Connected', '#67c23a');
    }
    if (area === 'local' && changes.monthly_requests) {
      MONTHLY_REQUEST_COUNT = changes.monthly_requests.newValue || 0;
      updateMonthlyCounterUI();
    }
  });

  connect();
  await loadTrackingGuess();

  // Auto-trigger capture if DevTools opened mid-session
  setTimeout(() => {
    if (events.length === 0) {
      // No events captured yet - try to re-inject
      chrome.tabs.sendMessage(
        chrome.devtools.inspectedWindow.tabId,
        { type: 'REINJECT_PAGE_SCRIPT' },
        () => void chrome.runtime.lastError
      );
    }
  }, 1000);
})();
