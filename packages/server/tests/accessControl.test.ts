// Unit tests for the access-control primitives in util/access.ts and
// util/localOrigin.ts — the address/token predicates the auth middleware trusts.
import { describe, it, expect } from 'vitest';
import type { IAccessToken } from '@warpcore/shared';
import {
	hasInferenceAccessForToken,
	hasMcpInlineAccessForToken,
	hasMcpLabelledAccessForToken,
	isLoopbackAddress,
	isLoopbackHost,
	isRemoteRequest,
	shouldRequireAuthForRequest,
} from '../src/util/access';
import { isLocalOrShellOrigin } from '../src/util/localOrigin';

describe('isLoopbackAddress', () => {
	it('accepts loopback forms', () => {
		expect(isLoopbackAddress('127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('127.5.0.1')).toBe(true); // whole 127/8 block
	});

	it('rejects non-loopback and missing addresses', () => {
		expect(isLoopbackAddress('10.0.0.5')).toBe(false);
		expect(isLoopbackAddress('192.168.1.10')).toBe(false);
		expect(isLoopbackAddress('')).toBe(false);
		expect(isLoopbackAddress(undefined)).toBe(false);
	});
});

describe('isLoopbackHost', () => {
	it('recognises loopback binds', () => {
		expect(isLoopbackHost('127.0.0.1')).toBe(true);
		expect(isLoopbackHost('localhost')).toBe(true);
		expect(isLoopbackHost('LOCALHOST')).toBe(true);
		expect(isLoopbackHost('[::1]')).toBe(true);
		expect(isLoopbackHost(undefined)).toBe(true);
	});

	it('flags network binds', () => {
		expect(isLoopbackHost('0.0.0.0')).toBe(false);
		expect(isLoopbackHost('192.168.1.10')).toBe(false);
		expect(isLoopbackHost('::')).toBe(false);
	});
});

describe('isRemoteRequest', () => {
	it('classifies by peer socket', () => {
		expect(isRemoteRequest({ ip: '127.0.0.1' })).toBe(false);
		expect(isRemoteRequest({ ip: '::ffff:127.0.0.1' })).toBe(false);
		expect(isRemoteRequest({ ip: '10.1.2.3' })).toBe(true);
		expect(isRemoteRequest({ connection: { remoteAddress: '10.1.2.3' } })).toBe(true);
	});
});

describe('shouldRequireAuthForRequest', () => {
	it('does not require auth for a loopback peer on a loopback bind', () => {
		expect(shouldRequireAuthForRequest({ ip: '127.0.0.1' }, { apiHost: '127.0.0.1' })).toBe(false);
	});

	it('requires auth for remote peers', () => {
		expect(shouldRequireAuthForRequest({ ip: '203.0.0.7' }, { apiHost: '127.0.0.1' })).toBe(true);
	});

	it('requires auth when forced for localhost', () => {
		expect(shouldRequireAuthForRequest({ ip: '127.0.0.1' }, { apiHost: '127.0.0.1', authRequireForLocalhost: true })).toBe(true);
	});

	it('requires auth when bound to a non-loopback interface', () => {
		// A request reaching a 0.0.0.0 bind through a reverse proxy still looks
		// like it came from 127.0.0.1, so loopback is not evidence of locality.
		expect(shouldRequireAuthForRequest({ ip: '127.0.0.1' }, { apiHost: '0.0.0.0' })).toBe(true);
	});
});

describe('token capability checks', () => {
	const admin = { id: 'a', name: 'admin', tokenHash: 'x', admin: true, createdAt: 0 } as IAccessToken;
	const scoped = {
		id: 'b', name: 'scoped', tokenHash: 'x',
		inference: ['llama-8b'], mcp_labelled: ['read_file'], mcp_inline: [],
		createdAt: 0,
	} as unknown as IAccessToken;
	const none = { id: 'c', name: 'none', tokenHash: 'x', createdAt: 0 } as IAccessToken;

	it('admin implies every capability', () => {
		expect(hasInferenceAccessForToken(admin, 'anything')).toBe(true);
		expect(hasMcpLabelledAccessForToken(admin, 'anything')).toBe(true);
		expect(hasMcpInlineAccessForToken(admin, 'anything')).toBe(true);
	});

	it('honours per-item allowlists', () => {
		expect(hasInferenceAccessForToken(scoped, 'llama-8b')).toBe(true);
		expect(hasInferenceAccessForToken(scoped, 'llama-70b')).toBe(false);
		expect(hasMcpLabelledAccessForToken(scoped, 'read_file')).toBe(true);
		expect(hasMcpLabelledAccessForToken(scoped, 'shell_exec')).toBe(false);
		expect(hasMcpInlineAccessForToken(scoped, 'anything')).toBe(false);
	});

	it('denies tokens with no grants', () => {
		expect(hasInferenceAccessForToken(none, 'x')).toBe(false);
		expect(hasMcpLabelledAccessForToken(none, 'x')).toBe(false);
		expect(hasMcpInlineAccessForToken(none, 'x')).toBe(false);
	});

	it('treats boolean true as unrestricted', () => {
		const all = { id: 'd', name: 'all', tokenHash: 'x', inference: true, mcp_labelled: true, mcp_inline: true, createdAt: 0 } as unknown as IAccessToken;
		expect(hasInferenceAccessForToken(all, 'x')).toBe(true);
		expect(hasMcpLabelledAccessForToken(all, 'x')).toBe(true);
		expect(hasMcpInlineAccessForToken(all, 'x')).toBe(true);
	});
});

describe('isLocalOrShellOrigin', () => {
	it('allows non-browser clients (no Origin)', () => {
		expect(isLocalOrShellOrigin(undefined)).toBe(true);
		expect(isLocalOrShellOrigin('')).toBe(true);
	});

	it('allows local dev and shell origins on any port', () => {
		for (const origin of [
			'http://localhost:4400', 'http://127.0.0.1:4400', 'http://localhost:5173',
			'http://localhost:3000', 'http://[::1]:8080', 'https://tauri.localhost',
			'http://tauri.localhost', 'http://tauri.localhost:4400', 'tauri://localhost', 'wry://x',
		]) {
			expect(isLocalOrShellOrigin(origin)).toBe(true);
		}
	});

	it('rejects look-alike and remote origins', () => {
		for (const origin of [
			'http://localhost.evil.com',
			'http://127.0.0.1.evil.com',
			'http://evil.com',
			'https://evil.com:443',
			'http://localhost:4400.evil.com',
			'null',
			'http://tauri.localhost.evil.com',
			'javascript:alert(1)',
		]) {
			expect(isLocalOrShellOrigin(origin)).toBe(false);
		}
	});
});
