// Background service worker (module)
import { checkUrl } from '../utils/api.js';

const DEFAULTS = {
	apiBaseUrl: 'http://localhost:5000',
	autoProtection: true,
	whitelist: [],
	mockMode: false
};

const STORAGE_KEYS = {
	config: 'ai_antiscam_config',
	lastScan: 'ai_antiscam_last_scan',
	history: 'ai_antiscam_history',
	cacheByDomain: 'ai_antiscam_cache_by_domain'
};

function getDomainFromUrl(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

function getItem(key, defaultValue = null) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], (result) => {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

function setItem(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [key]: value }, () => resolve(true));
	});
}

async function getConfig() {
	const cfg = (await getItem(STORAGE_KEYS.config)) || {};
	return {
		...DEFAULTS,
		...cfg,
		whitelist: Array.isArray(cfg.whitelist) ? cfg.whitelist : []
	};
}

async function saveConfig(cfg) {
	const merged = { ...DEFAULTS, ...cfg };
	await setItem(STORAGE_KEYS.config, merged);
	return merged;
}

async function pushHistory(entry) {
	const history = (await getItem(STORAGE_KEYS.history)) || [];
	history.unshift(entry);
	if (history.length > 200) history.length = 200;
	await setItem(STORAGE_KEYS.history, history);
	return history;
}

async function getCache() {
	return (await getItem(STORAGE_KEYS.cacheByDomain)) || {};
}

async function setCache(cache) {
	await setItem(STORAGE_KEYS.cacheByDomain, cache || {});
}

chrome.runtime.onInstalled.addListener(async () => {
	const cfg = await getItem(STORAGE_KEYS.config);
	if (!cfg) {
		await saveConfig(DEFAULTS);
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	(async () => {
		if (!message || !message.type) return;

		if (message.type === 'GET_CONFIG') {
			const cfg = await getConfig();
			sendResponse({ ok: true, config: cfg });
			return;
		}

		if (message.type === 'SAVE_CONFIG') {
			const cfg = await saveConfig(message.config || {});
			sendResponse({ ok: true, config: cfg });
			return;
		}

		if (message.type === 'CLEAR_HISTORY') {
			await setItem(STORAGE_KEYS.history, []);
			sendResponse({ ok: true });
			return;
		}

		if (message.type === 'GET_LAST_SCAN') {
			const { url } = message;
			const domain = getDomainFromUrl(url);
			const cache = await getCache();
			const entry = domain ? cache[domain] : null;
			sendResponse({ ok: true, lastScan: entry || null });
			return;
		}

		if (message.type === 'SCAN_URL') {
			const { url, text, keywordHits } = message.payload || {};
			const ts = Date.now();
			const domain = getDomainFromUrl(url);
			const cfg = await getConfig();

			if (!domain) {
				sendResponse({ ok: false, error: 'Invalid URL' });
				return;
			}

			// Mock mode: simulate results without hitting backend
			if (cfg.mockMode) {
				const hits = keywordHits || {};
				const totalHits = Object.values(hits).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
				const looksPhishy =
					cfg.forceDanger ||
					/.+\.test$/i.test(domain) ||
					/phish|scam|wallet|seed|login/i.test(url) ||
					totalHits >= 2;
				const status = looksPhishy ? 'DANGER' : 'SAFE';
				const score = looksPhishy ? Math.min(0.7 + totalHits * 0.1, 0.98) : Math.max(0.1 - totalHits * 0.02, 0.02);
				const reason = cfg.forceDanger
					? 'Mock Mode: forced danger for testing.'
					: looksPhishy
						? 'Mock Mode: heuristic matched suspicious indicators.'
						: 'Mock Mode: no obvious phishing indicators.';
				const result = { status, reason, score, ts, url, domain, keywordHits: hits };
				const cache = await getCache();
				cache[domain] = result;
				await setCache(cache);
				await setItem(STORAGE_KEYS.lastScan, result);
				await pushHistory(result);
				sendResponse({ ok: true, result });
				return;
			}

			// Whitelist check
			if (cfg.whitelist.some((d) => d.toLowerCase() === domain.toLowerCase())) {
				const result = {
					status: 'SAFE',
					reason: 'Domain is whitelisted.',
					score: 0.01,
					ts,
					url,
					domain,
					keywordHits: keywordHits || {}
				};
				const cache = await getCache();
				cache[domain] = result;
				await setCache(cache);
				await setItem(STORAGE_KEYS.lastScan, result);
				await pushHistory(result);
				sendResponse({ ok: true, result });
				return;
			}

			try {
				const apiBaseUrl = cfg.apiBaseUrl || DEFAULTS.apiBaseUrl;
				const apiResult = await checkUrl(apiBaseUrl, { url, text, keywordHits });

				const result = {
					status: apiResult.status,
					reason: apiResult.reason,
					score: apiResult.score,
					ts,
					url,
					domain,
					keywordHits: keywordHits || {}
				};

				const cache = await getCache();
				cache[domain] = result;
				await setCache(cache);
				await setItem(STORAGE_KEYS.lastScan, result);
				await pushHistory(result);

				sendResponse({ ok: true, result });
			} catch (err) {
				const fallback = {
					status: 'SAFE',
					reason: 'API unreachable. Defaulting to safe.',
					score: 0.5,
					ts,
					url,
					domain,
					keywordHits: keywordHits || {}
				};
				const cache = await getCache();
				cache[domain] = fallback;
				await setCache(cache);
				await setItem(STORAGE_KEYS.lastScan, fallback);
				await pushHistory(fallback);

				sendResponse({ ok: true, result: fallback });
			}
			return;
		}

		if (message.type === 'REPORT') {
			// Placeholder: In a real app this could POST to a report endpoint
			console.warn('User reported potential scam:', message.payload);
			sendResponse({ ok: true });
			return;
		}
	})();

	// Keep the message channel open for async response
	return true;
});


