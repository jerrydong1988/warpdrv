import React, { useCallback, useMemo, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Loader2 } from 'lucide-react';
import { FaStop } from 'react-icons/fa';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import { Box } from '@chakra-ui/react';
import removeMd from 'remove-markdown';
import emojiRegex from 'emoji-regex';
import { EventSource } from 'eventsource';

const ActionBarIcon: FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
	<Box
		w="28px"
		h="28px"
		display="flex"
		alignItems="center"
		justifyContent="center"
		cursor="pointer"
		rounded="md"
		color="var(--wc-text-secondary)"
		_hover={{ bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' }}
		onClick={onClick}
	>
		{children}
	</Box>
);

const MAX_RECURSION_DEPTH = 100;
let ttsAudioCtx: AudioContext | null = null;
let ttsAnalyser: AnalyserNode | null = null;
let ttsAnalyserListeners: Array<(a: AnalyserNode | null) => void> = [];
let recursionDepth = 0;
let _currentAudioEl: HTMLAudioElement | null = null;
let _currentEventSource: EventSource | null = null;
let _currentStreamAbortId: string | null = null;

function ensureAnalyser(): AnalyserNode {
	if (!ttsAudioCtx) ttsAudioCtx = new AudioContext();
	if (ttsAudioCtx.state === 'suspended') ttsAudioCtx.resume().catch(() => {});
	if (!ttsAnalyser) {
		ttsAnalyser = ttsAudioCtx.createAnalyser();
		ttsAnalyser.fftSize = 256;
		ttsAnalyser.smoothingTimeConstant = 0.8;
		ttsAnalyser.connect(ttsAudioCtx.destination);
		for (const l of ttsAnalyserListeners) l(ttsAnalyser);
	}
	return ttsAnalyser;
}
export function getTTSAnalyser(): AnalyserNode | null {
	return ttsAnalyser;
}
export function subscribeTTSAnalyser(cb: (a: AnalyserNode | null) => void): () => void {
	ttsAnalyserListeners.push(cb);
	cb(ttsAnalyser);
	return () => {
		ttsAnalyserListeners = ttsAnalyserListeners.filter(l => l !== cb);
	};
}
function checkVadComplete() {
	const s = useStore.getState();
	const queueLen = s.ttsPlaybackQueue.length;
	const playing = s.ttsIsSpeaking;
	const generating = s.ttsIsGenerating;
	const sent = s.ttsVadSentencesSent;
	const done = s.ttsVadSentencesDone;
	const threadId = s.currentThreadId;
	const running = threadId ? s.isRunningByThread[threadId] : false;
	if (queueLen > 0 || playing) return;
	if (generating !== 'vad') return;
	if (sent !== done) return;
	if (threadId && running) return;
	stopTTS();
}

function _getCleanedText(text: string): string {
	return removeMd(text).replace(emojiRegex(), '').replace(/\s+/g, ' ').trim();
}

let _startStreamAbort: (() => void) | null = null;

export async function startStream(requestId: number, text: string, voice: string): Promise<void> {
	const cleaned = _getCleanedText(text);
	if (!cleaned) return;
	const startRes = await fetch('/api/kokoro/tts/start', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: cleaned, voice }),
	});
	const startJson = await startRes.json();
	if (!startJson.ok) throw new Error(startJson.error || 'tts start failed');
	const streamId = startJson.data.streamId as string;
	_currentStreamAbortId = streamId;
	const es = new EventSource(`/api/kokoro/tts/stream/${streamId}`);
	_currentEventSource = es;
	_startStreamAbort = () => {
		es.close();
		fetch(`/api/kokoro/tts/abort/${streamId}`, { method: 'POST' }).catch(() => {});
	};
	const abortCheck = () => {
		const currentReqId = useStore.getState().ttsCurrentRequestId;
		return requestId === currentReqId;
	};
	es.addEventListener('chunk', (e: MessageEvent) => {
		if (!abortCheck()) {
			es.close();
			return;
		}
		const activeMsg = useStore.getState().ttsActiveMessageId;
		if (activeMsg === null) return;
		const payload = JSON.parse(e.data);
		const bin = atob(payload.audio);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
		useStore.getState().ttsPlaybackQueue.push(url);
		tryPlayNext();
	});
	es.addEventListener('done', () => {
		es.close();
		if (_currentEventSource === es) _currentEventSource = null;
		_currentStreamAbortId = null;
		_startStreamAbort = null;
		if (!abortCheck()) return;
		const s = useStore.getState();
		if (s.ttsIsGenerating === 'button') {
			s.ttsSetGenerating(null);
			if (s.ttsPlaybackQueue.length === 0 && !s.ttsIsSpeaking) {
				s.ttsSetSpeaking(false);
			}
		} else if (s.ttsIsGenerating === 'vad') {
			s.ttsVadIncDone();
			checkVadComplete();
		}
	});
	es.addEventListener('error', (e: MessageEvent) => {
		es.close();
		if (_currentEventSource === es) _currentEventSource = null;
		_currentStreamAbortId = null;
		_startStreamAbort = null;
		useStore.getState().ttsStop();
	});
}

