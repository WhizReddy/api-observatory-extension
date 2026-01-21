document.addEventListener('DOMContentLoaded', init);

async function init() {
  const content = document.getElementById('content');

  // Side Panel logic
  const openSideBtn = document.getElementById('open-sidepanel');
  if (openSideBtn) {
    openSideBtn.onclick = () => {
      chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
      window.close(); // Close popup after opening side panel
    };
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url || !tab.url.startsWith('http')) {
      content.innerHTML = `<div class="err">Open a website tab to use API Observatory.</div>`;
      return;
    }

    const domain = new URL(tab.url).hostname;
    console.log('[Popup] Domain:', domain);
    const syncData = await chrome.storage.sync.get([domain, 'is_premium']);
    const localData = await chrome.storage.local.get(['monthly_requests', 'stats_' + domain]);
    console.log('[Popup] Storage Data:', { syncData, localData });

    // Check Status
    const enabled = syncData[domain] !== false;
    const isPremium = syncData.is_premium === true;
    const monthlyRequests = localData.monthly_requests || 0;
    const FREE_MONTHLY_LIMIT = 200;

    const stats = localData['stats_' + domain] || {
      requests: 0,
      errors: 0,
      totalDuration: 0
    };

    const avg = stats.requests ? Math.round(stats.totalDuration / stats.requests) : 0;

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

    document.getElementById('toggle-btn').addEventListener('click', async () => {
      await chrome.storage.sync.set({ [domain]: !enabled });
      init();
    });

    if (!isPremium) {
      document.getElementById('upgrade-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'payment.html' });
      });
    }

  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="err">Popup failed to load.</div>`;
  }
}

// React to storage changes (e.g. background script increments counter)
chrome.storage.onChanged.addListener((changes) => {
  init(); // Simply re-fetch and re-render everything
});
