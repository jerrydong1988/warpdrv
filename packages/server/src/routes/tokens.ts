import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { store } from '../util/store';
import type { IAccessToken, IAccessTokenInfo, IAccessTokenCreatePayload, IAccessTokenUpdatePayload } from '@warpcore/shared';

export const tokensRouter = Router();

const TOKEN_PREFIX = 'tokens:';
const SALT_ROUNDS = 10;

// Generate a random token string with wc_ prefix
function generateToken(): string {
	return 'wc_' + crypto.randomBytes(32).toString('hex');
}

// Strip tokenHash from stored token before returning to client
function toInfo(token: IAccessToken): IAccessTokenInfo {
	return {
		id: token.id,
		name: token.name,
		tokenPrefix: token.tokenPrefix,
		admin: token.admin,
		inference: token.inference,
		mcp_labelled: token.mcp_labelled,
		mcp_inline: token.mcp_inline,
		createdAt: token.createdAt,
	};
}

// GET /api/tokens - list all tokens (without hashes)
tokensRouter.get('/', async (_req, res) => {
	const tokens = await store.list<IAccessToken>(TOKEN_PREFIX);
	const infos = tokens.map(toInfo);
	res.json({ ok: true, data: infos, total: infos.length, error: null });
});

// POST /api/tokens - create a new token
tokensRouter.post('/', async (req, res) => {
	const body = req.body as IAccessTokenCreatePayload;
	if (!body.name || body.name.trim().length === 0) {
		res.status(400).json({ ok: false, data: null, error: 'Token name is required' });
		return;
	}

	const rawToken = generateToken();
	const tokenHash = await bcrypt.hash(rawToken, SALT_ROUNDS);
	const id = crypto.randomUUID();

	// Validate: mcp only valid if inference is set
	let mcpLabelled = body.mcp_labelled;
	let mcpInline = body.mcp_inline;
	if (!body.inference && !body.admin) {
		mcpLabelled = false as unknown as true | string[];
		mcpInline = false as unknown as true | string[];
	}

	const token: IAccessToken = {
		id,
		name: body.name.trim(),
		tokenHash,
		tokenPrefix: rawToken.substring(0, 11), // "wc_" + 8 hex chars
		admin: body.admin ?? false,
		inference: body.admin ? true : (body.inference ?? false as unknown as true | string[]),
		mcp_labelled: body.admin ? true : (mcpLabelled ?? false as unknown as true | string[]),
		mcp_inline: body.admin ? true : (mcpInline ?? false as unknown as true | string[]),
		createdAt: Date.now(),
	};

	await store.put(`${TOKEN_PREFIX}${id}`, token);

	res.json({
		ok: true,
		data: {
			token: rawToken, // shown once, never again
			info: toInfo(token),
		},
		error: null,
	});
});

// PUT /api/tokens/:id - update token permissions (not the token string itself)
tokensRouter.put('/:id', async (req, res) => {
	const existing = await store.get<IAccessToken>(`${TOKEN_PREFIX}${req.params.id}`);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Token not found' });
		return;
	}

	const body = req.body as IAccessTokenUpdatePayload;
	const updated: IAccessToken = {
		...existing,
		name: body.name?.trim() ?? existing.name,
		admin: body.admin ?? existing.admin,
		inference: body.admin ? true : (body.inference ?? existing.inference),
		mcp_labelled: body.admin ? true : (body.mcp_labelled ?? existing.mcp_labelled),
		mcp_inline: body.admin ? true : (body.mcp_inline ?? existing.mcp_inline),
	};

	await store.put(`${TOKEN_PREFIX}${req.params.id}`, updated);
	res.json({ ok: true, data: toInfo(updated), error: null });
});

// DELETE /api/tokens/:id - revoke a token
tokensRouter.delete('/:id', async (req, res) => {
	const existing = await store.get<IAccessToken>(`${TOKEN_PREFIX}${req.params.id}`);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Token not found' });
		return;
	}

	await store.del(`${TOKEN_PREFIX}${req.params.id}`);
	res.json({ ok: true, data: null, error: null });
});

// ============================================================
// Token validation utility (for use by other middleware)
// ============================================================

export async function validateBearerToken(authHeader: string | undefined): Promise<IAccessToken | null> {
	if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
	const rawToken = authHeader.substring(7);
	if (!rawToken) return null;

	const tokens = await store.list<IAccessToken>(TOKEN_PREFIX);

	// Fast pre-filter: only compare bcrypt hashes for tokens whose stored
	// tokenPrefix (the first 11 chars of the raw token) matches. Previously
	// every request ran bcrypt.compare against EVERY token — a CPU-bound DoS
	// surface (bcrypt is deliberately slow) on any authenticated endpoint.
	const rawPrefix = rawToken.substring(0, 11);
	for (const token of tokens) {
		if (token.tokenPrefix !== rawPrefix) continue;
		const match = await bcrypt.compare(rawToken, token.tokenHash);
		if (match) return token;
	}
	return null;
}

// Token capability checks (inference / mcp_labelled / mcp_inline) used to be
// duplicated here alongside middleware/auth.ts. They are implemented once in
// util/access.ts now; import them from there rather than adding a third copy.
