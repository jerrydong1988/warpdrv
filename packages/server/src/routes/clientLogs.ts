import { Router } from 'express';

export const clientLogsRouter = Router();

// POST /api/client-log — receive error logs from frontend
// No auth by design (the app may report errors before auth is possible), so
// bound the payload: arbitrary text here would otherwise be a log-injection
// and memory surface for anyone who can reach the server.
const MAX_LOG_FIELDS = 32;
const MAX_LOG_FIELD_LEN = 4000;

function sanitizeLogField(value: unknown): unknown {
	if (typeof value === 'string') {
		return value.length > MAX_LOG_FIELD_LEN ? value.slice(0, MAX_LOG_FIELD_LEN) + '…[truncated]' : value;
	}
	return value;
}

clientLogsRouter.post('/', (req, res) => {
	try {
		const body = req.body;
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			res.status(400).end();
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

// Bound the accepted body size for the log endpoint
export const clientLogsMaxBodyBytes = MAX_LOG_FIELDS * MAX_LOG_FIELD_LEN;
