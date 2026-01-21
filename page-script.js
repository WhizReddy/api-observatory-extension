(() => {
  if (window.__API_OBS_PATCHED__) return;
  window.__API_OBS_PATCHED__ = true;

  const originalFetch = window.fetch;

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  function post(payload) {
    try {
      window.postMessage({ __api_observatory__: true, payload }, '*');
    } catch { }
  }

  window.fetch = async function (...args) {
    let start = 0;
    try { start = now(); } catch { start = Date.now(); }

    const input = args[0];
    const init = args[1];

    let url = '';
    let method = 'GET';
    let requestBody = null;

    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = String(init?.method || (input?.method) || 'GET').toUpperCase();

      if (init && init.body) {
        requestBody = init.body;
      } else if (input && input.body && typeof input.body === 'string') {
        // Only extract body if it's already a string (don't consume streams)
        requestBody = input.body;
      }

      if (typeof requestBody === 'object' && requestBody !== null) {
        try { requestBody = JSON.stringify(requestBody); } catch { }
      }
    } catch (e) {
      // Don't let stats gathering break the actual request
    }

    try {
      const res = await originalFetch.apply(this, args);

      // Successfully captured
      post({
        kind: 'fetch',
        url,
        method,
        statusCode: typeof res?.status === 'number' ? res.status : 0,
        durationMs: Math.max(0, Math.round(now() - start)),
        timestamp: Date.now(),
        requestBody: requestBody ? String(requestBody).substring(0, 5000) : null
      });

      return res;
    } catch (err) {
      // Captured error (like network failure)
      post({
        kind: 'fetch',
        url,
        method,
        statusCode: 0,
        durationMs: Math.max(0, Math.round(now() - start)),
        timestamp: Date.now(),
        requestBody: requestBody ? String(requestBody).substring(0, 5000) : null,
        error: String(err?.message || err || 'fetch_error')
      });
      throw err;
    }
  };
})();

