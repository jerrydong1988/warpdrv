import { spawn, spawnSync, type ChildProcess } from 'child_process';
import http from 'http';
import net from 'net';
import type { IServer, ILaunchParams, IBackend, IBackendGroup, ISettings, ISpecDecodeParams, ILlamaBackendCapabilities } from '@warpcore/shared';
import { EServerStatus, EKvQuantType, ELlamaFlashAttentionMode, ELlamaLoadMode, DEFAULT_SETTINGS } from '@warpcore/shared';
import { bootstrapServer, teardownServer, parseLogLine } from './slotStateTracker';
import { listCheckpoints, restoreCheckpoint, saveCheckpoint, getCheckpointsDir } from './checkpointService';
import { ECheckpointSaveMode } from '@warpcore/shared';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { getCachedModels } from '../routes/models';
import { startStatsPolling, stopStatsPolling } from './statsPoller';
import { refreshBackendCompatibility } from './backendValidator';
import { parseArgTokens } from '../util/shellArgs';

export const SERVERS_PREFIX = 'servers:';
const SETTINGS_KEY = 'settings:general';

// Cross-platform process tree kill.
// Linux/macOS: signal the process group via negative PID.
// Windows: taskkill /T /F walks the process tree and force-terminates.
// Note: on Windows, taskkill WITHOUT /F sends a WM_CLOSE-style request that
// console applications (llama-server) do not handle — every "graceful" stop
// previously burned the full 5s SIGKILL fallback. Use /F for both signals.
export function killProcessTree(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
	} else {
		process.kill(-pid, signal);
	}
}

// Track used ports to avoid collisions
export const usedPorts = new Set<number>();

// Health poller — checks /health endpoint until server is ready or timeout
export function pollHealth(
	port: number,
	onReady: () => void,
	onFail: (err: string) => void,
): ReturnType<typeof setInterval> {
	let attempts = 0;
	const maxAttempts = 120; // 2 minutes at 1s intervals
	const interval = setInterval(() => {
		attempts++;
		if (attempts > maxAttempts) {
			clearInterval(interval);
			onFail('Server did not become ready within 2 minutes');
			return;
		}
		const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 2000 }, (res) => {
			// Consume the response body so keep-alive sockets are released
			res.resume();
			if (res.statusCode === 200) {
				clearInterval(interval);
				onReady();
			}
		});
		req.on('error', () => {}); // not ready yet, keep polling
		req.on('timeout', () => req.destroy());
	}, 1000);
	return interval;
}
// In-memory map of running processes (keyed by server ID)
const processes = new Map<string, ChildProcess>();
// In-memory log buffers (last N lines per server)
const logBuffers = new Map<string, string[]>();
const MAX_LOG_LINES = 500;

// Emit full server update via SSE
async function emitServerUpdate(serverId: string, status: EServerStatus, error: string | null, startedAt: number | null | undefined, launchCommand?: string): Promise<void> {
	try {
		const server = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
		if (server) {
			const updated: IServer = {
				...server,
				status,
				error,
				...(startedAt != null && { startedAt }),
				...(launchCommand !== undefined && { launchCommand }),
			};
			sseManager.emit('servers:update', { [serverId]: updated });
		}
	} catch {
		// Ignore errors - SSE is optional
	}
}
const NGRAM_SPEC_TYPES = new Set(['ngram-simple', 'ngram-cache', 'ngram-map-k', 'ngram-map-k4v', 'ngram-mod']);
const DRAFT_MODEL_SPEC_TYPES = new Set(['draft-simple', 'draft-eagle3']);
const BLOCK_DRAFT_SPEC_TYPES = new Set(['draft-dflash', 'draft-dspark']);

function normalizeNgramSpecType(specType: string | undefined): string {
	// "ngram" was stored by early WarpCore builds but current llama.cpp calls
	// this implementation "ngram-simple".
	return specType && NGRAM_SPEC_TYPES.has(specType) ? specType : 'ngram-simple';
}

function normalizeDraftModelSpecType(specType: string | undefined): string {
	return specType && DRAFT_MODEL_SPEC_TYPES.has(specType) ? specType : 'draft-simple';
}

function normalizeBlockDraftSpecType(specType: string | undefined): string {
	return specType && BLOCK_DRAFT_SPEC_TYPES.has(specType) ? specType : 'draft-dflash';
}

function acceptedSpecType(
	capabilities: ILlamaBackendCapabilities | undefined,
	requested: string,
	fallback?: string,
): string | null {
	if (!capabilities || capabilities.specTypes.length === 0 || capabilities.specTypes.includes(requested)) return requested;
	return fallback && capabilities.specTypes.includes(fallback) ? fallback : null;
}

function supportedFlag(capabilities: ILlamaBackendCapabilities | undefined, candidates: string[]): string | null {
	if (!capabilities) return candidates[0] ?? null;
	return candidates.find(flag => capabilities.supportedFlags.includes(flag)) ?? null;
}

function pushSupportedOption(
	args: string[],
	capabilities: ILlamaBackendCapabilities | undefined,
	candidates: string[],
	value: string,
): void {
	const flag = supportedFlag(capabilities, candidates);
	if (flag) args.push(flag, value);
}

