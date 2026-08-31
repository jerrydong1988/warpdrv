import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15000;
// Budget across every redirect hop of one logical request. Without this,
// 5 hops x 15s let a single tool call hold a slot for 75s.
const TOTAL_DEADLINE_MS = 45000;

// ============================================================
// Address policy
//
// String-prefix checks are not a security boundary: `::ffff:7f00:1`,
// `::ffff:7f00:0001` and NAT64 `64:ff9b::7f00:1` all denote 127.0.0.1 while
// evading any textual match. Addresses are therefore parsed into bytes and
// matched against explicit CIDRs, with embedded IPv4 (v4-mapped / NAT64)
// unwrapped and re-evaluated as IPv4.
// ============================================================

function ipv4ToBytes(ip: string): number[] | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	const out: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const n = Number(part);
		if (n > 255) return null;
		out.push(n);
	}
	return out;
}

function ipv6ToBytes(ip: string): number[] | null {
	let s = ip.toLowerCase();
	const zone = s.indexOf('%'); // fe80::1%eth0 — zone id is not part of the address
	if (zone !== -1) s = s.slice(0, zone);

	// Normalize an embedded IPv4 tail (::ffff:1.2.3.4) into two hex words.
	const v4tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
	if (v4tail) {
		const v4 = ipv4ToBytes(v4tail[1]!);
		if (!v4) return null;
		const hi = (v4[0]! * 256 + v4[1]!).toString(16);
		const lo = (v4[2]! * 256 + v4[3]!).toString(16);
		s = s.slice(0, s.length - v4tail[1]!.length) + `${hi}:${lo}`;
	}

	const dc = s.indexOf('::');
	if (dc !== -1 && s.indexOf('::', dc + 1) !== -1) return null; // only one "::" allowed
	const headStr = dc === -1 ? s : s.slice(0, dc);
	const tailStr = dc === -1 ? '' : s.slice(dc + 2);

	const toWords = (chunk: string): number[] | null => {
		if (chunk === '') return [];
		const words: number[] = [];
		for (const g of chunk.split(':')) {
			if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
			words.push(parseInt(g, 16));
		}
		return words;
	};

	const head = toWords(headStr);
	const tail = toWords(tailStr);
	if (!head || !tail) return null;

	let words: number[];
	if (dc === -1) {
		if (head.length !== 8) return null;
		words = head;
	} else {
		const missing = 8 - head.length - tail.length;
		if (missing < 0) return null;
		words = [...head, ...new Array<number>(missing).fill(0), ...tail];
		if (words.length !== 8) return null;
	}

	const out: number[] = [];
	for (const w of words) out.push((w >> 8) & 0xff, w & 0xff);
	return out;
}

type TResolvedIp = { bytes: number[]; family: 4 | 6 };

function parseIpBytes(ip: string): TResolvedIp | null {
	if (net.isIPv4(ip)) {
		const bytes = ipv4ToBytes(ip);
		return bytes ? { bytes, family: 4 } : null;
	}
	if (net.isIPv6(ip)) {
		const bytes = ipv6ToBytes(ip);
		return bytes ? { bytes, family: 6 } : null;
	}
	return null;
}

function matchesCidr(bytes: number[], netBytes: number[], bits: number): boolean {
	const full = Math.floor(bits / 8);
	const rem = bits % 8;
	for (let i = 0; i < full; i++) {
		if (bytes[i] !== netBytes[i]) return false;
	}
	if (rem) {
		const mask = (0xff << (8 - rem)) & 0xff;
		if ((bytes[full]! & mask) !== (netBytes[full]! & mask)) return false;
	}
	return true;
}

function v4(a: number, b: number, c: number, d: number): number[] {
	return [a, b, c, d];
}

