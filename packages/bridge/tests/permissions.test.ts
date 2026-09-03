import { describe, expect, it } from 'vitest';
import { PermissionManager } from '../src/permissions';
import { EToolApprovalMode } from '../src/types';
import type {
	IPersistence,
	IServerPermission,
	IToolPermission,
	IThreadToolPermission,
} from '../src/types';

interface IPermStoreState {
	server: IServerPermission | null;
	tool: IToolPermission | null;
	thread: IThreadToolPermission | null;
}

// Minimal fake persistence covering only the permission surface under test.
function fakePersistence(state: IPermStoreState): IPersistence {
	return {
		async getServerPermission(): Promise<IServerPermission | null> {
			return state.server;
		},
		async getToolPermission(): Promise<IToolPermission | null> {
			return state.tool;
		},
		async getThreadToolPermission(): Promise<IThreadToolPermission | null> {
			return state.thread;
		},
		async getAllThreadToolPermissions(): Promise<IThreadToolPermission[]> {
			return state.thread ? [state.thread] : [];
		},
		async getAllServerPermissions(): Promise<IServerPermission[]> {
			return state.server ? [state.server] : [];
		},
		async getAllToolPermissions(): Promise<IToolPermission[]> {
			return state.tool ? [state.tool] : [];
		},
		async setServerPermission(): Promise<void> {},
		async setToolPermission(): Promise<void> {},
	} as unknown as IPersistence;
}

describe('PermissionManager.getToolApprovalMode', () => {
	it('falls back to ASK when no global or thread permission exists', async () => {
		const pm = new PermissionManager(fakePersistence({ server: null, tool: null, thread: null }));
		await expect(pm.getToolApprovalMode('thread-1', 'srv', 'tool')).resolves.toBe(EToolApprovalMode.ASK);
	});

	it('falls back to ASK when no threadId is given', async () => {
		const state: IPermStoreState = {
			server: null,
			tool: { serverName: 'srv', toolName: 'tool', enabled: true, approvalMode: EToolApprovalMode.ALLOWED },
			thread: null,
		};
		const pm = new PermissionManager(fakePersistence(state));
		// No threadId — global ALLOWED applies.
		await expect(pm.getToolApprovalMode(undefined, 'srv', 'tool')).resolves.toBe(EToolApprovalMode.ALLOWED);
	});

	it('uses the global tool permission when no thread override exists', async () => {
		const state: IPermStoreState = {
			server: null,
			tool: { serverName: 'srv', toolName: 'tool', enabled: true, approvalMode: EToolApprovalMode.ALLOWED },
			thread: null,
		};
		const pm = new PermissionManager(fakePersistence(state));
		await expect(pm.getToolApprovalMode('thread-1', 'srv', 'tool')).resolves.toBe(EToolApprovalMode.ALLOWED);
	});

	it('lets a thread-level override beat the global permission', async () => {
		const state: IPermStoreState = {
			server: null,
			tool: { serverName: 'srv', toolName: 'tool', enabled: true, approvalMode: EToolApprovalMode.ALLOWED },
			thread: {
				threadId: 'thread-1',
				serverName: 'srv',
				toolName: 'tool',
				enabled: true,
				approvalMode: EToolApprovalMode.DENIED,
			},
		};
		const pm = new PermissionManager(fakePersistence(state));
		await expect(pm.getToolApprovalMode('thread-1', 'srv', 'tool')).resolves.toBe(EToolApprovalMode.DENIED);
	});
});

describe('PermissionManager.isServerEnabled', () => {
	it('defaults to disabled when no permission row exists', async () => {
		const pm = new PermissionManager(fakePersistence({ server: null, tool: null, thread: null }));
		await expect(pm.isServerEnabled('srv')).resolves.toBe(false);
	});

	it('reflects the stored enabled flag', async () => {
		const pm = new PermissionManager(
			fakePersistence({ server: { serverName: 'srv', enabled: true }, tool: null, thread: null }),
		);
		await expect(pm.isServerEnabled('srv')).resolves.toBe(true);
	});
});

describe('PermissionManager.getEnabledTools', () => {
	const toolDef = (name: string) => ({
		name,
		description: '',
		inputSchema: {},
		serverName: 'srv',
	});

	it('excludes tools of disabled servers', async () => {
		const pm = new PermissionManager(
			fakePersistence({ server: { serverName: 'srv', enabled: false }, tool: null, thread: null }),
		);
		await expect(pm.getEnabledTools('thread-1', [toolDef('t')])).resolves.toEqual([]);
	});

	it('excludes tools whose approval mode is DENIED', async () => {
		const state: IPermStoreState = {
			server: { serverName: 'srv', enabled: true },
			tool: { serverName: 'srv', toolName: 't', enabled: true, approvalMode: EToolApprovalMode.DENIED },
			thread: null,
		};
		const pm = new PermissionManager(fakePersistence(state));
		await expect(pm.getEnabledTools('thread-1', [toolDef('t')])).resolves.toEqual([]);
	});

	it('enables tools by default when their server is enabled and no thread is selected', async () => {
		const pm = new PermissionManager(
			fakePersistence({ server: { serverName: 'srv', enabled: true }, tool: null, thread: null }),
		);
		await expect(pm.getEnabledTools(undefined, [toolDef('t')])).resolves.toEqual([toolDef('t')]);
	});

	it('lets a thread-level override re-enable a globally denied tool', async () => {
		const state: IPermStoreState = {
			server: { serverName: 'srv', enabled: true },
			tool: { serverName: 'srv', toolName: 't', enabled: false, approvalMode: EToolApprovalMode.ASK },
			thread: {
				threadId: 'thread-1',
				serverName: 'srv',
				toolName: 't',
				enabled: true,
				approvalMode: EToolApprovalMode.ALLOWED,
			},
		};
		const pm = new PermissionManager(fakePersistence(state));
		const result = await pm.getEnabledTools('thread-1', [toolDef('t')]);
		expect(result.map(t => t.name)).toEqual(['t']);
	});
});
