import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import type { IWhisperServer, IWhisperLaunchParams, IWhisperBackend } from '@warpcore/shared';
import { EWhisperServerStatus, DEFAULT_SETTINGS, type ISettings } from '@warpcore/shared';
import { parseArgTokens } from '../util/shellArgs';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { killProcessTree } from './processManager';

export const WHISPER_SERVERS_PREFIX = 'whisperServers:';
const SETTINGS_KEY = 'settings:general';

const processes = new Map<string, ChildProcess>();
const logBuffers = new Map<string, string[]>();
const MAX_LOG_LINES = 500;

export function getTrackedWhisperServerIds(): string[] {
	return [...processes.keys()];
}

// Poll port for TCP connectivity
function pollWhisperHealth(port: number, onReady: () => void, onFail: (err: string) => void): ReturnType<typeof setInterval> {
	let attempts = 0;
	const maxAttempts = 150; // 30s at 200ms intervals
	const interval = setInterval(() => {
		attempts++;
		if (attempts > maxAttempts) {
			clearInterval(interval);
			onFail('Server did not become ready within 30 seconds');
			return;
		}
		const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
			clearInterval(interval);
			socket.destroy();
			onReady();
		});
		socket.on('error', () => {
			socket.destroy();
		});
		socket.setTimeout(1000, () => {
			socket.destroy();
		});
	}, 200);
	return interval;
}

async function emitWhisperServerUpdate(serverId: string, status: EWhisperServerStatus, error: string | null, startedAt: number | null, launchCommand?: string | null): Promise<void> {
	try {
		const server = await store.get<IWhisperServer>(`${WHISPER_SERVERS_PREFIX}${serverId}`);
		if (server) {
			const updated: IWhisperServer = {
				...server,
				status,
				error,
				...(startedAt != null && { startedAt }),
				...(launchCommand !== undefined && { launchCommand }),
			};
			sseManager.emit('whisperServers:update', { [serverId]: updated });
		}
	} catch {
		// Ignore SSE errors
	}
}

export function buildWhisperArgs(
	modelPath: string,
	params: IWhisperLaunchParams,
	defaultArgs: string[],
): string[] {
	const args: string[] = [...defaultArgs];
	args.push('-m', modelPath);

	if (params.threads > 0) args.push('-t', String(params.threads));
	if (params.processors > 0) args.push('-p', String(params.processors));
	if (params.noGpu) args.push('--no-gpu');
	if (params.flashAttn) args.push('--flash-attn');
	if (params.language) args.push('-l', params.language);
	if (params.translate) args.push('--translate');
	if (params.beamSize > 0) args.push('-bs', String(params.beamSize));
	if (params.temperature > 0) args.push('-tp', String(params.temperature));
	if (params.prompt) args.push('--prompt', params.prompt);
	if (params.convert) args.push('--convert');
	if (params.inferencePath) args.push('--inference-path', params.inferencePath);

	// User-supplied flags come first: whisper-server keeps the LAST occurrence of
	// a flag, so appending them after the controlled ones below would let a
	// stored extraArgs value override --host/--port.
	if (params.extraArgs.trim()) {
		args.push(...parseArgTokens(params.extraArgs));
	}

	// Controlled flags last so user input cannot override them. The listen address
	// follows the same exposure setting as llama-server instead of always binding
	// every interface.
	args.push('--host', params.inferenceExposeExternal ? '0.0.0.0' : '127.0.0.1');
	args.push('--port', String(params.port));

	return args;
}

