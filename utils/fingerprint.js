/**
 * Device Fingerprinting - Tạo ID duy nhất cho mỗi device/browser
 * Sử dụng để spam control trên backend
 */

(function() {
	/**
	 * Tạo device fingerprint từ các thuộc tính browser
	 * @returns {Promise<string>} Device ID (hash)
	 */
	async function generateDeviceId() {
		try {
			const components = [];
			
			// 1. User Agent
			components.push(navigator.userAgent || '');
			
			// 2. Language
			components.push(navigator.language || '');
			components.push(navigator.languages ? navigator.languages.join(',') : '');
			
			// 3. Screen resolution
			components.push(`${screen.width}x${screen.height}`);
			components.push(`${screen.colorDepth}`);
			
			// 4. Timezone
			components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
			components.push(new Date().getTimezoneOffset().toString());
			
			// 5. Platform
			components.push(navigator.platform || '');
			
			// 6. Hardware concurrency (số CPU cores)
			components.push(navigator.hardwareConcurrency?.toString() || '');
			
			// 7. Device memory (GB)
			components.push(navigator.deviceMemory?.toString() || '');
			
			// 8. Plugins (limited in modern browsers)
			const plugins = [];
			for (let i = 0; i < navigator.plugins.length; i++) {
				plugins.push(navigator.plugins[i].name);
			}
			components.push(plugins.join(','));
			
			// 9. Canvas fingerprint (lightweight version)
			const canvasFingerprint = await getCanvasFingerprint();
			components.push(canvasFingerprint);
			
			// 10. WebGL fingerprint
			const webglFingerprint = getWebGLFingerprint();
			components.push(webglFingerprint);
			
			// Combine all components
			const fingerprintString = components.join('|');
			
			// Hash using SHA-256
			const hashHex = await sha256(fingerprintString);
			
			return hashHex;
		} catch (err) {
			console.error('Error generating device fingerprint:', err);
			// Fallback: simple hash of user agent
			return await sha256(navigator.userAgent || 'unknown');
		}
	}
	
	/**
	 * Canvas fingerprinting (simple version)
	 */
	async function getCanvasFingerprint() {
		try {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			
			if (!ctx) return '';
			
			// Draw some text
			ctx.textBaseline = 'top';
			ctx.font = '14px Arial';
			ctx.fillStyle = '#f60';
			ctx.fillRect(0, 0, 100, 50);
			ctx.fillStyle = '#069';
			ctx.fillText('AI-AntiScam 🛡️', 2, 15);
			
			// Get data URL
			const dataURL = canvas.toDataURL();
			
			// Hash it
			return await sha256(dataURL);
		} catch (err) {
			return '';
		}
	}
	
	/**
	 * WebGL fingerprinting
	 */
	function getWebGLFingerprint() {
		try {
			const canvas = document.createElement('canvas');
			const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
			
			if (!gl) return '';
			
			const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
			if (!debugInfo) return '';
			
			const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
			const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
			
			return `${vendor}|${renderer}`;
		} catch (err) {
			return '';
		}
	}
	
	/**
	 * SHA-256 hash function
	 */
	async function sha256(message) {
		try {
			const msgBuffer = new TextEncoder().encode(message);
			const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
			return hashHex;
		} catch (err) {
			// Fallback: simple string hash
			let hash = 0;
			for (let i = 0; i < message.length; i++) {
				const char = message.charCodeAt(i);
				hash = ((hash << 5) - hash) + char;
				hash = hash & hash;
			}
			return Math.abs(hash).toString(16);
		}
	}
	
	/**
	 * Lấy hoặc tạo mới Device ID (cached trong storage)
	 */
	async function getDeviceId() {
		return new Promise((resolve) => {
			chrome.storage.local.get(['ai_antiscam_device_id'], async (result) => {
				if (result.ai_antiscam_device_id) {
					// Đã có device ID
					resolve(result.ai_antiscam_device_id);
				} else {
					// Tạo mới
					const deviceId = await generateDeviceId();
					
					// Lưu vào storage
					chrome.storage.local.set({ ai_antiscam_device_id: deviceId }, () => {
						resolve(deviceId);
					});
				}
			});
		});
	}
	
	/**
	 * Generate User ID (persistent across sessions)
	 * Sử dụng chrome.storage để lưu trữ
	 */
	async function getUserId() {
		return new Promise((resolve) => {
			chrome.storage.local.get(['ai_antiscam_user_id'], async (result) => {
				if (result.ai_antiscam_user_id) {
					resolve(result.ai_antiscam_user_id);
				} else {
					// Tạo random user ID
					const userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
					
					chrome.storage.local.set({ ai_antiscam_user_id: userId }, () => {
						resolve(userId);
					});
				}
			});
		});
	}
	
	// Export to window
	window.AntiScamFingerprint = {
		generateDeviceId,
		getDeviceId,
		getUserId
	};
})();

