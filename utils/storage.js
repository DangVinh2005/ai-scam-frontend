(function () {
	const { STORAGE_KEYS, DEFAULT_CONFIG } = window.AntiScamConstants || {};

	function getDomainFromUrl(url) {
		try {
			const u = new URL(url);
			return u.hostname;
		} catch (e) {
			return null;
		}
	}

	function getItem(key, defaultValue = null) {
		return new Promise((resolve) => {
			chrome.storage.local.get([key], (result) => {
				if (chrome.runtime && chrome.runtime.lastError) {
					resolve(defaultValue);
					return;
				}
				resolve(result[key] !== undefined ? result[key] : defaultValue);
			});
		});
	}

	function setItem(key, value) {
		return new Promise((resolve) => {
			chrome.storage.local.set({ [key]: value }, () => resolve(true));
		});
	}

	function getMany(keys) {
		return new Promise((resolve) => {
			chrome.storage.local.get(keys, (result) => resolve(result));
		});
	}

	function setMany(obj) {
		return new Promise((resolve) => {
			chrome.storage.local.set(obj, () => resolve(true));
		});
	}

	async function getConfig() {
		const cfg = await getItem(STORAGE_KEYS.config);
		if (!cfg) {
			await setItem(STORAGE_KEYS.config, DEFAULT_CONFIG);
			return { ...DEFAULT_CONFIG };
		}
		// Merge with defaults in case of new fields
		return { ...DEFAULT_CONFIG, ...cfg, whitelist: Array.isArray(cfg.whitelist) ? cfg.whitelist : [] };
	}

	async function saveConfig(nextCfg) {
		const merged = { ...DEFAULT_CONFIG, ...nextCfg };
		await setItem(STORAGE_KEYS.config, merged);
		return merged;
	}

	async function pushHistory(entry) {
		const history = (await getItem(STORAGE_KEYS.history)) || [];
		history.unshift(entry);
		// Keep last 200 entries
		if (history.length > 200) history.length = 200;
		await setItem(STORAGE_KEYS.history, history);
		return history;
	}

	async function clearHistory() {
		await setItem(STORAGE_KEYS.history, []);
	}

	async function getHistory() {
		return (await getItem(STORAGE_KEYS.history)) || [];
	}

	async function getCacheByDomain() {
		return (await getItem(STORAGE_KEYS.cacheByDomain)) || {};
	}

	async function setCacheByDomain(cache) {
		await setItem(STORAGE_KEYS.cacheByDomain, cache || {});
	}

	window.AntiScamStorage = {
		getItem,
		setItem,
		getMany,
		setMany,
		getConfig,
		saveConfig,
		pushHistory,
		clearHistory,
		getHistory,
		getCacheByDomain,
		setCacheByDomain,
		getDomainFromUrl
	};
})();


