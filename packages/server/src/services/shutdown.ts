import { store } from '../util/store';
import type { IServer, IWhisperServer } from '@warpcore/shared';
import { EServerStatus, EWhisperServerStatus } from '@warpcore/shared';
import { killServer, SERVERS_PREFIX } from './processManager';
import { killWhisperServer, WHISPER_SERVERS_PREFIX } from './whisperProcessManager';

export interface IStopAllResult {
	llama: number;
	whisper: number;
}

/**
 * Stop every running inference child process (llama.cpp + whisper.cpp).
 *
 * Used by the graceful-shutdown path. The desktop shell also stops servers over
 * HTTP before killing this process, but that is best-effort with a fixed sleep:
 * if it fails or the process dies some other way, the children survive as
 * orphans holding GPU memory. Doing it in-process closes that gap.
 */
export async function stopAllInferenceServers(): Promise<IStopAllResult> {
	const result: IStopAllResult = { llama: 0, whisper: 0 };

	const servers = await store.list<IServer>(SERVERS_PREFIX);
	for (const server of servers) {
		if (server.status !== EServerStatus.RUNNING && server.status !== EServerStatus.LOADING) continue;
		try {
			await killServer(server.id, server.pid);
		} catch (err) {
			console.error(`[shutdown] Failed to stop server ${server.id}:`, err instanceof Error ? err.message : String(err));
		}
		server.status = EServerStatus.STOPPED;
		server.pid = undefined;
		try {
			await store.put(SERVERS_PREFIX + server.id, server);
		} catch (err) {
			console.error(`[shutdown] Failed to persist stopped state for ${server.id}:`, err instanceof Error ? err.message : String(err));
		}
		result.llama++;
	}

	const whisperServers = await store.list<IWhisperServer>(WHISPER_SERVERS_PREFIX);
	for (const server of whisperServers) {
		if (server.status !== EWhisperServerStatus.RUNNING && server.status !== EWhisperServerStatus.LOADING) continue;
		try {
			await killWhisperServer(server.id, server.pid);
		} catch (err) {
			console.error(`[shutdown] Failed to stop whisper server ${server.id}:`, err instanceof Error ? err.message : String(err));
		}
		server.status = EWhisperServerStatus.STOPPED;
		server.pid = undefined;
		try {
			await store.put(WHISPER_SERVERS_PREFIX + server.id, server);
		} catch (err) {
			console.error(`[shutdown] Failed to persist stopped whisper state for ${server.id}:`, err instanceof Error ? err.message : String(err));
		}
		result.whisper++;
	}

	return result;
}
