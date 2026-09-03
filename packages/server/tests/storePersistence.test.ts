// Regression tests for the JSON store's write path.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let dir: string;
let store: typeof import('../src/util/store').store;
const DB_FILE = 'warpcore-data.json';

beforeAll(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpcore-store-'));
	// store.ts resolves its paths at import time, so the data dir must be set
	// before the module is loaded — hence the dynamic import.
	process.env.WARPCORE_DATA_DIR = dir;
	({ store } = await import('../src/util/store'));
});

afterAll(() => {
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
	delete process.env.WARPCORE_DATA_DIR;
});

describe('store persistence', () => {
	it('round-trips a value and persists it to disk', async () => {
		await store.put('settings:test', { a: 1 });
		expect(await store.get<{ a: number }>('settings:test')).toEqual({ a: 1 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(dir, DB_FILE), 'utf8'));
		expect(JSON.parse(onDisk['settings:test'])).toEqual({ a: 1 });
	});

	it('rejects an oversized write without mutating state', async () => {
		await store.put('keep:me', { untouched: true });

		// MAX_DB_BYTES in store.ts is 50 MB; this payload exceeds it.
		const oversized = 'x'.repeat(51 * 1024 * 1024);
		await expect(store.put('junk:oversized', oversized)).rejects.toThrow(/exceed/);

		// Memory must not believe the write happened…
		expect(await store.get('junk:oversized')).toBeNull();
		// …and neither may the file.
		const onDisk = JSON.parse(fs.readFileSync(path.join(dir, DB_FILE), 'utf8'));
		expect(onDisk['junk:oversized']).toBeUndefined();
		expect(JSON.parse(onDisk['keep:me'])).toEqual({ untouched: true });
	});

	it('still accepts later writes after a rejected one', async () => {
		// Guards the rollback: before it, a single oversized value poisoned the
		// in-memory DB and every subsequent save() failed for the same reason.
		await store.put('junk:big', 'y'.repeat(51 * 1024 * 1024)).catch(() => undefined);
		await expect(store.put('after:failure', { ok: true })).resolves.toBeUndefined();
		expect(await store.get('after:failure')).toEqual({ ok: true });
	});

	it('deletes a key and persists the deletion', async () => {
		await store.put('temp:key', { v: 1 });
		await store.del('temp:key');
		expect(await store.get('temp:key')).toBeNull();
		const onDisk = JSON.parse(fs.readFileSync(path.join(dir, DB_FILE), 'utf8'));
		expect(onDisk['temp:key']).toBeUndefined();
	});
});
