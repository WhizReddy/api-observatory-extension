/**
 * page-script.js - API request instrumentation and capture
 * 
 * This script runs in the MAIN world of the web page, allowing it to hook into
 * fetch() and XMLHttpRequest before any page code runs.
 * 
 * Key Features:
 * - Patches window.fetch to capture all HTTP requests
 * - Patches XMLHttpRequest to capture XHR requests
 * - Extracts request metadata (method, URL, body, duration, status)
 * - Sends captured events to content script via postMessage
 * - Handles errors gracefully without breaking page functionality
 */

(() => {
  // Guard against multiple injections
  if (window.__API_OBS_PATCHED__) return;
  window.__API_OBS_PATCHED__ = true;

  // Store original fetch before patching
  const originalFetch = window.fetch;

  /**
   * Get current timestamp with high-resolution timing
   * Falls back to Date.now() if performance API unavailable
   * @returns {number} Current time in milliseconds
   */
  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  /**
   * Post captured API event to content script
   * Uses postMessage to communicate across worlds safely
   * @param {Object} payload - Event data to send
   */
  function post(payload) {
    try {
      window.postMessage({ __api_observatory__: true, payload }, '*');
    } catch {
      // Silent fail - extension context may be invalid
    }
  }

  /**
   * Patch window.fetch to capture request metadata
   * Wraps original fetch to record timing and response data
   */
  window.fetch = async function (...args) {
    let start = 0;
    try {
      start = now();
    } catch {
      start = Date.now();
    }

    // Extract URL and method from fetch arguments
    const input = args[0];
    const init = args[1];

    let url = '';
    let method = 'GET';
    let requestBody = null;

    try {
      // Parse URL from various input formats (string, Request object)
      url = typeof input === 'string' ? input : (input && input.url) || '';
      // Get HTTP method (default GET)
      method = String(init?.method || (input?.method) || 'GET').toUpperCase();

      // Extract request body if present
      if (init && init.body) {
        requestBody = init.body;
      } else if (input && input.body && typeof input.body === 'string') {
        // Only extract body if it's already a string (don't consume streams)
        requestBody = input.body;
      }

      // Convert object bodies to JSON string
      if (typeof requestBody === 'object' && requestBody !== null) {
        try {
          requestBody = JSON.stringify(requestBody);
        } catch {
          // Ignore JSON serialization errors
        }
      }
    } catch (e) {
      // Don't let request body extraction break the actual request
    }

    try {
      // Execute original fetch
      const res = await originalFetch.apply(this, args);

      // Record successful response
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
      // Record error/network failure
      post({
        kind: 'fetch',
        url,
        method,
        statusCode: 0, // Network error represented as status 0
        durationMs: Math.max(0, Math.round(now() - start)),
        timestamp: Date.now(),
        requestBody: requestBody ? String(requestBody).substring(0, 5000) : null,
        error: String(err?.message || err || 'fetch_error')
      });
      throw err; // Re-throw to preserve original behavior
    }
  };

  /**
   * Patch XMLHttpRequest to capture XHR requests
   * Wraps open() and send() to track timing and metadata
   */
  const originalXHR = window.XMLHttpRequest;
  const xhrOpen = originalXHR.prototype.open;
  const xhrSend = originalXHR.prototype.send;

  /**
   * Patch XMLHttpRequest.prototype.open
   * Records method and URL for later use in send()
   */
  originalXHR.prototype.open = function (method, url, async, user, password) {
    // Store metadata on the XHR instance for use in send()
    this._method = method;
    this._url = url;
    this._startTime = 0;
    // Call original open
    return xhrOpen.apply(this, arguments);
  };

  /**
   * Patch XMLHttpRequest.prototype.send
   * Records request body and listens for completion
   */
  originalXHR.prototype.send = function (body) {
    // Start timing the request
    try {
      this._startTime = now();
    } catch {
      this._startTime = Date.now();
    }

    // Extract request body (if present and is string)
    const reqBody = typeof body === 'string' ? body : (body ? JSON.stringify(body) : null);

    // Listen for request completion (success or failure)
    this.addEventListener('loadend', () => {
      const durationMs = Math.max(0, Math.round(now() - this._startTime));
      post({
        kind: 'xhr',
        url: this._url,
        method: String(this._method).toUpperCase(),
        statusCode: this.status || 0,
        durationMs,
        timestamp: Date.now(),
        requestBody: reqBody ? String(reqBody).substring(0, 5000) : null
      });
    });

    // Execute original send
    return xhrSend.apply(this, arguments);
  };
})();

