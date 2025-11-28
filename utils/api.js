// Module file (used by background); background loads as module
// NOTE: This function normalizes different backend schemas into a unified
// { status: 'SAFE'|'WARNING'|'DANGER', reason, score, raw } object.
// We intentionally use probability thresholds to reduce false positives:
//  - probability < 0.65  -> SAFE
//  - 0.65 <= probability < 0.85 -> WARNING
//  - probability >= 0.85 -> DANGER
// For legacy backends that only return is_scam without probability,
// we fall back to DANGER/SAFE by that boolean.

/**
 * Gửi report về link phishing
 */
export async function reportLink(apiBaseUrl, payload, timeoutMs = 10000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/report`, {
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
			const text = await res.text();
			data = { success: false, message: text };
		}
		
		return data;
	} catch (err) {
		throw new Error(`Report failed: ${err.message}`);
	} finally {
		clearTimeout(timer);
	}
}

export async function checkUrl(apiBaseUrl, payload, timeoutMs = 10000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/predict`, {
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
		// Normalize (supports new backend schema and legacy schema)
		let status;
		let reason;
		let score;

		const hasIsScam = typeof data?.is_scam === 'boolean';
		const hasProb = typeof data?.probability === 'number';

		if (hasIsScam || hasProb) {
			const isScam = Boolean(data.is_scam);
			const probability = hasProb
				? Math.max(0, Math.min(1, Number(data.probability)))
				: (isScam ? 0.9 : 0.1);
			const reasons = Array.isArray(data.reasons) ? data.reasons : [];

			// Use probability as the primary signal to avoid over‑flagging:
			//  - < 0.65  : SAFE
			//  - 0.65–0.85 : WARNING
			//  - >= 0.85 : DANGER
			if (probability >= 0.85) {
				status = 'DANGER';
			} else if (probability >= 0.65) {
				status = 'WARNING';
			} else {
				status = 'SAFE';
			}

			// If backend explicitly said it's not scam but probability is high
			// (inconsistent), we still respect SAFE/WARNING/DANGER from prob.
			reason =
				reasons.length > 0
					? reasons.join('; ')
					: status === 'DANGER'
						? 'Potential phishing indicators detected.'
						: status === 'WARNING'
							? 'Some suspicious indicators were found. Please be cautious.'
							: 'No obvious phishing indicators found.';

			score = probability;
		} else {
			// Legacy / generic schema: status + optional score/reason
			const rawStatus = String(data?.status || '').toUpperCase();
			if (rawStatus === 'DANGER' || rawStatus === 'WARNING' || rawStatus === 'SAFE') {
				status = rawStatus;
			} else {
				status = rawStatus === 'PHISHING' ? 'DANGER' : 'SAFE';
			}

			score =
				typeof data?.score === 'number'
					? Math.max(0, Math.min(1, Number(data.score)))
					: status === 'DANGER'
						? 0.9
						: status === 'WARNING'
							? 0.75
							: 0.1;

			reason =
				data?.reason ||
				(status === 'DANGER'
					? 'Potential phishing indicators detected.'
					: status === 'WARNING'
						? 'Some suspicious indicators were found. Please be cautious.'
						: 'No obvious phishing indicators found.');
		}

		return { status, reason, score, raw: data };
	} finally {
		clearTimeout(timer);
	}
}
