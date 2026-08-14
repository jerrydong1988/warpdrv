import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { EventNode, RemoteNode, WSTransport, AppletManager, EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { beApplets, AppletHostBE } from '../applets';
import { isRemote } from '../middleware/auth';
import { validateBearerToken } from '../routes/tokens';
import { store } from '../util/store';
import type { ISettings, IAccessToken } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';
const COOKIE_NAME = 'warpcore_auth';

let warpcoreNode: EventNode | null = null;
let io: IOServer | null = null;
let appletManager: AppletManager | null = null;

/**
 * Allowed browser origins for the realm WebSocket.
 * The dev UI (Vite) and the Tauri webview talk to this server, so both
 * localhost ports are allowed. NEVER fall back to '*' with credentials:
 * that would let any website open a credentialed socket.io session and
 * drive the whole event bus. Override via ALLOWED_REALM_ORIGIN as a
 * comma-separated list of exact origins.
 */
function allowedOrigins(): string[] {
	const env = process.env.ALLOWED_REALM_ORIGIN;
	if (env && env.trim()) {
		return env.split(',').map(s => s.trim()).filter(Boolean);
	}
	return [
		'http://localhost:4400',
		'http://127.0.0.1:4400',
		'http://localhost:3000',
		'http://127.0.0.1:3000',
		'http://localhost:5173',
		'http://127.0.0.1:5173',
	];
}

function parseCookies(header: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx < 0) continue;
		const key = part.slice(0, idx).trim();
		const value = part.slice(idx + 1).trim();
		if (key) out[key] = value;
	}
	return out;
}

export async function initRealm(server: HTTPServer, node: EventNode): Promise<{ node: EventNode; io: IOServer; appletManager: AppletManager }> {
	warpcoreNode = node;

	io = new IOServer(server, {
		path: '/api/realm/',
		cors: {
			origin: allowedOrigins(),
			credentials: true,
		},
	});

	// Authenticate every realm connection: local requests pass unless
	// authRequireForLocalhost is set; remote requests need a valid session
	// cookie or Bearer token (same policy as the HTTP API).
	io.use(async (socket, next) => {
		try {
			const settings = (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
			const req = socket.request as { ip?: string; connection?: { remoteAddress?: string } };
			if (!settings.authRequireForLocalhost && !isRemote(req)) {
				next();
				return;
			}
			const cookies = parseCookies(socket.handshake.headers.cookie);
			const tokenId = cookies[COOKIE_NAME];
			if (tokenId) {
				const tokens = await store.list<IAccessToken>('tokens:');
				if (tokens.some(t => t.id === tokenId)) {
					next();
					return;
				}
			}
			const token = await validateBearerToken(socket.handshake.headers.authorization);
			if (token) {
				next();
				return;
			}
			next(new Error('Unauthorized'));
		} catch {
			next(new Error('Unauthorized'));
		}
	});

	io.on('connection', (socket) => {
		const nodeId = socket.handshake.query.nodeId as string;
		console.log(`[Realm] Connection from ${nodeId}`);

		const transport = new WSTransport(socket);
		const remoteNode = new RemoteNode(nodeId, warpcoreNode!, transport);

		// If a stale node with the same id is still registered (client
		// reconnected before the old socket's disconnect was processed),
		// remove it first — addChild would otherwise fail and the new
		// socket would never be attached.
		warpcoreNode!.removeChild(nodeId).catch((err) => {
			if (err) console.error(`[Realm] removeChild ${nodeId}:`, err);
		}).finally(() => {
			warpcoreNode!.addChild(remoteNode).then(() => {
				console.log(`[Realm] ${nodeId} added as child`);
			}).catch(err => {
				console.error(`[Realm] Failed to add ${nodeId} as child:`, err);
			});
		});

		socket.on('disconnect', () => {
			console.log(`[Realm] ${nodeId} disconnected`);
			warpcoreNode!.removeChild(nodeId);
		});

		socket.on('error', (err) => {
			console.error(`[Realm] ${nodeId} error:`, err);
		});
	});

	appletManager = new AppletManager(
		warpcoreNode,
		EAppletScope.GLOBAL,
		undefined,
		{ [EAppletHostType.BE]: AppletHostBE },
		beApplets,
		{ BEApplet: true },
	);
	await appletManager.initializeAll();
	return { node: warpcoreNode, io, appletManager };
}
