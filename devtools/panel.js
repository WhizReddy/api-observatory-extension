/**
 * devtools/panel.js - DevTools panel for viewing API requests
 * 
 * Features:
 * - Live stream of API requests (fetch and XHR)
 * - Grouped/aggregated view by HTTP method and path
 * - Search and filtering (Pro feature)
 * - Pause/resume and clear controls
 * - Premium status indication
 * - Monthly usage tracking for free users
 * 
 * The panel connects to background.js via chrome.runtime.connect
 * to receive API events captured by content/page scripts
 */

// Signal to background that DevTools panel is ready to receive events
window.postMessage({ type: 'PANEL_READY' }, '*');

// DOM element references
const rowsEl = document.getElementById('rows');
const theadEl = document.getElementById('thead');
const statusEl = document.getElementById('status');

// Control buttons
const pauseBtn = document.getElementById('pause');
const clearBtn = document.getElementById('clear');

// Search and filter controls
const searchInput = document.getElementById('search');

const onlySuccessEl = document.getElementById('onlySuccess');
const onlyErrorsEl = document.getElementById('onlyErrors');
const onlySlowEl = document.getElementById('onlySlow');

// Constants
const SLOW_THRESHOLD_MS = 500; // Requests slower than this are marked as "slow"
const MAX_EVENTS = 2500; // Hard limit on events kept in memory
const FREE_LIMIT = 5; // Free users can only see last 5 requests in DevTools
const FREE_MONTHLY_LIMIT = 200; // Free users get 200 requests per month total

// Premium status (loaded from storage)
let IS_PREMIUM = false;
let MONTHLY_REQUEST_COUNT = 0; // Tracked for free users

// UI Elements
const proBadge = document.getElementById('pro-badge');

/**
 * Handle search input - Pro feature
 * Search is restricted to Pro users
 */
searchInput.addEventListener('input', (e) => {
  if (!IS_PREMIUM) {
    // Free users cannot search
    e.preventDefault();
    searchInput.value = '';
    alert('🔒 Search is a Pro feature!\n\nUpgrade to unlock search functionality.');
    return;
  }
  // Update search query and re-render
  searchQuery = e.target.value.toLowerCase().trim();
  render();
});

// Search query state
let searchQuery = '';

/**
 * Update UI elements based on premium status
 * Shows/hides Pro features and disables them for free users
 */
