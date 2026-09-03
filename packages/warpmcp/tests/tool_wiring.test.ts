// Regression tests for the deps→handler wiring in buildToolEntries.
// In particular: shell_exec MUST receive deps.getFsAllowedRoots(). A previous
// regression registered it without deps, which silently disabled the absolute-
// path/cwd sandbox the tool description promises (the per-handler unit tests
// call shellExecHandler directly with roots and therefore never caught it).
import { describe, it, expect } from 'vitest';
import { buildToolEntries } from '../src/index';
import type { IWarpmcpDeps } from '../src/types';

function makeDeps(fsAllowedRoots: string[]): IWarpmcpDeps {
	// Only the field the shell_exec handler consumes matters for this test;
	// the remaining dep slots are satisfied by the cast.
	return {
		getFsAllowedRoots: () => fsAllowedRoots,
	} as unknown as IWarpmcpDeps;
}

function findHandler(deps: IWarpmcpDeps, toolName: string): (args: Record<string, unknown>) => Promise<unknown> {
	const entry = buildToolEntries(deps).find(e => (e.def as { name?: string }).name === toolName);
	expect(entry).toBeDefined();
	return entry!.handler as (args: Record<string, unknown>) => Promise<unknown>;
}

describe('buildToolEntries wiring', () => {
	it('shell_exec handler enforces fsAllowedRoots for absolute paths', async () => {
		const handler = findHandler(makeDeps(['/safe-root']), 'shell_exec');
		await expect(handler({ command: 'cat /etc/passwd' })).rejects.toThrow(/outside the allowed roots/);
	});

	// Real process spawn — cold CI runners (AV scan, node startup) have
	// exceeded vitest's default 5s here; allow a generous ceiling.
	it('shell_exec handler runs allowlisted commands without absolute paths', async () => {
		const handler = findHandler(makeDeps(['/safe-root']), 'shell_exec');
		const result = await handler({ command: 'node --version' }) as { exitCode: number | null };
		expect(result.exitCode).toBe(0);
	}, 15000);

	it('dir_list handler also receives deps (rejects paths outside roots)', async () => {
		const handler = findHandler(makeDeps(['/safe-root']), 'dir_list');
		await expect(handler({ path: '/etc' })).rejects.toThrow();
	});
});
