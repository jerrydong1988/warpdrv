// Integration tests for the auth router over real HTTP: token rejection and
// the login rate limit that guards bcrypt comparisons. Mounts the router in a
// throwaway express app on an ephemeral port — no extra dependencies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';
import express from 'express';

let dir: string;
let authRouter: express.Router;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpcore-auth-'));
	// store.ts resolves its paths at import time, so the data dir must be set
	// before the module is loaded — hence the dynamic import.
	process.env.WARPCORE_DATA_DIR = dir;
	({ authRouter } = await import('../src/routes/auth'));

	const app = express();
	app.use(express.json());
	app.use('/auth', authRouter);
	await new Promise<void>((resolve) => {
		server = app.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address() as { port: number };
	baseUrl = `http://127.0.0.1:${address.port}/auth`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
	delete process.env.WARPCORE_DATA_DIR;
});

describe('auth routes', () => {
	it('rejects login without a valid bearer token', async () => {
		const res = await fetch(`${baseUrl}/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(401);
		const body = await res.json() as { ok: boolean; error: string };
		expect(body.ok).toBe(false);
		expect(body.error).toBe('Invalid token');
	});

	it('throttles repeated login attempts per IP', async () => {
		// The login limiter allows at most 10 attempts per window. Iterate
		// until the 429 arrives (order-independent: earlier tests in this file
		// may have consumed part of the shared budget) and assert that at most
		// 10 attempts were answered with 401 before the throttle engaged.
		let rejected = 0;
		let throttled = false;
		for (let i = 0; i < 15 && !throttled; i++) {
			const res = await fetch(`${baseUrl}/login`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: 'Bearer wc_00000000000000000000000000000000',
				},
				body: JSON.stringify({}),
			});
			if (res.status === 429) {
				throttled = true;
				const body = await res.json() as { ok: boolean; error: string };
				expect(body.ok).toBe(false);
				expect(body.error).toBe('Too many requests. Please try again later.');
				break;
			}
			expect(res.status).toBe(401);
			rejected++;
		}
		expect(throttled).toBe(true);
		expect(rejected).toBeLessThanOrEqual(10);
	});

	it('reports authenticated when auth is not required (loopback default)', async () => {
		const res = await fetch(`${baseUrl}/check`);
		expect(res.status).toBe(200);
		const body = await res.json() as { ok: boolean; data: { authenticated: boolean } };
		expect(body.ok).toBe(true);
		expect(body.data.authenticated).toBe(true);
	});
});