// Build speculative decoding args for older llama.cpp builds.
function buildSpecDecodeArgsLegacy(sd: ISpecDecodeParams): string[] {
	const args: string[] = [];
	const isNgram = sd.mode === 'ngram';
	const isMtp = sd.mode === 'mtp';
	if (isNgram) {
		const specType = normalizeNgramSpecType(sd.specType);
		args.push('--spec-type', specType);
		if (sd.ngramSizeN) args.push('--spec-ngram-size-n', String(sd.ngramSizeN));
		if (sd.ngramSizeM) args.push('--spec-ngram-size-m', String(sd.ngramSizeM));
		if ((specType === 'ngram-map-k' || specType === 'ngram-map-k4v') && sd.ngramMinHits) {
			args.push('--spec-ngram-min-hits', String(sd.ngramMinHits));
		}
	}
	// MTP mode
	if (isMtp) {
		args.push('--spec-type', 'draft-mtp');
		if (sd.specDraftNMax) args.push('--spec-draft-n-max', String(sd.specDraftNMax));
		if (sd.draftMin > 0) args.push('--draft-min', String(sd.draftMin));
		if (sd.draftPMin > 0) args.push('--draft-p-min', String(sd.draftPMin));
	}
	if (sd.mode === 'dflash') {
		args.push('--spec-type', 'draft-dflash');
		if (sd.draftModelPath) args.push('--spec-draft-model', sd.draftModelPath);
		if (sd.draftContextSize > 0) args.push('--ctx-size-draft', String(sd.draftContextSize));
		if (sd.draftGpuLayers > 0) args.push('--n-gpu-layers-draft', String(sd.draftGpuLayers));
		if (sd.draftDevice) args.push('--device-draft', sd.draftDevice);
		if (sd.specDraftNMax) args.push('--spec-draft-n-max', String(sd.specDraftNMax));
		if (sd.specDraftNMin) args.push('--spec-draft-n-min', String(sd.specDraftNMin));
	}
	if (!isNgram && !isMtp && sd.mode !== 'dflash' && sd.draftModelPath) {
		args.push('--model-draft', sd.draftModelPath);
		if (sd.draftDevice) args.push('--device-draft', sd.draftDevice);
		if (sd.draftGpuLayers > 0) args.push('--gpu-layers-draft', String(sd.draftGpuLayers));
		if (sd.draftContextSize > 0) args.push('--ctx-size-draft', String(sd.draftContextSize));
	}
	if (sd.draftMax > 0 && sd.mode !== 'dflash') args.push('--draft-max', String(sd.draftMax));
	if (!isMtp && sd.mode !== 'dflash' && sd.draftMin > 0) args.push('--draft-min', String(sd.draftMin));
	if (!isMtp && !isNgram && sd.mode !== 'dflash' && sd.draftPMin > 0) args.push('--draft-p-min', String(sd.draftPMin));
	return args;
}

// Build speculative decoding args using the b10453 parameter families.
function buildSpecDecodeArgsModern(sd: ISpecDecodeParams, capabilities?: ILlamaBackendCapabilities): string[] {
	const args: string[] = [];
	const isNgram = sd.mode === 'ngram';
	const isMtp = sd.mode === 'mtp';
	if (isNgram) {
		const specType = acceptedSpecType(capabilities, normalizeNgramSpecType(sd.specType), 'ngram-simple');
		if (!specType) return args;
		if (specType !== 'none') args.push('--spec-type', specType);
		if (specType === 'ngram-mod') {
			if (sd.draftMax > 0) pushSupportedOption(args, capabilities, ['--spec-ngram-mod-n-max'], String(sd.draftMax));
			if (sd.draftMin >= 0) pushSupportedOption(args, capabilities, ['--spec-ngram-mod-n-min'], String(sd.draftMin));
			if (sd.ngramSizeN) pushSupportedOption(args, capabilities, ['--spec-ngram-mod-n-match'], String(sd.ngramSizeN));
		} else if (specType !== 'ngram-cache') {
			const prefix = specType === 'ngram-map-k4v' ? 'map-k4v'
				: specType === 'ngram-map-k' ? 'map-k' : 'simple';
			if (sd.ngramSizeN) pushSupportedOption(args, capabilities, [`--spec-ngram-${prefix}-size-n`], String(sd.ngramSizeN));
			if (sd.ngramSizeM) pushSupportedOption(args, capabilities, [`--spec-ngram-${prefix}-size-m`], String(sd.ngramSizeM));
			if (sd.ngramMinHits) pushSupportedOption(args, capabilities, [`--spec-ngram-${prefix}-min-hits`], String(sd.ngramMinHits));
		}
		return args;
	}
	if (isMtp) {
		const specType = acceptedSpecType(capabilities, 'draft-mtp');
		if (!specType) return args;
		args.push('--spec-type', specType);
		if (sd.specDraftNMax) pushSupportedOption(args, capabilities, ['--spec-draft-n-max'], String(sd.specDraftNMax));
		if (sd.draftMin > 0) pushSupportedOption(args, capabilities, ['--spec-draft-n-min'], String(sd.draftMin));
		if (sd.draftPMin > 0) pushSupportedOption(args, capabilities, ['--spec-draft-p-min', '--draft-p-min'], String(sd.draftPMin));
		return args;
	}
	if (sd.mode === 'dflash') {
		const specType = acceptedSpecType(capabilities, normalizeBlockDraftSpecType(sd.specType), 'draft-dflash');
		if (!specType) return args;
		args.push('--spec-type', specType);
		if (sd.draftModelPath) pushSupportedOption(args, capabilities, ['--spec-draft-model', '--model-draft'], sd.draftModelPath);
		if (sd.draftContextSize > 0 && capabilities?.supportedFlags.includes('--ctx-size-draft')) args.push('--ctx-size-draft', String(sd.draftContextSize));
		if (sd.draftGpuLayers > 0) pushSupportedOption(args, capabilities, ['--spec-draft-ngl', '--n-gpu-layers-draft', '--gpu-layers-draft'], String(sd.draftGpuLayers));
		if (sd.draftDevice) pushSupportedOption(args, capabilities, ['--spec-draft-device', '--device-draft'], sd.draftDevice);
		if (sd.specDraftNMax) pushSupportedOption(args, capabilities, ['--spec-draft-n-max'], String(sd.specDraftNMax));
		if (sd.specDraftNMin) pushSupportedOption(args, capabilities, ['--spec-draft-n-min'], String(sd.specDraftNMin));
		return args;
	}
	const specType = acceptedSpecType(capabilities, normalizeDraftModelSpecType(sd.specType), 'draft-simple');
	if (!specType) return args;
	args.push('--spec-type', specType);
	if (sd.draftModelPath) {
		pushSupportedOption(args, capabilities, ['--spec-draft-model', '--model-draft'], sd.draftModelPath);
		if (sd.draftDevice) pushSupportedOption(args, capabilities, ['--spec-draft-device', '--device-draft'], sd.draftDevice);
		if (sd.draftGpuLayers > 0) pushSupportedOption(args, capabilities, ['--spec-draft-ngl', '--gpu-layers-draft', '--n-gpu-layers-draft'], String(sd.draftGpuLayers));
		if (sd.draftContextSize > 0 && capabilities?.supportedFlags.includes('--ctx-size-draft')) args.push('--ctx-size-draft', String(sd.draftContextSize));
	}
	if (sd.draftMax > 0) pushSupportedOption(args, capabilities, ['--spec-draft-n-max'], String(sd.draftMax));
	if (sd.draftMin > 0) pushSupportedOption(args, capabilities, ['--spec-draft-n-min'], String(sd.draftMin));
	if (sd.draftPMin > 0) pushSupportedOption(args, capabilities, ['--spec-draft-p-min', '--draft-p-min'], String(sd.draftPMin));
	return args;
}