function updatePremiumUI() {
  // Show PRO badge for premium users
  if (IS_PREMIUM) {
    proBadge.style.display = 'inline-block';
  } else {
    proBadge.style.display = 'none';
  }

  // Lock features for free users
  if (!IS_PREMIUM) {
    // Disable search for free users
    searchInput.disabled = true;
    searchInput.placeholder = '🔒 Search (Pro Only)';
    searchInput.style.opacity = '0.5';
    searchInput.title = 'Upgrade to Pro to use search';

    // Disable filter checkboxes for free users
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
    // Enable search for pro users
    searchInput.disabled = false;
    searchInput.placeholder = 'Search method or path...';
    searchInput.style.opacity = '1';
    searchInput.title = '';

    // Enable filter checkboxes for pro users
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

  // Re-render table with updated UI
  render();
}


// Event state
let paused = false;          // Pause button state (DevTools UI only)
let trackingEnabled = false; // Global tracking status (from popup/storage)
let events = [];             // Array of captured events

/**
 * Update monthly counter UI for free users
 * Shows warning if approaching or exceeded monthly limit
 */
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

/**
 * Check if we should stream new events
 * Returns false if tracking is disabled or panel is paused
 * @returns {boolean}
 */
function canStream() {
  return trackingEnabled && !paused;
}

/**
 * Extract pathname from URL safely
 * @param {string} url - Full URL to parse
 * @returns {string} Pathname or fallback to full URL
 */
function safePath(url) {
  try {
    return new URL(url, location.href).pathname || String(url || '');
  } catch {
    return String(url || '');
  }
}

/**
 * Format milliseconds to readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function fmtMs(ms) {
  return `${Math.round(ms || 0)}ms`;
}

/**
 * Format timestamp to relative time string (e.g. "5s ago")
 * @param {number} ts - Timestamp in milliseconds
 * @returns {string} Relative time string
 */
function fmtRel(ts) {
  const d = Date.now() - ts;
  if (d < 1000) return `${d}ms ago`;
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  return `${Math.floor(d / 60000)}m ago`;
}

/**
 * Enforce hard limit on events array
 * Removes oldest events if we exceed MAX_EVENTS
 */
function clampEvents() {
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

/**
 * Update pause button based on current state
 */
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

/**
 * Render table header with column names
 */
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

/**
 * Render table with filtered/searched events
 * Applies search query and filter checkboxes
 */
function render() {
  updateHeader();
  renderHeader();
  rowsEl.innerHTML = '';

  // console.log('[API Observatory] Render called. Events:', events.length);

  let shown = 0;
  // Iterate backwards to show most recent events first
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];

    // Determine status categories
    const ok = e.statusCode >= 200 && e.statusCode < 400;
    const err = e.statusCode >= 400 || e.statusCode === 0;
    const slow = e.durationMs >= SLOW_THRESHOLD_MS;

    // Apply filter checkboxes (only for Pro users)
    if (onlySuccessEl.checked && !ok) continue;
    if (onlyErrorsEl.checked && !err) continue;
    if (onlySlowEl.checked && !slow) continue;

    // Apply search filter (only for Pro users)
    if (searchQuery) {
      if (!e.url.toLowerCase().includes(searchQuery) && !e.method.toLowerCase().includes(searchQuery)) {
        continue;
      }
    }

    // Enforce row limit for free users
    if (!IS_PREMIUM && shown >= FREE_LIMIT) {
      // Show "upgrade to pro" banner when free users hit limit
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

    // Create table row for event
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.title = 'Click to log details to Console';
    tr.onclick = () => {
      // Log event details to DevTools console
      if (!IS_PREMIUM && e.requestBody) {
        console.log('[API Observatory] 🔒 Request Body is hidden on Free plan.');
        console.log('[API Observatory] Upgrade to see payloads:', e);
      } else {
        console.log('[API Details]', e);
      }
    };

    // Determine status styling class
    let statusClass = 'status-200';
    if (e.statusCode >= 400 || e.statusCode === 0) statusClass = 'status-400';
    else if (e.statusCode >= 300) statusClass = 'status-300';

    // Show lock icon if request body hidden (free users)
    let bodyIcon = '';
    if (e.requestBody) {
      if (IS_PREMIUM) {
        bodyIcon = '<span title="Has Request Body">📦</span>';
      } else {
        bodyIcon = '<span title="Upgrade to see payload" style="filter:grayscale(1); opacity:0.5">🔒</span>';
      }
    }

    // Render row content
    tr.innerHTML = `
      <td class="method">${e.method}</td>
      <td style="color:var(--text-primary)">${safePath(e.url)} ${bodyIcon}</td>
      <td class="${statusClass}">${e.statusCode === 0 ? 'FAIL' : e.statusCode}</td>
      <td class="duration">${fmtMs(e.durationMs)}</td>
      <td class="time">${fmtRel(e.timestamp)}</td>
    `;
    rowsEl.appendChild(tr);

    // Hard limit on displayed rows
    if (++shown >= 450) break;
  }
}

/**
 * Handle pause button click
 */
pauseBtn.addEventListener('click', () => {
  if (!trackingEnabled) {
    alert('⚠️ Tracking is disabled for this domain.\n\nEnable it in the extension popup first!');
    return;
  }
  paused = !paused;
  render();
});

/**
 * Handle clear button click
 * Clears visible events (not full history)
 */
clearBtn.addEventListener('click', () => {
  events.length = 0;
  render();
});

// Add listeners for filter checkboxes
onlySuccessEl.addEventListener('change', render);
onlyErrorsEl.addEventListener('change', render);
onlySlowEl.addEventListener('change', render);

/**
 * Load domain tracking status from storage
 * Updates trackingEnabled flag based on user's popup settings
 */
async function loadTrackingGuess() {
  try {
    // Get current inspected tab
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) {
      const domain = new URL(tab.url).hostname;
      // Check if user has disabled tracking for this domain
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

// ---- Connection Logic ----
let port = null;

/**
 * Set status message in the top status bar
 * @param {string} msg - Status message to display
 * @param {string} color - CSS color for the text
 */
function setStatus(msg, color = '#888') {
  // console.log('[API Observatory] Status Update:', msg);
  statusEl.textContent = msg;
  statusEl.style.color = color;
}

/**
 * Connect DevTools panel to background service worker
 * Establishes port for receiving API events
 */
function connect() {
  setStatus('Connecting...', '#e6a23c'); // Orange

  try {
    // Connect to background service worker
    port = chrome.runtime.connect({ name: 'api-observatory-devtools' });

    // Add listener BEFORE registering to prevent race conditions
    port.onMessage.addListener((msg) => {
      console.log('[DevTools API] Received message:', msg?.type);
      if (msg?.type !== 'LOG') return;
      
      // Ignore messages if streaming is paused or disabled
      if (!canStream()) {
        console.warn('[DevTools API] Stream ignored (Paused or Disabled)');
        return;
      }

      const p = msg.payload || {};
      if (!p.url) return;

      // Check free user monthly limit
      if (!IS_PREMIUM && MONTHLY_REQUEST_COUNT >= FREE_MONTHLY_LIMIT) {
        setStatus(`❌ Monthly limit reached (${FREE_MONTHLY_LIMIT} requests)`, '#f56c6c');
        return;
      }

      // console.log('[API Observatory] Logging event:', p.method, p.url);
      
      // Add event to local array
      events.push({
        method: String(p.method || 'GET').toUpperCase(),
        url: p.url,
        statusCode: p.statusCode || 0,
        durationMs: p.durationMs || 0,
        timestamp: p.timestamp || Date.now(),
        requestBody: p.requestBody || null
      });

      // Keep array size manageable
      clampEvents();
      render();
    });

    // Register this DevTools panel with background for the inspected tab
    // console.log('[API Observatory] Sending REGISTER for tab:', chrome.devtools.inspectedWindow.tabId);
    port.postMessage({
      type: 'REGISTER',
      tabId: chrome.devtools.inspectedWindow.tabId
    });

    // Mark as connected
    setStatus('Connected', '#67c23a'); // Green

    // Handle disconnection (e.g. background service worker restart)
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

/**
 * Initialize DevTools panel
 * Load settings from storage and establish connection
 */
(async function init() {
  // Load premium status from storage
  const data = await chrome.storage.sync.get('is_premium');
  IS_PREMIUM = data.is_premium === true;

  // Load monthly counter for free users
  const localData = await chrome.storage.local.get('monthly_requests');
  MONTHLY_REQUEST_COUNT = localData.monthly_requests || 0;
  updateMonthlyCounterUI();

  // Update UI based on premium status
  updatePremiumUI();

  // Listen for storage changes to sync premium status
  chrome.storage.onChanged.addListener((changes, area) => {
    // React to premium status changes
    if (area === 'sync' && changes.is_premium) {
      IS_PREMIUM = changes.is_premium.newValue === true;
      updatePremiumUI();
      if (IS_PREMIUM) setStatus('Connected', '#67c23a');
    }
    // React to monthly counter changes
    if (area === 'local' && changes.monthly_requests) {
      MONTHLY_REQUEST_COUNT = changes.monthly_requests.newValue || 0;
      updateMonthlyCounterUI();
    }
  });

  // Establish connection to background service worker
  connect();
  // Load domain tracking status
  await loadTrackingGuess();

  // Auto-trigger capture if DevTools opened mid-session
  // If no events captured yet, re-inject page script
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
