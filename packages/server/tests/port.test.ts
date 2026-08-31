// Unit tests for listen-port resolution.
import { describe, it, expect } from 'vitest';
import { isValidPort, resolveListenPort } from '../src/util/port';

describe('isValidPort', () => {
	it('accepts real TCP ports', () => {
		expect(isValidPort(1)).toBe(true);
		expect(isValidPort(4400)).toBe(true);
		expect(isValidPort(65_535)).toBe(true);
	});

	it('rejects everything else', () => {
		expect(isValidPort(0)).toBe(false);
		expect(isValidPort(-1)).toBe(false);
		expect(isValidPort(65_536)).toBe(false);
		expect(isValidPort(44.5)).toBe(false);
		expect(isValidPort('4400' as unknown as number)).toBe(false);
		expect(isValidPort(undefined)).toBe(false);
		expect(isValidPort(NaN)).toBe(false);
	});
});

describe('resolveListenPort', () => {
	it('prefers a valid env override', () => {
		expect(resolveListenPort('8080', 4400, 4400)).toEqual({ port: 8080, usedEnv: true });
	});

	it('uses settings when no env var is set', () => {
		expect(resolveListenPort(undefined, 5555, 4400).port).toBe(5555);
		expect(resolveListenPort('', 5555, 4400).port).toBe(5555);
	});

	it('falls back to the default when settings are unusable', () => {
		expect(resolveListenPort(undefined, undefined, 4400).port).toBe(4400);
		expect(resolveListenPort(undefined, 0, 4400).port).toBe(4400);
	});

	it('never returns an invalid port for a bad env value', () => {
		// The bug this pins: the old code logged "using default" and then passed
		// NaN straight to listen(), which throws ERR_SOCKET_BAD_PORT.
		for (const bad of ['abc', '', '0', '-5', '99999', '4400abc', '  ']) {
			const result = resolveListenPort(bad, undefined, 4400);
			expect(isValidPort(result.port)).toBe(true);
			expect(result.port).toBe(4400);
			expect(result.usedEnv).toBe(false);
		}
	});

	it('reports when the env override was honoured', () => {
		expect(resolveListenPort(' 4401 ', undefined, 4400)).toEqual({ port: 4401, usedEnv: true });
	});
});