const LOAD_MODE_FLAGS = new Set(['--load-mode', '-lm', '--mlock', '--mmap', '--no-mmap', '-dio', '--direct-io', '-ndio', '--no-direct-io']);
const REMOVED_SPEC_FLAGS_WITH_VALUE = new Set(['--draft', '--draft-n', '--draft-max', '--draft-min', '--draft-n-min', '--spec-ngram-size-n', '--spec-ngram-size-m', '--spec-ngram-min-hits']);

function stripControlledDefaultArgs(defaultArgs: string[], capabilities?: ILlamaBackendCapabilities): string[] {
	const args: string[] = [];
	for (let index = 0; index < defaultArgs.length; index++) {
		const arg = defaultArgs[index]!;
		const flag = arg.split('=', 1)[0]!;
		if (LOAD_MODE_FLAGS.has(flag)) {
			const next = defaultArgs[index + 1];
			if (!arg.includes('=') && (flag === '--load-mode' || flag === '-lm') && next && Object.values(ELlamaLoadMode).includes(next as ELlamaLoadMode)) index++;
			continue;
		}
		if (flag === '-fa' || flag === '--flash-attn') {
			const next = defaultArgs[index + 1];
			if (!arg.includes('=') && next && ['on', 'off', 'auto'].includes(next)) index++;
			continue;
		}
		if (flag === '-ngl' || flag === '--gpu-layers' || flag === '--n-gpu-layers') {
			const next = defaultArgs[index + 1];
			if (!arg.includes('=') && next && (/^-?\d+$/.test(next) || next === 'auto' || next === 'all')) index++;
			continue;
		}
		if (capabilities?.removedFlags.includes(flag) && REMOVED_SPEC_FLAGS_WITH_VALUE.has(flag)) {
			const next = defaultArgs[index + 1];
			if (!arg.includes('=') && next && /^-?\d+(?:\.\d+)?$/.test(next)) index++;
			continue;
		}
		args.push(arg);
	}
	return args;
}

function resolveLoadMode(params: ILaunchParams): ELlamaLoadMode {
	if (params.loadMode) return params.loadMode;
	if (params.directIo) return ELlamaLoadMode.DIO;
	if (params.mmap && params.mlock) return ELlamaLoadMode.MMAP_MLOCK;
	if (params.mmap) return ELlamaLoadMode.MMAP;
	if (params.mlock) return ELlamaLoadMode.MLOCK;
	return ELlamaLoadMode.NONE;
}

function appendLegacyLoadMode(args: string[], loadMode: ELlamaLoadMode): void {
	switch (loadMode) {
		case ELlamaLoadMode.NONE:
			args.push('--no-mmap');
			break;
		case ELlamaLoadMode.MLOCK:
			args.push('--no-mmap', '--mlock');
			break;
		case ELlamaLoadMode.MMAP_MLOCK:
			args.push('--mlock');
			break;
		case ELlamaLoadMode.DIO:
			args.push('-dio');
			break;
		default:
			break;
	}
}

