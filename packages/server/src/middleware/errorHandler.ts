import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
	// Log the real error — swallowing it silently made every runtime failure
	// invisible in production logs.
	console.error('[WarpCore] Unhandled request error:', err instanceof Error ? err.stack ?? err.message : err);

	if (res.headersSent) {
		_next(err);
		return;
	}

	res.status(500).json({
		ok: false,
		data: null,
		error: 'Internal server error',
	});
};