export function spawnWhisperServer(
	serverId: string,
	binaryPath: string,
	args: string[],
	onStatusChange: (status: EWhisperServerStatus, error?: string) => void,
): number | null {
	try {
		const launchCommand = [binaryPath, ...args].join(' ');
		const child = spawn(binaryPath, args, {
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		child.unref();
		processes.set(serverId, child);
		logBuffers.set(serverId, []);

		const appendLog = (line: string) => {
			const buf = logBuffers.get(serverId);
			if (buf) {
				buf.push(line);
				if (buf.length > MAX_LOG_LINES) buf.shift();
			}
		};

		child.stdout?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				appendLog(line);
				sseManager.emit('whisperServers:logs', { [serverId]: [line] });
			}
		});

		child.stderr?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				appendLog(line);
				sseManager.emit('whisperServers:logs', { [serverId]: [line] });
			}
		});

		const portIdx = args.indexOf('--port');
		const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '0', 10) : 0;

		let healthInterval: ReturnType<typeof setInterval> | null = null;
		if (port > 0) {
			healthInterval = pollWhisperHealth(
				port,
				async () => {
					onStatusChange(EWhisperServerStatus.RUNNING);
					await emitWhisperServerUpdate(serverId, EWhisperServerStatus.RUNNING, null, Date.now());
				},
				async (err) => {
					onStatusChange(EWhisperServerStatus.ERROR, err);
					await emitWhisperServerUpdate(serverId, EWhisperServerStatus.ERROR, err, null);
				},
			);
		}

		child.on('error', async (err) => {
			if (healthInterval) clearInterval(healthInterval);
			onStatusChange(EWhisperServerStatus.ERROR, err.message);
			await emitWhisperServerUpdate(serverId, EWhisperServerStatus.ERROR, err.message, null);
		});

		child.on('exit', (code) => {
			if (healthInterval) clearInterval(healthInterval);
			processes.delete(serverId);
			if (code !== 0 && code !== null) {
				onStatusChange(EWhisperServerStatus.ERROR, `Process exited with code ${code}`);
				emitWhisperServerUpdate(serverId, EWhisperServerStatus.ERROR, `Process exited with code ${code}`, null).catch(() => {});
			} else {
				onStatusChange(EWhisperServerStatus.STOPPED);
				emitWhisperServerUpdate(serverId, EWhisperServerStatus.STOPPED, null, null).catch(() => {});
			}
		});

		onStatusChange(EWhisperServerStatus.LOADING);
		emitWhisperServerUpdate(serverId, EWhisperServerStatus.LOADING, null, null, launchCommand).catch(() => {});
		return child.pid ?? null;
	} catch (err) {
		onStatusChange(EWhisperServerStatus.ERROR, String(err));
		emitWhisperServerUpdate(serverId, EWhisperServerStatus.ERROR, String(err), null).catch(() => {});
		return null;
	}
}

async function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.listen(port, '127.0.0.1', () => {
			server.close();
			resolve(true);
		});
		server.on('error', () => resolve(false));
	});
}

export async function killWhisperServer(serverId: string, pid?: number): Promise<boolean> {
	const child = processes.get(serverId);
	// Neither the child path nor the orphan path below has an exit handler that
	// frees the reserved port (unlike llama-server), so capture it here and
	// release it once the process is gone.
	const record = await store.get<IWhisperServer>(`${WHISPER_SERVERS_PREFIX}${serverId}`).catch(() => null);
	const releasePort = () => {
		if (record && record.port > 0) usedPorts.delete(record.port);
	};

	if (child?.pid) {
		return new Promise((resolve) => {
			const pidToUse = child.pid!;
			let resolved = false;
			let killTimer: ReturnType<typeof setTimeout> | null = null;
			let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
			const finish = (success: boolean) => {
				if (killTimer) { clearTimeout(killTimer); killTimer = null; }
				if (forceKillTimer) { clearTimeout(forceKillTimer); forceKillTimer = null; }
				if (!resolved) {
					resolved = true;
					processes.delete(serverId);
					releasePort();
					resolve(success);
				}
			};

			const onExit = async () => {
				const server = await store.get<IWhisperServer>(`${WHISPER_SERVERS_PREFIX}${serverId}`).catch(() => null);
				const port = server?.port || 0;

				if (port > 0) {
					let attempts = 0;
					const checkPort = async () => {
						const free = await isPortFree(port);
						if (free) {
							finish(true);
						} else if (attempts < 20) {
							attempts++;
							setTimeout(checkPort, 250);
						} else {
							finish(true);
						}
					};
					checkPort();
				} else {
					finish(true);
				}

				emitWhisperServerUpdate(serverId, EWhisperServerStatus.STOPPED, null, null).catch(() => {});
			};

			// The child may already have exited before we got here: 'exit' will not
			// fire again, and taskkill does not throw for a dead PID on Windows, so
			// run the settled path directly instead of waiting for an event that has
			// already happened — otherwise this promise never settles.
			if (child.exitCode !== null || child.signalCode !== null) {
				void onExit();
			} else {
				child.once('exit', onExit);
			}

	try {
			killProcessTree(pidToUse, 'SIGTERM');
		} catch {
			finish(false);
			return;
		}

		// Force kill after 5s. Guarded so a PID reused by an unrelated process
		// after a clean exit is never SIGKILLed.
		killTimer = setTimeout(() => {
			if (resolved) return;
			if (!isProcessAlive(pidToUse)) {
				// Already gone, which is the outcome we wanted. Returning without
				// resolving used to hang the caller forever.
				finish(true);
				return;
			}
			try {
				killProcessTree(pidToUse, 'SIGKILL');
			} catch { /* best-effort */ }
			forceKillTimer = setTimeout(() => finish(true), 200);
		}, 5000);
	});
	}

	if (pid) {
		try {
			process.kill(pid, 0);
		} catch {
			releasePort();
			return true;
		}

		try {
			killProcessTree(pid, 'SIGTERM');
		} catch { /* best-effort */ }

		return new Promise((resolve) => {
			let settled = false;
			let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
			const settle = (success: boolean) => {
				releasePort();
				resolve(success);
			};
			const check = setInterval(() => {
				try {
					process.kill(pid, 0);
				} catch {
					settled = true;
					if (forceKillTimer) { clearTimeout(forceKillTimer); forceKillTimer = null; }
					clearInterval(check);
					settle(true);
				}
			}, 100);
			forceKillTimer = setTimeout(() => {
				if (settled) return; // already resolved — do not touch the PID
				clearInterval(check);
				if (!isProcessAlive(pid)) { settle(true); return; }
				try {
					killProcessTree(pid, 'SIGKILL');
				} catch { /* best-effort */ }
				setTimeout(() => settle(true), 200);
			}, 5000);
		});
	}

	return false;
}