function appendLoadMode(args: string[], params: ILaunchParams, capabilities?: ILlamaBackendCapabilities): void {
	const requested = resolveLoadMode(params);
	if (!capabilities?.supportedFlags.includes('--load-mode')) {
		appendLegacyLoadMode(args, requested);
		return;
	}
	const accepted = capabilities.loadModes.length === 0 || capabilities.loadModes.includes(requested);
	const loadMode = accepted ? requested
		: capabilities.loadModes.includes(ELlamaLoadMode.AUTO) ? ELlamaLoadMode.AUTO
			: null;
	if (loadMode) args.push('--load-mode', loadMode);
}

// Build the llama-server command line args from params
export function buildArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
	buildNumber: number,
	capabilities?: ILlamaBackendCapabilities,
	extraArgs?: Record<string, string>,
): string[] {
	const args = stripControlledDefaultArgs(defaultArgs, capabilities);
	const argsSet = new Set(args);
	args.push('-m', modelPath);
	if (mmprojPath) args.push('--mmproj', mmprojPath);
	if (params.gpuLayersAuto !== true && params.gpuLayers > 0) args.push('-ngl', String(params.gpuLayers));
	if (params.contextSize > 0 && !argsSet.has('-c')) args.push('-c', String(params.contextSize));
	if (params.batchSize > 0 && !argsSet.has('-b')) args.push('-b', String(params.batchSize));
	if (params.ubatchSize > 0 && !argsSet.has('-ub')) args.push('-ub', String(params.ubatchSize));
	if (params.threads > 0 && !argsSet.has('-t')) args.push('-t', String(params.threads));
	if (params.threadsBatch > 0 && !argsSet.has('-tb')) args.push('-tb', String(params.threadsBatch));
	const requestedFlashAttn = params.flashAttnMode ?? (params.flashAttn ? ELlamaFlashAttentionMode.ON : ELlamaFlashAttentionMode.OFF);
	const effectiveFlashAttn = params.specDecode?.enabled && params.specDecode.mode === 'dflash'
		? ELlamaFlashAttentionMode.ON
		: requestedFlashAttn;
	const flashFlag = supportedFlag(capabilities, ['-fa', '--flash-attn']);
	const flashAttentionModes = capabilities?.flashAttentionModes ?? [];
	const acceptedFlashAttn = !capabilities || flashAttentionModes.length === 0 || flashAttentionModes.includes(effectiveFlashAttn)
		? effectiveFlashAttn
		: flashAttentionModes.includes(ELlamaFlashAttentionMode.AUTO) ? ELlamaFlashAttentionMode.AUTO
			: flashAttentionModes.includes(ELlamaFlashAttentionMode.ON) ? ELlamaFlashAttentionMode.ON : null;
	if (capabilities && flashFlag && acceptedFlashAttn) args.push(flashFlag, acceptedFlashAttn);
	else if (!capabilities && effectiveFlashAttn === ELlamaFlashAttentionMode.ON) args.push('-fa', 'on');
	appendLoadMode(args, params, capabilities);
	if (params.noWarmup && !argsSet.has('--no-warmup')) args.push('--no-warmup');
	if (params.jinja && !argsSet.has('--jinja')) args.push('--jinja');
	if (params.swaFull && !argsSet.has('--swa-full')) args.push('--swa-full');
	if (params.useEmbedding && !argsSet.has('--embedding')) args.push('--embedding');
	if (params.kvQuantK !== EKvQuantType.F16) args.push('--cache-type-k', params.kvQuantK);
	if (params.kvQuantV !== EKvQuantType.F16) args.push('--cache-type-v', params.kvQuantV);
	if (params.chatTemplate) args.push('--chat-template', params.chatTemplate);
	if (params.preserveThinking) args.push('--chat-template-kwargs', JSON.stringify({ preserve_thinking: true }));
	if (params.device && !params.multiGpu) args.push('--device', params.device);
	// Multi-GPU tensor split — preserve zeros to maintain device index alignment
	if (params.multiGpu && params.gpuSplitValues && params.gpuSplitValues.length > 1) {
		args.push('-ts', params.gpuSplitValues.join(','));
	}
	// Split mode (layer is default, only emit when different)
	if (params.multiGpu && params.splitMode && params.splitMode !== 'layer') {
		args.push('-sm', params.splitMode);
	}
	// Main GPU (-1 or undefined = default/GPU0)
	if (params.multiGpu && params.mainGpu !== undefined && params.mainGpu >= 0) {
		args.push('-mg', String(params.mainGpu));
	}
	// Parallel slots - add --kv-unified to share context across all slots instead of splitting it
	if (params.parallelSlots > 0) {
		args.push('-np', String(params.parallelSlots));
		args.push('--kv-unified');
	}
	// Speculative decoding
	if (params.specDecode?.enabled) {
		const sd = params.specDecode;
		const modernSpecArgs = capabilities
			? capabilities.supportedFlags.includes('--spec-draft-n-max')
			: buildNumber >= 9100;
		const specArgs = modernSpecArgs
			? buildSpecDecodeArgsModern(sd, capabilities)
			: buildSpecDecodeArgsLegacy(sd);
		args.push(...specArgs);
	}
	// User extra args — placed BEFORE the server-controlled flags below so a
	// user value can never override --host/--port/--slot-save-path (previously
	// a crafted extraArgs could redirect checkpoint writes to any directory).
	if (params.extraArgs.trim()) {
		const tokens = parseArgTokens(params.extraArgs);
		// Stored free-form flags can contain the same removed/deprecated options as
		// backend defaults. Strip only the parameter families controlled above so
		// upgrading a backend cannot reintroduce a fatal parser error from old data.
		args.push(...stripControlledDefaultArgs(tokens, capabilities));
	}
	// Bind to loopback by default — the authenticated proxy reaches the
	// server via 127.0.0.1, so remote access keeps working. Only bind
	// 0.0.0.0 when the user explicitly opts into exposing inference ports.
	args.push('--host', params.inferenceExposeExternal ? '0.0.0.0' : '127.0.0.1');
	args.push('--port', String(params.port));
	// Injected extra args (e.g., --slot-save-path)
	if (extraArgs) {
		for (const [key, value] of Object.entries(extraArgs)) {
			args.push(`--${key}`, value);
		}
	}
	return args;
}
// Async wrapper that injects checkpoint path
export async function buildServerArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
	buildNumber: number,
	capabilities?: ILlamaBackendCapabilities,
): Promise<string[]> {
	const checkpointDir = await getCheckpointsDir();
	return buildArgs(modelPath, mmprojPath, params, defaultArgs, buildNumber, capabilities, { 'slot-save-path': checkpointDir });
}
// Spawn a llama-server process
export function spawnServer(
	serverId: string,
	binaryPath: string,
	args: string[],
	onStatusChange: (status: EServerStatus, error?: string) => void,
): number | null {
	try {
		const launchCommand = [binaryPath, ...args].join(' ');
		const child = spawn(binaryPath, args, {
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		// Don't let this child keep the parent alive
		child.unref();
		processes.set(serverId, child);
		logBuffers.set(serverId, []);
		// Carry an unterminated log line across chunks (a long line split by
		// the OS buffer would otherwise be parsed as multiple fragments).
		const pendingLine: Record<string, string> = {};
		const appendLog = (line: string) => {
			const buf = logBuffers.get(serverId);
			if (buf) {
				buf.push(line);
				if (buf.length > MAX_LOG_LINES) buf.shift();
			}
		};
		const handleChunk = (data: Buffer) => {
			const combined = (pendingLine[serverId] ?? '') + data.toString();
			const lines = combined.split('\n');
			pendingLine[serverId] = lines.pop() ?? '';
			for (const line of lines) {
				if (!line) continue;
				appendLog(line);
				sseManager.emit('servers:logs', { [serverId]: [line] });
				parseLogLine(serverId, line);
			}
		};
		child.stdout?.on('data', handleChunk);
		child.stderr?.on('data', handleChunk);
		// Extract port from args for health polling
		const portIdx = args.indexOf('--port');
		const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '0', 10) : 0;
		// Start health poller instead of relying on stdout parsing
		let healthInterval: ReturnType<typeof setInterval> | null = null;
		if (port > 0) {
			healthInterval = pollHealth(
				port,
				async () => {
					onStatusChange(EServerStatus.RUNNING);
					await emitServerUpdate(serverId, EServerStatus.RUNNING, null, Date.now());
					// Live server stats (slots, tokens) via /health + /slots
					startStatsPolling(serverId, port);
					await bootstrapServer(serverId, port);
					await maybeAutoLoadCheckpoint(serverId);
				},
				async (err) => {
					onStatusChange(EServerStatus.ERROR, err);
					await emitServerUpdate(serverId, EServerStatus.ERROR, err, null);
				},
			);
		}
		child.on('error', async (err) => {
			if (healthInterval) clearInterval(healthInterval);
			stopStatsPolling(serverId);
			// Spawn failures (e.g. ENOENT) never fire 'exit' — clean up so the
			// maps don't leak an entry for a process that never started.
			delete pendingLine[serverId];
			processes.delete(serverId);
			logBuffers.delete(serverId);
			onStatusChange(EServerStatus.ERROR, err.message);
			await emitServerUpdate(serverId, EServerStatus.ERROR, err.message, null);
		});
		child.on('exit', async (code) => {
			if (healthInterval) clearInterval(healthInterval);
			stopStatsPolling(serverId);
			teardownServer(serverId);
			delete pendingLine[serverId];
			processes.delete(serverId);
			// Release the reserved port so it can be reused (a crash or a stop
			// previously leaked the port for the rest of the session).
			try {
				const srv = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
				if (srv?.port && srv.port > 0 && usedPorts.has(srv.port)) usedPorts.delete(srv.port);
			} catch { /* ignore */ }
			if (code !== 0 && code !== null) {
				onStatusChange(EServerStatus.ERROR, `Process exited with code ${code}`);
				emitServerUpdate(serverId, EServerStatus.ERROR, `Process exited with code ${code}`, null).catch((err) => {
					console.error(`[processManager] Failed to emit server update for ${serverId}:`, err);
				});
			} else {
				onStatusChange(EServerStatus.STOPPED);
				emitServerUpdate(serverId, EServerStatus.STOPPED, null, null).catch((err) => {
					console.error(`[processManager] Failed to emit server update for ${serverId}:`, err);
				});
			}
		});
		onStatusChange(EServerStatus.LOADING);
		emitServerUpdate(serverId, EServerStatus.LOADING, null, null, launchCommand).catch((err) => {
			console.error(`[processManager] Failed to emit server update for ${serverId}:`, err);
		});
		return child.pid ?? null;
	} catch (err) {
		onStatusChange(EServerStatus.ERROR, String(err));
		emitServerUpdate(serverId, EServerStatus.ERROR, String(err), null).catch((e) => {
			console.error(`[processManager] Failed to emit server update for ${serverId}:`, e);
		});
		return null;
	}
}
// Kill a running server process and wait for termination
export async function killServer(serverId: string, pid?: number): Promise<boolean> {
    // Auto-save checkpoint before kill if enabled
    await maybeAutoSaveCheckpoint(serverId);

    const child = processes.get(serverId);
    
// Helper to check if port is free
	const isPortFree = (port: number): Promise<boolean> => {
		return new Promise((resolvePort) => {
			const server = net.createServer();
			server.listen(port, '127.0.0.1', () => {
                server.close();
                resolvePort(true);
            });
            server.on('error', () => resolvePort(false));
        });
    };
    
    // Try to kill from in-memory process first, then fall back to PID
    if (child?.pid) {
        stopStatsPolling(serverId);
        teardownServer(serverId);
        
        return new Promise((resolve) => {
            const pidToUse = child.pid;
            let resolved = false;
            let killTimer: ReturnType<typeof setTimeout> | null = null;
            let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
            
            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    processes.delete(serverId);
                }
            };
            
            const finish = (success: boolean) => {
                if (killTimer) { clearTimeout(killTimer); killTimer = null; }
                if (forceKillTimer) { clearTimeout(forceKillTimer); forceKillTimer = null; }
                cleanup();
                resolve(success);
            };
            
            // Listen for process exit. If the child already exited before this
            // promise was created (e.g. it crashed moments earlier), the 'exit'
            // event will never fire again and the kill would hang forever —
            // handle that by running the exit path immediately.
            const onExit = (code: number | null) => {
                const status = code !== 0 && code !== null 
                    ? EServerStatus.ERROR 
                    : EServerStatus.STOPPED;
                const error = code !== 0 && code !== null 
                    ? `Process exited with code ${code}` 
                    : null;
                
                emitServerUpdate(serverId, status, error, null).catch((err) => {
                    console.error(`[processManager] Failed to emit server update for ${serverId}:`, err);
                });
                
                // Look up port from server config and wait for it to be free
                const waitForPort = async () => {
                    try {
                        const server = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
                        const port = server?.port || 0;
                        
                        if (port > 0) {
                            let portAttempts = 0;
                            const checkPort = async () => {
                                const free = await isPortFree(port);
                                if (free) {
                                    finish(true);
                                } else if (portAttempts < 20) {
                                    portAttempts++;
                                    setTimeout(checkPort, 250);
                                } else {
                                    finish(true);
                                }
                            };
                            checkPort();
                        } else {
                            finish(true);
                        }
                    } catch {
                        finish(true);
                    }
                };
                
                waitForPort();
            };
            if (child.exitCode !== null || child.signalCode !== null) {
                // Already exited — run the exit path directly (guard against
                // the kill hanging forever).
                onExit(child.exitCode);
            } else {
                child.once('exit', onExit);
            }
            
			// Send SIGTERM to process tree
            try {
                killProcessTree(pidToUse!, 'SIGTERM');
            } catch (err) {
                if (isProcessAlive(pidToUse!)) {
                    finish(false);
                } else {
                    finish(true);
                }
                return;
            }
            
            // If not exited after 5 seconds, force kill with SIGKILL.
            // The timer is cleared once the kill completes, and it refuses to
            // act after `resolved` — otherwise a PID reused by an unrelated
            // process within 5s would get SIGKILLed (data loss on the host).
            killTimer = setTimeout(() => {
                if (resolved) return;
                if (!isProcessAlive(pidToUse!)) {
                    // The process is already gone — that is the outcome we wanted.
                    // Returning without resolving would hang the caller forever.
                    finish(true);
                    return;
                }
                try {
                    killProcessTree(pidToUse!, 'SIGKILL');
                } catch (err) {
                    console.error(`[processManager] SIGKILL failed for ${pidToUse}:`, err);
                }
                forceKillTimer = setTimeout(() => {
                    if (!resolved) {
                        finish(true);
                    }
                }, 200);
            }, 5000);
        });
    }
    
    // If not in map, try to kill using PID from storage (orphan process)
    if (pid) {
        stopStatsPolling(serverId);
        teardownServer(serverId);
        // No child handle exists on this path, so the spawn-time exit handler
        // never runs and would leave the port marked as used forever.
        void store.get<IServer>(`${SERVERS_PREFIX}${serverId}`).then((srv) => {
            if (srv?.port && srv.port > 0) usedPorts.delete(srv.port);
        }).catch(() => {});
        if (!isProcessAlive(pid)) {
            return true;
        }
        
        return new Promise((resolve) => {
            let resolved = false;
            let checkInterval: ReturnType<typeof setInterval> | null = null;
            let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
            
            const finish = (success: boolean) => {
                if (!resolved) {
                    resolved = true;
                    if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
                    if (forceKillTimer) { clearTimeout(forceKillTimer); forceKillTimer = null; }
                    resolve(success);
                }
            };
            
            // Send SIGTERM
            try {
                killProcessTree(pid, 'SIGTERM');
            } catch {
                finish(false);
                return;
            }
            
            // Poll until process is dead
            checkInterval = setInterval(async () => {
                if (!isProcessAlive(pid)) {
                    finish(true);
                }
            }, 100);
            
            // Force kill after 5 seconds
            forceKillTimer = setTimeout(() => {
                if (resolved) return; // already finished — do not touch the PID
                if (!isProcessAlive(pid)) {
                    finish(true);
                    return;
                }
                try {
                    killProcessTree(pid, 'SIGKILL');
                } catch (err) {
                    console.error(`[processManager] SIGKILL failed for orphan ${pid}:`, err);
                }
                setTimeout(() => finish(true), 200);
            }, 5000);
        });
    }
    
    return false;
}
// Check if a process is still alive by PID
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
// Get log buffer for a server
export function getServerLogs(serverId: string): string[] {
	return logBuffers.get(serverId) ?? [];
}
// Clear log buffer
export function clearServerLogs(serverId: string): void {
	logBuffers.set(serverId, []);
}
// Get all tracked process IDs
export function getTrackedServerIds(): string[] {
	return [...processes.keys()];
}

