// utils/logger.js
import { CONFIG } from '../config.js';

// Bounded in-memory queue for batching
const queue = [];
let flushTimer = null;
let flushing = false;

// simple retry/backoff state
let retryAttempt = 0;

function scheduleFlush(delayMs) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch(() => {
      // ignore
    });
  }, delayMs);
}

function backoffMs(attempt) {
  // 0,1,2,... => 500, 1000, 2000, 4000, 8000 (cap)
  const base = 500;
  const max = 8000;
  return Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
}

/**
 * Sends a batch of events to the backend.
 * Payload shape: { events: [...] }
 */
export async function sendLog(logData) {
  try {
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': CONFIG.VERSION
      },
      body: JSON.stringify(logData)
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Enqueue a single request event and flush in batches.
 * @param {Object} requestData
 */
export async function logRequest(requestData) {
  // Privacy: keep only request metadata; no session/user identifiers.
  const event = {
    ...requestData,
    extensionVersion: CONFIG.VERSION
  };

  queue.push(event);

  // bound growth
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

  // take up to BATCH_SIZE
  const events = queue.splice(0, CONFIG.BATCH_SIZE);

  try {
    const ok = await sendLog({ events });
    if (!ok) {
      // put back at front (best effort)
      queue.unshift(...events);
      retryAttempt += 1;
      scheduleFlush(backoffMs(retryAttempt));
      return;
    }

    retryAttempt = 0;

    // if more remain, flush soon
    if (queue.length > 0) scheduleFlush(0);
  } finally {
    flushing = false;
  }
}

/**
 * Check if tracking is enabled for a specific domain
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
export async function isTrackingEnabled(domain) {
  return new Promise((resolve) => {
    chrome.storage.sync.get([domain], (result) => {
      resolve(!!result[domain]);
    });
  });
}