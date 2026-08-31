import { Router, json } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';

export const clientLogsRouter = Router();

// POST /api/client-log — receive error logs from frontend
// No auth by design (the app may report errors before auth is possible), so
// bound the payload: arbitrary text here would otherwise be a log-injection
// and memory surface for anyone who can reach the server.
const MAX_LOG_FIELDS = 32;
const MAX_LOG_FIELD_LEN = 4000;

/**
 * Body parser for this route only. The app-wide parser allows 32 MB (model
 * metadata, chat transcripts); a log line never needs more than a few KB, and an
 * unauthenticated endpoint must not double as a 32 MB memory amplifier. It is
 * mounted in front of the global parser (see index.ts) so it wins: whichever
 * parser runs first owns the body and later parsers no-op.
 */
export const clientLogsBodyParser = json({ limit: '16kb' });

/** Requests a single client may post per window before receiving a 429. */
const CLIENT_LOG_WINDOW_MS = 60_000;
const CLIENT_LOG_MAX_REQUESTS = 30;

function sanitizeLogField(value: unknown): unknown {
	if (typeof value === 'string') {
		return value.length > MAX_LOG_FIELD_LEN ? value.slice(0, MAX_LOG_FIELD_LEN) + '…[truncated]' : value;
	}
	return value;
}

clientLogsRouter.post('/', rateLimiter({ windowMs: CLIENT_LOG_WINDOW_MS, max: CLIENT_LOG_MAX_REQUESTS }), (req, res) => {
	try {
		const body = req.body;
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			res.status(400).end();
			return;
		}
		// Cap the shape as well as each field: an unbounded key count turns every
		// reported error into an unbounded console write.
		if (Object.keys(body).length > MAX_LOG_FIELDS) {
			res.status(413).end();
			return;
		}
		const { level, message, stack, url, extra } = body as Record<string, unknown>;
		console.error('[client]', {
			level: sanitizeLogField(level),
			message: sanitizeLogField(message),
			stack: sanitizeLogField(stack),
			url: sanitizeLogField(url),
			extra: extra !== undefined && typeof extra === 'object'
				? JSON.stringify(extra).slice(0, MAX_LOG_FIELD_LEN)
				: sanitizeLogField(extra),
		});
		res.status(204).end();
	} catch {
		res.status(400).end();
	}
});
