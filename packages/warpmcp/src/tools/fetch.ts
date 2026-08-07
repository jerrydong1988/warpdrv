const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

function isSafeUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (!['http:', 'https:'].includes(u.protocol)) return false;
		const host = u.hostname.toLowerCase();
		// Block private, link-local, and loopback addresses
		if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
		if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^169\.254\.|^fe80:|^fc00:|^fd[0-9a-f]{2}:|^0\.0\.0\.0$/i.test(host)) return false;
		if (/^\\/.test(u.pathname) || u.pathname.startsWith('//')) return false; // UNC paths
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

export async function fetchHandler(args: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	if (!isSafeUrl(args.url)) {
		throw new Error('URL is not allowed: only public http/https URLs are permitted (no localhost, private IPs, or file://)');
	}

	const res = await fetch(args.url, {
		method: args.method ?? 'GET',
		headers: args.headers,
		body: args.body,
	});

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
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => { headers[k] = v; });
	return { status: res.status, headers, body: bodyBuffer.toString('utf8') };
}
