// Background service worker (module)
import { checkUrl, reportLink } from '../utils/api.js';

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

function isWhitelisted(url, whitelistEntries) {
	if (!url || !whitelistEntries || whitelistEntries.length === 0) {
		return false;
	}
	
	const domain = getDomainFromUrl(url);
	if (!domain) return false;
	
	return whitelistEntries.some((entry) => {
		// Normalize entry - extract domain if it's a full URL
		let entryDomain = entry.toLowerCase().trim();
		
		// Remove protocol
		entryDomain = entryDomain.replace(/^https?:\/\//, '');
		// Remove trailing slash and path
		entryDomain = entryDomain.split('/')[0];
		// Remove port if any
		entryDomain = entryDomain.split(':')[0];
		
		const normalizedDomain = domain.toLowerCase();
		
		// Exact match
		if (entryDomain === normalizedDomain) return true;
		
		// Match without www
		const entryWithoutWww = entryDomain.replace(/^www\./, '');
		const domainWithoutWww = normalizedDomain.replace(/^www\./, '');
		
		return entryWithoutWww === domainWithoutWww;
	});
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

		if (message.type === 'CLEAR_CACHE') {
			// Clear local extension cache
			await setCache({});
			await setItem(STORAGE_KEYS.lastScan, null);
			
			// Call backend to clear server cache
			try {
				const cfg = await getConfig();
				const apiBaseUrl = cfg.apiBaseUrl || DEFAULTS.apiBaseUrl;
				const response = await fetch(`${apiBaseUrl}/cache/clear`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
				const data = await response.json();
				sendResponse({ ok: true, message: `Cache cleared! (${data.cleared || 0} server entries removed)` });
			} catch (err) {
				console.error('Failed to clear server cache:', err);
				sendResponse({ ok: true, message: 'Local cache cleared (server unreachable)' });
			}
			return;
		}

		if (message.type === 'CLEAR_SERVER_HISTORY') {
			// Call backend to clear server log history
			try {
				const cfg = await getConfig();
				const apiBaseUrl = cfg.apiBaseUrl || DEFAULTS.apiBaseUrl;
				const response = await fetch(`${apiBaseUrl}/history/clear`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
				const data = await response.json();
				sendResponse({ ok: true, message: data.message || 'History cleared!' });
			} catch (err) {
				console.error('Failed to clear server history:', err);
				sendResponse({ ok: false, message: 'Failed to clear history (server unreachable)' });
			}
			return;
		}

		if (message.type === 'CLEAR_ALL') {
			// Clear everything: local cache + history + server cache + server history
			await setCache({});
			await setItem(STORAGE_KEYS.lastScan, null);
			await setItem(STORAGE_KEYS.history, []);
			
			try {
				const cfg = await getConfig();
				const apiBaseUrl = cfg.apiBaseUrl || DEFAULTS.apiBaseUrl;
				const response = await fetch(`${apiBaseUrl}/clear_all`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
				const data = await response.json();
				sendResponse({ 
					ok: true, 
					message: `All data cleared! (${data.cache_cleared || 0} cache entries, logs ${data.log_cleared ? 'cleared' : 'not found'})`
				});
			} catch (err) {
				console.error('Failed to clear server data:', err);
				sendResponse({ ok: true, message: 'Local data cleared (server unreachable)' });
			}
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

			// Global toggle: if protection is off, do not scan
			if (!cfg.autoProtection) {
				const result = {
					status: 'SAFE',
					reason: 'Protection is disabled.',
					score: 0.0,
					ts,
					url,
					domain,
					keywordHits: keywordHits || {}
				};
				sendResponse({ ok: true, result });
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

		// Whitelist check - use improved matching logic
		if (isWhitelisted(url, cfg.whitelist)) {
			console.log(`URL ${url} is whitelisted`);
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

		if (message.type === 'SUBMIT_REPORT') {
			// New report system - gửi report về backend
			const { link, reason } = message.payload || {};
			
			if (!link) {
				sendResponse({ ok: false, error: 'Link is required' });
				return;
			}

			try {
				const cfg = await getConfig();
				const apiBaseUrl = cfg.apiBaseUrl || DEFAULTS.apiBaseUrl;

				// Lấy device ID và user ID
				let deviceId = null;
				let userId = null;

				try {
					// Try to get from storage
					const storage = await new Promise((resolve) => {
						chrome.storage.local.get(['ai_antiscam_device_id', 'ai_antiscam_user_id'], (result) => {
							resolve(result);
						});
					});

					deviceId = storage.ai_antiscam_device_id;
					userId = storage.ai_antiscam_user_id;

					// If not exist, generate new ones (simplified version)
					if (!deviceId) {
						deviceId = 'device_' + Math.random().toString(36).substr(2, 16);
						chrome.storage.local.set({ ai_antiscam_device_id: deviceId });
					}
					if (!userId) {
						userId = 'user_' + Math.random().toString(36).substr(2, 12);
						chrome.storage.local.set({ ai_antiscam_user_id: userId });
					}
				} catch (err) {
					console.error('Error getting device/user ID:', err);
					// Fallback
					deviceId = 'unknown';
					userId = 'anonymous';
				}

				// Call backend API
				const result = await reportLink(apiBaseUrl, {
					link,
					reason,
					device_id: deviceId,
					user_id: userId
				});

				sendResponse({ ok: true, result });
			} catch (err) {
				console.error('Report submission error:', err);
				sendResponse({ ok: false, error: err.message });
			}
			return;
		}
	})();

	// Keep the message channel open for async response
	return true;
});


