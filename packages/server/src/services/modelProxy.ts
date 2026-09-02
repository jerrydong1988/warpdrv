import http from 'http';
import express from 'express';
import cors from 'cors';
import busboy from 'busboy';
import { store } from '../util/store';
import { isLocalOrShellOrigin } from '../util/localOrigin';
import type { IServer, ISettings, IWhisperServer } from '@warpcore/shared';
import { EServerStatus, EWhisperServerStatus, DEFAULT_SETTINGS } from '@warpcore/shared';
import { sseManager } from './sseManagerInstance';
import { proxyAuthMiddleware, hasInferenceAccessForToken } from '../middleware/auth';

const SERVERS_PREFIX = 'servers:';
const WHISPER_SERVERS_PREFIX = 'whisperServers:';
const SETTINGS_KEY = 'settings:general';

// Sticky routing: alias -> serverId
const stickyRoutes = new Map<string, string>();

// Store the proxy server instance for dynamic start/stop
let proxyServerInstance: http.Server | null = null;
let proxyError: string | null = null; // in-memory error state

// Find a running server for the given alias
async function resolveServer(alias: string): Promise<IServer | null> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);

	// Filter to servers that have this alias
	const candidates = servers.filter(s =>
		(s.serverAlias ?? []).includes(alias)
	);

	if (candidates.length === 0) return null;

// Check sticky route first
		const stickyId = stickyRoutes.get(alias);
		if (stickyId) {
			const sticky = candidates.find(s => s.id === stickyId && s.status === EServerStatus.RUNNING);
			if (sticky) return sticky;
			// Sticky server is gone, clear it
			stickyRoutes.delete(alias);
			getStickyRoutesResolved().then(routes => {
				sseManager.emit('proxy:routes', { routes });
			}).catch(() => {});
		}

	// Find a running server without error state
	const running = candidates.filter(s => s.status === EServerStatus.RUNNING);
	if (running.length === 0) return null;

	// Prefer servers without recent errors
	const healthy = running.filter(s => !s.error);
	const chosen = healthy.length > 0 ? healthy[0]! : running[0]!;

// Set sticky route
		const oldServerId = stickyRoutes.get(alias);
		if (oldServerId !== chosen.id) {
			stickyRoutes.set(alias, chosen.id);
			getStickyRoutesResolved().then(routes => {
				sseManager.emit('proxy:routes', { routes });
			}).catch(() => {});
		}
		return chosen;
	}

// Get all unique aliases from all servers
async function getAllAliases(): Promise<string[]> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	const aliases = new Set<string>();
	for (const s of servers) {
		for (const a of (s.serverAlias ?? [])) aliases.add(a);
	}
	return [...aliases];
}

// Whisper server resolution
async function resolveWhisperServer(alias: string): Promise<IWhisperServer | null> {
	const servers = await store.list<IWhisperServer>(WHISPER_SERVERS_PREFIX);
	const candidates = servers.filter(s => (s.serverAlias ?? []).includes(alias));
	if (candidates.length === 0) return null;

	const running = candidates.filter(s => s.status === EWhisperServerStatus.RUNNING);
	if (running.length === 0) return null;

	const healthy = running.filter(s => !s.error);
	return healthy.length > 0 ? healthy[0]! : running[0]!;
}

async function getAllWhisperAliases(): Promise<string[]> {
	const servers = await store.list<IWhisperServer>(WHISPER_SERVERS_PREFIX);
	const aliases = new Set<string>();
	for (const s of servers) {
		for (const a of (s.serverAlias ?? [])) aliases.add(a);
	}
	return [...aliases];
}

// How long an upstream (llama.cpp / whisper.cpp) may take to start responding
// before the proxied request is torn down. Generations are long-lived, so this
// is deliberately generous — it exists to stop permanently wedged sockets.
const PROXY_UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000;

// NOTE: this file used to carry two unused helpers (`proxyRequest` and
// `extractModelFromMultipart`) that held security-relevant logic while the
// live handlers did not. They were dead code and have been removed; the /v1/
// handlers below now own those guarantees (client-disconnect propagation,
// upstream timeout, minimal forwarded headers, multipart model extraction via
// busboy over the buffered body). Keeping a second copy of a security-relevant
// helper around is how fixes end up applied to the wrong path.

// Extract model name from request body (for POST requests)
// Needs raw body parsing since we also pipe it through
function extractModelFromBody(req: express.Request): string | null {
	const body = req.body;
	if (body && typeof body === 'object' && typeof body.model === 'string') {
		return body.model;
	}
	return null;
}

export interface IStickyRouteInfo {
	alias: string;
	serverId: string;
	serverName: string | null; // null if server no longer exists
}

