(function () {
	const { PHISHING_KEYWORDS } = window.AntiScamConstants || {};

	function extractVisibleText(maxLen = 10000) {
		const text = document.body ? document.body.innerText || '' : '';
		return text.slice(0, maxLen);
	}

	function computeKeywordHits(text) {
		const lower = (text || '').toLowerCase();
		const hits = {};
		for (const kw of PHISHING_KEYWORDS) {
			const count = (lower.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
			if (count > 0) hits[kw] = count;
		}
		return hits;
	}

	function scanAndRequest() {
		const url = location.href;
		const text = extractVisibleText();
		const keywordHits = computeKeywordHits(text);

		return new Promise((resolve) => {
			chrome.runtime.sendMessage(
				{
					type: 'SCAN_URL',
					payload: { url, text, keywordHits }
				},
				(response) => {
					resolve(response);
				}
			);
		});
	}

	window.AntiScamScanner = {
		scanAndRequest
	};
})();


