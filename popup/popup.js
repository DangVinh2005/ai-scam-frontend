function formatTime(ts) {
	if (!ts) return '-';
	try {
		const d = new Date(ts);
		return d.toLocaleString();
	} catch {
		return '-';
	}
}

function send(type, payload) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type, ...(payload || {}) }, (resp) => resolve(resp));
	});
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
	const cfgResp = await send('GET_CONFIG');
	const enabled = !!(cfgResp && cfgResp.ok && cfgResp.config && cfgResp.config.autoProtection);
	const toggle = document.getElementById('toggleProtection');
	const toggleLabel = document.getElementById('toggleProtectionLabel');
	if (toggle) toggle.checked = enabled;
	if (toggleLabel) toggleLabel.textContent = enabled ? 'Enabled' : 'Disabled';

	const url = await getActiveTabUrl();
	document.getElementById('url').textContent = url || '-';

	if (!url) {
		document.getElementById('status').innerHTML = '<span class="badge badge-neutral">Unknown</span>';
		document.getElementById('timestamp').textContent = '-';
		return;
	}

	if (!enabled) {
		document.getElementById('status').innerHTML = '<span class="badge badge-neutral">Disabled</span>';
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

function showReportStatus(message, type = 'success') {
	const statusEl = document.getElementById('reportStatus');
	if (!statusEl) return;
	
	statusEl.textContent = message;
	statusEl.className = `report-status show ${type}`;
	
	setTimeout(() => {
		statusEl.className = 'report-status';
	}, 5000);
}

function initActions() {
	const toggle = document.getElementById('toggleProtection');
	if (toggle) {
		toggle.addEventListener('change', async (e) => {
			const resp = await send('GET_CONFIG');
			const cfg = (resp && resp.ok && resp.config) ? resp.config : {};
			cfg.autoProtection = !!e.target.checked;
			await send('SAVE_CONFIG', { config: cfg });
			const label = document.getElementById('toggleProtectionLabel');
			if (label) label.textContent = cfg.autoProtection ? 'Enabled' : 'Disabled';
			loadData();
		});
	}

	document.getElementById('btnOptions').addEventListener('click', () => {
		chrome.runtime.openOptionsPage();
	});

	document.getElementById('btnClear').addEventListener('click', () => {
		chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
			window.close();
		});
	});

	// Report Form
	const btnShowReport = document.getElementById('btnShowReport');
	const reportSection = document.getElementById('reportSection');
	const btnCancelReport = document.getElementById('btnCancelReport');
	const btnSubmitReport = document.getElementById('btnSubmitReport');

	// Show report form
	btnShowReport.addEventListener('click', async () => {
		reportSection.style.display = 'block';
		btnShowReport.style.display = 'none';
		
		// Pre-fill current URL (readonly, auto-filled from active tab)
		const url = await getActiveTabUrl();
		if (url) {
			document.getElementById('reportLink').value = url;
		} else {
			document.getElementById('reportLink').value = '(Unable to get current URL)';
		}
	});

	// Cancel report
	btnCancelReport.addEventListener('click', () => {
		reportSection.style.display = 'none';
		btnShowReport.style.display = 'block';
		// Clear form (note: link is readonly and will be refilled on next open)
		document.getElementById('reportLink').value = '';
		document.getElementById('reportReason').value = '';
		document.getElementById('reportReasonCustom').value = '';
		document.getElementById('reportStatus').className = 'report-status';
	});

	// Submit report
	btnSubmitReport.addEventListener('click', async () => {
		// IMPORTANT: Always get URL from active tab (don't trust input field)
		// This prevents users from bypassing readonly via dev tools
		const link = await getActiveTabUrl();
		
		const reasonSelect = document.getElementById('reportReason').value;
		const reasonCustom = document.getElementById('reportReasonCustom').value.trim();

		// Validation
		if (!link) {
			showReportStatus('Unable to get current page URL', 'error');
			return;
		}

		if (!reasonSelect) {
			showReportStatus('Please select a reason', 'error');
			return;
		}

		// Combine reason
		let reason = reasonSelect;
		if (reasonCustom) {
			reason = `${reasonSelect}: ${reasonCustom}`;
		}

		// Disable button
		btnSubmitReport.disabled = true;
		btnSubmitReport.textContent = 'Submitting...';
		showReportStatus('Sending report...', 'warning');

		try {
			// Send report through background
			const resp = await send('SUBMIT_REPORT', { 
				payload: { link, reason }
			});

			if (resp && resp.ok && resp.result && resp.result.success) {
				showReportStatus(
					`✅ Report submitted! (Risk: ${resp.result.risk_level}, Count: ${resp.result.report_count})`,
					'success'
				);
				
				// Clear form after 2 seconds
				setTimeout(() => {
					reportSection.style.display = 'none';
					btnShowReport.style.display = 'block';
					document.getElementById('reportLink').value = '';
					document.getElementById('reportReason').value = '';
					document.getElementById('reportReasonCustom').value = '';
				}, 2000);
			} else {
				const msg = resp?.result?.message || 'Failed to submit report';
				showReportStatus(`❌ ${msg}`, 'error');
			}
		} catch (err) {
			showReportStatus(`❌ Error: ${err.message}`, 'error');
		} finally {
			btnSubmitReport.disabled = false;
			btnSubmitReport.textContent = 'Submit Report';
		}
	});
}

document.addEventListener('DOMContentLoaded', () => {
	loadData();
	initActions();
});


