import { describe, expect, it } from 'vitest';
import { ElicitationRegistry } from '../src/mcp/elicitationRegistry';
import type { IElicitationResponse } from '../src/types';

const accept: IElicitationResponse = { action: 'accept' };

describe('ElicitationRegistry', () => {
	it('register returns a Promise', () => {
		const registry = new ElicitationRegistry();
		const pending = registry.register('req-1', 'server-a');
		expect(pending).toBeInstanceOf(Promise);
		expect(registry.has('req-1')).toBe(true);
	});

	it('resolve settles the pending promise with the response and returns true', async () => {
		const registry = new ElicitationRegistry();
		const pending = registry.register('req-1', 'server-a');
		const response: IElicitationResponse = { action: 'accept', content: { name: 'Ada' } };

		expect(registry.resolve('req-1', response)).toBe(true);
		await expect(pending).resolves.toEqual(response);
		expect(registry.has('req-1')).toBe(false);
	});

	it('resolve returns false for an unknown id', () => {
		const registry = new ElicitationRegistry();
		expect(registry.resolve('missing', accept)).toBe(false);
	});

	it('has reflects only pending entries', () => {
		const registry = new ElicitationRegistry();
		expect(registry.has('req-1')).toBe(false);

		void registry.register('req-1', 'server-a');
		expect(registry.has('req-1')).toBe(true);

		expect(registry.resolve('req-1', accept)).toBe(true);
		expect(registry.has('req-1')).toBe(false);
	});

	it('cancelAllForServer rejects with Cancelled, clears entries and returns cancelled ids', async () => {
		const registry = new ElicitationRegistry();
		const a1 = registry.register('req-1', 'server-a');
		const a2 = registry.register('req-2', 'server-a');
		const b1 = registry.register('req-3', 'server-b');

		const cancelled = registry.cancelAllForServer('server-a');
		expect(cancelled.sort()).toEqual(['req-1', 'req-2']);

		await expect(a1).rejects.toThrow('Cancelled');
		await expect(a2).rejects.toThrow('Cancelled');

		expect(registry.has('req-1')).toBe(false);
		expect(registry.has('req-2')).toBe(false);
		// Other server untouched
		expect(registry.has('req-3')).toBe(true);
		expect(registry.resolve('req-3', { action: 'decline' })).toBe(true);
		await expect(b1).resolves.toEqual({ action: 'decline' });
	});

	it('cancelAllForServer with no matches returns []', () => {
		const registry = new ElicitationRegistry();
		expect(registry.cancelAllForServer('server-a')).toEqual([]);
	});

	it('re-registering the same id overwrites the previous entry', async () => {
		const registry = new ElicitationRegistry();
		void registry.register('req-1', 'server-a');
		const second = registry.register('req-1', 'server-b');

		// The registry now only knows about the server-b entry.
		expect(registry.cancelAllForServer('server-a')).toEqual([]);
		expect(registry.has('req-1')).toBe(true);

		// Resolving settles the replacement promise.
		expect(registry.resolve('req-1', accept)).toBe(true);
		await expect(second).resolves.toEqual(accept);
		expect(registry.has('req-1')).toBe(false);
	});
});