// Get sticky routes with resolved server names from store
export async function getStickyRoutesResolved(): Promise<IStickyRouteInfo[]> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	const serverMap = new Map(servers.map(s => [s.id, s.serverName]));

	const routes: IStickyRouteInfo[] = [];
	for (const [alias, serverId] of stickyRoutes.entries()) {
		routes.push({
			alias,
			serverId,
			serverName: serverMap.get(serverId) || null,
		});
	}
	return routes;
}

// Clear a specific sticky route by alias
export function clearStickyRoute(alias: string): boolean {
	const deleted = stickyRoutes.delete(alias);
	if (deleted) {
		getStickyRoutesResolved().then(routes => {
			sseManager.emit('proxy:routes', { routes });
		}).catch(() => {});
	}
	return deleted;
}

// Clear all sticky routes
export function clearAllStickyRoutes(): void {
	stickyRoutes.clear();
	getStickyRoutesResolved().then(routes => {
		sseManager.emit('proxy:routes', { routes });
	}).catch(() => {});
}

// Create the proxy app (shared between start and restart)
function createProxyApp(): express.Express {
	const app = express();

	// Enable CORS for browser clients
	// CORS: do NOT reflect arbitrary origins. The proxy is meant for OpenAI-
	// compatible clients (curl, SDKs, native apps) which send no Origin header and
	// are unaffected. Browsers always send their real Origin; we allow only local /
	// desktop-shell origins so that a random website cannot drive the local proxy
	// (and read its responses) from the user's browser.
	app.use(cors({
		origin(origin, callback) {
			if (!origin) return callback(null, true); // non-browser client (no Origin)
			// Shared with the control plane: localhost on any port + Tauri/Wry.
			return callback(null, isLocalOrShellOrigin(origin) ? origin : false); // ACAO omitted → browser blocks the read
		},
	}));

	// Parse JSON body but keep it available for forwarding.
	// Bounded buffering — an unbounded accumulate would let any client
	// (the proxy binds 0.0.0.0 when remote access is enabled) exhaust memory.
	//
	// Two invariants this buffering must keep:
	//  * Accumulate Buffers and decode ONCE. Appending `chunk.toString()` per
	//    chunk corrupts any multi-byte character straddling a read boundary
	//    (routine for CJK/emoji prompts), and the old `catch { req.body = {} }`
	//    fallback then turned a perfectly valid request into a 400
	//    "Missing model field".
	//  * Only consume JSON-ish bodies. The multipart transcription route reads
	//    the stream itself; consuming it here would leave that handler waiting
	//    on an 'end' event that has already fired.
	const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
	app.use((req, res, next) => {
		const contentType = req.headers['content-type'] ?? '';
		const isJsonish = contentType.trim() === '' || /application\/(?:[\w.+-]+\+)?json/i.test(contentType);
		if (!isJsonish) return next();

		const chunks: Buffer[] = [];
		let rawBytes = 0;
		let tooLarge = false;
		req.on('data', (chunk: Buffer) => {
			if (rawBytes + chunk.length > MAX_PROXY_BODY_BYTES) {
				tooLarge = true;
				req.destroy();
				return;
			}
			chunks.push(chunk);
			rawBytes += chunk.length;
		});
		req.on('end', () => {
			if (tooLarge) return;
			const raw = Buffer.concat(chunks);
			if (raw.length > 0) {
				(req as { _rawBody?: string })._rawBody = raw.toString('utf8');
				// Byte-exact copy for forwarding: never re-encode the client payload.
				(req as { _rawBodyBuffer?: Buffer })._rawBodyBuffer = raw;
				try {
					req.body = JSON.parse(raw.toString('utf8'));
				} catch {
					req.body = {};
				}
			}
			next();
		});
		req.on('error', () => { /* destroyed above */ });
	});

	// Apply auth middleware to all /v1/* routes
	app.use('/v1/', proxyAuthMiddleware);

	// POST /v1/audio/transcriptions — route to whisper server via multipart model field
	app.post('/v1/audio/transcriptions', async (req, res) => {
		// Buffer the entire request body first (bounded — audio uploads are
		// capped at MAX_PROXY_BODY_BYTES to prevent memory exhaustion)
		const chunks: Buffer[] = [];
		let totalBytes = 0;
		await new Promise<void>((resolve, reject) => {
			req.on('data', (chunk: Buffer) => {
				totalBytes += chunk.length;
				if (totalBytes > MAX_PROXY_BODY_BYTES) {
					reject(new Error('Request body too large'));
					req.destroy();
					return;
				}
				chunks.push(chunk);
			});
			req.on('end', resolve);
			req.on('error', reject);
		});
		const body = Buffer.concat(chunks);

		// Parse model field from buffered body using busboy
		const model = await new Promise<string | null>((resolve) => {
			const bb = busboy({ headers: req.headers });
			let found: string | null = null;
			bb.on('field', (name, value) => { if (name === 'model') found = value; });
			bb.on('file', (_name, stream) => { stream.resume(); });
			bb.on('finish', () => resolve(found));
			bb.write(body);
			bb.end();
		});

		if (!model) {
			res.status(400).json({
				error: {
					message: 'Missing "model" field in form data',
					type: 'invalid_request_error',
					code: 400,
				},
			});
			return;
		}

		// Enforce per-token inference access for the extracted model. The proxy's
		// JSON body is not parsed by express.json, so proxyAuthMiddleware cannot see
		// this multipart model; enforce it here using the token it attached. When
		// proxy auth is disabled there is no authToken and no restriction applies.
		const authToken = (req as any).authToken;
		if (authToken && !hasInferenceAccessForToken(authToken, model)) {
			res.status(403).json({ error: { message: 'Access denied for this model', type: 'access_denied', code: 403 } });
			return;
		}

		const server = await resolveWhisperServer(model);

		if (!server) {
			const allAliases = await getAllWhisperAliases();
			const aliasExists = allAliases.includes(model);

			res.status(aliasExists ? 503 : 404).json({
				error: {
					message: aliasExists
						? `No running whisper server for model "${model}"`
						: `Unknown whisper model "${model}". Available: ${allAliases.join(', ') || 'none'}`,
					type: aliasExists ? 'server_unavailable' : 'model_not_found',
					code: aliasExists ? 503 : 404,
				},
			});
			return;
		}

		// Forward buffered body to whisper server
		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: server.port,
			path: req.originalUrl,
			method: req.method,
			headers: {
				'content-type': req.headers['content-type'] ?? 'multipart/form-data',
				'content-length': String(body.length),
				'accept': req.headers.accept ?? '*/*',
			},
		};

		const proxyReq = http.request(options, (proxyRes) => {
			const headers = { ...proxyRes.headers };
			res.writeHead(proxyRes.statusCode ?? 200, headers);
			proxyRes.pipe(res, { end: true });
		});

		proxyReq.setTimeout(PROXY_UPSTREAM_TIMEOUT_MS, () => {
			proxyReq.destroy(new Error(`upstream did not respond within ${PROXY_UPSTREAM_TIMEOUT_MS}ms`));
		});

		let whisperClientGone = false;
		res.on('close', () => {
			if (!res.writableEnded) {
				whisperClientGone = true;
				proxyReq.destroy();
			}
		});

		proxyReq.on('error', (err) => {
			if (whisperClientGone) return; // client aborted; teardown is expected
			if (!res.headersSent) {
				res.status(502).json({
					error: {
						message: `Whisper server not responding: ${err.message}`,
						type: 'proxy_error',
						code: 502,
					},
				});
			} else if (!res.writableEnded) {
				res.end();
			}
		});

		proxyReq.write(body);
		proxyReq.end();
	});

	// GET /v1/models — list all available aliases (llama + whisper)
	app.get('/v1/models', async (_req, res) => {
		const [llamaAliases, whisperAliases] = await Promise.all([getAllAliases(), getAllWhisperAliases()]);
		const seen: Record<string, boolean> = {};
		const uniqueWhisper = whisperAliases.filter(a => seen[a] ? false : (seen[a] = true) as any);
		const all = [...llamaAliases, ...uniqueWhisper];
		res.json({
			object: 'list',
			data: all.map(alias => ({
				id: alias,
				object: 'model',
				created: 0,
				owned_by: 'warpcore',
			})),
		});
	});

	// Catch-all for /v1/* — route by model alias
	// Express 5 router uses different syntax - use a middleware approach
	app.use('/v1/', async (req, res, next) => {
		// Skip the /models endpoint which is handled separately
		if (req.path.startsWith('/models')) {
			return next();
		}
		const model = extractModelFromBody(req);

		if (!model) {
			res.status(400).json({
				error: {
					message: 'Missing "model" field in request body',
					type: 'invalid_request_error',
					code: 400,
				},
			});
			return;
		}

		const server = await resolveServer(model);

		if (!server) {
			const allAliases = await getAllAliases();
			const aliasExists = allAliases.includes(model);

			res.status(aliasExists ? 503 : 404).json({
				error: {
					message: aliasExists
						? `No running server for model "${model}". Start a server with this alias first.`
						: `Unknown model "${model}". Available: ${allAliases.join(', ') || 'none'}`,
					type: aliasExists ? 'server_unavailable' : 'model_not_found',
					code: aliasExists ? 503 : 404,
				},
			});
			return;
		}

		// The body was already consumed for model extraction, so forward the
		// buffered bytes verbatim — never re-encode a client payload.
		const rawBody = (req as { _rawBodyBuffer?: Buffer })._rawBodyBuffer;

		const forwardHeaders: Record<string, string> = {
			'content-type': req.headers['content-type'] ?? 'application/json',
			'accept': req.headers.accept ?? '*/*',
		};
		if (rawBody && rawBody.length > 0) {
			forwardHeaders['content-length'] = String(rawBody.length);
		}

		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: server.port,
			path: req.originalUrl,
			method: req.method,
			headers: forwardHeaders,
		};

		const proxyReq = http.request(options, (proxyRes) => {
			// Copy all response headers
			const headers = { ...proxyRes.headers };
			res.writeHead(proxyRes.statusCode ?? 200, headers);
			// Stream response directly — no buffering
			proxyRes.pipe(res, { end: true });
		});

		// A stalled upstream must not pin the client socket forever: a single
		// llama.cpp generation can stall for minutes.
		proxyReq.setTimeout(PROXY_UPSTREAM_TIMEOUT_MS, () => {
			proxyReq.destroy(new Error(`upstream did not respond within ${PROXY_UPSTREAM_TIMEOUT_MS}ms`));
		});

		// Propagate client disconnects: without this, llama.cpp keeps generating
		// a full completion for a socket nobody is reading (GPU held for nothing).
		let clientGone = false;
		res.on('close', () => {
			if (!res.writableEnded) {
				clientGone = true;
				proxyReq.destroy();
			}
		});

		proxyReq.on('error', (err) => {
			// A teardown caused by the client going away is expected: keep the
			// sticky route warm and do not report a proxy error.
			if (clientGone) return;
			// Server might have died — clear sticky route
			stickyRoutes.delete(model);
			if (!res.headersSent) {
				res.status(502).json({
					error: {
						message: `Model server not responding: ${err.message}`,
						type: 'proxy_error',
						code: 502,
					},
				});
			} else if (!res.writableEnded) {
				// Mid-stream failure after headers: close cleanly instead of hanging.
				res.end();
			}
		});

		// Write the raw body and end
		if (rawBody && rawBody.length > 0) {
			proxyReq.write(rawBody);
		}
		proxyReq.end();
	});

	// Health endpoint for the proxy itself
	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', service: 'warpcore-proxy' });
	});

	return app;
}

