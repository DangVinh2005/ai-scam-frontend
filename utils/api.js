// Module file (used by background); background loads as module
export async function checkUrl(apiBaseUrl, payload, timeoutMs = 10000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/check`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload),
			signal: controller.signal
		});
		const contentType = res.headers.get('content-type') || '';
		if (!res.ok) {
			throw new Error(`API error ${res.status}`);
		}
		let data = null;
		if (contentType.includes('application/json')) {
			data = await res.json();
		} else {
			// Fallback: treat text response
			const text = await res.text();
			data = { status: 'SAFE', reason: text || 'No details provided', score: 0.5 };
		}
		// Normalize
		const status = String((data.status || '').toUpperCase()) === 'DANGER' ? 'DANGER' : 'SAFE';
		const reason = data.reason || (status === 'DANGER' ? 'Potential phishing indicators detected.' : 'No obvious phishing indicators found.');
		const score = typeof data.score === 'number' ? data.score : (status === 'DANGER' ? 0.9 : 0.1);

		return { status, reason, score, raw: data };
	} finally {
		clearTimeout(timer);
	}
}


