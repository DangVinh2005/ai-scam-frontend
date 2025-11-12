(function () {
	let hasRun = false;
	let lastConfig = null;

	function playSound(kind) {
		try {
			const file = kind === 'danger' ? 'assets/sounds/alert.mp3' : 'assets/sounds/safe.mp3';
			const url = chrome.runtime.getURL(file);
			const audio = new Audio(url);
			audio.volume = kind === 'danger' ? 0.8 : 0.5;
			audio.play().catch(() => {});
		} catch (e) {
			// Ignore playback errors (e.g., user gesture required)
		}
	}

	function injectBanner(result) {
		if (!window.AntiScamWarningBanner || typeof window.AntiScamWarningBanner.show !== 'function') return;
		window.AntiScamWarningBanner.show({
			title: 'Potential Scam Detected',
			reason: result.reason || 'This page shows phishing indicators.',
			status: result.status || 'DANGER',
			score: result.score || 0.9,
			url: result.url || location.href,
			keywordHits: result.keywordHits || {}
		});
	}

	function highlightDangerousKeywords(keywordHits) {
		try {
			const keys = Object.keys(keywordHits || {});
			if (!keys.length) return;
			const escaped = keys
				.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				.sort((a,b)=>b.length-a.length); // longer first
			if (!escaped.length) return;
			const regex = new RegExp('(' + escaped.join('|') + ')', 'ig');
			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
				acceptNode(node) {
					if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
					const p = node.parentElement;
					if (!p) return NodeFilter.FILTER_REJECT;
					const tag = p.tagName;
					if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
					if (p.closest('#ai-anti-scam-banner')) return NodeFilter.FILTER_REJECT;
					if (p.closest('.ai-anti-scam-mark')) return NodeFilter.FILTER_REJECT;
					return NodeFilter.FILTER_ACCEPT;
				}
			});
			let node;
			let applied = 0;
			const maxMarks = 200;
			while ((node = walker.nextNode()) && applied < maxMarks) {
				const text = node.nodeValue;
				if (!regex.test(text)) continue;
				// reset lastIndex to split correctly
				regex.lastIndex = 0;
				const frag = document.createDocumentFragment();
				let lastIdx = 0;
				let m;
				while ((m = regex.exec(text)) && applied < maxMarks) {
					const start = m.index;
					const end = start + m[0].length;
					if (start > lastIdx) {
						frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
					}
					const span = document.createElement('span');
					span.className = 'ai-anti-scam-mark';
					span.textContent = text.slice(start, end);
					frag.appendChild(span);
					lastIdx = end;
					applied++;
					// guard: avoid infinite loop on zero-length
					if (regex.lastIndex === start) regex.lastIndex++;
				}
				if (lastIdx < text.length) {
					frag.appendChild(document.createTextNode(text.slice(lastIdx)));
				}
				node.parentNode.replaceChild(frag, node);
			}
		} catch (e) {
			// ignore highlighting errors
		}
	}

	function showToast(message, variant) {
		if (window.AntiScamNotify && typeof window.AntiScamNotify.show === 'function') {
			window.AntiScamNotify.show(message, variant);
		}
	}

	function getConfig() {
		return new Promise((resolve) => {
			chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (resp) => {
				if (resp && resp.ok) resolve(resp.config);
				else resolve({ apiBaseUrl: 'http://localhost:5000', autoProtection: true, whitelist: [] });
			});
		});
	}

	async function scanOnce() {
		const response = await window.AntiScamScanner.scanAndRequest();
		if (!response || !response.ok || !response.result) return;
		const { result } = response;
		// TEMP: Force DANGER in all cases and suppress SAFE/WARNING
		result.status = 'DANGER';
		result.reason = result.reason || 'Temporary testing: forced danger.';
		if (typeof result.score !== 'number' || result.score < 0.8) result.score = 0.95;
		// Ensure forced DANGER in mock testing if configured
		if (lastConfig && lastConfig.mockMode && lastConfig.forceDanger) {
			result.status = 'DANGER';
			result.reason = result.reason || 'Forced danger (testing)';
			if (typeof result.score !== 'number' || result.score < 0.7) result.score = 0.9;
		}

		if (result.status === 'DANGER') {
			injectBanner(result);
			highlightDangerousKeywords(result.keywordHits || {});
			playSound('danger');
			showToast('This page may be dangerous. Proceed with caution.', 'danger');
		}
	}

	async function checkReferrerFirst() {
		try {
			const ref = document.referrer || '';
			if (!ref) return false;
			const resp = await new Promise((resolve) => {
				chrome.runtime.sendMessage({ type: 'SCAN_URL', payload: { url: ref } }, (r) => resolve(r));
			});
			if (!resp || !resp.ok || !resp.result) return false;
			let status = String(resp.result.status || '').toUpperCase();
			// Respect Force Danger setting
			if (lastConfig && lastConfig.mockMode && lastConfig.forceDanger) status = 'DANGER';
			if (status === 'DANGER') {
				if (window.AntiScamWarningBanner && typeof window.AntiScamWarningBanner.confirmDanger === 'function') {
					window.AntiScamWarningBanner.confirmDanger({
						reason: 'Previous page you came from looks dangerous. Continue?',
						url: ref
					});
					return true;
				}
			}
			return false;
		} catch {
			return false;
		}
	}

	function listenUrlChanges() {
		// Re-run scan on SPA navigations
		const origPush = history.pushState;
		const origReplace = history.replaceState;
		const trigger = () => {
			if (window.__aiAntiScamScanDebounce) clearTimeout(window.__aiAntiScamScanDebounce);
			window.__aiAntiScamScanDebounce = setTimeout(() => {
				window.__aiAntiScamScanDebounce = null;
				scanOnce();
			}, 500);
		};
		if (origPush) {
			history.pushState = function () {
				const r = origPush.apply(this, arguments);
				trigger();
				return r;
			};
		}
		if (origReplace) {
			history.replaceState = function () {
				const r = origReplace.apply(this, arguments);
				trigger();
				return r;
			};
		}
		window.addEventListener('popstate', trigger);
	}

	async function main() {
		if (hasRun) return;
		hasRun = true;

		const cfg = await getConfig();
		lastConfig = cfg;
		if (!cfg.autoProtection) return;

		const handledByReferrer = await checkReferrerFirst();
		if (!handledByReferrer) {
			await scanOnce();
		}
		listenUrlChanges();
	}

	// Run after DOM is ready
	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		main();
	} else {
		document.addEventListener('DOMContentLoaded', main, { once: true });
	}
})();


