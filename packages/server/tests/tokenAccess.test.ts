// Unit tests for token access-control logic in the auth middleware.
import { describe, it, expect, vi, } from 'vitest';
import type { IAccessToken } from '@warpcore/shared';

// Stub the JSON store and token validation — auth.ts pulls them in at
// import time and we only test the pure access-predicate functions.
vi.mock('../src/util/store', () => ({
	store: {
		get: vi.fn(),
		put: vi.fn(),
		list: vi.fn(),
		del: vi.fn(),
	},
}));
vi.mock('../src/routes/tokens', () => ({
	validateBearerToken: vi.fn(async () => null),
}));

import { hasInferenceAccessForToken, hasMcpLabelledAccessForToken, hasMcpInlineAccessForToken, isRemote } from '../src/middleware/auth';

function adminToken(): IAccessToken {
	return { id: 't1', name: 'admin', tokenHash: 'x', admin: true, createdAt: Date.now() } as IAccessToken;
}

describe('hasInferenceAccessForToken', () => {
	it('grants admin tokens access to any model', () => {
		expect(hasInferenceAccessForToken(adminToken(), 'any-model')).toBe(true);
	});

	it('grants unrestricted inference tokens access', () => {
		const token = { id: 't2', name: 'inf', tokenHash: 'x', inference: true, createdAt: Date.now() } as IAccessToken;
		expect(hasInferenceAccessForToken(token, 'anything')).toBe(true);
	});

	it('grants access only to whitelisted model aliases', () => {
		const token = { id: 't3', name: 'scoped', tokenHash: 'x', inference: ['model-a', 'model-b'], createdAt: Date.now() } as IAccessToken;
		expect(hasInferenceAccessForToken(token, 'model-a')).toBe(true);
		expect(hasInferenceAccessForToken(token, 'model-b')).toBe(true);
		expect(hasInferenceAccessForToken(token, 'model-c')).toBe(false);
	});

	it('denies tokens with no inference capability', () => {
		const token = { id: 't4', name: 'none', tokenHash: 'x', createdAt: Date.now() } as IAccessToken;
		expect(hasInferenceAccessForToken(token, 'model-a')).toBe(false);
	});
});

describe('hasMcpLabelledAccessForToken', () => {
	it('grants admin tokens all labelled tools', () => {
		expect(hasMcpLabelledAccessForToken(adminToken(), 'anything')).toBe(true);
	});

	it('honors boolean and list grants', () => {
		const all = { id: 't5', name: 'all', tokenHash: 'x', mcp_labelled: true, createdAt: Date.now() } as IAccessToken;
		expect(hasMcpLabelledAccessForToken(all, 'file_read')).toBe(true);
		const scoped = { id: 't6', name: 'scoped', tokenHash: 'x', mcp_labelled: ['file_read'], createdAt: Date.now() } as IAccessToken;
		expect(hasMcpLabelledAccessForToken(scoped, 'file_read')).toBe(true);
		expect(hasMcpLabelledAccessForToken(scoped, 'file_write')).toBe(false);
	});

	it('denies tokens with no labelled-tool grants', () => {
		const token = { id: 't7', name: 'none', tokenHash: 'x', createdAt: Date.now() } as IAccessToken;
		expect(hasMcpLabelledAccessForToken(token, 'file_read')).toBe(false);
	});
});

describe('hasMcpInlineAccessForToken', () => {
	it('grants admin tokens inline tools', () => {
		expect(hasMcpInlineAccessForToken(adminToken(), 'x')).toBe(true);
	});

	it('honors boolean and list grants', () => {
		const all = { id: 't8', name: 'all', tokenHash: 'x', mcp_inline: true, createdAt: Date.now() } as IAccessToken;
		expect(hasMcpInlineAccessForToken(all, 'anything')).toBe(true);
		const scoped = { id: 't9', name: 'scoped', tokenHash: 'x', mcp_inline: ['fetch'], createdAt: Date.now() } as IAccessToken;
		expect(hasMcpInlineAccessForToken(scoped, 'fetch')).toBe(true);
		expect(hasMcpInlineAccessForToken(scoped, 'shell_exec')).toBe(false);
	});
});

describe('isRemote', () => {
	it('treats loopback addresses as local', () => {
		expect(isRemote({ ip: '127.0.0.1' })).toBe(false);
		expect(isRemote({ ip: '::1' })).toBe(false);
		expect(isRemote({ ip: '::ffff:127.0.0.1' })).toBe(false);
	});

	it('treats LAN/WAN addresses as remote', () => {
		expect(isRemote({ ip: '192.168.1.10' })).toBe(true);
		expect(isRemote({ ip: '10.0.0.5' })).toBe(true);
		expect(isRemote({ ip: '172.16.0.1' })).toBe(true);
	});

	it('falls back to connection.remoteAddress', () => {
		expect(isRemote({ connection: { remoteAddress: '127.0.0.1' } })).toBe(false);
		expect(isRemote({ connection: { remoteAddress: '8.8.8.8' } })).toBe(true);
	});
});
