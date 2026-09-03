import { describe, expect, it, vi } from 'vitest';
import { syncAutostart } from '../src/utils/autostart';
import { isMcpServerEnabled, isMcpToolEnabled } from '../src/utils/mcpPermissions';

describe('MCP permission presentation', () => {
	it('treats a missing server permission as disabled like the bridge', () => {
		expect(isMcpServerEnabled('warpmcp', [])).toBe(false);
	});

	it('uses the persisted server permission', () => {
		expect(isMcpServerEnabled('warpmcp', [{ serverName: 'warpmcp', enabled: true }])).toBe(true);
		expect(isMcpServerEnabled('warpmcp', [{ serverName: 'warpmcp', enabled: false }])).toBe(false);
	});

	it('excludes disabled and denied tools', () => {
		expect(isMcpToolEnabled('warpmcp', 'shell_exec', [])).toBe(true);
		expect(isMcpToolEnabled('warpmcp', 'shell_exec', [{
			serverName: 'warpmcp',
			toolName: 'shell_exec',
			enabled: false,
			approvalMode: 'ASK',
		}])).toBe(false);
		expect(isMcpToolEnabled('warpmcp', 'shell_exec', [{
			serverName: 'warpmcp',
			toolName: 'shell_exec',
			enabled: true,
			approvalMode: 'DENIED',
		}])).toBe(false);
	});
});

describe('autostart synchronization', () => {
	it('does not disable an already-disabled Windows registration', async () => {
		const api = {
			isEnabled: vi.fn().mockResolvedValue(false),
			enable: vi.fn().mockResolvedValue(undefined),
			disable: vi.fn().mockRejectedValue(new Error('registry value not found')),
		};

		await expect(syncAutostart(api, false)).resolves.toBe(false);
		expect(api.disable).not.toHaveBeenCalled();
		expect(api.enable).not.toHaveBeenCalled();
	});

	it('enables only when the requested state differs', async () => {
		const api = {
			isEnabled: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
			enable: vi.fn().mockResolvedValue(undefined),
			disable: vi.fn().mockResolvedValue(undefined),
		};

		await expect(syncAutostart(api, true)).resolves.toBe(true);
		expect(api.enable).toHaveBeenCalledOnce();
		expect(api.disable).not.toHaveBeenCalled();
	});

	it('disables only when the requested state differs', async () => {
		const api = {
			isEnabled: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
			enable: vi.fn().mockResolvedValue(undefined),
			disable: vi.fn().mockResolvedValue(undefined),
		};

		await expect(syncAutostart(api, false)).resolves.toBe(false);
		expect(api.disable).toHaveBeenCalledOnce();
		expect(api.enable).not.toHaveBeenCalled();
	});
});
