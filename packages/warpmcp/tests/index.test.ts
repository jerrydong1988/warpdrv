import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getStatus, stopServer, startServer } from '../src/index';
import { authorizeAccess, authorizeToolCall } from '../src/auth';
import { createMockDeps, createMockToken, createMockRequest, createAdminDeps, createScopedDeps, createRemoteDeps } from './fixtures';

// ============================================================
// getStatus - no dependencies, pure state checks
// ============================================================

describe('getStatus', () => {
	it('returns not running when server has not started', () => {
		const status = getStatus();
		expect(status.running).toBe(false);
		expect(status.port).toBeNull();
		expect(status.bindHost).toBeNull();
	});
});

// ============================================================
// stopServer - graceful shutdown
// ============================================================

describe('stopServer', () => {
	it('does not throw when server is not running', async () => {
		await expect(stopServer()).resolves.not.toThrow();
	});
});

// ============================================================
// startServer - express + MCP server lifecycle
// ============================================================

describe('startServer', () => {
	it('starts the server on the specified port', async () => {
		const deps = createMockDeps();
		const result = await startServer({ ...deps, port: 0, exposeExternal: false });
		const status = getStatus();
		expect(status.running).toBe(true);
		expect(status.bindHost).toBe('127.0.0.1');

		await stopServer();
	}, 10000);

	it('binds to 0.0.0.0 when exposeExternal is true', async () => {
		const deps = createMockDeps();
		const result = await startServer({ ...deps, port: 0, exposeExternal: true });
		expect(result.bindHost).toBe('0.0.0.0');

		await stopServer();
	}, 10000);

	it('registers MCP tools via ListToolsRequestSchema', async () => {
		const deps = createMockDeps();
		const result = await startServer({ ...deps, port: 0, exposeExternal: false });

		const status = getStatus();
		expect(status.running).toBe(true);

		await stopServer();
	}, 10000);
});

// ============================================================
// Auth - authorizeAccess
// ============================================================

describe('authorizeAccess', () => {
	it('allows local requests without token', async () => {
		const deps = createMockDeps();
		const req = createMockRequest();
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(true);
	});

	it('allows admin token for remote requests', async () => {
		const deps = createRemoteDeps();
		const req = createMockRequest({
			headers: { authorization: 'Bearer admin-token' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(true);
	});

	it('rejects remote request without token', async () => {
		const deps = createRemoteDeps();
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: undefined },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('Missing or invalid Bearer token.');
	});

	it('rejects remote request with non-admin non-scoped token', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ admin: false, mcp_labelled: false }),
		});
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: 'Bearer regular-token' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('Token lacks mcp_labelled scope.');
	});

	it('allows token with mcp_labelled: true', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ mcp_labelled: true }),
		});
		const req = createMockRequest({
			headers: { authorization: 'Bearer full-scope-token' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(true);
	});

	it('allows token with non-empty mcp_labelled array', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ mcp_labelled: ['file_read'] }),
		});
		const req = createMockRequest({
			headers: { authorization: 'Bearer scoped-token' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(true);
	});
});

// ============================================================
// Auth - authorizeToolCall
// ============================================================

describe('authorizeToolCall', () => {
	it('allows local requests for tool calls without token', async () => {
		const deps = createMockDeps();
		const req = createMockRequest();
		const result = await authorizeToolCall(deps, req, 'file_read');
		expect(result.ok).toBe(true);
	});

	it('allows admin token for tool calls', async () => {
		const deps = createRemoteDeps();
		const req = createMockRequest({
			headers: { authorization: 'Bearer admin-token' },
		});
		const result = await authorizeToolCall(deps, req, 'file_write');
		expect(result.ok).toBe(true);
	});

	it('allows token with mcp_labelled: true for any tool', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ mcp_labelled: true }),
		});
		const req = createMockRequest({
			headers: { authorization: 'Bearer full-token' },
		});
		const result = await authorizeToolCall(deps, req, 'shell_exec');
		expect(result.ok).toBe(true);
	});

	it('allows token with matching scope for specific tool', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ mcp_labelled: ['file_read', 'dir_list'] }),
		});
		const req = createMockRequest({
			headers: { authorization: 'Bearer scoped-token' },
		});
		const result = await authorizeToolCall(deps, req, 'file_read');
		expect(result.ok).toBe(true);
	});

	it('rejects token without matching scope for tool', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ mcp_labelled: ['file_read'] }),
		});
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: 'Bearer scoped-token' },
		});
		const result = await authorizeToolCall(deps, req, 'shell_exec');
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('mcp_labelled scope');
		expect(result.reason).toContain('shell_exec');
	});

	it('rejects remote tool call without token', async () => {
		const deps = createRemoteDeps();
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: undefined },
		});
		const result = await authorizeToolCall(deps, req, 'file_read');
		expect(result.ok).toBe(false);
		expect(result.reason).toBe('Missing or invalid Bearer token.');
	});
});

// ============================================================
// Auth - edge cases
// ============================================================

describe('authorizeAccess - edge cases', () => {
	it('rejects null token from validateBearerToken', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => null,
		});
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: 'Bearer invalid' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(false);
	});

	it('allows empty mcp_labelled array only if admin', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ admin: false, mcp_labelled: [] }),
		});
		const req = createMockRequest({
			ip: '192.168.1.100',
			remoteAddress: '192.168.1.100',
			headers: { authorization: 'Bearer empty-scoped' },
		});
		const result = await authorizeAccess(deps, req);
		expect(result.ok).toBe(false);
	});
});

describe('authorizeToolCall - edge cases', () => {
	it('allows non-admin token with mcp_labelled: true for specific tool', async () => {
		const deps = createRemoteDeps({
			validateBearerToken: async () => createMockToken({ admin: false, mcp_labelled: true }),
		});
		const req = createMockRequest({
			headers: { authorization: 'Bearer full-scope' },
		});
		const result = await authorizeToolCall(deps, req, 'embedding_search');
		expect(result.ok).toBe(true);
	});
});
