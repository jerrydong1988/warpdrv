import type { RequestHandler } from 'express';

const WINDOW_MS = 60000;
const MAX_REQUESTS = 300;

const clients = new Map<string, { count: number; resetAt: number }>();

// Periodically prune expired buckets so the map cannot grow without bound
// when many distinct source IPs are seen over a long-running server.
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const pruneTimer = setInterval(() => {
	const now = Date.now();
	for (const [key, client] of clients) {
		if (now > client.resetAt) clients.delete(key);
	}
}, PRUNE_INTERVAL_MS);
pruneTimer.unref?.();

export function rateLimiter(options?: { windowMs?: number; max?: number }): RequestHandler {
	const windowMs = options?.windowMs ?? WINDOW_MS;
	const max = options?.max ?? MAX_REQUESTS;

	return (req, res, next) => {
		const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
		const now = Date.now();
		const client = clients.get(key);

		if (!client || now > client.resetAt) {
			clients.set(key, { count: 1, resetAt: now + windowMs });
			return next();
		}

		client.count++;

		if (client.count > max) {
			return res.status(429).json({
				ok: false,
				data: null,
				error: 'Too many requests. Please try again later.',
			});
		}

		next();
	};
}