// Auto-load latest compatible checkpoint if enabled on this server
async function maybeAutoLoadCheckpoint(serverId: string): Promise<void> {
	try {
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server || !server.autoLoadCheckpointOnStart) return;
		const all = await listCheckpoints({ serverId: null, threadId: null });
		const forThisServer = all.filter(c => c.serverId === serverId);
		if (forThisServer.length === 0) return;
		const latest = forThisServer.sort((a, b) => b.createdAt - a.createdAt)[0]!;
		const targetBundleId = latest.bundleId;
		await restoreCheckpoint({
			checkpointId: targetBundleId ? null : latest.id,
			bundleId: targetBundleId,
			targetServerId: serverId,
		});
	} catch (err) {
		console.error(`[auto-load] ${serverId}:`, err);
	}
}

// Auto-save all slots as a bundle if enabled on this server
async function maybeAutoSaveCheckpoint(serverId: string): Promise<void> {
	try {
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server || !server.autoSaveCheckpointOnStop) return;
		await saveCheckpoint({
			serverId,
			slotIds: null,
			mode: ECheckpointSaveMode.SAVE,
			name: `Auto-save ${new Date().toISOString()}`,
			notes: null,
		});
	} catch (err) {
		console.error(`[auto-save] ${serverId}:`, err);
	}
}

