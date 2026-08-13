import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (_err, _req, res, _next) => {
	if (res.headersSent) {
		_next(_err);
		return;
	}

	res.status(500).json({
		ok: false,
		data: null,
		error: 'Internal server error',
	});
};

