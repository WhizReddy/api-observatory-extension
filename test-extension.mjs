import puppeteer from 'puppeteer';
import path from 'path';

const extensionPath = process.cwd();

(async () => {
    console.log('Launching browser with extension from:', extensionPath);
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    try {
        console.log('Browser launched. Finding extension ID...');
        // Find the background service worker or extension page to extract the ID
        const target = await browser.waitForTarget(
            t => t.type() === 'service_worker' || t.url().startsWith('chrome-extension://'),
            { timeout: 10000 }
        );

        const extensionUrl = new URL(target.url());
        const extensionId = extensionUrl.hostname;
        console.log('Extension ID:', extensionId);

        const paymentPageUrl = `chrome-extension://${extensionId}/payment.html`;
        console.log('Navigating to:', paymentPageUrl);

        const page = await browser.newPage();

        let hasErrors = false;
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('[Browser ERROR]', msg.text());
                hasErrors = true;
            } else {
                console.log('[Browser LOG]', msg.text());
            }
        });

        page.on('pageerror', error => {
            console.error('[Browser PAGE_ERROR]', error.message);
            hasErrors = true;
        });

        await page.goto(paymentPageUrl, { waitUntil: 'networkidle0' });
        console.log('Payment page loaded.');

        // Let's trigger handleSimBuy to see if it works
        console.log('Clicking Sim Buy button...');
        // Mock window.alert to prevent blocking
        await page.evaluate(() => {
            window.alert = (msg) => console.log('ALERT:', msg);
        });

        await page.click('#sim-buy');
        await new Promise(r => setTimeout(r, 500));

        console.log('Clicking Activate button...');
        await page.click('#activate');
        await new Promise(r => setTimeout(r, 1000));

        const errText = await page.$eval('#err', el => el.textContent).catch(() => '');
        const errDisplay = await page.$eval('#err', el => window.getComputedStyle(el).display).catch(() => '');
        if (errDisplay === 'block' && errText) {
            console.error('Validation Error displayed on page:', errText);
            hasErrors = true;
        }

        if (!hasErrors) {
            console.log('✅ No errors occurred during the test.');
        } else {
            console.error('❌ Errors were found during the test.');
        }

    } catch (err) {
        console.error('Test script error:', err);
    } finally {
        await browser.close();
    }
})();
