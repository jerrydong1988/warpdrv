import path from 'path';
import os from 'os';
import { createRequire } from 'node:module';
import { store } from '../util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
const SETTINGS_KEY = 'settings:general';
declare const __filename: string | undefined;
const requireFn = (process as any).pkg && process.env.WARPCORE_RESOURCE_DIR
	? createRequire(path.join(process.env.WARPCORE_RESOURCE_DIR, 'binaries', 'index.js'))
	: createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);

interface IKokoroTTSInstance {
	stream(splitter: any, opts: { voice: string; speed: number }): AsyncIterable<{ audio: { toWav: () => Uint8Array } }>;
	dispose?: () => void;
}

let kokoroInstance: IKokoroTTSInstance | null = null;
let isReady = false;
const KOKORO_AUTHOR = 'onnx-community';
const KOKORO_MODEL = 'Kokoro-82M-v1.0-ONNX';
function kokoroBasePath(): string {
	return path.join(os.homedir(), '.config', 'warpcore', 'kokoro', KOKORO_AUTHOR, KOKORO_MODEL);
}
export interface IPendingStream {
	text: string;
	voice: string;
	createdAt: number;
	aborted: boolean;
}
const pendingStreams: Record<string, IPendingStream> = {};
const STREAM_TTL_MS = 30_000;
let _streamCleanupTimer: ReturnType<typeof setInterval> | null = null;

	function _startStreamCleanup(): void {
		_streamCleanupTimer = setInterval(() => {
			const now = Date.now();
			for (const id of Object.keys(pendingStreams)) {
				const entry = pendingStreams[id];
				if (entry && now - entry.createdAt > STREAM_TTL_MS) delete pendingStreams[id];
			}
		}, 10_000);
		if (_streamCleanupTimer.unref) _streamCleanupTimer.unref();
	}
_startStreamCleanup();

export function cleanupKokoroService(): void {
	if (_streamCleanupTimer) {
		clearInterval(_streamCleanupTimer);
		_streamCleanupTimer = null;
	}
	if (kokoroInstance && typeof kokoroInstance.dispose === 'function') {
		try { kokoroInstance.dispose(); } catch { /* ignore */ }
	}
	kokoroInstance = null;
	isReady = false;
	for (const id of Object.keys(pendingStreams)) {
		const entry = pendingStreams[id];
		if (entry) entry.aborted = true;
	}
}
export async function initKokoroService(): Promise<void> {
	if (isReady) return;
	try {
		const kokoroLib = requireFn('kokoro-js');
		const transformersLib = requireFn('@huggingface/transformers');
		const { KokoroTTS, setVoiceDataUrl } = kokoroLib;
		const { env } = transformersLib;
		const basePath = kokoroBasePath();
		env.allowLocalModels = true;
		env.localModelPath = path.join(os.homedir(), '.config', 'warpcore', 'kokoro');
		env.allowRemoteModels = false;
		setVoiceDataUrl(path.join(basePath, 'voices'));
		kokoroInstance = await KokoroTTS.from_pretrained(`${KOKORO_AUTHOR}/${KOKORO_MODEL}`, {
			dtype: 'fp32',
			device: 'cpu',
		});
		isReady = true;
		console.log('[Kokoro] Model loaded');
	} catch (err) {
		console.error('[Kokoro] Init failed:', err);
		throw err;
	}
}
// removed
export function isKokoroReady(): boolean {
	return isReady;
}
export function registerStream(text: string, voice: string): string {
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	pendingStreams[id] = { text, voice, createdAt: Date.now(), aborted: false };
	return id;
}
export function abortStream(streamId: string): void {
	const p = pendingStreams[streamId];
	if (p) p.aborted = true;
}
export async function* consumeStream(streamId: string): AsyncGenerator<Buffer> {
	const p = pendingStreams[streamId];
	if (!p) throw new Error('stream not found');
	delete pendingStreams[streamId];
	if (!isReady || !kokoroInstance) throw new Error('kokoro not ready');
	const { TextSplitterStream } = requireFn('kokoro-js');
	const splitter = new TextSplitterStream();
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const speed = settings.kokoroSpeed ?? 1;
	const stream = kokoroInstance.stream(splitter, { voice: p.voice, speed });
	splitter.push(p.text);
	splitter.close();
	for await (const chunk of stream) {
		if (p.aborted) return;
		const wav = chunk.audio.toWav();
		yield Buffer.from(wav);
	}
}
