// Get DEFAULT_API_BASE from window.AntiScamConstants (loaded by constants.js)
// Don't redeclare - just use window.AntiScamConstants.DEFAULT_API_BASE directly

function getDefaultApiBase() {
	return (window.AntiScamConstants && window.AntiScamConstants.DEFAULT_API_BASE) || 'http://localhost:5000';
}

function send(type, payload) {
	return new Promise((resolve) => {
		console.log('Sending message:', { type, payload });
		chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
			console.log('Received response for', type, ':', resp);
			if (chrome.runtime.lastError) {
				console.error('Runtime error:', chrome.runtime.lastError);
			}
			resolve(resp);
		});
	});
}

// Direct backend API calls (không qua background.js)
async function callBackendAPI(endpoint, method = 'GET', body = null, timeoutMs = 5000) {
	const apiBaseUrl = document.getElementById('apiBaseUrl')?.value.trim() || getDefaultApiBase();
	const url = `${apiBaseUrl}${endpoint}`;
	
	console.log(`Calling backend API: ${method} ${url}`);
	
	// Create abort controller for timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	
	try {
		const options = {
			method,
			headers: { 'Content-Type': 'application/json' },
			signal: controller.signal
		};
		
		if (body && method !== 'GET') {
			options.body = JSON.stringify(body);
		}
		
		const response = await fetch(url, options);
		clearTimeout(timeoutId);
		
		// Check if response is JSON
		const contentType = response.headers.get('content-type');
		let data;
		
		if (contentType && contentType.includes('application/json')) {
			data = await response.json();
		} else {
			const text = await response.text();
			data = { message: text };
		}
		
		console.log('Backend response:', data);
		return { ok: response.ok, data, status: response.status };
	} catch (err) {
		clearTimeout(timeoutId);
		console.error('Backend API error:', err);
		
		if (err.name === 'AbortError') {
			return { ok: false, error: 'Request timeout. Server may be down.' };
		}
		
		return { ok: false, error: err.message };
	}
}

function normalizeDomain(domain) {
	if (!domain) return '';
	let normalized = domain.toLowerCase().trim();
	// Remove protocol
	normalized = normalized.replace(/^https?:\/\//, '');
	// Remove trailing slash and path
	normalized = normalized.split('/')[0];
	// Remove port
	normalized = normalized.split(':')[0];
	return normalized;
}

function renderWhitelist(list) {
	const ul = document.getElementById('wlList');
	ul.innerHTML = '';
	
	// Normalize and deduplicate list
	const normalizedList = [...new Set((list || []).map(normalizeDomain).filter(d => d))];
	
	normalizedList.forEach((domain) => {
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
			// Normalize both lists for comparison
			cfg.whitelist = cfg.whitelist
				.map(normalizeDomain)
				.filter((d) => d && d !== domain);
			await send('SAVE_CONFIG', { config: cfg });
			renderWhitelist(cfg.whitelist);
			showNotification(`✅ Removed ${domain} from whitelist`, 'success');
		});

		li.appendChild(span);
		li.appendChild(btn);
		ul.appendChild(li);
	});
}

async function load() {
	try {
		console.log('Loading configuration...');
		const resp = await send('GET_CONFIG');
		console.log('Config response:', resp);
		
		const cfg = resp && resp.ok ? resp.config : { apiBaseUrl: getDefaultApiBase(), autoProtection: true, whitelist: [] };
		
		// Normalize whitelist entries
		if (cfg.whitelist && cfg.whitelist.length > 0) {
			const originalWhitelist = [...cfg.whitelist];
			cfg.whitelist = [...new Set(cfg.whitelist.map(normalizeDomain).filter(d => d))];
			
			// Save cleaned whitelist if changed
			if (JSON.stringify(originalWhitelist) !== JSON.stringify(cfg.whitelist)) {
				console.log('Whitelist cleaned:', originalWhitelist, '->', cfg.whitelist);
				await send('SAVE_CONFIG', { config: cfg });
			}
		}
		
		const apiUrlInput = document.getElementById('apiBaseUrl');
		const autoProtectionCheckbox = document.getElementById('autoProtection');
		
		if (apiUrlInput) {
			apiUrlInput.value = cfg.apiBaseUrl || getDefaultApiBase();
		}
		
		if (autoProtectionCheckbox) {
			autoProtectionCheckbox.checked = !!cfg.autoProtection;
		}
		
		renderWhitelist(cfg.whitelist || []);
		
		// Test server connection on load (with small delay)
		setTimeout(() => {
			testServerConnection();
		}, 500);
		
		console.log('Configuration loaded successfully');
	} catch (err) {
		console.error('Failed to load configuration:', err);
		showNotification('Failed to load settings: ' + err.message, 'error');
	}
}

