/**
 * TCP listen-port resolution, kept separate from the server bootstrap so it can
 * be unit-tested without importing the server entry point (which starts things).
 */

export const MIN_PORT = 1;
export const MAX_PORT = 65_535;

export function isValidPort(value: unknown): boolean {
	return typeof value === 'number' && Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

/**
 * Resolve the port to listen on: `CONTROL_API_PORT` overrides settings, which in
 * turn falls back to the product default. An unusable value never reaches
 * `server.listen()` — passing NaN there throws ERR_SOCKET_BAD_PORT and aborts
 * startup with a log line that claims a default was used.
 *
 * Returns the port plus whether the env override had to be discarded, so the
 * caller can log why the configured value was ignored.
 */
export function resolveListenPort(
	envValue: string | undefined | null,
	settingsPort: number | undefined,
	defaultPort: number,
): { port: number; usedEnv: boolean } {
	const fallback = isValidPort(settingsPort) ? (settingsPort as number) : defaultPort;
	const trimmed = (envValue ?? '').trim();
	if (trimmed === '') return { port: fallback, usedEnv: false };

	const fromEnv = Number.parseInt(trimmed, 10);
	// parseInt is lenient ("4400abc" → 4400); require the whole value to be digits.
	if (!/^\d+$/.test(trimmed) || !isValidPort(fromEnv)) {
		return { port: fallback, usedEnv: false };
	}
	return { port: fromEnv, usedEnv: true };
}