// IPv4 ranges the fetch tool must never reach: loopback, private, link-local,
// CGNAT, benchmarking, documentation, multicast and reserved space.
const BLOCKED_V4: Array<{ net: number[]; bits: number }> = [
	{ net: v4(0, 0, 0, 0), bits: 8 }, // "this network", incl. 0.0.0.0
	{ net: v4(10, 0, 0, 0), bits: 8 },
	{ net: v4(100, 64, 0, 0), bits: 10 }, // CGNAT / Tailscale-style pools
	{ net: v4(127, 0, 0, 0), bits: 8 }, // loopback
	{ net: v4(169, 254, 0, 0), bits: 16 }, // link-local, incl. cloud metadata
	{ net: v4(172, 16, 0, 0), bits: 12 },
	{ net: v4(192, 0, 0, 0), bits: 24 }, // IETF protocol assignments
	{ net: v4(192, 0, 2, 0), bits: 24 }, // TEST-NET-1
	{ net: v4(192, 168, 0, 0), bits: 16 },
	{ net: v4(198, 18, 0, 0), bits: 15 }, // benchmarking
	{ net: v4(198, 51, 100, 0), bits: 24 }, // TEST-NET-2
	{ net: v4(203, 0, 113, 0), bits: 24 }, // TEST-NET-3
	{ net: v4(224, 0, 0, 0), bits: 4 }, // multicast
	{ net: v4(240, 0, 0, 0), bits: 4 }, // reserved, incl. 255.255.255.255
];

const V6_ZEROS = new Array<number>(16).fill(0);
const BLOCKED_V6: Array<{ net: number[]; bits: number }> = [
	{ net: V6_ZEROS, bits: 128 }, // :: unspecified
	{ net: ipv6ToBytes('::1')!, bits: 128 }, // loopback
	{ net: ipv6ToBytes('100::')!, bits: 64 }, // discard-only
	{ net: ipv6ToBytes('2001::')!, bits: 32 }, // Teredo (tunnels to arbitrary v4)
	{ net: ipv6ToBytes('2001:db8::')!, bits: 32 }, // documentation
	{ net: ipv6ToBytes('fc00::')!, bits: 7 }, // unique-local
	{ net: ipv6ToBytes('fe80::')!, bits: 10 }, // link-local
	{ net: ipv6ToBytes('ff00::')!, bits: 8 }, // multicast
];

function isBlockedV4(bytes: number[]): boolean {
	return BLOCKED_V4.some((r) => matchesCidr(bytes, r.net, r.bits));
}

function isPrivateAddress(address: string): boolean {
	const parsed = parseIpBytes(address.trim());
	if (!parsed) return false; // unparseable input is rejected by the URL check
	const { bytes, family } = parsed;

	if (family === 4) return isBlockedV4(bytes);

	// v4-mapped (::ffff:0:0/96) and NAT64 wrappers carry an IPv4 destination:
	// unwrap it so the IPv4 policy applies instead of any textual match.
	if (matchesCidr(bytes, V6_ZEROS, 80) && bytes[10] === 0xff && bytes[11] === 0xff) {
		return isBlockedV4(bytes.slice(12));
	}
	if (matchesCidr(bytes, ipv6ToBytes('64:ff9b::')!, 96)) {
		return isBlockedV4(bytes.slice(12)); // NAT64 well-known prefix
	}
	if (matchesCidr(bytes, ipv6ToBytes('64:ff9b:1::')!, 48)) {
		return isBlockedV4(bytes.slice(6, 10)); // NAT64 local-use prefix
	}

	return BLOCKED_V6.some((r) => matchesCidr(bytes, r.net, r.bits));
}

// ============================================================
// URL / DNS validation
// ============================================================

function hasUncPath(u: URL): boolean {
	// A pathname starting with "//" is parsed as an authority by some clients.
	return u.pathname.startsWith('//');
}

async function resolveSafeAddress(host: string): Promise<{ address: string; family: 4 | 6 } | null> {
	const literal = parseIpBytes(host);
	if (literal) {
		if (isPrivateAddress(host)) return null;
		return { address: host, family: literal.family };
	}

	let records: Array<{ address: string; family: number }>;
	try {
		records = await dns.lookup(host, { all: true, verbatim: true });
	} catch {
		return null;
	}
	if (records.length === 0) return null;
	// Every published record must be public: one private A record is enough for
	// an attacker-controlled domain to resolve inward.
	for (const record of records) {
		if (isPrivateAddress(record.address)) return null;
	}
	const first = records[0]!;
	return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

export async function isSafeUrl(url: string): Promise<boolean> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (!['http:', 'https:'].includes(u.protocol)) return false;
	const host = u.hostname.toLowerCase();
	if (host === 'localhost') return false;
	if (hasUncPath(u)) return false;
	return (await resolveSafeAddress(host)) !== null;
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
	resultLimit: 200000,
};

// Headers that must never follow a redirect to a different origin.
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'cookie2', 'proxy-authorization', 'x-api-key', 'x-auth-token', 'private-token']);

