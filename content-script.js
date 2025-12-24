// content-script.js
// MV3 content scripts must be classic scripts (no top-level import/export).
// This script patches window.fetch + XMLHttpRequest and emits safe request metadata.

(() => {
  const API_PATH_PATTERNS = ['/api', '/v1', '/v2', '/graphql'];
  const DEBUG = true;
  const pageOrigin = location.origin;

  function dbg(...args) {
    if (!DEBUG) return;
    try {
      console.debug('[API Observatory][content]', ...args);
    } catch {
      // ignore
    }
  }

  // Bridge: forward events from page context to extension background.
  // sendMessage returns a Promise in MV3; it must be handled to avoid
  // "Uncaught (in promise)" noise when the SW is not available.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__api_observatory__ !== true) return;

    try {
      const p = chrome.runtime.sendMessage({ type: 'API_OBSERVATORY_EVENT', payload: data.payload });
      if (p && typeof p.catch === 'function') {
        p.catch((e) => {
          // This happens when the extension is reloaded/disabled or SW is unavailable.
          dbg('sendMessage rejected:', e?.message || e);
        });
      }
    } catch (e) {
      dbg('sendMessage threw:', e?.message || e);
    }
  });

  function shouldTrack(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);
      if (u.origin !== pageOrigin) return false;
      return API_PATH_PATTERNS.some((p) => u.pathname.includes(p));
    } catch {
      return false;
    }
  }

  function sanitizeUrl(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);
      return `${u.origin}${u.pathname}`;
    } catch {
      return String(rawUrl);
    }
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  function emit(payload) {
    window.postMessage({ __api_observatory__: true, payload }, '*');
  }

  dbg('loaded at', document.readyState, 'origin=', pageOrigin);

  // ---- fetch
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const method = String(
        (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET'
      ).toUpperCase();
      const url = (typeof input === 'string') ? input : (input && input.url) || '';

      const track = shouldTrack(url);
      const start = track ? nowMs() : 0;

      try {
        const res = await originalFetch.apply(this, arguments);
        if (track) {
          const sUrl = sanitizeUrl(url);
          emit({
            kind: 'fetch',
            url: sUrl,
            method,
            statusCode: res && typeof res.status === 'number' ? res.status : 0,
            durationMs: Math.max(0, nowMs() - start),
            timestamp: Date.now()
          });
        }
        return res;
      } catch (err) {
        if (track) {
          const sUrl = sanitizeUrl(url);
          emit({
            kind: 'fetch',
            url: sUrl,
            method,
            statusCode: 0,
            durationMs: Math.max(0, nowMs() - start),
            timestamp: Date.now(),
            error: err && err.message ? String(err.message) : 'fetch_error'
          });
        }
        throw err;
      }
    };
    dbg('patched fetch');
  }

  // ---- XHR
  if (typeof window.XMLHttpRequest === 'function') {
    const OriginalXHR = window.XMLHttpRequest;

    function PatchedXHR() {
      const xhr = new OriginalXHR();
      let tracked = false;
      let url = '';
      let method = 'GET';
      let start = 0;

      const origOpen = xhr.open;
      xhr.open = function (m, u) {
        method = String(m || 'GET').toUpperCase();
        url = u;
        tracked = shouldTrack(url);
        return origOpen.apply(this, arguments);
      };

      const origSend = xhr.send;
      xhr.send = function () {
        if (tracked) start = nowMs();

        xhr.addEventListener('loadend', () => {
          if (!tracked) return;
          const sUrl = sanitizeUrl(url);
          emit({
            kind: 'xhr',
            url: sUrl,
            method,
            statusCode: xhr.status || 0,
            durationMs: Math.max(0, nowMs() - start),
            timestamp: Date.now()
          });
        }, { once: true });

        return origSend.apply(this, arguments);
      };

      return xhr;
    }

    window.XMLHttpRequest = PatchedXHR;
    dbg('patched XMLHttpRequest');
  }
})();