export function getWhisperServerLogs(serverId: string): string[] {
	return logBuffers.get(serverId) ?? [];
}

export function clearWhisperServerLogs(serverId: string): void {
	logBuffers.set(serverId, []);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function reconcileWhisperServers(): Promise<void> {
	const servers = await store.list<IWhisperServer>(WHISPER_SERVERS_PREFIX);
	for (const server of servers) {
		if (server.status === EWhisperServerStatus.RUNNING || server.status === EWhisperServerStatus.LOADING) {
			if (server.pid && isProcessAlive(server.pid)) {
				// Still running across a server restart: re-claim the port so a later
				// launch is not handed an address this live process already holds.
				if (server.port > 0) usedPorts.add(server.port);
			} else {
				server.status = EWhisperServerStatus.STOPPED;
				server.pid = undefined;
				// Release the reserved port so it can be reused (consistent
				// with the llama-server reconcile path).
				if (server.port > 0) usedPorts.delete(server.port);
				await store.put(WHISPER_SERVERS_PREFIX + server.id, server);
			}
		}
	}
}

export async function launchAutoStartWhisperServers(): Promise<void> {
	const servers = await store.list<IWhisperServer>(WHISPER_SERVERS_PREFIX);
	for (const server of servers) {
		if (server.autoLaunch && server.status === EWhisperServerStatus.STOPPED) {
			try {
				await launchWhisperServer(server);
				console.log(`[WarpCore] Auto-launching whisper server: ${server.serverName}`);
			} catch (err) {
				console.log(`[WarpCore] Skipping auto-launch for whisper server ${server.serverName}: ${err}`);
			}
		}
	}
}

import { usedPorts, findRandomAvailablePort } from './processManager';

export async function launchWhisperServer(server: IWhisperServer): Promise<void> {
	const backend = await store.get<IWhisperBackend>('whisperBackends:' + server.backendId);
	if (!backend) throw new Error('Whisper backend not found');

	if (server.params.port === 0) {
		if (server.port > 0) {
			usedPorts.delete(server.port);
		}
		server.port = await findRandomAvailablePort();
	}
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const launchParams = { ...server.params };
	launchParams.inferenceExposeExternal = settings.inferenceExposeExternal ?? false;
	if (launchParams.port === 0) {
		launchParams.port = server.port;
	}
	if (server.port > 0) {
		usedPorts.add(server.port);
	}

	const args = buildWhisperArgs(
		server.modelPath,
		launchParams,
		backend.defaultArgs,
	);

	const pid = spawnWhisperServer(
		server.id,
		backend.path,
		args,
		async (status, error) => {
			server.status = status;
			if (error) server.error = error;
			if (status === EWhisperServerStatus.RUNNING) server.startedAt = Date.now();
			await store.put(WHISPER_SERVERS_PREFIX + server.id, server);
		},
	);

	if (pid === null) {
		// Spawn failed. There is no child process, so the exit handler that
		// normally settles the status and frees the port will never run: settle to
		// ERROR here and release the reserved port immediately.
		if (server.port > 0) usedPorts.delete(server.port);
		server.pid = undefined;
		server.status = EWhisperServerStatus.ERROR;
		server.error = server.error ?? 'Failed to start the whisper process';
		await store.put(WHISPER_SERVERS_PREFIX + server.id, server);
		return;
	}

	server.pid = pid;
	server.status = EWhisperServerStatus.LOADING;
	server.error = null;
	await store.put(WHISPER_SERVERS_PREFIX + server.id, server);
}
