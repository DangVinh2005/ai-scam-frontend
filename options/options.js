const { DEFAULT_API_BASE } = window.AntiScamConstants || { DEFAULT_API_BASE: 'http://localhost:5000' };

function send(type, payload) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type, ...payload }, (resp) => resolve(resp));
	});
}

function renderWhitelist(list) {
	const ul = document.getElementById('wlList');
	ul.innerHTML = '';
	(list || []).forEach((domain, idx) => {
		const li = document.createElement('li');
		const span = document.createElement('span');
		span.textContent = domain;

		const btn = document.createElement('button');
		btn.className = 'remove';
		btn.textContent = '×';
		btn.title = 'Remove';
		btn.addEventListener('click', async () => {
			const cfgResp = await send('GET_CONFIG');
			const cfg = cfgResp.config;
			cfg.whitelist = cfg.whitelist.filter((d) => d !== domain);
			await send('SAVE_CONFIG', { config: cfg });
			renderWhitelist(cfg.whitelist);
		});

		li.appendChild(span);
		li.appendChild(btn);
		ul.appendChild(li);
	});
}

async function load() {
	const resp = await send('GET_CONFIG');
	const cfg = resp && resp.ok ? resp.config : { apiBaseUrl: DEFAULT_API_BASE, autoProtection: true, whitelist: [], mockMode: false };
	document.getElementById('apiBaseUrl').value = cfg.apiBaseUrl || DEFAULT_API_BASE;
	document.getElementById('autoProtection').checked = !!cfg.autoProtection;
	if (document.getElementById('mockMode')) {
		document.getElementById('mockMode').checked = !!cfg.mockMode;
	}
	if (document.getElementById('forceDanger')) {
		document.getElementById('forceDanger').checked = !!cfg.forceDanger;
	}
	renderWhitelist(cfg.whitelist || []);
}

async function save() {
	const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim() || DEFAULT_API_BASE;
	const autoProtection = document.getElementById('autoProtection').checked;
	const mockMode = document.getElementById('mockMode') ? document.getElementById('mockMode').checked : false;
	const forceDanger = document.getElementById('forceDanger') ? document.getElementById('forceDanger').checked : false;
	const wlResp = await send('GET_CONFIG');
	const wl = wlResp && wlResp.ok ? wlResp.config.whitelist : [];

	const resp = await send('SAVE_CONFIG', {
		config: { apiBaseUrl, autoProtection, mockMode, forceDanger, whitelist: wl }
	});
	if (resp && resp.ok) {
		alert('Settings saved.');
	}
}

function init() {
	document.getElementById('btnSave').addEventListener('click', save);
	document.getElementById('btnReload').addEventListener('click', load);

	document.getElementById('btnAdd').addEventListener('click', async () => {
		const input = document.getElementById('wlDomain');
		const domain = input.value.trim().toLowerCase();
		if (!domain) return;

		const resp = await send('GET_CONFIG');
		const cfg = resp.config || {};
		const set = new Set(cfg.whitelist || []);
		set.add(domain);
		cfg.whitelist = Array.from(set);
		await send('SAVE_CONFIG', { config: cfg });
		input.value = '';
		renderWhitelist(cfg.whitelist);
	});

	// Auto-save on change to avoid losing switches after reload
	const debounce = (fn, ms = 250) => {
		let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
	};
	const saveQuiet = debounce(async () => {
		const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim() || DEFAULT_API_BASE;
		const autoProtection = document.getElementById('autoProtection').checked;
		const mockMode = document.getElementById('mockMode') ? document.getElementById('mockMode').checked : false;
		const forceDanger = document.getElementById('forceDanger') ? document.getElementById('forceDanger').checked : false;
		const wlResp = await send('GET_CONFIG');
		const wl = wlResp && wlResp.ok ? wlResp.config.whitelist : [];
		await send('SAVE_CONFIG', { config: { apiBaseUrl, autoProtection, mockMode, forceDanger, whitelist: wl } });
	}, 200);

	['apiBaseUrl','autoProtection','mockMode','forceDanger'].forEach(id => {
		const el = document.getElementById(id);
		if (!el) return;
		const evt = id === 'apiBaseUrl' ? 'blur' : 'change';
		el.addEventListener(evt, saveQuiet);
	});

	// Sync UI if storage changes elsewhere
	if (chrome && chrome.storage && chrome.storage.onChanged) {
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== 'local' || !changes || !changes.ai_antiscam_config) return;
			load();
		});
	}
}

document.addEventListener('DOMContentLoaded', () => {
	load();
	init();
});