function tryPlayNext() {
	recursionDepth++;
	if (recursionDepth > MAX_RECURSION_DEPTH) {
		recursionDepth = 0;
		return;
	}
	const s = useStore.getState();
	if (s.ttsIsSpeaking || s.ttsPlaybackQueue.length === 0) {
		recursionDepth = 0;
		return;
	}
	const url = s.ttsPlaybackQueue.shift();
	if (!url) {
		recursionDepth = 0;
		return;
	}
	const currentReqId = s.ttsCurrentRequestId;
	if (currentReqId === 0) {
		URL.revokeObjectURL(url);
		recursionDepth = 0;
		return;
	}
	s.ttsSetSpeaking(true);
	const audioEl = new Audio(url);
	_currentAudioEl = audioEl;
	try {
		const analyser = ensureAnalyser();
		const src = ttsAudioCtx!.createMediaElementSource(audioEl);
		src.connect(analyser);
	} catch (e) {
		console.error('[KokoroTTS] analyser wire failed:', e);
	}
	const onEnd = () => {
		if (_currentAudioEl === audioEl) _currentAudioEl = null;
		URL.revokeObjectURL(url);
		recursionDepth = 0;
		setTimeout(() => tryPlayNext(), 0);
		const after = useStore.getState();
		if (after.ttsPlaybackQueue.length === 0 && !after.ttsIsGenerating) {
			after.ttsSetSpeaking(false);
		}
		checkVadComplete();
	};
	const onError = () => {
		if (_currentAudioEl === audioEl) _currentAudioEl = null;
		URL.revokeObjectURL(url);
		recursionDepth = 0;
		setTimeout(() => tryPlayNext(), 0);
		const after = useStore.getState();
		if (after.ttsPlaybackQueue.length === 0 && !after.ttsIsGenerating) {
			after.ttsSetSpeaking(false);
		}
		checkVadComplete();
	};
	audioEl.onended = onEnd;
	audioEl.onerror = onError;
	audioEl.play().catch(() => {
		if (_currentAudioEl === audioEl) _currentAudioEl = null;
		URL.revokeObjectURL(url);
		recursionDepth = 0;
	});
}

export function stopTTS() {
	const s = useStore.getState();
	s.ttsCurrentRequestId = 0;
	if (_currentAudioEl) {
		_currentAudioEl.pause();
		_currentAudioEl.currentTime = 0;
		_currentAudioEl = null;
	}
	for (const url of s.ttsPlaybackQueue) {
		URL.revokeObjectURL(url);
	}
	s.ttsPlaybackQueue = [];
	s.ttsSetSpeaking(false);
	const activeId = s.ttsActiveMessageId;
	if (activeId) s.ttsClearSpokenIndex(activeId);
	s.ttsVadReset();
	s.ttsStop();
	if (_startStreamAbort) {
		_startStreamAbort();
		_startStreamAbort = null;
	}
	if (_currentEventSource) {
		_currentEventSource.close();
		_currentEventSource = null;
	}
	if (_currentStreamAbortId) {
		fetch(`/api/kokoro/tts/abort/${_currentStreamAbortId}`, { method: 'POST' }).catch(() => {});
		_currentStreamAbortId = null;
	}
}

export function setKokoroCurrentRequestId(id: number) {
	const s = useStore.getState();
	s.ttsCurrentRequestId = id;
}

export const KokoroTTSButton = React.memo(() => {
	const parts = useAuiState((s) => s.message.content);
	const messageId = useAuiState((s) => s.message.id);
	const voice = useStore((s) => s.settings.kokoroVoice || 'af_heart');

	const activeMessageId = useStore((s) => s.ttsActiveMessageId);
	const isGenerating = useStore((s) => s.ttsIsGenerating);
	const isSpeaking = useStore((s) => s.ttsIsSpeaking);
	const ttsStart = useStore((s) => s.ttsStart);

	const isActive = activeMessageId === messageId;

	const messageText = useMemo(() => {
		if (!parts || parts.length === 0) return '';
		return parts
			.filter((p: any) => p.type === 'text')
			.map((p: any) => p.text)
			.join('\n\n');
	}, [parts]);

	const handleSpeak = useCallback(async () => {
		if (isActive) {
			stopTTS();
			return;
		}
		if (activeMessageId) {
			stopTTS();
		}
		if (!messageText.trim()) return;
		const requestId = Date.now();
		ttsStart(messageId);
		const s = useStore.getState();
		s.ttsCurrentRequestId = requestId;
		try {
			await startStream(requestId, messageText, voice);
		} catch (err) {
			console.error('[KokoroTTS] Stream failed:', err);
			useStore.getState().ttsStop();
		}
	}, [isActive, activeMessageId, messageId, messageText, voice, ttsStart]);

	return (
		<ActionBarIcon onClick={handleSpeak}>
			{isActive ? (isSpeaking ? <FaStop style={{ fontSize: 14, color: 'var(--wc-accent-green)', animation: 'pulse 1.5s ease infinite' }} /> : <Loader2 size={14} className="animate-spin" />) : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});
