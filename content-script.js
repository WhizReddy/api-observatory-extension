/**
 * content-script.js - Message bridge between page world and extension
 * 
 * This content script runs in the ISOLATED world (Manifest V3 default).
 * It acts as a secure message bridge:
 * 1. Listens for API events from page-script.js (MAIN world)
 * 2. Forwards them to background.js (Extension context)
 * 
 * This architecture ensures:
 * - Page code cannot access extension APIs directly
 * - Extension APIs cannot be polluted by page code
 * - Safe communication between worlds
 */

(() => {
  // Guard against multiple injections
  // In isolated world, we use __API_OBS_BRIDGE__ as marker
  if (globalThis.__API_OBS_BRIDGE__) return;
  globalThis.__API_OBS_BRIDGE__ = true;

  /**
   * Forward API event to background.js
   * @param {Object} payload - Event payload from page script
   */
  function forward(payload) {
    // Check if extension context is still valid
    // chrome.runtime.id is undefined if extension is disabled/reloaded
    if (!chrome?.runtime?.id) return;

    try {
      // Send message to background service worker
      chrome.runtime.sendMessage(
        { type: "API_OBSERVATORY_EVENT", payload },
        () => {
          // Swallow expected MV3 disconnect noise when background worker reloads
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // Extension context invalidated - expected during extension reload
      // Silent fail, content script will still work after extension reloads
    }
  }

  /**
   * Listen for events posted from page-script.js
   * Page script posts to window with __api_observatory__ marker for safety
   */
  window.addEventListener("message", (event) => {
    // Only process messages from the page itself (not external sources)
    if (event.source !== window) return;

    const data = event.data;
    // Only process messages marked as API Observatory events
    if (!data || data.__api_observatory__ !== true) return;

    // Forward the payload to the extension
    forward(data.payload);
  });

  /**
   * Handle re-injection request from DevTools panel
   * If the extension is reloaded while DevTools is open, we need to re-inject
   * the page-script.js so that fetch/XHR patching is restored
   */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "REINJECT_PAGE_SCRIPT") {
      try {
        // Create new script element pointing to page-script.js
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page-script.js");
        // Remove script after execution (clean up DOM)
        script.onload = () => script.remove();
        // Append to document to execute (in MAIN world)
        (document.head || document.documentElement || document).appendChild(
          script
        );
        sendResponse({ success: true });
      } catch {
        sendResponse({ success: false });
      }
    }
    return true;
  });
})();
