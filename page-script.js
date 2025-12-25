// page-script.js (runs in PAGE world)
(() => {
    if (window.__API_OBS_PATCHED__) return;
    window.__API_OBS_PATCHED__ = true;
  
    const originalFetch = window.fetch;
  
    function post(payload) {
      try {
        window.postMessage({ __api_observatory__: true, payload }, '*');
      } catch {}
    }
  
    function now() {
      return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
  
    window.fetch = async function (...args) {
      const start = now();
      const input = args[0];
      const init = args[1];
  
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String(init?.method || (input && input.method) || 'GET').toUpperCase();
  
      try {
        const res = await originalFetch.apply(this, args);
  
        post({
          kind: 'fetch',
          url,
          method,
          statusCode: (res && typeof res.status === 'number') ? res.status : 0,
          durationMs: Math.max(0, Math.round(now() - start)),
          timestamp: Date.now()
        });
  
        return res;
      } catch (err) {
        post({
          kind: 'fetch',
          url,
          method,
          statusCode: 0,
          durationMs: Math.max(0, Math.round(now() - start)),
          timestamp: Date.now(),
          error: String(err?.message || err || 'fetch_error')
        });
        throw err;
      }
    };
  
    // console.log('[API Observatory] page fetch patched');
  })();
  