export interface StartProxyResult {
	success: boolean;
	server?: http.Server;
	error?: string;
}

export async function startModelProxy(): Promise<StartProxyResult> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

	const app = createProxyApp();
	const port = settings.proxyPort ?? 1234;

	return new Promise((resolve) => {
		const host = settings.proxyHost ?? '127.0.0.1';
		const server = app.listen(port, host, async () => {
			console.log(`[WarpCore] Model proxy listening on ${host}:${port}`);
			proxyServerInstance = server;
			proxyError = null;
			const status = await getProxyStatus();
			sseManager.emit('proxy:update', status);
			resolve({ success: true, server });
		});

		server.on('error', async (err) => {
			const errorMsg = err.message || 'Unknown error';
			console.error(`[WarpCore] Model proxy failed to start: ${errorMsg}`);
			proxyError = errorMsg;
			const status = await getProxyStatus();
			sseManager.emit('proxy:update', status);
			resolve({ success: false, error: errorMsg });
		});
	});
}

export async function stopModelProxy(): Promise<void> {
	if (!proxyServerInstance) {
		proxyError = null;
		console.log('[WarpCore] Model proxy not running');
		return;
	}

	const server = proxyServerInstance;
	proxyServerInstance = null;
	proxyError = null;

	return new Promise(async (resolve) => {
		server.close(async () => {
			console.log('[WarpCore] Model proxy stopped');
			const status = await getProxyStatus();
			sseManager.emit('proxy:update', status);
			resolve();
		});
	});
}

export function getModelProxyInstance(): http.Server | null {
	return proxyServerInstance;
}

export function getProxyError(): string | null {
	return proxyError;
}

export function isProxyOnline(): boolean {
	return proxyServerInstance !== null && proxyError === null;
}

export async function getProxyStatus(): Promise<{ status: any; routes: IStickyRouteInfo[] }> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const running = !!proxyServerInstance;
	const routes = await getStickyRoutesResolved();

	return {
		status: {
			enabled: settings.proxyEnabled,
			port: settings.proxyPort,
			running,
			healthy: running && proxyError === null,
			error: proxyError,
		},
		routes,
	};
}