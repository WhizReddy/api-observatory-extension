// background.js (MV3 service worker)
console.log('[API Observatory][bg] service worker loaded');

// DevTools panel connections: tabId -> Port
const devtoolsPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'api-observatory-devtools') return;

  let tabId = null;

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'REGISTER' && typeof msg.tabId === 'number') {
      tabId = msg.tabId;
      devtoolsPorts.set(tabId, port);
      try {
        port.postMessage({ type: 'HELLO', ok: true });
      } catch {}
    }
  });

  port.onDisconnect.addListener(() => {
    if (typeof tabId === 'number') devtoolsPorts.delete(tabId);
  });
});

// receive messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message?.type !== 'API_OBSERVATORY_EVENT') return true;

    const payload = message.payload || {};
    const tabId = sender?.tab?.id;

    // forward to DevTools UI if open for this tab
    if (typeof tabId === 'number') {
      const port = devtoolsPorts.get(tabId);
      if (port) {
        try {
          port.postMessage({ type: 'LOG', payload });
        } catch {}
      }
    }

    sendResponse?.({ ok: true });
  } catch (e) {
    // ignore
  }
  return true;
});
