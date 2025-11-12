# AI Anti-Scam Protection (Chrome Extension)

Scans websites for phishing indicators and displays warnings.

## Features
- Content script scans current page text for phishing keywords.
- Background script calls backend API: `http://localhost:5000/check`.
- Warning banner injected on dangerous pages with actions: View Details / Report / Dismiss.
- Popup shows current URL, status, and scan timestamp; includes Options and Clear History.
- Options page to configure API URL, toggle auto-protection, and manage whitelist.

## Dev Setup
1. Build your backend at `http://localhost:5000` with POST `/check` returning JSON:
   ```json
   { "status": "SAFE" | "DANGER", "reason": "text", "score": 0.0 }
   ```
2. Place this folder `anti-scam-extension/` as-is.

## Load in Chrome
1. Go to chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the `anti-scam-extension/` folder

## Notes
- Icons (PNG) and sounds are placeholders; replace with real assets for production.
- Host permissions include `<all_urls>` and `http://localhost:5000/*`.
- The extension stores scan history and last result per domain in `chrome.storage.local`.


