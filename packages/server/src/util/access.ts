import type { IAccessToken } from '@warpcore/shared';

/**
 * Access-control primitives: where a request came from, and what a token allows.
 *
 * These live in one module on purpose. The same questions ("is this peer local?",
 * "may this token use this model?") were previously answered by three near-identical
 * copies spread over middleware/auth.ts and routes/tokens.ts; duplicated policy
 * code drifts, and the copies here are the only sanctioned implementations.
 */

/** Loopback addresses, including the IPv4-mapped IPv6 form Node reports. */
export function isLoopbackAddress(ip: string | undefined | null): boolean {
	if (!ip) return false;
	const normalized = ip.replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '');
	return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

/** Hosts that bind to the loopback interface only. */
export function isLoopbackHost(host: string | undefined | null): boolean {
	if (!host) return true; // no explicit host → whatever the caller defaults to
	const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
	return normalized === 'localhost' || normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

/** True when the peer socket is not a loopback connection. */
export function isRemoteRequest(req: { ip?: string; connection?: { remoteAddress?: string } }): boolean {
	return !isLoopbackAddress(req.ip || req.connection?.remoteAddress);
}

/**
 * Whether a request must present credentials.
 *
 * `trustLoopback` is false when the API is bound to a non-loopback interface:
 * in that deployment a request can reach us through a reverse proxy or a port
 * forward while its socket still looks like 127.0.0.1, so loopback stops being
 * evidence of "the machine's own user". Callers pass the configured apiHost.
 */
export function shouldRequireAuthForRequest(
	req: { ip?: string; connection?: { remoteAddress?: string } },
	settings: { authRequireForLocalhost?: boolean; apiHost?: string },
): boolean {
	if (settings.authRequireForLocalhost) return true;
	if (!isLoopbackHost(settings.apiHost)) return true;
	return isRemoteRequest(req);
}

/** Token capability checks. `admin` implies everything. */
export function hasInferenceAccessForToken(token: IAccessToken, modelAliasOrId: string): boolean {
	if (token.admin) return true;
	if (token.inference === true) return true;
	if (Array.isArray(token.inference)) return token.inference.includes(modelAliasOrId);
	return false;
}

export function hasMcpLabelledAccessForToken(token: IAccessToken, toolName: string): boolean {
	if (token.admin) return true;
	if (token.mcp_labelled === true) return true;
	if (Array.isArray(token.mcp_labelled)) return token.mcp_labelled.includes(toolName);
	return false;
}

export function hasMcpInlineAccessForToken(token: IAccessToken, toolName: string): boolean {
	if (token.admin) return true;
	if (token.mcp_inline === true) return true;
	if (Array.isArray(token.mcp_inline)) return token.mcp_inline.includes(toolName);
	return false;
}
