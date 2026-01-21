(() => {
  if (window.__API_OBS_BRIDGE__) return;
  window.__API_OBS_BRIDGE__ = true;

  // 🚀 Bridge Logic
  // This content script runs in the ISOLATED world (default)
  // It listens for messages from the MAIN world (page-script.js) 
  // and forwards them to the background script.


  function forward(payload) {
    // 🔑 Check extension context FIRST
    if (!chrome?.runtime?.id) return;

    try {
      chrome.runtime.sendMessage(
        { type: 'API_OBSERVATORY_EVENT', payload },
        () => {
          // Swallow expected MV3 disconnect noise
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // Context invalidated — expected, ignore
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__api_observatory__ !== true) return;

    forward(data.payload);
  });
})();
