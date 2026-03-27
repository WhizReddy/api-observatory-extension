/**
 * devtools/devtools.js - DevTools extension entry point
 * 
 * Creates a new DevTools panel titled "API Observatory"
 * The panel loads panel.html which contains the UI and panel.js logic
 */

chrome.devtools.panels.create(
  'API Observatory',     // Panel title shown in tab
  '',                    // Icon (empty for default)
  'devtools/panel.html'  // HTML file to load in panel
);
