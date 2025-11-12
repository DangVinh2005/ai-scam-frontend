// Base configuration and shared constants
const DEFAULT_API_BASE = 'http://localhost:5000';
const CHECK_ENDPOINT = '/check';

const DEFAULT_CONFIG = {
	apiBaseUrl: DEFAULT_API_BASE,
	autoProtection: true,
	whitelist: [],
	mockMode: false,
	forceDanger: false
};

const STORAGE_KEYS = {
	config: 'ai_antiscam_config',
	lastScan: 'ai_antiscam_last_scan',
	history: 'ai_antiscam_history',
	cacheByDomain: 'ai_antiscam_cache_by_domain'
};

const PHISHING_KEYWORDS = [
	'verify your account',
	'urgent',
	'suspend',
	'password',
	'login',
	'confirm',
	'reset',
	'bank',
	'paypal',
	'crypto',
	'seed phrase',
	'mnemonic',
	'wallet',
	'ssn',
	'security alert',
	'limited time',
	'click here',
	'update billing',
	'invoice overdue',
	'account locked'
];

// Expose on window for content scripts; background imports by module path
window.AntiScamConstants = {
	DEFAULT_API_BASE,
	CHECK_ENDPOINT,
	DEFAULT_CONFIG,
	STORAGE_KEYS,
	PHISHING_KEYWORDS
};


