// Regression tests for the settings bind guard. A previous version rejected
// ANY save when the stored config already held a non-loopback bind with auth
// disabled — which deadlocked users out of every setting (theme, language,
// apiHost fix, auth enable all needed a save). The guard must only block
// *introducing or changing to* the risky state.
import { describe, it, expect } from 'vitest';
import { validateSettingsBindGuard } from '../src/util/settingsGuard';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import type { ISettings } from '@warpcore/shared';

function base(overrides: Partial<ISettings> = {}): ISettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('validateSettingsBindGuard', () => {
	it('allows unrelated saves on a pre-existing non-loopback apiHost (no deadlock)', () => {
		const current = base({ apiHost: '0.0.0.0' });
		expect(validateSettingsBindGuard(current, { theme: 'dracula' })).toBeNull();
	});

	it('allows re-saving the same non-loopback apiHost value', () => {
		const current = base({ apiHost: '0.0.0.0' });
		expect(validateSettingsBindGuard(current, { apiHost: '0.0.0.0' })).toBeNull();
	});

	it('rejects introducing a non-loopback apiHost without authentication', () => {
		const current = base({ apiHost: '127.0.0.1' });
		expect(validateSettingsBindGuard(current, { apiHost: '0.0.0.0' })).toMatch(/Refusing to bind apiHost/);
	});

	it('allows a non-loopback apiHost when API auth is enabled', () => {
		const current = base({ apiHost: '127.0.0.1' });
		expect(validateSettingsBindGuard(current, { apiHost: '0.0.0.0', apiAuthEnabled: true })).toBeNull();
	});

	it('allows a non-loopback apiHost when auth is required for localhost', () => {
		const current = base({ apiHost: '127.0.0.1' });
		expect(validateSettingsBindGuard(current, { apiHost: '0.0.0.0', authRequireForLocalhost: true })).toBeNull();
	});

	it('allows moving a legacy non-loopback apiHost back to loopback', () => {
		const current = base({ apiHost: '0.0.0.0' });
		expect(validateSettingsBindGuard(current, { apiHost: '127.0.0.1' })).toBeNull();
	});

	it('enables auth on a legacy non-loopback config without requiring the bind to change', () => {
		const current = base({ apiHost: '0.0.0.0' });
		expect(validateSettingsBindGuard(current, { apiAuthEnabled: true })).toBeNull();
	});

	it('treats loopback spellings as safe', () => {
		const current = base({ apiHost: '127.0.0.1', proxyHost: '127.0.0.1' });
		expect(validateSettingsBindGuard(current, { apiHost: 'localhost' })).toBeNull();
		expect(validateSettingsBindGuard(current, { apiHost: '::1' })).toBeNull();
		expect(validateSettingsBindGuard(current, { apiHost: '127.0.0.9' })).toBeNull();
	});

	it('applies the same change-only rule to proxyHost', () => {
		const legacy = base({ proxyHost: '0.0.0.0' });
		expect(validateSettingsBindGuard(legacy, { theme: 'dracula' })).toBeNull();

		const clean = base({ proxyHost: '127.0.0.1' });
		expect(validateSettingsBindGuard(clean, { proxyHost: '0.0.0.0' })).toMatch(/Refusing to bind proxyHost/);
		expect(validateSettingsBindGuard(clean, { proxyHost: '0.0.0.0', proxyAuthEnabled: true })).toBeNull();
	});
});