function scrubHeadersForTarget(headers: Record<string, string> | undefined, from: URL, to: URL): Record<string, string> | undefined {
	if (!headers) return undefined;
	if (from.hostname.toLowerCase() === to.hostname.toLowerCase()) return headers;
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (SENSITIVE_HEADERS.has(name.toLowerCase())) continue;
		out[name] = value;
	}
	return out;
}

// ============================================================
// One HTTP hop, pinned to an already-validated IP address
// ============================================================

interface IHopResult {
	status: number;
	headers: Record<string, string>;
	body: string;
}

function requestPinned(
	u: URL,
	address: string,
	family: 4 | 6,
	method: string,
	headers: Record<string, string> | undefined,
	body: string | undefined,
	timeoutMs: number,
): Promise<IHopResult> {
	return new Promise((resolve, reject) => {
		const isHttps = u.protocol === 'https:';
		const transport = isHttps ? https : http;
		const port = u.port ? Number(u.port) : isHttps ? 443 : 80;

		// We connect by IP, so pin the logical Host header and TLS SNI to the
		// hostname that was actually validated.
		const reqHeaders: Record<string, string> = {};
		for (const [name, value] of Object.entries(headers ?? {})) {
			if (name.toLowerCase() === 'host') continue;
			reqHeaders[name] = value;
		}
		reqHeaders['host'] = u.host;

		// Pin DNS: this address is the exact one we validated, so no second
		// resolution can swap in a private address between check and connect.
		const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
			callback(null, address, family);
		};

		const req = transport.request(
			{
				hostname: address,
				port,
				path: u.pathname + u.search,
				method,
				headers: reqHeaders,
				family,
				servername: isHttps ? u.hostname : undefined,
				lookup: pinnedLookup,
				timeout: timeoutMs,
			},
			(res) => {
				const chunks: Buffer[] = [];
				let totalBytes = 0;
				res.on('data', (chunk: Buffer) => {
					totalBytes += chunk.length;
					if (totalBytes > MAX_RESPONSE_BYTES) {
						req.destroy(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes limit`));
						return;
					}
					chunks.push(chunk);
				});
				res.on('error', reject);
				res.on('aborted', () => reject(new Error('Response stream aborted')));
				res.on('end', () => {
					const headersOut: Record<string, string> = {};
					for (const [name, value] of Object.entries(res.headers)) {
						headersOut[name] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
					}
					resolve({ status: res.statusCode ?? 0, headers: headersOut, body: Buffer.concat(chunks).toString('utf8') });
				});
			},
		);

		req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

async function doFetch(
	url: string,
	method: string,
	headers: Record<string, string> | undefined,
	body: string | undefined,
	redirectCount: number,
	deadlineAt: number,
): Promise<IHopResult> {
	if (redirectCount > MAX_REDIRECTS) {
		throw new Error('Too many redirects');
	}

	let u: URL;
	try {
		u = new URL(url);
	} catch {
		throw new Error('Invalid URL');
	}
	if (!['http:', 'https:'].includes(u.protocol)) {
		throw new Error('Only http/https URLs are permitted');
	}
	if (hasUncPath(u)) {
		throw new Error('URL is not allowed');
	}

	const resolved = await resolveSafeAddress(u.hostname.toLowerCase());
	if (!resolved) {
		throw new Error('URL is not allowed: host resolves to a private or reserved address');
	}

	const remaining = deadlineAt - Date.now();
	if (remaining <= 0) throw new Error('Request exceeded its total time budget');
	const hopTimeout = Math.min(REQUEST_TIMEOUT_MS, remaining);

	const res = await requestPinned(u, resolved.address, resolved.family, method, headers, body, hopTimeout);

	// Redirects are followed manually so every hop is re-validated before a
	// connection is made; cross-origin hops drop credential headers.
	if (res.status >= 300 && res.status < 400 && res.headers['location']) {
		let nextUrl: URL;
		try {
			nextUrl = new URL(res.headers['location'], u);
		} catch {
			throw new Error('Invalid redirect target');
		}
		return doFetch(nextUrl.toString(), method, scrubHeadersForTarget(headers, u, nextUrl), body, redirectCount + 1, deadlineAt);
	}

	return res;
}

export async function fetchHandler(args: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	if (!await isSafeUrl(args.url)) {
		throw new Error('URL is not allowed: only public http/https URLs are permitted (no localhost, private IPs, or file://)');
	}
	return doFetch(args.url, args.method ?? 'GET', args.headers, args.body, 0, Date.now() + TOTAL_DEADLINE_MS);
}
