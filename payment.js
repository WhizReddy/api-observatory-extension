// payment.js - External script for license activation
console.log('[Payment Page] Script loaded successfully!');

// Wait for DOM to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('[Payment Page] Initializing...');

    const simBtn = document.getElementById('sim-buy');
    const activateBtn = document.getElementById('activate');

    if (!simBtn || !activateBtn) {
        console.error('[Payment Page] Buttons not found!');
        return;
    }

    console.log('[Payment Page] Buttons found, attaching listeners...');
    simBtn.addEventListener('click', handleSimBuy);
    activateBtn.addEventListener('click', handleActivate);
    console.log('[Payment Page] ✅ Ready!');
}

// Generate unique instance ID for this browser installation
function getInstanceId() {
    return new Promise((resolve) => {
        chrome.storage.local.get('instance_id', (data) => {
            if (data.instance_id) {
                resolve(data.instance_id);
            } else {
                // Create new unique ID
                const newId = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                chrome.storage.local.set({ instance_id: newId }, () => {
                    console.log('[Instance ID] Created:', newId);
                    resolve(newId);
                });
            }
        });
    });
}

function showSuccess(message = 'Thank you! Enjoy Pro features.') {
    console.log('[Payment Page] Showing success!');
    const card = document.getElementById('card');
    card.innerHTML = `
    <div style="font-size: 60px; margin-bottom: 20px; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">🎉</div>
    <h2 style="color: #fff; margin-bottom: 10px;">Activation Successful!</h2>
    <p style="color:#8b949e">${message}</p>
    <button id="close-btn" style="background: #238636; border:none; color:white; padding:12px 20px; border-radius:6px; cursor:pointer; margin-top:20px; font-weight:700;">Close</button>
  `;

    const styleEl = document.createElement('style');
    styleEl.innerHTML = '@keyframes pop { 0% { transform: scale(0.5); opacity:0; } 100% { transform: scale(1); opacity:1; } }';
    document.head.appendChild(styleEl);

    document.getElementById('close-btn').addEventListener('click', () => window.close());
}

function handleSimBuy() {
    console.log('[Payment Page] Sim buy clicked');
    alert('Test Key:\n\nTEST-REDIBALLA\n\n(It will auto-fill for you)');
    document.getElementById('license').value = 'TEST-REDIBALLA';
}

function handleActivate() {
    console.log('[Payment Page] Activate clicked');
    const key = document.getElementById('license').value.trim();
    const btn = document.getElementById('activate');
    const err = document.getElementById('err');

    if (key.length < 5) {
        err.style.display = 'block';
        err.textContent = 'Please enter a valid key.';
        return;
    }

    btn.textContent = 'Verifying...';
    btn.disabled = true;
    err.style.display = 'none';

    // Test keys bypass API
    const keyUpper = key.toUpperCase();
    if (keyUpper.startsWith('TEST-') || keyUpper.includes('REDIBALLA') || key.length < 20) {
        console.log('[Dev Mode] Test key detected:', key);
        chrome.storage.sync.set({ is_premium: true }, () => {
            console.log('[Dev Mode] ✅ Premium status saved!');
            showSuccess('✅ Pro Mode Activated (Test Key)');
        });
        return;
    }

    // Real Lemon Squeezy API call
    getInstanceId().then(instanceId => {
        return fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                license_key: key,
                instance_name: instanceId  // Unique per installation - prevents fraud
            })
        })
    })
        .then(async (res) => {
            const data = await res.json();
            console.log('[License API Response]', data);

            const isActivated = data.activated === true;
            const hasActiveLicense = data.license_key?.status === 'active';
            const hasValidLicense = data.license_key &&
                data.license_key.status !== 'inactive' &&
                data.license_key.status !== 'expired' &&
                data.license_key.status !== 'disabled';

            if (isActivated || hasActiveLicense || hasValidLicense) {
                chrome.storage.sync.set({ is_premium: true }, () => {
                    showSuccess();
                });
            } else {
                const errorMsg = data.error || data.message || 'License key invalid or not found';
                throw new Error(errorMsg);
            }
        })
        .catch(error => {
            console.error('[License Activation Error]', error);
            btn.textContent = 'Activate';
            btn.disabled = false;
            err.style.display = 'block';
            err.textContent = '❌ ' + error.message;
        });
}
