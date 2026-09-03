import { Response, NextFunction } from 'express';
import { store } from '../util/store';
import { validateBearerToken } from '../routes/tokens';
import type { IAccessToken, ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import {
	hasInferenceAccessForToken,
	hasMcpInlineAccessForToken,
	hasMcpLabelledAccessForToken,
	isRemoteRequest,
	shouldRequireAuthForRequest,
} from '../util/access';

const SETTINGS_KEY = 'settings:general';
const COOKIE_NAME = 'warpcore_auth';

// Token capability checks are implemented once in util/access and re-exported
// here so existing callers keep working.
export { hasInferenceAccessForToken, hasMcpLabelledAccessForToken, hasMcpInlineAccessForToken };

// Check if request is from a remote host (not localhost)
export function isRemote(req: { ip?: string; connection?: { remoteAddress?: string } }): boolean {
	return isRemoteRequest(req);
}

// Check if auth should be required for this request. Delegates to util/access so
// the "bound to a non-loopback interface" case (where a reverse proxy makes a
// network request look local) is applied consistently.
export async function shouldRequireAuth(req: { ip?: string; connection?: { remoteAddress?: string } }): Promise<boolean> {
	return shouldRequireAuthForRequest(req, await getSettings());
}

// Get current settings
async function getSettings(): Promise<ISettings> {
	return (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}

// Check if user has admin access via cookie or token
export async function hasAdminAccess(req: { cookies?: Record<string, string>; headers?: Record<string, string>; ip?: string; connection?: { remoteAddress: string } }): Promise<boolean> {
	const settings = await getSettings();

	// If not requiring auth (localhost and authRequireForLocalhost is false), allow
	if (!await shouldRequireAuth(req)) return true;

	// Check if any auth is enabled
	if (!settings.apiAuthEnabled && !settings.proxyAuthEnabled) return true;

	// Check cookie first
	const cookieId = req.cookies?.[COOKIE_NAME];
	if (cookieId) {
		const tokens = await store.list<IAccessToken>('tokens:');
		const token = tokens.find(t => t.id === cookieId);
		if (token?.admin) return true;
	}

	// Check Bearer token
	const token = await validateBearerToken(req.headers?.authorization);
	if (token?.admin) return true;

	return false;
}

// Auth middleware for /api/* routes
export async function authMiddleware(req: any, res: Response, next: NextFunction): Promise<void> {
	const settings = await getSettings();

	// Bypass auth if:
	// 1. authRequireForLocalhost is false AND request is from localhost
	//    (a non-loopback apiHost always requires auth — see util/access)
	// 2. apiAuthEnabled is false
	// (2) is a deliberate global kill switch, so it also covers remote peers.
	// Running it with apiHost bound to a LAN address exposes the control plane,
	// which can start servers and run recipes; startup warns loudly about that
	// combination instead of silently overriding the user's setting.
	if (!await shouldRequireAuth(req) || !settings.apiAuthEnabled) {
		next();
		return;
	}

	// Check cookie auth
	if (req.cookies?.[COOKIE_NAME]) {
		const tokens = await store.list<IAccessToken>('tokens:');
		const token = tokens.find(t => t.id === req.cookies[COOKIE_NAME]);
		if (token) {
			next();
			return;
		}
	}

	// Check Bearer token
	const token = await validateBearerToken(req.headers?.authorization);
	if (token) {
		next();
		return;
	}

	res.status(401).json({ ok: false, data: null, error: 'Authentication required' });
}

// Admin-only middleware: must be mounted AFTER authMiddleware.
// Gates control-plane routes (tokens, settings, backends, recipes, MCP config,
// downloads, servers) so that non-admin (inference-only) tokens cannot
// escalate privileges or reach arbitrary command execution.
export async function adminMiddleware(req: any, res: Response, next: NextFunction): Promise<void> {
	if (await hasAdminAccess(req)) {
		next();
		return;
	}
	res.status(403).json({ ok: false, data: null, error: 'Admin access required' });
}

// Auth middleware for /v1/* proxy routes
export async function proxyAuthMiddleware(req: any, res: Response, next: NextFunction): Promise<void> {
	const settings = await getSettings();

	// Bypass auth if:
	// 1. authRequireForLocalhost is false AND request is from localhost
	// 2. proxyAuthEnabled is false
	if (!await shouldRequireAuth(req) || !settings.proxyAuthEnabled) {
		next();
		return;
	}

	// Check Bearer token (proxy uses Bearer auth, not cookies)
	const token = await validateBearerToken(req.headers?.authorization);

	if (!token) {
		res.status(401).json({
			ok: false,
			data: null,
			error: 'Authentication required',
		});
		return;
	}

	// Check if token has inference access. The proxy sub-app does not mount
	// express.json(), so req.body is not populated here; derive the model from the
	// raw body captured by the proxy's raw-body middleware (JSON requests). For
	// multipart uploads the route enforces per-model access after extraction.
	let model: string | undefined = typeof req.body?.model === 'string' ? req.body.model : undefined;
	if (!model) {
		const raw = req._rawBody;
		if (typeof raw === 'string' && raw.length > 0) {
			try {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed.model === 'string') model = parsed.model;
			} catch { /* not JSON (e.g. multipart) — route handles it */ }
		}
	}
	if (model && !hasInferenceAccessForToken(token, model)) {
		res.status(403).json({
			ok: false,
			data: null,
			error: 'Access denied for this model',
		});
		return;
	}

	// Attach token to request for downstream use
	(req as any).authToken = token;
	next();
}
