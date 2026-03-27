/**
 * background.js - Service Worker for API Observatory
 * 
 * Responsibilities:
 * - Manages event buffering and forwarding to DevTools panels
 * - Tracks monthly request counts for free users
 * - Manages domain-specific tracking status
 * - Maintains premium status cache
 * - Listens for storage changes and syncs them across tabs
 */

// Map of tabId -> port for communicating with DevTools panels
const devtoolsPorts = new Map();
// Map of tabId -> Array<Event> for queuing events when DevTools panel not connected
const eventBuffers = new Map();

// Global constants and limits
const FREE_MONTHLY_LIMIT = 200;

// In-memory cache to prevent race conditions during concurrent request handling
let isPremiumCached = null;
let monthlyRequestsCached = null;
let lastResetCheckDate = ''; // Tracks when monthly counter was last reset
let statsCache = {}; // domain -> { requests, errors, totalDuration }

/**
 * Ensure in-memory cache is synced with Chrome storage
 * Also handles monthly counter reset if calendar month has changed
 */
async function ensureStateLoaded() {
  // Load from chrome storage if not yet cached
  if (isPremiumCached === null || monthlyRequestsCached === null) {
    const sync = await chrome.storage.sync.get('is_premium');
    const local = await chrome.storage.local.get(['monthly_requests', 'counter_reset_date']);

    // Cache values in memory for quick access
    isPremiumCached = sync.is_premium === true;
    monthlyRequestsCached = local.monthly_requests || 0;
    lastResetCheckDate = local.counter_reset_date || '';
  }

  // Check if we need to reset monthly counter (new calendar month)
  const now = new Date();
  const resetDate = lastResetCheckDate ? new Date(lastResetCheckDate) : null;

  // Reset if: first time (no reset date) OR calendar month/year has changed
  if (!resetDate || resetDate.getMonth() !== now.getMonth() || resetDate.getFullYear() !== now.getFullYear()) {
    monthlyRequestsCached = 0;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    lastResetCheckDate = nextMonth.toISOString();
    await chrome.storage.local.set({
      monthly_requests: 0,
      counter_reset_date: lastResetCheckDate
    });
    console.log('[Background] Monthly counter RESET for new month');
  }
}

/**
 * Handle DevTools panel connection
 * When a DevTools panel connects, register it and send buffered events
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'api-observatory-devtools') {
    let tabId = null;
    // Listen for REGISTER message from DevTools panel
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'REGISTER' && Number.isInteger(msg.tabId)) {
        // Save port reference for this tab
        tabId = msg.tabId;
        devtoolsPorts.set(tabId, port);
        // Flush buffered events to newly connected panel
        const buffer = eventBuffers.get(tabId);
        if (buffer) {
          buffer.forEach(p => {
            try {
              port.postMessage({ type: 'LOG', payload: p });
            } catch {
              // Port may have disconnected, ignore
            }
          });
        }
      }
    });
    // Clean up port reference when panel disconnects
    port.onDisconnect.addListener(() => {
      if (tabId !== null) {
        devtoolsPorts.delete(tabId);
      }
    });
  }
});

/**
 * Clean up when a tab is closed
 * Remove event buffer and DevTools port references
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  eventBuffers.delete(tabId);
  devtoolsPorts.delete(tabId);
});

/**
 * Main event listener for API requests from content script
 * Handles:
 * - Domain filtering (users can pause tracking per domain)
 * - Monthly request limits for free users
 * - Monthly request counter increments
 * - Statistics aggregation by domain
 * - Event buffering and forwarding to DevTools
 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'API_OBSERVATORY_EVENT') return;

  (async () => {
    // Sync cache with storage
    await ensureStateLoaded();
    // Validate sender tab info
    if (!sender.tab?.id || !sender.tab?.url) return;

    const tabId = sender.tab.id;
    const url = new URL(sender.tab.url);
    const domain = url.hostname;

    // Step 1: Domain Check - user can disable tracking per domain
    const domainStorage = await chrome.storage.sync.get(domain);
    if (domainStorage[domain] === false) {
      return; // Tracking disabled for this domain
    }

    // Step 2: Free User Limit Check - enforce monthly request limit
    if (!isPremiumCached && monthlyRequestsCached >= FREE_MONTHLY_LIMIT) {
      return; // Exceeded free tier monthly limit
    }

    // Step 3: Increment Monthly Counter (free users only)
    if (!isPremiumCached) {
      monthlyRequestsCached++;
      chrome.storage.local.set({ monthly_requests: monthlyRequestsCached });
    }

    // Step 4: Update Statistics by domain
    const statsKey = 'stats_' + domain;
    if (!statsCache[domain]) {
      // Load stats from storage if not in cache
      const data = await chrome.storage.local.get(statsKey);
      statsCache[domain] = data[statsKey] || { requests: 0, errors: 0, totalDuration: 0 };
    }

    const stats = statsCache[domain];
    stats.requests++; // Increment request count
    // Track errors (4xx, 5xx, or network failures represented as 0)
    if (msg.payload.statusCode >= 400 || msg.payload.statusCode === 0) {
      stats.errors++;
    }
    // Accumulate total duration for average calculation
    stats.totalDuration += (msg.payload.durationMs || 0);

    chrome.storage.local.set({ [statsKey]: stats });

    // Step 5: Buffer and Forward to DevTools
    // Maintain a rolling buffer of recent events (max 50)
    if (!eventBuffers.has(tabId)) {
      eventBuffers.set(tabId, []);
    }
    const buffer = eventBuffers.get(tabId);
    buffer.push(msg.payload);
    // Keep buffer size manageable by removing oldest events
    if (buffer.length > 50) {
      buffer.shift();
    }

    // Forward event to DevTools panel if connected
    const dt = devtoolsPorts.get(tabId);
    if (dt) {
      try {
        dt.postMessage({ type: 'LOG', payload: msg.payload });
      } catch {
        // Connection error - remove stale port reference
        devtoolsPorts.delete(tabId);
      }
    }
  })();

  return true;
});

/**
 * Listen for storage changes and sync premium status cache
 * This ensures if premium status changes in one tab/popup, all tabs see the update
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.is_premium) {
    // Update cache immediately when premium status changes
    isPremiumCached = changes.is_premium.newValue === true;
  }
});
