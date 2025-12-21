// background.js - Service Worker for API Observatory
import { logRequest, isTrackingEnabled } from "./utils/logger.js";

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
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return;
  if (message.type !== 'API_OBSERVATORY_EVENT') return;

  const payload = message.payload;
  if (!payload || typeof payload !== 'object') return;

  const isSelfTest = payload.selfTest === true;

  const tabId = sender?.tab?.id;
  const domain = extractDomain(payload.url);
  if (!domain) return;

  // Self-test events are always accepted (for debug only).
  // Normal events require per-domain tracking to be enabled.
  const proceed = async () => {
    if (isSelfTest) {
      console.log('[API Observatory][bg] SELF-TEST event accepted:', payload.url);
      return true;
    }

    const enabled = await isTrackingEnabled(domain);
    if (!enabled) {
      console.log('[API Observatory][bg] Dropped event (tracking disabled):', domain, payload.url);
      return false;
    }

    return true;
  };

  proceed().then(async (ok) => {
    if (!ok) return;

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

    try {
      await logRequest(apiMetadata);
      await updateLocalStats(domain, apiMetadata, apiMetadata.statusCode === 0 || apiMetadata.statusCode >= 400);
      await storeLogEntry(domain, apiMetadata);
      if (typeof tabId === 'number') {
        postToDevtools(tabId, { type: 'LOG', payload: apiMetadata });
      }
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