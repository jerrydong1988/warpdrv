import http from 'http';
import type { IServerStats, ISlotStats, IServer } from '@warpcore/shared';

const statsMap = new Map<string, IServerStats>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();

const MAX_STATS_BODY_BYTES = 2 * 1024 * 1024;

function fetchJson<T>(url: string): Promise<T | null> {
	return new Promise((resolve) => {
		const req = http.get(url, { timeout: 2000 }, (res) => {
			if (res.statusCode !== 200) { resolve(null); return; }
			const chunks: Buffer[] = [];
			let size = 0;
			res.on('data', (chunk: Buffer) => {
				// Health/slot payloads are a few kilobytes. The cap is what stops a
				// different service answering on this port from growing the buffer
				// without bound while we poll it every 1.5s.
				size += chunk.length;
				if (size > MAX_STATS_BODY_BYTES) {
					req.destroy();
					resolve(null);
					return;
				}
				chunks.push(chunk);
			});
			res.on('end', () => {
				try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T); }
				catch { resolve(null); }
			});
		});
		req.on('error', () => resolve(null));
		req.on('timeout', () => { req.destroy(); resolve(null); });
	});
}

interface IHealthResponse {
	status: string;
	slots_idle?: number;
	slots_processing?: number;
}

interface ISlotNextToken {
	has_next_token: boolean;
	n_remain: number;
	n_decoded: number;
}

interface ISlotResponse {
	id: number;
	n_ctx: number;
	is_processing: boolean;
	next_token?: ISlotNextToken[];
}

export function startStatsPolling(serverId: string, port: number): void {
	if (pollers.has(serverId)) return;

	// Two guards the original tick lacked: an async callback that throws inside
	// setInterval is an unhandled rejection, and a poll slower than the interval
	// used to stack up behind itself.
	let inFlight = false;
	const interval = setInterval(async () => {
		if (inFlight) return;
		inFlight = true;
		try {
			const base = `http://127.0.0.1:${port}`;

			const health = await fetchJson<IHealthResponse>(`${base}/health`);
			if (!health) {
				statsMap.delete(serverId); // Clear stale stats on failure
				return;
			}

			const slots = await fetchJson<ISlotResponse[]>(`${base}/slots`);

			// Parse log buffer for per-slot context info
			const slotStats: ISlotStats[] = (slots ?? []).map((s) => {
				const nextToken = s.next_token?.[0];
				const nDecoded = nextToken?.n_decoded ?? 0;
				const nRemain = nextToken?.n_remain ?? 0;

				return {
					id: s.id,
					state: s.is_processing ? 'processing' as const : 'idle' as const,
					tokensGenerated: nDecoded,
					tokensRemaining: nRemain > 0 ? nRemain : 0,
				};
			});

			const totalGenerated = slotStats.reduce((sum, s) => sum + s.tokensGenerated, 0);
			const processingCount = slotStats.filter(s => s.state === 'processing').length;
			const idleCount = slotStats.filter(s => s.state === 'idle').length;

			const stats: IServerStats = {
				slotsIdle: health.slots_idle ?? idleCount,
				slotsProcessing: health.slots_processing ?? processingCount,
				tokensGenerated: totalGenerated,
				slots: slotStats,
			};

			statsMap.set(serverId, stats);
		} catch {
			// Never let a failed poll surface as an unhandled rejection; the next tick retries.
		} finally {
			inFlight = false;
		}
	}, 1500);
	// Polling must not be what keeps the process alive.
	interval.unref?.();

	pollers.set(serverId, interval);
}

export function stopStatsPolling(serverId: string): void {
	const interval = pollers.get(serverId);
	if (interval) {
		clearInterval(interval);
		pollers.delete(serverId);
	}
	statsMap.delete(serverId);
}

export function getServerStats(serverId: string): IServerStats | null {
	return statsMap.get(serverId) ?? null;
}

export function getAllServerStats(): Record<string, IServerStats> {
	const result: Record<string, IServerStats> = {};
	for (const [id, stats] of statsMap.entries()) {
		result[id] = stats;
	}
	return result;
}