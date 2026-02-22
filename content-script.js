(() => {
  // IMPORTANT: content scripts run in an isolated world.
  // Don't use `window` for "already injected" markers (page JS can see/mutate that).
  if (globalThis.__API_OBS_BRIDGE__) return;
  globalThis.__API_OBS_BRIDGE__ = true;

  // 🚀 Bridge Logic
  // This content script runs in the ISOLATED world (default)
  // It listens for messages from the MAIN world (page-script.js)
  // and forwards them to the background script.

  function forward(payload) {
    // 🔑 Check extension context FIRST
    if (!chrome?.runtime?.id) return;

    try {
      chrome.runtime.sendMessage(
        { type: "API_OBSERVATORY_EVENT", payload },
        () => {
          // Swallow expected MV3 disconnect noise
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // Context invalidated — expected, ignore
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__api_observatory__ !== true) return;

    forward(data.payload);
  });

  // Handle re-injection request from DevTools Panel
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "REINJECT_PAGE_SCRIPT") {
      try {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page-script.js");
        script.onload = () => script.remove();
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
