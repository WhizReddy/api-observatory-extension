// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const domainContainer = document.getElementById("domain-container");

  // Fetch the current domain
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const domain = url.hostname;

    // Create UI for the domain
    domainContainer.innerHTML = `
      <div class="domain">
        <p><strong>Domain:</strong> ${domain}</p>
        <button id="toggle-tracking">Enable Tracking</button>
      </div>
    `;

    const toggleButton = document.getElementById("toggle-tracking");

    // Check if tracking is enabled for the domain
    chrome.storage.sync.get([domain], (result) => {
      const isTrackingEnabled = result[domain];
      toggleButton.textContent = isTrackingEnabled ? "Disable Tracking" : "Enable Tracking";
    });

    // Toggle tracking on button click
    toggleButton.addEventListener("click", () => {
      chrome.storage.sync.get([domain], (result) => {
        const isTrackingEnabled = result[domain];
        const newStatus = !isTrackingEnabled;

        chrome.storage.sync.set({ [domain]: newStatus }, () => {
          toggleButton.textContent = newStatus ? "Disable Tracking" : "Enable Tracking";
        });
      });
    });
  });
});