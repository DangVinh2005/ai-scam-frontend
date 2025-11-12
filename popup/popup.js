function formatTime(ts) {
	if (!ts) return '-';
	try {
		const d = new Date(ts);
		return d.toLocaleString();
	} catch {
		return '-';
	}
}

async function getActiveTabUrl() {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs && tabs[0];
			resolve(tab ? tab.url : null);
		});
	});
}

async function loadData() {
	const url = await getActiveTabUrl();
	document.getElementById('url').textContent = url || '-';

	if (!url) {
		document.getElementById('status').innerHTML = '<span class="badge badge-neutral">Unknown</span>';
		document.getElementById('timestamp').textContent = '-';
		return;
	}

	chrome.runtime.sendMessage({ type: 'GET_LAST_SCAN', url }, (resp) => {
		if (!resp || !resp.ok) {
			document.getElementById('status').innerHTML = '<span class="badge badge-neutral">Unknown</span>';
			document.getElementById('timestamp').textContent = '-';
			return;
		}
		const result = resp.lastScan;
		if (!result) {
			document.getElementById('status').innerHTML = '<span class="badge badge-neutral">Not scanned</span>';
			document.getElementById('timestamp').textContent = '-';
			return;
		}

		const badgeClass = result.status === 'DANGER' ? 'badge-danger' : result.status === 'SAFE' ? 'badge-safe' : (result.status === 'WARNING' ? 'badge-warning' : 'badge-neutral');
		const label = result.status === 'DANGER' ? 'DANGEROUS ❌' : (result.status === 'SAFE' ? 'SAFE ✅' : (result.status === 'WARNING' ? 'WARNING ⚠️' : 'UNKNOWN'));
		document.getElementById('status').innerHTML = `<span class="badge ${badgeClass}">${label}</span>`;
		document.getElementById('timestamp').textContent = formatTime(result.ts);
	});
}

function initActions() {
	document.getElementById('btnOptions').addEventListener('click', () => {
		chrome.runtime.openOptionsPage();
	});

	document.getElementById('btnClear').addEventListener('click', () => {
		chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
			window.close();
		});
	});
}

document.addEventListener('DOMContentLoaded', () => {
	loadData();
	initActions();
});


