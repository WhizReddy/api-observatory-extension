// background.js

// Import the logger utility
import { logRequest } from "./utils/logger.js";

// Listen for outgoing HTTP requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Filter requests to same-origin and paths containing '/api'
    if (details.url.includes('/api') && details.initiator === location.origin) {
      const requestMetadata = {
        url: details.url,
        method: details.method,
        timestamp: Date.now(),
      };
      logRequest(requestMetadata);
    }
  },
  { urls: ["<all_urls>"] },
  []
);

// Listen for completed HTTP requests
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.includes('/api') && details.initiator === location.origin) {
      const responseMetadata = {
        url: details.url,
        statusCode: details.statusCode,
        duration: details.timeStamp - details.requestTime,
        timestamp: Date.now(),
      };
      logRequest(responseMetadata);
    }
  },
  { urls: ["<all_urls>"] }
);