import type { ISettings } from '@warpcore/shared';

// A bind host is considered loopback-safe if it only accepts loopback traffic.
function isLoopbackHost(host: string | undefined): boolean {
	const h = (host || '').trim().toLowerCase();
	return h === '' || h === 'localhost' || h === '::1' || h === '::ffff:127.0.0.1' || /^127\./.test(h);
}

/**
 * Hardening guardrail: never allow *introducing or changing to* a non-loopback
 * bind while the matching authentication is disabled — that would expose the
 * control plane (incl. recipe execution) or inference to the LAN unauth'd.
 *
 * Pre-existing non-loopback configs are deliberately NOT re-validated:
 * blocking every save for them would deadlock users out of all settings (they
 * could neither fix apiHost nor enable auth, since both need a save). The
 * startup posture warnings keep covering that legacy state.
 *
 * Returns an error message when the patch must be rejected, or null when the
 * save is safe.
 */
export function validateSettingsBindGuard(current: ISettings, patch: Partial<ISettings>): string | null {
	const updated: ISettings = { ...current, ...patch };

	const apiHostChanged = patch.apiHost !== undefined && patch.apiHost !== current.apiHost;
	if (apiHostChanged && !isLoopbackHost(updated.apiHost) && !updated.apiAuthEnabled && !updated.authRequireForLocalhost) {
		return 'Refusing to bind apiHost to a non-loopback address while authentication is disabled. Enable API authentication (or "require auth for localhost") first.';
	}

	const proxyHostChanged = patch.proxyHost !== undefined && patch.proxyHost !== current.proxyHost;
	if (proxyHostChanged && !isLoopbackHost(updated.proxyHost) && !updated.proxyAuthEnabled) {
		return 'Refusing to bind proxyHost to a non-loopback address while proxy authentication is disabled. Enable proxy authentication first.';
	}

	return null;
}
