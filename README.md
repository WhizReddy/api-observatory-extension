# API Observatory (Chrome DevTools Extension)

API Observatory is a **Manifest V3** Chrome extension that instruments `fetch` and `XMLHttpRequest` in the page to provide a **live API observability view inside Chrome DevTools**.

It’s intended for debugging real-world frontend applications where you want quick answers to:
- *Which endpoints are being hit the most?*
- *Which endpoints are failing?*
- *Which endpoints are slow?*

This is a devtool-first project: capture is done safely via in-page instrumentation, and visualization/aggregation is done entirely client-side.

---

## Features

DevTools panel (“API Observatory”):
- **Live stream** of API requests (method, path, status, duration, timestamp)
- **Client-side noise filtering**:
  - hides `statusCode === 0`
  - optional heuristics to hide “blocked by client/extension” noise
  - toggle: **Show only successful requests** (default off)
- **Grouped / aggregated view** by **HTTP method + pathname**:
  - total request count
  - error count (`statusCode >= 400`)
  - average duration
- **Automatic highlighting**:
  - erroring endpoints
  - slow endpoints (avg duration threshold)
- **Controls**:
  - Pause / Resume streaming
  - Clear table (visible only)
  - Clear data (reset in-memory history and aggregates)
- **Empty states** for both Live and Grouped views

Capture:
- MV3-safe instrumentation of **`window.fetch`** and **`XMLHttpRequest`**
- Same-origin filtering + simple path pattern matching (`/api`, `/v1`, `/v2`, `/graphql`)

---

## How it works (architecture)

High-level pipeline:

1. **Content script** (`content-script.js`)
   - Runs at `document_start`
   - Patches `window.fetch` and `XMLHttpRequest`
   - Emits safe request metadata via `chrome.runtime.sendMessage`

2. **Background service worker** (`background.js`)
   - Receives events from the content script
   - Applies per-domain enable/disable gating (via `chrome.storage.sync`)
   - Forwards accepted events to the DevTools panel over a long-lived port

3. **DevTools panel** (`devtools/panel.html` + `devtools/panel.js`)
   - Maintains an in-memory event buffer
   - Renders Live view + Grouped view
   - Performs client-side filtering and highlighting

**No backend is required** for the DevTools workflow. (A backend folder exists in this repo for experimentation, but the panel features are client-side.)

---

## Install (unpacked extension)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this directory:
   - `/Users/rediballa/OBSERVATOR/proposed-api-sample`

---

## Usage

1. Navigate to a site you want to inspect.
2. Open DevTools → select the **“API Observatory”** panel.
3. Enable tracking for the current domain using the extension popup.
4. Reload the page (recommended) to ensure instrumentation starts early.
5. Interact with the app and watch requests stream in.

Workflow tips:
- Use **Pause** when you want to inspect a burst without the list shifting.
- Use **Grouped view** to identify hot or problematic endpoints quickly.
- Use **Clear data** to start a clean session during demos or while switching contexts.

---

## Why this project is interesting (engineering)

- **MV3-correct request capture** without relying on `webRequest` logging for analytics.
- **Early, reliable instrumentation** (`document_start`) to catch app initialization traffic.
- **Safe-by-default payload design**: metadata only, no bodies, no headers.
- **DevTools-first UX**: live stream + aggregation + highlighting, entirely client-side.
- **Practical debuggability**: explicit controls, empty-states, and noise filtering for real sites.

---

## Repo layout

```
.
├── manifest.json
├── background.js
├── content-script.js
├── popup.html
├── popup.js
└── devtools/
    ├── devtools.html
    ├── devtools.js
    ├── panel.html
    └── panel.js
```
