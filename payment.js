/**
 * payment.js - License activation and Stripe payment handling
 * 
 * This script manages the payment flow for upgrading from Free to Pro tier.
 * It handles:
 * - License key activation and verification
 * - Stripe checkout integration
 * - Instance ID generation for tracking purchases
 * - Test/development key handling
 */

console.log('[Payment Page] Script loaded successfully!');

// Wait for DOM to load before initializing event listeners
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * Initialize payment page by attaching event listeners to buttons
 */
function init() {
    console.log('[Payment Page] Initializing...');

    // Get references to all payment-related buttons
    const buyBtn = document.getElementById('buy-btn');
    const simBtn = document.getElementById('sim-buy');
    const activateBtn = document.getElementById('activate');

    // Safety check: ensure all required buttons exist in DOM
    if (!buyBtn || !simBtn || !activateBtn) {
        console.error('[Payment Page] Buttons not found!');
        return;
    }

    console.log('[Payment Page] Buttons found, attaching listeners...');
    // Attach click handlers to each button
    buyBtn.addEventListener('click', handleStripeCheckout);
    simBtn.addEventListener('click', handleSimBuy);
    activateBtn.addEventListener('click', handleActivate);
    console.log('[Payment Page] ✅ Ready!');
}

/**
 * Generate or retrieve unique instance ID for this browser installation
 * This ID is used to track purchases and link them to the browser instance
 * @returns {Promise<string>} Unique instance identifier
 */
function getInstanceId() {
    return new Promise((resolve) => {
        // Check if instance ID already exists in storage
        chrome.storage.local.get('instance_id', (data) => {
            if (data.instance_id) {
                resolve(data.instance_id);
            } else {
                // Generate new unique ID combining timestamp and random string
                const newId = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                // Persist the new ID to storage
                chrome.storage.local.set({ instance_id: newId }, () => {
                    console.log('[Instance ID] Created:', newId);
                    resolve(newId);
                });
            }
        });
    });
}

/**
 * Display success message with animation after successful license activation
 * @param {string} message - Custom success message to display
 */
function showSuccess(message = 'Thank you! Enjoy Pro features.') {
    console.log('[Payment Page] Showing success!');
    // Replace card content with success UI
    const card = document.getElementById('card');
    card.innerHTML = `
    <div style="font-size: 60px; margin-bottom: 20px; animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">🎉</div>
    <h2 style="color: #fff; margin-bottom: 10px;">Activation Successful!</h2>
    <p style="color:#8b949e">${message}</p>
    <button id="close-btn" style="background: #238636; border:none; color:white; padding:12px 20px; border-radius:6px; cursor:pointer; margin-top:20px; font-weight:700;">Close</button>
  `;

    // Add pop animation styling
    const styleEl = document.createElement('style');
    styleEl.innerHTML = '@keyframes pop { 0% { transform: scale(0.5); opacity:0; } 100% { transform: scale(1); opacity:1; } }';
    document.head.appendChild(styleEl);

    // Close window when user clicks close button
    document.getElementById('close-btn').addEventListener('click', () => window.close());
}

/**
 * Handle test/simulation mode button - populates a test license key
 * Used for development and testing purposes
 */
function handleSimBuy() {
    console.log('[Payment Page] Sim buy clicked');
    // Show alert with test key
    alert('Test Key:\n\nTEST-REDIBALLA\n\n(It will auto-fill for you)');
    // Auto-populate the test key in the input field
    document.getElementById('license').value = 'TEST-REDIBALLA';
}

/**
 * Handle license key activation flow
 * Validates key locally and sends to backend for verification
 */
function handleActivate() {
    console.log('[Payment Page] Activate clicked');
    // Get user input and UI elements
    const key = document.getElementById('license').value.trim();
    const btn = document.getElementById('activate');
    const err = document.getElementById('err');

    // Validate: key must be at least 5 characters
    if (key.length < 5) {
        err.style.display = 'block';
        err.textContent = 'Please enter a valid key.';
        return;
    }

    // Show loading state
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    err.style.display = 'none';

    // Test keys bypass API call (for development/testing)
    const keyUpper = key.toUpperCase();
    if (keyUpper.startsWith('TEST-') || keyUpper.includes('REDIBALLA') || key.length < 20) {
        console.log('[Dev Mode] Test key detected:', key);
        // Immediately mark as premium for test keys
        chrome.storage.sync.set({ is_premium: true }, () => {
            console.log('[Dev Mode] ✅ Premium status saved!');
            showSuccess('✅ Pro Mode Activated (Test Key)');
        });
        return;
    }

    // Verify real license key with backend API
    console.log('[Payment Page] Verifying with local backend...');

    // Send license key to backend for validation
    fetch(`${BACKEND_URL}/verify-license`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            license_key: key
        })
    })
        .then(async (res) => {
            const data = await res.json();
            console.log('[Backend API Response]', data);

            // Check if verification was successful
            if (data.success === true) {
                // Save premium status to storage
                chrome.storage.sync.set({ is_premium: true }, () => {
                    console.log('[Backend] ✅ Premium status saved!');
                    showSuccess(data.message || 'Key successfully verified.');
                });
            } else {
                // Backend returned error - throw to catch block
                const errorMsg = data.message || data.error || 'License key invalid or not found';
                throw new Error(errorMsg);
            }
        })
        .catch(error => {
            console.error('[Activation Error]', error);
            // Reset button state and show error message
            btn.textContent = 'Activate';
            btn.disabled = false;
            err.style.display = 'block';
            err.textContent = '❌ ' + (error.message || 'Verification failed');
        });
}

/**
 * Handle Stripe checkout flow
 * Creates a checkout session and redirects to Stripe payment page
 */
async function handleStripeCheckout() {
    const btn = document.getElementById('buy-btn');
    btn.textContent = 'Redirecting to Stripe...';
    btn.disabled = true;

    try {
        // Get unique instance ID for this browser
        const instanceId = await getInstanceId();
        // Create checkout session with backend
        const response = await fetch('http://localhost:3000/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceId })
        });

        const data = await response.json();

        // Redirect to Stripe checkout page if session created successfully
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error(data.error || 'Failed to create session');
        }
    } catch (error) {
        console.error('[Stripe Error]', error);
        // Show user-friendly error message with proper instructions
        alert('Failed to connect to payment server. Make sure it is running locally (node payment-server/server.js).\n\nError: ' + error.message);
        // Reset button state
        btn.textContent = 'Purchase License ($5)';
        btn.disabled = false;
    }
}

