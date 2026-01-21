const devtoolsPorts = new Map(); // tabId -> port
const eventBuffers = new Map(); // tabId -> Array<Event>

const FREE_MONTHLY_LIMIT = 200;

// In-memory state to prevent race conditions during concurrent requests
let isPremiumCached = null;
let monthlyRequestsCached = null;
let statsCache = {}; // domain -> stats

async function ensureStateLoaded() {
  if (isPremiumCached !== null && monthlyRequestsCached !== null) return;

  const sync = await chrome.storage.sync.get('is_premium');
  const local = await chrome.storage.local.get(['monthly_requests', 'counter_reset_date']);

  isPremiumCached = sync.is_premium === true;
  monthlyRequestsCached = local.monthly_requests || 0;

  const now = new Date();
  const resetDate = local.counter_reset_date ? new Date(local.counter_reset_date) : null;

  if (!resetDate || resetDate.getMonth() !== now.getMonth() || resetDate.getFullYear() !== now.getFullYear()) {
    monthlyRequestsCached = 0;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await chrome.storage.local.set({
      monthly_requests: 0,
      counter_reset_date: nextMonth.toISOString()
    });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'api-observatory-devtools') {
    let tabId = null;
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'REGISTER' && Number.isInteger(msg.tabId)) {
        tabId = msg.tabId;
        devtoolsPorts.set(tabId, port);
        const buffer = eventBuffers.get(tabId);
        if (buffer) buffer.forEach(p => { try { port.postMessage({ type: 'LOG', payload: p }); } catch { } });
      }
    });
    port.onDisconnect.addListener(() => { if (tabId !== null) devtoolsPorts.delete(tabId); });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  eventBuffers.delete(tabId);
  devtoolsPorts.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'API_OBSERVATORY_EVENT') return;

  (async () => {
    await ensureStateLoaded();
    if (!sender.tab?.id || !sender.tab?.url) return;

    const tabId = sender.tab.id;
    const url = new URL(sender.tab.url);
    const domain = url.hostname;

    // 1. Domain Check
    const domainStorage = await chrome.storage.sync.get(domain);
    if (domainStorage[domain] === false) return;

    // 2. Limit Check
    if (!isPremiumCached && monthlyRequestsCached >= FREE_MONTHLY_LIMIT) return;

    // 3. Increment (In-memory first, then storage)
    if (!isPremiumCached) {
      monthlyRequestsCached++;
      chrome.storage.local.set({ monthly_requests: monthlyRequestsCached });
    }

    // 4. Update Stats
    const statsKey = 'stats_' + domain;
    if (!statsCache[domain]) {
      const data = await chrome.storage.local.get(statsKey);
      statsCache[domain] = data[statsKey] || { requests: 0, errors: 0, totalDuration: 0 };
    }

    const stats = statsCache[domain];
    stats.requests++;
    if (msg.payload.statusCode >= 400 || msg.payload.statusCode === 0) stats.errors++;
    stats.totalDuration += (msg.payload.durationMs || 0);

    chrome.storage.local.set({ [statsKey]: stats });

    // 5. Buffer and Forward
    if (!eventBuffers.has(tabId)) eventBuffers.set(tabId, []);
    const buffer = eventBuffers.get(tabId);
    buffer.push(msg.payload);
    if (buffer.length > 50) buffer.shift();

    const dt = devtoolsPorts.get(tabId);
    if (dt) {
      try { dt.postMessage({ type: 'LOG', payload: msg.payload }); }
      catch { devtoolsPorts.delete(tabId); }
    }
  })();

  return true;
});

// Update cache if premium status changes elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.is_premium) isPremiumCached = changes.is_premium.newValue === true;
});
