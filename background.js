// background.js - Service Worker for API Observatory

// Keep background minimal and robust. If this file fails to register or throws at
// top-level, content-script sendMessage will error with:
// "Could not establish connection. Receiving end does not exist."

console.log('[API Observatory][bg] service worker loaded');

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

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function isTrackingEnabled(domain) {
  return new Promise((resolve) => {
    chrome.storage.sync.get([domain], (result) => {
      resolve(!!result[domain]);
    });
  });
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

      // Panel currently expects optional STATE messages.
      try {
        port.postMessage({ type: 'STATE', origin: null, enabled: true });
      } catch {
        // ignore
      }
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Always respond so sendMessage has a receiver.
    sendResponse?.({ ok: true });

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

    // Always forward to DevTools if connected
    if (typeof tabId === 'number') {
      postToDevtools(tabId, { type: 'LOG', payload: apiMetadata });
    }

    // Stats/log storage are gated by per-domain tracking.
    isTrackingEnabled(domain)
      .then(async (enabled) => {
        if (!enabled) return;
        await updateLocalStats(domain, apiMetadata, apiMetadata.statusCode === 0 || apiMetadata.statusCode >= 400);
        await storeLogEntry(domain, apiMetadata);
      })
      .catch(() => {});
  } catch (e) {
    console.warn('[API Observatory][bg] onMessage failed', e);
  }

  return true;
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