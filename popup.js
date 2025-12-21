// popup.js

// Inline config to avoid module import issues
const CONFIG = {
  VERSION: '1.0.0',
  NAME: 'API Observatory'
};

// State management
let currentDomain = '';
let stats = {
  requests: 0,
  avgDuration: 0,
  errors: 0
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Get current tab information
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.url) {
      showError("Unable to access current tab information");
      return;
    }

    // Check if it's a valid HTTP/HTTPS URL
    if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
      showError("API Observatory only works on HTTP/HTTPS websites");
      return;
    }

    const url = new URL(tab.url);
    currentDomain = url.hostname;
    
    // Get current tracking status and stats
    const result = await chrome.storage.sync.get([currentDomain]);
    const domainStats = await getDomainStats(currentDomain);
    
    const isTrackingEnabled = !!result[currentDomain];
    stats = domainStats;
    
    // Render the UI
    renderUI(currentDomain, isTrackingEnabled);
    
    // Start real-time updates if tracking is enabled
    if (isTrackingEnabled) {
      startRealtimeUpdates();
    }
    
  } catch (error) {
    console.error('Error initializing popup:', error);
    showError("Failed to initialize API Observatory");
  }
});

/**
 * Render the main UI with stats
 */
function renderUI(domain, isEnabled) {
  const contentDiv = document.getElementById("content");
  
  contentDiv.innerHTML = `
    <div class="main-card">
      <div class="domain-section">
        <div class="domain-label">Current Domain</div>
        <div class="domain-name">${escapeHtml(domain)}</div>
      </div>
      
      <div class="status-row">
        <div class="status-indicator">
          <span class="status-dot ${isEnabled ? 'enabled' : 'disabled'}"></span>
          <span>${isEnabled ? 'Tracking Active' : 'Tracking Disabled'}</span>
        </div>
      </div>
      
      <button 
        id="toggle-tracking" 
        class="toggle-button ${isEnabled ? 'disable' : 'enable'}"
      >
        ${isEnabled ? 'Disable Tracking' : 'Enable Tracking'}
      </button>
    </div>
    
    ${isEnabled ? renderStatsSection() : ''}
    
    <div class="quick-actions">
      <button class="action-button" id="export-data">
        📊 Export Data
      </button>
      <button class="action-button" id="clear-stats">
        🗑️ Clear Stats
      </button>
    </div>
    
    <div class="footer">
      Monitor API requests • Real-time analytics
    </div>
  `;

  // Add event listeners
  setupEventListeners(domain, isEnabled);
}

/**
 * Render the statistics section
 */
function renderStatsSection() {
  return `
    <div class="main-card">
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card">
          <div class="stat-value" id="stat-requests">${stats.requests}</div>
          <div class="stat-label">Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-duration">${stats.avgDuration}ms</div>
          <div class="stat-label">Avg Time</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-errors">${stats.errors}</div>
          <div class="stat-label">Errors</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Setup event listeners for UI interactions
 */
function setupEventListeners(domain, isEnabled) {
  // Toggle tracking button
  const toggleButton = document.getElementById("toggle-tracking");
  if (toggleButton) {
    toggleButton.addEventListener("click", () => toggleTracking(domain, isEnabled));
  }
  
  // Export data button
  const exportButton = document.getElementById("export-data");
  if (exportButton) {
    exportButton.addEventListener("click", exportData);
  }
  
  // Clear stats button
  const clearButton = document.getElementById("clear-stats");
  if (clearButton) {
    clearButton.addEventListener("click", clearStats);
  }
}

/**
 * Toggle tracking for the current domain
 */
async function toggleTracking(domain, currentStatus) {
  const toggleButton = document.getElementById("toggle-tracking");
  const statusDot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-indicator span:last-child");
  
  // Disable button during operation
  toggleButton.disabled = true;
  toggleButton.textContent = "Updating...";
  
  try {
    const newStatus = !currentStatus;
    
    // Update storage
    await chrome.storage.sync.set({ [domain]: newStatus });
    
    // Show feedback
    showToast(newStatus ? `✅ Tracking enabled for ${domain}` : `🚫 Tracking disabled for ${domain}`);
    
    // Re-render to show/hide stats
    renderUI(domain, newStatus);
    
    // Start/stop real-time updates
    if (newStatus) {
      startRealtimeUpdates();
    } else {
      stopRealtimeUpdates();
    }
    
  } catch (error) {
    console.error('Error toggling tracking:', error);
    showError("Failed to update tracking settings");
  }
}

/**
 * Get statistics for a domain
 */
async function getDomainStats(domain) {
  try {
    const result = await chrome.storage.local.get([`stats_${domain}`]);
    return result[`stats_${domain}`] || { requests: 0, avgDuration: 0, errors: 0 };
  } catch (error) {
    console.error('Error getting domain stats:', error);
    return { requests: 0, avgDuration: 0, errors: 0 };
  }
}

/**
 * Update statistics display
 */
function updateStatsDisplay(newStats) {
  const requestsEl = document.getElementById("stat-requests");
  const durationEl = document.getElementById("stat-duration");
  const errorsEl = document.getElementById("stat-errors");
  
  if (requestsEl) requestsEl.textContent = newStats.requests;
  if (durationEl) durationEl.textContent = `${newStats.avgDuration}ms`;
  if (errorsEl) errorsEl.textContent = newStats.errors;
  
  stats = newStats;
}

/**
 * Start real-time updates of statistics
 */
let updateInterval;
function startRealtimeUpdates() {
  if (updateInterval) return;
  
  updateInterval = setInterval(async () => {
    try {
      const newStats = await getDomainStats(currentDomain);
      updateStatsDisplay(newStats);
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }, 2000); // Update every 2 seconds
}

/**
 * Stop real-time updates
 */
function stopRealtimeUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

/**
 * Export data functionality
 */
async function exportData() {
  try {
    const result = await chrome.storage.local.get([`logs_${currentDomain}`]);
    const logs = result[`logs_${currentDomain}`] || [];
    
    if (logs.length === 0) {
      showToast("📋 No data to export");
      return;
    }
    
    const data = {
      domain: currentDomain,
      exportTime: new Date().toISOString(),
      stats: stats,
      logs: logs
    };
    
    // Create downloadable file
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-observatory-${currentDomain}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("📁 Data exported successfully");
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast("❌ Export failed");
  }
}

/**
 * Clear statistics
 */
async function clearStats() {
  try {
    await chrome.storage.local.remove([`stats_${currentDomain}`, `logs_${currentDomain}`]);
    
    // Reset stats
    stats = { requests: 0, avgDuration: 0, errors: 0 };
    updateStatsDisplay(stats);
    
    showToast("🗑️ Statistics cleared");
  } catch (error) {
    console.error('Error clearing stats:', error);
    showToast("❌ Failed to clear stats");
  }
}

/**
 * Show error message
 */
function showError(message) {
  const contentDiv = document.getElementById("content");
  contentDiv.innerHTML = `
    <div class="error">
      ${escapeHtml(message)}
    </div>
    <div class="footer">
      Please refresh the page and try again
    </div>
  `;
}

/**
 * Show toast notification
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.remove();
    }
  }, duration);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
  stopRealtimeUpdates();
});