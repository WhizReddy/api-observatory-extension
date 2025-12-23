// content-script.js
// MV3 content scripts must be classic scripts (no top-level import/export).
// This script patches window.fetch + XMLHttpRequest and emits safe request metadata.

(() => {
  // Minimal, inlined config (keep simple for debugging)
  const API_PATH_PATTERNS = ['/api', '/v1', '/v2', '/graphql'];
  const DEBUG = true;

  // DEBUG-ONLY SELF-TEST
  // Set SELF_TEST = true to re-enable the one-time self-test fetch on page load.
  const SELF_TEST = false;
  const SELF_TEST_URL = 'https://jsonplaceholder.typicode.com/posts/1';

  const pageOrigin = location.origin;

  function dbg(...args) {
    if (!DEBUG) return;
    try {
      // Prefix makes it easy to filter in DevTools
      console.debug('[API Observatory][content]', ...args);
    } catch {
      // ignore
    }
  }

  function shouldTrack(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);

      // Allow the self-test request to be tracked even though it's cross-origin.
      // This is strictly for proving instrumentation runs.
      if (SELF_TEST && u.href === SELF_TEST_URL) return true;

      if (u.origin !== pageOrigin) return false; // same-origin only
      return API_PATH_PATTERNS.some((p) => u.pathname.includes(p));
    } catch {
      return false;
    }
  }

  function sanitizeUrl(rawUrl) {
    try {
      const u = new URL(rawUrl, location.href);
      return `${u.origin}${u.pathname}`; // strip query/hash
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
    try {
      // sendMessage can fail if the extension/service worker is not available.
      const maybePromise = chrome.runtime.sendMessage({ type: 'API_OBSERVATORY_EVENT', payload });
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch((e) => {
          dbg('sendMessage failed:', e?.message || e);
        });
      }
    } catch (e) {
      dbg('sendMessage threw:', e?.message || e);
    }
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

      // Detect whether this fetch is the self-test request.
      const isThisSelfTest = (() => {
        try {
          return SELF_TEST && new URL(url, location.href).href === SELF_TEST_URL;
        } catch {
          return false;
        }
      })();

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
            timestamp: Date.now(),
            selfTest: isThisSelfTest
          });

          if (isThisSelfTest) {
            console.log('[API Observatory][content] SELF-TEST intercepted');
          }

          dbg('INTERCEPT fetch', method, sUrl, res.status);
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
            error: err && err.message ? String(err.message) : 'fetch_error',
            selfTest: isThisSelfTest
          });

          if (isThisSelfTest) {
            console.log('[API Observatory][content] SELF-TEST intercepted');
          }

          dbg('INTERCEPT fetch error', method, sUrl);
        }
        throw err;
      }
    };
    dbg('patched fetch');
  } else {
    dbg('window.fetch not found');
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
          dbg('INTERCEPT xhr', method, sUrl, xhr.status);
        }, { once: true });

        return origSend.apply(this, arguments);
      };

      return xhr;
    }

    window.XMLHttpRequest = PatchedXHR;
    dbg('patched XMLHttpRequest');
  } else {
    dbg('window.XMLHttpRequest not found');
  }

  // ---- DEBUG SELF-TEST (runs once per page load)
  // This is intentionally explicit and easy to remove.
  if (DEBUG && SELF_TEST) {
    const KEY = '__api_observatory_self_test_ran__';
    if (!window[KEY]) {
      window[KEY] = true;
      dbg('SELF-TEST triggering fetch:', SELF_TEST_URL);
      // Use the *patched* fetch (window.fetch), so it must pass through our instrumentation.
      window.fetch(SELF_TEST_URL)
        .then((r) => dbg('SELF-TEST completed:', r.status))
        .catch((e) => dbg('SELF-TEST failed:', e));
    }
  }
})();
