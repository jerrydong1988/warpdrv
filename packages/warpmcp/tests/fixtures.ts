import type { IWarpmcpDeps, IEmbeddingSearchResult } from '../src/types';
import type { IAccessToken, ITodoItem } from '@warpcore/shared';
import type { Request } from 'express';

export function createMockDeps(overrides?: Partial<IWarpmcpDeps>): IWarpmcpDeps {
	return {
		isRemote: overrides?.isRemote ?? (() => false),
		validateBearerToken: overrides?.validateBearerToken ?? (async () => null),
		getFsAllowedRoots: overrides?.getFsAllowedRoots ?? (() => []),
		embeddingSearch: overrides?.embeddingSearch ?? (async () => []),
		todoRead: overrides?.todoRead ?? (async () => []),
		todoAdd: overrides?.todoAdd ?? (async () => []),
		todoRemove: overrides?.todoRemove ?? (async () => []),
		todoUpdate: overrides?.todoUpdate ?? (async () => []),
		todoClear: overrides?.todoClear ?? (async () => []),
	};
}

export function createMockToken(overrides?: Partial<IAccessToken>): IAccessToken {
	return {
		id: 'test-token-id',
		user_id: 'test-user',
		label: 'test-label',
		scopes: ['read', 'write'],
		expires_at: Date.now() + 3600000,
		created_at: Date.now(),
		admin: overrides?.admin ?? false,
		mcp_labelled: overrides?.mcp_labelled ?? false,
		...overrides,
	};
}

export function createMockRequest(overrides?: Partial<Request> & { ip?: string; remoteAddress?: string }): Request {
	const ip = overrides?.ip ?? '127.0.0.1';
	const remoteAddress = overrides?.remoteAddress ?? '127.0.0.1';
	return {
		headers: {
			authorization: overrides?.headers?.authorization,
			'mcp-session-id': overrides?.headers?.['mcp-session-id'],
			...overrides?.headers,
		},
		method: overrides?.method ?? 'GET',
		body: overrides?.body ?? {},
		ip,
		connection: { remoteAddress },
		...overrides,
	} as Request;
}

export function createAdminDeps(): IWarpmcpDeps {
	return createMockDeps({
		validateBearerToken: async () => createMockToken({ admin: true }),
	});
}

export function createScopedDeps(scopes: string[]): IWarpmcpDeps {
	return createMockDeps({
		validateBearerToken: async () => createMockToken({ mcp_labelled: scopes }),
	});
}

export function createRemoteDeps(overrides?: Partial<IWarpmcpDeps>): IWarpmcpDeps {
	return createMockDeps({
		...overrides,
		isRemote: (req) => {
			const isRemote = req.ip !== '127.0.0.1' && req.connection?.remoteAddress !== '127.0.0.1';
			return overrides?.isRemote
				? overrides.isRemote(req) || isRemote
				: isRemote;
		},
	});
}

export function createMockEmbeddingResult(overrides?: Partial<IEmbeddingSearchResult>): IEmbeddingSearchResult {
	return {
		messageId: overrides?.messageId ?? 'msg-001',
		text: overrides?.text ?? 'test result',
		distance: overrides?.distance ?? 0.1,
		...overrides,
	};
}

export function createMockTodoItem(overrides?: Partial<ITodoItem>): ITodoItem {
	return {
		id: overrides?.id ?? 'todo-001',
		thread_id: overrides?.thread_id ?? 'thread-001',
		content: overrides?.content ?? 'Test todo',
		status: overrides?.status ?? 'pending',
		created_at: overrides?.created_at ?? new Date().toISOString(),
		updated_at: overrides?.updated_at ?? new Date().toISOString(),
		...overrides,
	};
}
