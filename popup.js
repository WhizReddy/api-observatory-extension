/**
 * popup.js - Extension popup UI
 * 
 * Displays quick status overview:
 * - Premium/Free tier status
 * - Current domain tracking status
 * - Monthly usage (for free users)
 * - Quick stats (requests, latency, errors)
 * - Toggle domain tracking on/off
 * - Upgrade button (for free users)
 */

document.addEventListener('DOMContentLoaded', init);

/**
 * Initialize popup UI with current status
 * Loads premium status, monthly usage, and domain stats from storage
 */
async function init() {
  const content = document.getElementById('content');

  // Side Panel logic - open DevTools side panel when button clicked
  const openSideBtn = document.getElementById('open-sidepanel');
  if (openSideBtn) {
    openSideBtn.onclick = async () => {
      const win = await chrome.windows.getCurrent();
      chrome.sidePanel.open({ windowId: win.id });
      window.close(); // Close popup after opening side panel
    };
  }

  try {
    // Get active tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Show error if tab is not a web page
    if (!tab?.url || !tab.url.startsWith('http')) {
      content.innerHTML = `<div class="err">Open a website tab to use API Observatory.</div>`;
      return;
    }

    // Extract domain from tab URL
    const domain = new URL(tab.url).hostname;
    console.log('[Popup] Domain:', domain);
    
    // Load storage data for this domain
    const syncData = await chrome.storage.sync.get([domain, 'is_premium']);
    const localData = await chrome.storage.local.get(['monthly_requests', 'stats_' + domain]);
    console.log('[Popup] Storage Data:', { syncData, localData });

    // Extract status flags
    const enabled = syncData[domain] !== false; // Default: enabled
    const isPremium = syncData.is_premium === true;
    const monthlyRequests = localData.monthly_requests || 0;
    const FREE_MONTHLY_LIMIT = 200;

    // Load statistics for this domain
    const stats = localData['stats_' + domain] || {
      requests: 0,
      errors: 0,
      totalDuration: 0
    };

    // Calculate average latency
    const avg = stats.requests ? Math.round(stats.totalDuration / stats.requests) : 0;

    // Update version tag based on premium status
    const versionTag = document.getElementById('version-tag');
    if (versionTag) {
      if (isPremium) {
        versionTag.textContent = 'PRO VERSION';
        versionTag.style.color = 'var(--accent-primary)';
      } else {
        versionTag.textContent = 'FREE TIER';
        versionTag.style.color = 'var(--text-muted)';
      }
    }

    // Build and render UI
    content.innerHTML = `
      <div class="control-card">
        <div class="domain-info">
          <div class="domain-label">
            <span class="label">Current Domain</span>
            <span class="domain-name">${domain}</span>
          </div>
          <div class="status-pill">
            <div class="status-dot ${enabled ? 'active' : 'paused'}"></div>
            <span class="status-text">${enabled ? 'Capturing' : 'Paused'}</span>
          </div>
        </div>

        <div class="plan-section">
          <div class="plan-info">
            <div class="plan-name">
              ${isPremium ? '💎 PRO PLAN' : 'FREE TIER'}
            </div>
            ${!isPremium ? `<button id="upgrade-btn">UPGRADE</button>` : ''}
          </div>
          
          ${!isPremium ? `
            <div class="usage-meter">
              <div class="meter-text">
                <span>Usage</span>
                <span>${monthlyRequests} / ${FREE_MONTHLY_LIMIT}</span>
              </div>
              <div class="meter-bar">
                <div class="meter-fill" style="width: ${Math.min(100, (monthlyRequests / FREE_MONTHLY_LIMIT) * 100)}%; background: ${monthlyRequests > FREE_MONTHLY_LIMIT * 0.8 ? 'var(--error)' : 'var(--accent-primary)'}"></div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <button id="toggle-btn" class="btn-toggle">
        ${enabled ? 'Disable Tracking' : 'Enable Tracking'}
      </button>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${stats.requests}</span>
          <span class="stat-label">Requests</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${avg}ms</span>
          <span class="stat-label">Latency</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.errors}</span>
          <span class="stat-label">Errors</span>
        </div>
      </div>
    `;

    // Add event listener for toggle button
    document.getElementById('toggle-btn').addEventListener('click', async () => {
      // Toggle tracking status for this domain
      await chrome.storage.sync.set({ [domain]: !enabled });
      // Re-render to show updated status
      init();
    });

    // Add event listener for upgrade button (free users only)
    if (!isPremium) {
      document.getElementById('upgrade-btn').addEventListener('click', () => {
        // Open payment page in new tab
        chrome.tabs.create({ url: 'payment.html' });
      });
    }

  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="err">Popup failed to load.</div>`;
  }
}

/**
 * React to storage changes and update popup UI
 * Listens for: premium status, monthly counter, and domain tracking changes
 */
chrome.storage.onChanged.addListener((changes, area) => {
  // Determine if we should re-render the popup
  let shouldReinit = false;

  // Re-render if premium status changed
  if (area === 'sync' && changes.is_premium) {
    shouldReinit = true;
  }
  
  // Re-render if monthly requests changed (for free users)
  if (area === 'local' && changes.monthly_requests) {
    shouldReinit = true;
  }

  // Re-render if any domain tracking status changed
  // (Ignore stats_ changes to prevent excessive re-renders)
  if (area === 'sync') {
    for (const key in changes) {
      if (key !== 'is_premium') {
        shouldReinit = true;
        break;
      }
    }
  }

  // Re-render if needed
  if (shouldReinit) {
    init();
  }
});
