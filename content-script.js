// content-script.js
(() => {
  if (window.__API_OBS_BRIDGE__) return;
  window.__API_OBS_BRIDGE__ = true;

  // inject page-script into PAGE world
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-script.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // bridge page->extension->background
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__api_observatory__ !== true) return;

    // MV3-safe: callback form + swallow runtime.lastError (no console spam)
    try {
      chrome.runtime.sendMessage(
        { type: 'API_OBSERVATORY_EVENT', payload: data.payload },
        () => void chrome.runtime.lastError
      );
    } catch {
      // ignore
    }
  });

  // optional: small log
  // console.log('[API Observatory] bridge injected');
})();