/**
 * Parse CLI flags into a map, handling quoted values and various formats
 */
export function parseCliFlags(flags: string): Map<string, string | true> {
	const result = new Map<string, string | true>();
	
	if (!flags?.trim()) return result;
	
	// Tokenize respecting quotes via shell-quote
	const tokens: string[] = parseArgTokens(flags);
	
	// Parse tokens into flags
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		
		if (token.startsWith('--')) {
			// Check for --key=value format
			const equalsIndex = token.indexOf('=');
			if (equalsIndex !== -1) {
				const key = token.substring(0, equalsIndex);
				const value = token.substring(equalsIndex + 1);
				result.set(key, value);
			} else {
				// Check if next token is a value (not another flag)
				const nextToken = tokens[i + 1];
				if (nextToken && typeof nextToken === 'string' && !nextToken.startsWith('--')) {
					result.set(token, nextToken);
					i++; // Skip the value token
				} else {
					// Boolean flag
					result.set(token, true);
				}
			}
		} else if (token.startsWith('-')) {
			// Single-dash flags (e.g., -cram, -c 262144)
			const equalsIndex = token.indexOf('=');
			if (equalsIndex !== -1) {
				const key = token.substring(0, equalsIndex);
				const value = token.substring(equalsIndex + 1);
				result.set(key, value);
			} else {
				// Check if next token is a value (not another flag starting with -)
				const nextToken = tokens[i + 1];
				if (nextToken && typeof nextToken === 'string' && !nextToken.startsWith('-')) {
					result.set(token, nextToken);
					i++; // Skip the value token
				} else {
					// Boolean flag
					result.set(token, true);
				}
			}
		}
	}
	
	return result;
}


