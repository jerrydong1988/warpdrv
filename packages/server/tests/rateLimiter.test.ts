// Unit tests for the in-memory rate limiter.
import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimiter } from '../src/middleware/rateLimiter';

function makeReq(ip: string): Partial<Request> {
	return { ip, socket: { remoteAddress: ip } } as unknown as Partial<Request>;
}

function makeRes() {
	const res = {
		statusCode: 200,
		status: (code: number) => {
			res.statusCode = code;
			return res as unknown as Response;
		},
		json: () => res as unknown as Response,
	} as unknown as Response;
	return res;
}

describe('rateLimiter', () => {
	it('allows requests under the limit', () => {
		const limiter = rateLimiter({ windowMs: 60_000, max: 3 });
		let nextCalls = 0;
		for (let i = 0; i < 3; i++) {
			limiter(makeReq('10.0.0.1') as Request, makeRes(), () => { nextCalls++; });
		}
		expect(nextCalls).toBe(3);
	});

	it('returns 429 once the limit is exceeded', () => {
		const limiter = rateLimiter({ windowMs: 60_000, max: 2 });
		let status = 200;
		const res = {
			statusCode: 200,
			status: (code: number) => { status = code; return res; },
			json: () => res,
		} as unknown as Response;
		let nextCalls = 0;
		for (let i = 0; i < 5; i++) {
			limiter(makeReq('10.0.0.2') as Request, res, () => { nextCalls++; });
		}
		expect(nextCalls).toBe(2);
		expect(status).toBe(429);
	});

	it('tracks clients independently by IP', () => {
		const limiter = rateLimiter({ windowMs: 60_000, max: 1 });
		let nextA = 0;
		let nextB = 0;
		limiter(makeReq('10.0.0.3') as Request, makeRes(), () => { nextA++; });
		limiter(makeReq('10.0.0.4') as Request, makeRes(), () => { nextB++; });
		limiter(makeReq('10.0.0.3') as Request, makeRes(), () => { nextA++; });
		expect(nextA).toBe(1); // 10.0.0.3 exceeded its limit
		expect(nextB).toBe(1); // 10.0.0.4 still allowed
	});

	it('resets the bucket after the window elapses', async () => {
		const limiter = rateLimiter({ windowMs: 20, max: 1 });
		let nextCalls = 0;
		const next = () => { nextCalls++; };
		limiter(makeReq('10.0.0.5') as Request, makeRes(), next);
		limiter(makeReq('10.0.0.5') as Request, makeRes(), next);
		expect(nextCalls).toBe(1);
		await new Promise(r => setTimeout(r, 40));
		limiter(makeReq('10.0.0.5') as Request, makeRes(), next);
		expect(nextCalls).toBe(2);
	});
});
