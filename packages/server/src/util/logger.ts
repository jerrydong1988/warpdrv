// Simple structured logger to replace console.log in production code
// Usage: logger.info('[module] message', data)
//        logger.error('[module] error', err)
//        logger.warn('[module] warning', data)
//        logger.debug('[module] debug', data)

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

// Default log level — can be overridden via WARPCORE_LOG_LEVEL env var
const DEFAULT_LOG_LEVEL: LogLevel = (process.env.WARPCORE_LOG_LEVEL as LogLevel) || 'info';
let currentLogLevel: LogLevel = DEFAULT_LOG_LEVEL;

export function setLogLevel(level: LogLevel): void {
	currentLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

export const logger = {
	debug: (...args: unknown[]): void => {
		if (shouldLog('debug')) console.debug('[WarpCore]', ...args);
	},
	info: (...args: unknown[]): void => {
		if (shouldLog('info')) console.log('[WarpCore]', ...args);
	},
	warn: (...args: unknown[]): void => {
		if (shouldLog('warn')) console.warn('[WarpCore]', ...args);
	},
	error: (...args: unknown[]): void => {
		if (shouldLog('error')) console.error('[WarpCore]', ...args);
	},
};