/**
 * Merge CLI flags with override flags taking precedence
 */
export function mergeCliFlags(baseFlags: string, overrideFlags: string): string {
	const merged = parseCliFlags(baseFlags);
	const overrides = parseCliFlags(overrideFlags);
	
	// Apply overrides
	overrides.forEach((value, key) => {
		merged.set(key, value);
	});
	
	// Reconstruct CLI string
	const parts: string[] = [];
	merged.forEach((value, key) => {
		if (value === true) {
			parts.push(key); // Boolean flag
		} else {
			// Quote values containing spaces or JSON; use single quotes so inner "..." survive
			const needsQuoting = value.includes(' ') || value.startsWith('{') || value.startsWith('[');
			if (needsQuoting) {
				// Escape any single quotes in value using shell-safe '\'' pattern
				const escaped = value.replace(/'/g, `'\\''`);
				parts.push(key, `'${escaped}'`);
			} else {
				parts.push(key, value);
			}
		}
	});
	
	return parts.join(' ');
}

export async function findRandomAvailablePort(): Promise<number> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const available: number[] = [];
	for (let port = settings.portRangeStart; port <= settings.portRangeEnd; port++) {
		if (!usedPorts.has(port)) {
			available.push(port);
		}
	}
	if (available.length === 0) {
		throw new Error('No available ports in configured range');
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const tier = Math.random() * 100;
		const idx = Math.min(available.length - 1, Math.floor((tier / 100) * available.length));
		const port = available[idx];
		if (port !== undefined && !usedPorts.has(port)) {
			usedPorts.add(port);
			return port;
		}
	}

	return await findAvailablePort();
}

export async function findAvailablePort(): Promise<number> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	for (let port = settings.portRangeStart; port <= settings.portRangeEnd; port++) {
		if (!usedPorts.has(port)) {
			usedPorts.add(port);
			return port;
		}
	}
	throw new Error('No available ports in configured range');
}

// On startup, reconcile stored servers with actual running processes
export async function reconcileServers(): Promise<void> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	for (const server of servers) {
		if (server.status === EServerStatus.RUNNING || server.status === EServerStatus.LOADING) {
			if (server.pid && isProcessAlive(server.pid)) {
				usedPorts.add(server.port);
			} else {
				server.status = EServerStatus.STOPPED;
				server.pid = undefined;
				// Remove stale port from tracking so it can be reused
				if (server.port > 0) usedPorts.delete(server.port);
				await store.put(SERVERS_PREFIX + server.id, server);
			}
		}
	}
}

// Launch servers with autoLaunch=true that are not already running
export async function launchAutoStartServers(): Promise<void> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	for (const server of servers) {
		if ((server.autoLaunch ?? false) && server.status === EServerStatus.STOPPED) {
			try {
				await launchServer(server);
				console.log(`[WarpCore] Auto-launching server: ${server.serverName}`);
			} catch (err) {
				console.log(`[WarpCore] Skipping auto-launch for ${server.serverName}: ${err}`);
			}
		}
	}
}

// Common server spawn logic — resolves backend, builds args, spawns, sets PID + status.
// Mutates server.pid, server.status, server.error, server.port. Persists to store.
// Throws if backend resolution fails.
export async function launchServer(server: IServer): Promise<void> {
	let backend: IBackend | null = null;
	if (server.backendGroupId) {
		const group = await store.get<IBackendGroup>('backendGroups:' + server.backendGroupId);
		if (!group) throw new Error('Backend group not found');
		backend = await store.get<IBackend>('backends:' + group.activeBackendId);
		if (!backend) throw new Error('Active backend in group not found');
	} else if (server.backendId) {
		backend = await store.get<IBackend>('backends:' + server.backendId);
		if (!backend) throw new Error('Backend not found');
	}
	if (!backend) throw new Error('No backend or backend group configured');

	const model = getCachedModels().find(m => m.primaryFile?.filePath === server.modelPath);
	const mmprojPath = model?.mmprojFile?.filePath && server.useMultiModal ? model.mmprojFile.filePath : null;

	// Append recommended inference params to extraArgs if enabled
	const launchParams = { ...server.params };
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	launchParams.inferenceExposeExternal = settings.inferenceExposeExternal ?? false;
	if (server.useRecommendedInferenceParams && model?.recommendedInferenceParams) {
		launchParams.extraArgs = mergeCliFlags(model.recommendedInferenceParams, server.params.extraArgs);
	}
	// Use -ngl 999 when all layers are offloaded (GGUF parser may miss output layers)
	if (model?.primaryFile?.metadata?.nLayers && launchParams.gpuLayers >= model.primaryFile.metadata.nLayers) {
		launchParams.gpuLayers = 999;
	}

	// Auto-assign port if user didn't pick one (0 = new port every launch)
	if (server.params.port === 0) {
		if (server.port > 0) {
			usedPorts.delete(server.port);
		}
		server.port = await findRandomAvailablePort();
	}
	if (launchParams.port === 0) {
		launchParams.port = server.port;
	}
	if (server.port > 0) {
		usedPorts.add(server.port);
	}

	// Binary paths are commonly replaced in place. Refresh cheap version metadata
	// on every launch and re-probe -h only when the build changed or capabilities
	// are missing. This also repairs records created while the new version format
	// was not understood.
	const compatibility = await refreshBackendCompatibility(
		backend.path,
		backend.buildNumber && backend.gitCommit
			? { buildNumber: backend.buildNumber, gitCommit: backend.gitCommit }
			: null,
		backend.capabilities,
	);
	if (compatibility.changed) {
		backend.buildNumber = compatibility.buildInfo?.buildNumber ?? backend.buildNumber;
		backend.gitCommit = compatibility.buildInfo?.gitCommit ?? backend.gitCommit;
		backend.capabilities = compatibility.capabilities ?? undefined;
		backend.updatedAt = Date.now();
		await store.put('backends:' + backend.id, backend);
		sseManager.emit('backends:update', backend);
	}

	const parsedBuildNumber = backend.buildNumber ? parseInt(backend.buildNumber, 10) : 0;
	const buildNumber = Number.isFinite(parsedBuildNumber) ? parsedBuildNumber : 0;

	const args = await buildServerArgs(
		server.modelPath,
		mmprojPath,
		launchParams,
		backend.defaultArgs,
		buildNumber,
		backend.capabilities,
	);

	const pid = spawnServer(
		server.id,
		backend.path,
		args,
		async (status, error) => {
			server.status = status;
			if (error) server.error = error;
			if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
			await store.put(SERVERS_PREFIX + server.id, server);
		},
	);

	if (pid === null) {
		// Spawn failed. There is no child process, so the exit handler that
		// normally frees the port and settles the status will never run: settle
		// to ERROR here and release the reserved port immediately.
		if (server.port > 0) usedPorts.delete(server.port);
		server.pid = undefined;
		server.status = EServerStatus.ERROR;
		server.error = server.error ?? 'Failed to start the inference process';
		await store.put(SERVERS_PREFIX + server.id, server);
		return;
	}

	server.pid = pid;
	server.status = EServerStatus.LOADING;
	server.error = null;
	await store.put(SERVERS_PREFIX + server.id, server);
}