async function save() {
	try {
		console.log('Save button clicked');
		const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim() || getDefaultApiBase();
		const autoProtection = document.getElementById('autoProtection').checked;
		console.log('Settings to save:', { apiBaseUrl, autoProtection });
		
		const wlResp = await send('GET_CONFIG');
		const wl = wlResp && wlResp.ok ? wlResp.config.whitelist : [];

		const resp = await send('SAVE_CONFIG', {
			config: { apiBaseUrl, autoProtection, whitelist: wl }
		});
		console.log('Save response:', resp);
		
		if (resp && resp.ok) {
			showNotification('✅ Settings saved successfully!', 'success');
			// Test connection after saving URL
			await testServerConnection();
		} else {
			showNotification('❌ Failed to save settings', 'error');
		}
	} catch (err) {
		console.error('Save error:', err);
		showNotification('Error: ' + err.message, 'error');
	}
}

async function testServerConnection() {
	const statusEl = document.getElementById('serverStatus');
	const infoEl = document.getElementById('serverInfo');
	
	if (!statusEl || !infoEl) {
		console.error('Server status elements not found');
		return;
	}
	
	statusEl.innerHTML = '⏳ Testing...';
	statusEl.style.color = '#666';
	infoEl.textContent = 'Connecting to server...';
	
	console.log('Testing server connection...');
	
	try {
		const result = await callBackendAPI('/health', 'GET');
		console.log('Health check result:', result);
		
		if (result.ok && result.data) {
			const data = result.data;
			statusEl.innerHTML = '✅ Connected';
			statusEl.style.color = '#28a745';
			
			const model = data.model || 'N/A';
			const accuracy = data.accuracy ? (data.accuracy * 100).toFixed(2) : 'N/A';
			const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '';
			
			infoEl.textContent = `Model: ${model} | Accuracy: ${accuracy}% | Last check: ${timestamp}`;
		} else {
			throw new Error(result.error || 'Server returned error');
		}
	} catch (err) {
		console.error('Server connection test failed:', err);
		statusEl.innerHTML = '❌ Disconnected';
		statusEl.style.color = '#dc3545';
		infoEl.textContent = `Cannot connect to server: ${err.message}. Make sure backend is running on the configured URL.`;
	}
}

