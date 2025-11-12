(function () {
	function removeExisting() {
		const el = document.getElementById('ai-anti-scam-banner');
		if (el) el.remove();
	}

	function removeOverlay() {
		const ov = document.getElementById('ai-anti-scam-overlay');
		if (ov) ov.remove();
		document.documentElement.style.overflow = '';
	}

	function createKeywordChips(keywordHits) {
		const container = document.createElement('div');
		container.className = 'ai-anti-scam-keywords';
		Object.entries(keywordHits || {}).forEach(([kw, count]) => {
			const chip = document.createElement('span');
			chip.className = 'ai-anti-scam-chip';
			chip.textContent = `${kw} ×${count}`;
			container.appendChild(chip);
		});
		return container;
	}

	function showDangerConfirm(opts) {
		removeOverlay();
		const { reason, url } = opts || {};
		const overlay = document.createElement('div');
		overlay.id = 'ai-anti-scam-overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');

		const modal = document.createElement('div');
		modal.className = 'ai-anti-scam-modal';

		const header = document.createElement('div');
		header.className = 'ai-anti-scam-modal-header';
		const h = document.createElement('h3');
		h.textContent = 'This site looks dangerous';
		header.appendChild(h);

		const body = document.createElement('div');
		body.className = 'ai-anti-scam-modal-body';
		body.textContent = reason || 'Potential phishing indicators detected. Are you sure you want to proceed?';

		const footer = document.createElement('div');
		footer.className = 'ai-anti-scam-modal-footer';

		const btnLeave = document.createElement('button');
		btnLeave.className = 'ai-anti-scam-btn ai-anti-scam-btn-primary';
		btnLeave.textContent = 'Leave site';
		btnLeave.addEventListener('click', () => {
			try {
				if (document.referrer && history.length > 1) {
					history.back();
				} else {
					location.replace('about:blank');
				}
			} catch {
				location.href = 'about:blank';
			}
		});

		const btnProceed = document.createElement('button');
		btnProceed.className = 'ai-anti-scam-btn ai-anti-scam-btn-ghost';
		btnProceed.textContent = 'Proceed anyway';
		btnProceed.addEventListener('click', () => {
			removeOverlay();
		});

		footer.appendChild(btnLeave);
		footer.appendChild(btnProceed);

		modal.appendChild(header);
		modal.appendChild(body);
		modal.appendChild(footer);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);
		document.documentElement.style.overflow = 'hidden';
		// focus first action
		setTimeout(() => btnLeave.focus(), 0);
	}

	function show(opts) {
		removeExisting();
		const { title, reason, status, url, score, keywordHits } = opts || {};
		const kind = (status || 'DANGER').toUpperCase();
		const colorClass = kind === 'DANGER'
			? 'ai-anti-scam-danger'
			: kind === 'SAFE'
				? 'ai-anti-scam-safe'
				: kind === 'WARNING'
					? 'ai-anti-scam-warning'
					: 'ai-anti-scam-neutral';

		const banner = document.createElement('div');
		banner.id = 'ai-anti-scam-banner';
		banner.className = colorClass;

		const container = document.createElement('div');
		container.className = 'ai-anti-scam-container';

		const icon = document.createElement('img');
		icon.className = 'ai-anti-scam-icon';
		icon.alt = kind === 'DANGER' ? 'Danger' : 'Safe';
		icon.src = chrome.runtime.getURL(kind === 'DANGER' ? 'assets/icons/shield-danger.svg' : 'assets/icons/shield-safe.svg');

		const content = document.createElement('div');
		content.className = 'ai-anti-scam-content';

		const h = document.createElement('h3');
		h.className = 'ai-anti-scam-title';
		h.textContent = title || (kind === 'DANGER' ? 'Potential Scam Detected' : 'This Page Seems Safe');

		const p = document.createElement('p');
		p.className = 'ai-anti-scam-reason';
		p.textContent = reason || 'Proceed with caution.';

		const details = document.createElement('div');
		details.className = 'ai-anti-scam-details';
		details.style.display = 'none';

		const meta = document.createElement('div');
		meta.textContent = `URL: ${url || location.href} • Confidence: ${(Math.round((score || 0.5) * 100))}%`;

		details.appendChild(meta);
		if (keywordHits && Object.keys(keywordHits).length > 0) {
			const label = document.createElement('div');
			label.textContent = 'Keyword indicators:';
			label.style.marginTop = '6px';
			details.appendChild(label);
			details.appendChild(createKeywordChips(keywordHits));
		}

		const actions = document.createElement('div');
		actions.className = 'ai-anti-scam-actions';

		const btnDetails = document.createElement('button');
		btnDetails.className = 'ai-anti-scam-btn';
		btnDetails.textContent = 'View Details';
		btnDetails.addEventListener('click', () => {
			details.style.display = details.style.display === 'none' ? 'block' : 'none';
			btnDetails.textContent = details.style.display === 'none' ? 'View Details' : 'Hide Details';
		});

		const btnReport = document.createElement('button');
		btnReport.className = 'ai-anti-scam-btn';
		btnReport.textContent = 'Report';
		btnReport.addEventListener('click', () => {
			chrome.runtime.sendMessage(
				{
					type: 'REPORT',
					payload: { url: url || location.href, reason, status: kind, score }
				},
				() => {}
			);
			// Simple feedback
			if (window.AntiScamNotify && typeof window.AntiScamNotify.show === 'function') {
				window.AntiScamNotify.show('Thank you for your report.', 'neutral');
			}
		});

		const btnDismiss = document.createElement('button');
		btnDismiss.className = 'ai-anti-scam-btn';
		btnDismiss.textContent = 'Dismiss';
		btnDismiss.addEventListener('click', () => {
			banner.remove();
		});

		actions.appendChild(btnDetails);
		actions.appendChild(btnReport);
		actions.appendChild(btnDismiss);

		content.appendChild(h);
		content.appendChild(p);
		content.appendChild(actions);
		content.appendChild(details);

		container.appendChild(icon);
		container.appendChild(content);

		banner.appendChild(container);
		document.documentElement.style.scrollMarginTop = '64px';
		document.body.insertBefore(banner, document.body.firstChild || null);

		// Auto show confirm modal on DANGER
		if (kind === 'DANGER') {
			showDangerConfirm({ reason, url });
		}
	}

	window.AntiScamWarningBanner = {
		show,
		confirmDanger: showDangerConfirm
	};
})();


