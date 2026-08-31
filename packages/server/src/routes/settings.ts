import { Router } from 'express';
import { store } from '../util/store';
import { sseManager } from '../services/sseManagerInstance';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { restartWarpmcpIfChanged, updateCurrentSettings } from '../warpmcpRunner';

const SETTINGS_KEY = 'settings:general';

export const settingsRouter = Router();

/**
 * Whitelist of settings keys that clients may update, with the expected type.
 * Anything else in the request body is ignored — prevents injecting arbitrary
 * shapes or values into persisted settings.
 */
const SETTING_FIELD_TYPES: Record<string, 'string' | 'number' | 'boolean' | 'string[]' | 'number[]'> = {
	modelRoots: 'string[]',
	portRangeStart: 'number',
	portRangeEnd: 'number',
	apiHost: 'string',
	apiPort: 'number',
	proxyHost: 'string',
	proxyPort: 'number',
	proxyEnabled: 'boolean',
	proxyAuthEnabled: 'boolean',
	apiAuthEnabled: 'boolean',
	authRequireForLocalhost: 'boolean',
	serversSortField: 'string',
	serversSortOrder: 'string',
	backendsSortField: 'string',
	backendsSortOrder: 'string',
	recipesSortField: 'string',
	recipesSortOrder: 'string',
	checkpointsSortField: 'string',
	checkpointsSortOrder: 'string',
	startMinimized: 'boolean',
	sidebarCollapsed: 'boolean',
	windowWidth: 'number',
	windowHeight: 'number',
	checkpointsPath: 'string',
	maxCheckpointDiskGB: 'number',
	disableTitleGen: 'boolean',
	showRawJSONChatConfig: 'boolean',
	isOnboardingComplete: 'boolean',
	theme: 'string',
	micDeviceId: 'string',
	kokoroVoice: 'string',
	kokoroSpeed: 'number',
	builtinMcpPort: 'number',
	builtinMcpExposeExternal: 'boolean',
	fsAllowedRoots: 'string[]',
	appZoomLevel: 'number',
	chatFontSize: 'number',
	chatFontFamily: 'string',
	chatFixedWidth: 'boolean',
	dictationPTTKey: 'string',
	dictationPTTModeHold: 'boolean',
	globalPTTKey: 'string',
	globalPTTModeHold: 'boolean',
};

function isValidValue(value: unknown, type: string): boolean {
	switch (type) {
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number' && Number.isFinite(value);
		case 'boolean': return typeof value === 'boolean';
		case 'string[]': return Array.isArray(value) && (value as unknown[]).every(v => typeof v === 'string');
		case 'number[]': return Array.isArray(value) && (value as unknown[]).every(v => typeof v === 'number' && Number.isFinite(v));
		default: return false;
	}
}

function sanitizeSettingsPatch(body: unknown): Partial<ISettings> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
	const out: Partial<ISettings> = {};
	for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
		const expected = SETTING_FIELD_TYPES[key];
		if (!expected) continue; // unknown key — ignore
		if (!isValidValue(value, expected)) continue; // wrong type — ignore
		(out as Record<string, unknown>)[key] = value;
	}
	return out;
}

// A bind host is considered loopback-safe if it only accepts loopback traffic.
function isLoopbackHost(host: string | undefined): boolean {
	const h = (host || '').trim().toLowerCase();
	return h === '' || h === 'localhost' || h === '::1' || h === '::ffff:127.0.0.1' || /^127\./.test(h);
}

// GET /api/settings - returns persisted preferences only
settingsRouter.get('/', async (_req, res) => {
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	res.json({ ok: true, data: settings ?? DEFAULT_SETTINGS, error: null });
});

// PUT /api/settings - persists preferences only, no side effects
settingsRouter.put('/', async (req, res) => {
	const current = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const patch = sanitizeSettingsPatch(req.body);
	const updated: ISettings = { ...current, ...patch };

	// Hardening guardrail: never allow binding the control plane or the proxy to a
	// non-loopback interface while authentication is disabled — that would expose
	// the control plane (incl. recipe execution) or inference to the LAN unauth'd.
	if (!isLoopbackHost(updated.apiHost) && !updated.apiAuthEnabled && !updated.authRequireForLocalhost) {
		res.status(400).json({ ok: false, data: null, error: 'Refusing to bind apiHost to a non-loopback address while authentication is disabled. Enable API authentication (or "require auth for localhost") first.' });
		return;
	}
	if (!isLoopbackHost(updated.proxyHost) && !updated.proxyAuthEnabled) {
		res.status(400).json({ ok: false, data: null, error: 'Refusing to bind proxyHost to a non-loopback address while proxy authentication is disabled. Enable proxy authentication first.' });
		return;
	}

	await store.put(SETTINGS_KEY, updated);
	// Emit partial update
	sseManager.emit('settings:update', patch);
	updateCurrentSettings(updated);
	restartWarpmcpIfChanged(current, updated).catch(err => console.error('[warpmcp] restart failed:', err));
	res.json({ ok: true, data: updated, error: null });
});