function init() {
	document.getElementById('btnSave').addEventListener('click', save);
	document.getElementById('btnReload').addEventListener('click', load);
	
	// Test connection button
	const btnTestConnection = document.getElementById('btnTestConnection');
	if (btnTestConnection) {
		btnTestConnection.addEventListener('click', testServerConnection);
	}

	document.getElementById('btnAdd').addEventListener('click', async () => {
		const input = document.getElementById('wlDomain');
		let domain = input.value.trim().toLowerCase();
		if (!domain) return;

		// Normalize domain: remove protocol, trailing slash, path
		domain = domain.replace(/^https?:\/\//, ''); // Remove protocol
		domain = domain.split('/')[0]; // Remove path
		domain = domain.split(':')[0]; // Remove port
		
		if (!domain) {
			showNotification('Invalid domain', 'error');
			return;
		}

		const resp = await send('GET_CONFIG');
		const cfg = resp.config || {};
		const set = new Set(cfg.whitelist || []);
		set.add(domain);
		cfg.whitelist = Array.from(set);
		await send('SAVE_CONFIG', { config: cfg });
		input.value = '';
		renderWhitelist(cfg.whitelist);
		showNotification(`✅ Added ${domain} to whitelist`, 'success');
	});

	// Auto-save on change
	const debounce = (fn, ms = 250) => {
		let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
	};
	const saveQuiet = debounce(async () => {
		const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim() || getDefaultApiBase();
		const autoProtection = document.getElementById('autoProtection').checked;
		const wlResp = await send('GET_CONFIG');
		const wl = wlResp && wlResp.ok ? wlResp.config.whitelist : [];
		await send('SAVE_CONFIG', { config: { apiBaseUrl, autoProtection, whitelist: wl } });
	}, 200);

	['apiBaseUrl','autoProtection'].forEach(id => {
		const el = document.getElementById(id);
		if (!el) return;
		const evt = id === 'apiBaseUrl' ? 'blur' : 'change';
		el.addEventListener(evt, saveQuiet);
	});

	// Clear cache/history buttons - Call backend API directly
	const btnClearCache = document.getElementById('btnClearCache');
	const btnClearHistory = document.getElementById('btnClearHistory');
	const btnClearAll = document.getElementById('btnClearAll');

	if (btnClearCache) {
		btnClearCache.addEventListener('click', async () => {
			try {
				console.log('Clear cache clicked');
				showClearStatus('Clearing cache...');
				
				// Call backend API directly
				const result = await callBackendAPI('/cache/clear', 'POST');
				console.log('Clear cache result:', result);
				
				if (result.ok && result.data) {
					// Also clear local extension cache
					await send('CLEAR_CACHE', {});
					const msg = result.data.message || `Cache cleared! (${result.data.cleared || 0} entries removed)`;
					showClearStatus('✅ ' + msg);
				} else {
					showClearStatus('❌ Failed to clear cache: ' + (result.error || 'Unknown error'));
				}
			} catch (err) {
				console.error('Clear cache error:', err);
				showClearStatus('❌ Error: ' + err.message);
			}
		});
	} else {
		console.warn('btnClearCache not found');
	}

	if (btnClearHistory) {
		btnClearHistory.addEventListener('click', async () => {
			try {
				console.log('Clear history clicked');
				showClearStatus('Clearing history...');
				
				// Call backend API directly
				const result = await callBackendAPI('/history/clear', 'POST');
				console.log('Clear history result:', result);
				
				if (result.ok && result.data) {
					const msg = result.data.message || 'History cleared!';
					showClearStatus('✅ ' + msg);
				} else {
					showClearStatus('❌ Failed to clear history: ' + (result.error || 'Unknown error'));
				}
			} catch (err) {
				console.error('Clear history error:', err);
				showClearStatus('❌ Error: ' + err.message);
			}
		});
	} else {
		console.warn('btnClearHistory not found');
	}

	if (btnClearAll) {
		btnClearAll.addEventListener('click', async () => {
			try {
				if (!confirm('⚠️ Are you sure you want to clear ALL cache and history?\n\nThis will:\n- Clear local extension cache\n- Clear server cache\n- Clear server logs\n\nThis action cannot be undone.')) return;
				
				console.log('Clear all clicked');
				showClearStatus('Clearing all data...');
				
				// Call backend API directly
				const result = await callBackendAPI('/clear_all', 'POST');
				console.log('Clear all result:', result);
				
				if (result.ok && result.data) {
					// Also clear local extension data
					await send('CLEAR_CACHE', {});
					await send('CLEAR_HISTORY', {});
					
					const msg = result.data.message || `All cleared! (${result.data.cache_cleared || 0} cache entries, logs ${result.data.log_cleared ? 'cleared' : 'not found'})`;
					showClearStatus('✅ ' + msg);
				} else {
					showClearStatus('❌ Failed to clear data: ' + (result.error || 'Unknown error'));
				}
			} catch (err) {
				console.error('Clear all error:', err);
				showClearStatus('❌ Error: ' + err.message);
			}
		});
	} else {
		console.warn('btnClearAll not found');
	}

	// Sync UI if storage changes elsewhere
	if (chrome && chrome.storage && chrome.storage.onChanged) {
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== 'local' || !changes || !changes.ai_antiscam_config) return;
			load();
		});
	}
}

function showClearStatus(message) {
	console.log('showClearStatus called:', message);
	const statusDiv = document.getElementById('clearStatus');
	console.log('clearStatus div:', statusDiv);
	if (statusDiv) {
		const isError = message.includes('Error') || message.includes('Failed');
		statusDiv.textContent = message;
		statusDiv.className = `status-message show ${isError ? 'error' : 'success'}`;
		console.log('Status div updated with class:', statusDiv.className);
		setTimeout(() => {
			statusDiv.className = 'status-message';
		}, 4000);
	} else {
		console.error('clearStatus div not found!');
		alert(message); // Fallback to alert
	}
}

function showNotification(message, type = 'success') {
	console.log('showNotification called:', message, type);
	const statusDiv = document.getElementById('clearStatus');
	if (statusDiv) {
		statusDiv.textContent = message;
		statusDiv.className = `status-message show ${type}`;
		setTimeout(() => {
			statusDiv.className = 'status-message';
		}, 3000);
	} else {
		console.error('clearStatus div not found for notification!');
		alert(message); // Fallback to alert
	}
}

document.addEventListener('DOMContentLoaded', () => {
	console.log('DOM Content Loaded - Initializing options page');
	
	// Check critical elements
	const criticalElements = {
		apiBaseUrl: document.getElementById('apiBaseUrl'),
		autoProtection: document.getElementById('autoProtection'),
		serverStatus: document.getElementById('serverStatus'),
		serverInfo: document.getElementById('serverInfo'),
		clearStatus: document.getElementById('clearStatus'),
		btnSave: document.getElementById('btnSave'),
		btnReload: document.getElementById('btnReload'),
		btnTestConnection: document.getElementById('btnTestConnection')
	};
	
	console.log('Critical elements check:', criticalElements);
	
	// Initialize
	try {
		load();
		init();
		console.log('Options page initialized successfully');
	} catch (err) {
		console.error('Failed to initialize options page:', err);
		alert('Failed to initialize options page: ' + err.message);
	}
});


