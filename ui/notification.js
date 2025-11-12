(function () {
	function ensureContainer() {
		let root = document.getElementById('ai-anti-scam-toast');
		if (!root) {
			root = document.createElement('div');
			root.id = 'ai-anti-scam-toast';
			document.body.appendChild(root);
		}
		return root;
	}

	function show(message, variant = 'neutral', timeout = 3500) {
		const root = ensureContainer();
		const el = document.createElement('div');
		el.className = `ai-anti-scam-toast-item ${
			variant === 'danger'
				? 'ai-anti-scam-toast-danger'
				: variant === 'safe'
					? 'ai-anti-scam-toast-safe'
					: variant === 'warning'
						? 'ai-anti-scam-toast-warning'
						: 'ai-anti-scam-toast-neutral'
		}`;
		el.textContent = message || '';
		root.appendChild(el);

		setTimeout(() => {
			el.style.opacity = '0';
			el.style.transform = 'translateY(-6px)';
			el.style.transition = 'all 200ms ease';
		}, timeout - 200);

		setTimeout(() => {
			el.remove();
		}, timeout + 150);
	}

	window.AntiScamNotify = {
		show
	};
})();


