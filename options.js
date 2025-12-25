// options.js
const keyEl = document.getElementById('key');
const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');

function setStatus(ok, msg) {
  statusEl.innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${msg}</span>`;
}

function normalizeKey(k) {
  return String(k || '').trim().toUpperCase();
}

// SIMPLE v1 validation (no backend):
// - must start with API-OBS-
// - must have 4 chunks after prefix (total 5 chunks): API OBS XXXX XXXX XXXX
function isValidKey(k) {
  const key = normalizeKey(k);
  if (!key.startsWith('API-OBS-')) return false;
  const parts = key.split('-');
  // API / OBS / A / B / C (5 parts)
  if (parts.length !== 5) return false;
  if (parts[2].length < 3 || parts[3].length < 3 || parts[4].length < 3) return false;
  return true;
}

async function load() {
  const { proLicenseKey } = await chrome.storage.sync.get(['proLicenseKey']);
  if (proLicenseKey) {
    keyEl.value = proLicenseKey;
    setStatus(true, 'Pro is active on this browser.');
  } else {
    setStatus(false, 'Pro is not active yet.');
  }
}

saveBtn.addEventListener('click', async () => {
  const key = normalizeKey(keyEl.value);
  if (!isValidKey(key)) {
    setStatus(false, 'Invalid key format. Expected: API-OBS-XXXX-XXXX-XXXX');
    return;
  }
  await chrome.storage.sync.set({ proLicenseKey: key });
  setStatus(true, 'Saved. Pro features are now unlocked.');
});

clearBtn.addEventListener('click', async () => {
  await chrome.storage.sync.remove(['proLicenseKey']);
  keyEl.value = '';
  setStatus(false, 'Key removed. Pro is disabled.');
});

load();
