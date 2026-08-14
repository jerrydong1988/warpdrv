import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15000;

function isPrivateAddress(address: string): boolean {
	const normalized = address.toLowerCase();
	if (normalized === '::1' || normalized === '::' || normalized === '127.0.0.1') return true;
	// IPv4-mapped IPv6 (::ffff:a.b.c.d) — maps straight to an IPv4 address
	const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPrivateAddress(mapped[1]!);
	if (net.isIPv4(normalized)) {
		const parts = normalized.split('.').map(Number);
		const [a, b] = parts as [number, number, number, number];
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 169 && b === 254) return true; // link-local
		if (a === 127) return true;
		if (a === 0) return true;
		return false;
	}
	if (net.isIPv6(normalized)) {
		// link-local fe80::/10 and unique-local fc00::/7
		if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
		return false;
	}
	return false;
}

async function isSafeUrl(url: string): Promise<boolean> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (!['http:', 'https:'].includes(u.protocol)) return false;
	const host = u.hostname.toLowerCase();
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
	if (/^\\/.test(u.pathname) || u.pathname.startsWith('//')) return false; // UNC paths
	if (net.isIP(host) && isPrivateAddress(host)) return false;
	// Resolve and verify every address — catches IPv4-mapped IPv6, decimal/octal
	// IP forms, and (partially) DNS-rebinding after resolution.
	try {
		const records = await dns.lookup(host, { all: true, verbatim: true });
		if (records.length === 0) return false;
		for (const record of records) {
			if (isPrivateAddress(record.address)) return false;
		}
		return true;
	} catch {
		return false;
	}
}

export const fetchDefinition = {
	name: 'fetch',
	description: 'Perform an HTTP request and return the response.',
	inputSchema: {
		type: 'object',
		properties: {
			url: { type: 'string' },
			method: { type: 'string', default: 'GET' },
			headers: { type: 'object', additionalProperties: { type: 'string' } },
			body: { type: 'string' },
		},
		required: ['url'],
	},
};

async function doFetch(url: string, method: string, headers: Record<string, string> | undefined, body: string | undefined, redirectCount = 0): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	if (redirectCount > MAX_REDIRECTS) {
		throw new Error('Too many redirects');
	}
	const res = await fetch(url, {
		method,
		headers,
		body,
		redirect: 'manual',
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	// Follow redirects manually, re-validating each hop against the SSRF policy
	if (res.status >= 300 && res.status < 400) {
		const location = res.headers.get('location');
		if (location) {
			const nextUrl = new URL(location, url).toString();
			if (!await isSafeUrl(nextUrl)) {
				throw new Error('Redirect target is not allowed');
			}
			return doFetch(nextUrl, method, headers, body, redirectCount + 1);
		}
	}

	// Stream body with size limit to prevent OOM
	const reader = res.body?.getReader();
	if (!reader) return { status: res.status, headers: {}, body: '' };

	const chunks: Buffer[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			totalBytes += value.length;
			if (totalBytes > MAX_RESPONSE_BYTES) {
				reader.cancel();
				throw new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes limit`);
			}
			chunks.push(value as unknown as Buffer);
		}
	}
	const bodyBuffer = Buffer.concat(chunks);
	const headersOut: Record<string, string> = {};
	res.headers.forEach((v, k) => { headersOut[k] = v; });
	return { status: res.status, headers: headersOut, body: bodyBuffer.toString('utf8') };
}

export async function fetchHandler(args: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	if (!await isSafeUrl(args.url)) {
		throw new Error('URL is not allowed: only public http/https URLs are permitted (no localhost, private IPs, or file://)');
	}
	return doFetch(args.url, args.method ?? 'GET', args.headers, args.body);
}
