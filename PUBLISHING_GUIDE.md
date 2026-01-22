# 🚀 How to Publish API Observatory

This guide explains how to prepare and submit your extension to the Chrome Web Store.

---

## 📦 Step 1: Prepare the Zip Bundle

1.  **Cleanup**: Before zipping, ensure you don't include any extra files (like `.git`, `node_modules`, or this markdown file).
2.  **Required Files**:
    - `manifest.json`
    - `background.js`
    - `content-script.js`
    - `page-script.js`
    - `popup.html` / `popup.js` / `popup.css`
    - `payment.html` / `payment.js`
    - `devtools/` folder (entirely)
    - `icon.png`
3.  **Command to Zip (Mac)**:
    ```bash
    zip -r api-observatory-v1.2.0.zip . -x "*.git*" "node_modules/*" "*.md" "test-server.js"
    ```

---

## 🛠 Step 2: Set Up Chrome Developer Account

1.  Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2.  Sign in with a Google Account.
3.  Pay the **$5 USD one-time developer registration fee** (Google's standard requirement).

---

## 📤 Step 3: Submit for Review

1.  **Add New Item**: Click "New Item" and upload your `api-observatory-v1.2.0.zip` file.
2.  **Store Listing**:
    - **Description**: Add a compelling description about live API observability.
    - **Category**: Developer Tools.
    - **Icons**: You've already included `icon.png`. Chrome will ask you to upload screenshot assets (typically 1280x800).
3.  **Privacy Tab**:
    - **Single Purpose**: "Live API observability and request tracking inside DevTools."
    - **Permissions**: Explain that `<all_urls>` and `storage` are needed to capture network requests and save user preferences/license status.
4.  **License Key (Gumroad)**:
    - In the "Reviewer Instructions" field, provide a **Test License Key** (`TEST-REDIBALLA`) so the Chrome reviewers can test the Pro features without paying.

---

## 🔑 Step 4: Finalize Gumroad Setup

1.  **Create Product**: Go to [Gumroad](https://gumroad.com/) and create a "Digital Product".
2.  **License Keys**: In the product "Checkout" tab, you **MUST** enable **"Generate a unique license key per sale"**. 
3.  **Find Permalink**: Your product URL slug (e.g., `api-observatory-pro`) is your permalink.
4.  **Update Config**: 
    - Open `payment.js` and update `GUMROAD_PRODUCT_PERMALINK` with your permalink.
    - Open `payment.html` and update the link with your checkout URL.
5.  **Test Purchase**: Gumroad allows you to "buy" your own product with a dummy card to test the license key activation flow.

---

## 💡 Pro Tips
- **Review Time**: Chrome usually takes 2-5 days for the first review.
- **Updates**: Future updates are usually faster (under 24 hours).
- **Icons**: I generated a high-quality `icon.png`. For professional submission, you might want to create specific 16x16 and 48x48 versions from it to ensure pixel perfection.

**Good luck with your launch! 🚀**
