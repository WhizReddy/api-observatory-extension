// background.js - Service Worker for API Observatory
// Inlined config to avoid import issues
const CONFIG = {
  BACKEND_URL: 'https://api.observatory-backend.com/logs',
  BATCH_SIZE: 10,
  BATCH_TIMEOUT_MS: 5000,
  VERSION: '1.0.0'
};

// Inlined logger functions (no external imports)
const queue = [];
let flushTimer = null;
let flushing = false;
let retryAttempt = 0;

function scheduleFlush(delayMs) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch(() => {});
  }, delayMs);
}

function backoffMs(attempt) {
  const base = 500;
  const max = 8000;
  return Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
}

async function sendLog(logData) {
  try {
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': CONFIG.VERSION
      },
      body: JSON.stringify(logData)
    });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  }
}

async function logRequest(requestData) {
  const event = {
    ...requestData,
    extensionVersion: CONFIG.VERSION
  };
  queue.push(event);
  if (queue.length > 1000) {
    queue.splice(0, queue.length - 1000);
  }
  if (queue.length >= CONFIG.BATCH_SIZE) {
    scheduleFlush(0);
  } else {
    scheduleFlush(CONFIG.BATCH_TIMEOUT_MS);
  }
}

async function flush() {
  if (flushing) return;
  if (queue.length === 0) return;
  flushing = true;
  const events = queue.splice(0, CONFIG.BATCH_SIZE);
  try {
    const ok = await sendLog({ events });
    if (!ok) {
      queue.unshift(...events);
      retryAttempt += 1;
      scheduleFlush(backoffMs(retryAttempt));
      return;
    }
    retryAttempt = 0;
    if (queue.length > 0) scheduleFlush(0);
  } finally {
    flushing = false;
  }
}

async function isTrackingEnabled(domain) {
  return new Promise((resolve) => {
    chrome.storage.sync.get([domain], (result) => {
      resolve(!!result[domain]);
    });
  });
}

// DevTools connections keyed by tabId
const devtoolsPortsByTabId = new Map();

function postToDevtools(tabId, message) {
  const port = devtoolsPortsByTabId.get(tabId);
  if (!port) return;
  try {
    port.postMessage(message);
  } catch {
    // ignore
  }
}

/**
 * Extract domain from a URL string
 * @param {string} url
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'api-observatory-devtools') return;

  let registeredTabId = null;

  port.onDisconnect.addListener(() => {
    if (typeof registeredTabId === 'number') {
      devtoolsPortsByTabId.delete(registeredTabId);
    }
  });

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'REGISTER' && typeof msg.tabId === 'number') {
      registeredTabId = msg.tabId;
      devtoolsPortsByTabId.set(registeredTabId, port);
      console.log('[API Observatory][bg] devtools connected for tab', registeredTabId);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return;
  if (message.type !== 'API_OBSERVATORY_EVENT') return;

  const payload = message.payload;
  if (!payload || typeof payload !== 'object') return;

  const tabId = sender?.tab?.id;
  const domain = extractDomain(payload.url);
  if (!domain) return;

  const apiMetadata = {
    url: payload.url,
    method: payload.method,
    statusCode: payload.statusCode,
    duration: Math.max(0, Math.round(payload.durationMs || 0)),
    timestamp: payload.timestamp || Date.now(),
    domain,
    kind: payload.kind,
    ...(payload.error ? { error: payload.error } : {})
  };

  // Always forward to DevTools panel (if connected) so you can see live traffic.
  if (typeof tabId === 'number') {
    postToDevtools(tabId, { type: 'LOG', payload: apiMetadata });
  }

  // Storage/stats are only updated when tracking is enabled.
  isTrackingEnabled(domain).then(async (enabled) => {
    if (!enabled) {
      console.log('[API Observatory][bg] Dropped stats/logging (tracking disabled):', domain, apiMetadata.url);
      return;
    }

    try {
      await updateLocalStats(domain, apiMetadata, apiMetadata.statusCode === 0 || apiMetadata.statusCode >= 400);
      await storeLogEntry(domain, apiMetadata);
    } catch {
      // ignore
    }
  });
});

async function updateLocalStats(domain, apiMetadata, isError = false) {
  try {
    const statsKey = `stats_${domain}`;
    const result = await chrome.storage.local.get([statsKey]);
    const currentStats =
      result[statsKey] || { requests: 0, totalDuration: 0, avgDuration: 0, errors: 0 };

    currentStats.requests += 1;
    if (isError) currentStats.errors += 1;
    currentStats.totalDuration += apiMetadata.duration;
    currentStats.avgDuration = Math.round(currentStats.totalDuration / currentStats.requests);

    await chrome.storage.local.set({ [statsKey]: currentStats });
  } catch {
    // ignore
  }
}

async function storeLogEntry(domain, logEntry) {
  try {
    const logsKey = `logs_${domain}`;
    const result = await chrome.storage.local.get([logsKey]);
    const logs = result[logsKey] || [];

    logs.push(logEntry);
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }

    await chrome.storage.local.set({ [logsKey]: logs });
  } catch {
    // ignore
  }
}

console.log('[API Observatory] Service worker initialized');
console.log('[API Observatory][bg] service worker loaded');