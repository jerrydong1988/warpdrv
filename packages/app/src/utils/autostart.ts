export interface IAutostartApi {
	isEnabled: () => Promise<boolean>;
	enable: () => Promise<void>;
	disable: () => Promise<void>;
}

/**
 * Synchronize OS autostart without invoking non-idempotent platform commands
 * when the requested state is already active.
 */
export async function syncAutostart(api: IAutostartApi, desired: boolean): Promise<boolean> {
	const current = await api.isEnabled();
	if (current === desired) return current;

	if (desired) {
		await api.enable();
	} else {
		await api.disable();
	}

	return api.isEnabled();
}
