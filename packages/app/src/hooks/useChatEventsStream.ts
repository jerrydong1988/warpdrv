import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useStore } from '../store';
import { setKokoroCurrentRequestId, startStream } from '../pages/Chat/assistant-ui/KokoroTTS';
import type { IBridgeEvent } from '@warpcore/bridge';

function findLastSentenceEnd(text: string): number {
	for (let i = text.length - 1; i >= 0; i--) {
		const c = text[i];
		if (c === '.' || c === '!' || c === '?') {
			if (i + 1 >= text.length || /\s/.test(text[i + 1] ?? '')) {
				return i;
			}
		}
	}
	return -1;
}

export function tryAutoEmbed(messageId: string, threadId: string) {
	const s = useStore.getState();
	if (!s.selectedEmbeddingServerId) return;
	const thread = s.threads[threadId];
	if (!thread?.meta) return;
	let autoEmbed = false;
	try { autoEmbed = JSON.parse(thread.meta).enableAutoEmbed; } catch { /* ignore */ }
	if (!autoEmbed) return;
	if (s.embeddingStatusByMessage[messageId]) return;
	fetch(`/api/chat/messages/${messageId}/embed`, { method: 'POST' })
		.catch(err => useStore.getState().applyEmbeddingError(String(err)));
}

function handleThreadCreated(event: IBridgeEvent) {
	const applyThreadCreated = useStore.getState().applyThreadCreated;
	applyThreadCreated(event.thread);
}

function handleThreadUpdated(event: IBridgeEvent) {
	const applyThreadUpdated = useStore.getState().applyThreadUpdated;
	applyThreadUpdated(event.threadId, event.updates);
}

function handleThreadDeleted(event: IBridgeEvent) {
	const applyThreadDeleted = useStore.getState().applyThreadDeleted;
	applyThreadDeleted(event.threadId);
}

function handleMessageCreated(event: IBridgeEvent) {
	const applyMessageCreated = useStore.getState().applyMessageCreated;
	applyMessageCreated(event.message);
	if (event.message.role === 'user') {
		tryAutoEmbed(event.message.id, event.message.threadId);
	}
}

function handleMessagePatched(event: IBridgeEvent) {
	const applyMessagePatched = useStore.getState().applyMessagePatched;
	applyMessagePatched(event.messageId, event.threadId, event.updates);
}

function handleMessageDeleted(event: IBridgeEvent) {
	const applyMessageDeleted = useStore.getState().applyMessageDeleted;
	applyMessageDeleted(event.messageId, event.threadId);
}

function handleMessageChunk(event: IBridgeEvent) {
	const applyMessageChunk = useStore.getState().applyMessageChunk;
	applyMessageChunk(event.messageId, event.threadId, event.partId, event.deltaText);

	if (event.partType !== 'text') return;

	const state = useStore.getState();
	const guardPass = state.ttsActiveMessageId === event.messageId && state.ttsIsGenerating === 'vad';
	if (!guardPass) return;

	const msg = state.messagesByThread[event.threadId]?.[event.messageId];
	if (!msg) return;

	const part = msg.content.find((p: any) => p.id === event.partId);
	const buffered = state.chunksByMessageId[event.messageId]?.chunk || '';
	const fullText = ((part as { text?: string })?.text || '') + buffered;
	const spoken = state.ttsSpokenByMessage[event.messageId] || 0;
	const remaining = fullText.slice(spoken);
	const lastEnd = findLastSentenceEnd(remaining);

	if (lastEnd > -1) {
		const sentence = remaining.slice(0, lastEnd + 1);
		const reqId = useStore.getState().ttsVadRequestId ?? '';
		useStore.getState().ttsVadIncSent();
		startStream(
			reqId,
			sentence,
			state.settings.kokoroVoice || 'af_heart',
		).catch((err) => { console.error('[TTS SSE] startStream ERROR:', err); });
		useStore.getState().ttsSetSpokenIndex(event.messageId, spoken + lastEnd + 1);
	} else {
		console.log('[TTS SSE] no sentence boundary found in remaining text');
	}
}

function handleToolCallStarting(event: IBridgeEvent) {
	const applyToolCallStarting = useStore.getState().applyToolCallStarting;
	applyToolCallStarting(event.messageId, event.name);
}

function handleToolCallCreated(event: IBridgeEvent) {
	const applyToolCallCreated = useStore.getState().applyToolCallCreated;
	applyToolCallCreated(event.toolCall);
}

function handleToolCallUpdated(event: IBridgeEvent) {
	const applyToolCallUpdated = useStore.getState().applyToolCallUpdated;
	applyToolCallUpdated(event.toolCall);
}

function handleInferenceStarted(event: IBridgeEvent) {
	const applyInferenceStarted = useStore.getState().applyInferenceStarted;
	applyInferenceStarted(event.threadId, event.messageId);

	const s = useStore.getState();
	if (!s.vadActive) return;

	s.ttsSetSpokenIndex(event.messageId, 0);
	s.ttsVadReset();
	const newId = s.ttsVadNewRequestId();
	setKokoroCurrentRequestId(newId);
	s.ttsStart(event.messageId, 'vad');
}

function handleInferenceEnded(event: IBridgeEvent) {
	const applyInferenceEnded = useStore.getState().applyInferenceEnded;
	applyInferenceEnded(event.threadId, event.messageId);
	tryAutoEmbed(event.messageId, event.threadId);

	const vadActive = useStore.getState().vadActive;
	if (vadActive) {
		useStore.getState().ttsClearSpokenIndex(event.messageId);
	}
}

function handleInferenceError(event: IBridgeEvent) {
	const applyInferenceError = useStore.getState().applyInferenceError;
	applyInferenceError(event.threadId, event.messageId, event.error);
}

function handleElicitationRequest(event: IBridgeEvent) {
	const applyElicitationRequest = useStore.getState().applyElicitationRequest;
	applyElicitationRequest(event.threadId, event.request);
}

function handleElicitationResolved(event: IBridgeEvent) {
	const applyElicitationResolved = useStore.getState().applyElicitationResolved;
	applyElicitationResolved(event.id);
}

function handleEmbeddingError(event: IBridgeEvent) {
	const applyEmbeddingError = useStore.getState().applyEmbeddingError;
	applyEmbeddingError(event.error);
}

function handleEmbeddingEmbedded(event: IBridgeEvent) {
	const state = useStore.getState();
	const selectedServerId = state.selectedEmbeddingServerId;
	const selectedServer = selectedServerId ? state.servers[selectedServerId] : null;
	if (selectedServer?.modelPath === event.modelId && event.topic === 'global' && state.currentThreadId === event.threadId) {
		const applyEmbeddingEmbedded = useStore.getState().applyEmbeddingEmbedded;
		applyEmbeddingEmbedded(event.messageId);
	}
}

function handleEmbeddingRemoved(event: IBridgeEvent) {
	const state = useStore.getState();
	const selectedServerId = state.selectedEmbeddingServerId;
	const selectedServer = selectedServerId ? state.servers[selectedServerId] : null;
	if (selectedServer?.modelPath === event.modelId && event.topic === 'global') {
		const removeEmbeddingStatus = useStore.getState().removeEmbeddingStatus;
		removeEmbeddingStatus(event.messageId);
	}
}

function handleWorkspaceStateUpdated(event: IBridgeEvent) {
	const applyWorkspaceStateUpdated = useStore.getState().applyWorkspaceStateUpdated;
	applyWorkspaceStateUpdated(event.folderId, event.data);
}

function handleThreadStateUpdated(event: IBridgeEvent) {
	const applyThreadStateUpdated = useStore.getState().applyThreadStateUpdated;
	applyThreadStateUpdated(event.threadId, event.data);
}

function handleMessageStateUpdated(event: IBridgeEvent) {
	const applyMessageStateUpdated = useStore.getState().applyMessageStateUpdated;
	applyMessageStateUpdated(event.messageId, event.data);
}

const eventHandlers: Record<string, (event: IBridgeEvent) => void> = {
	'thread.created': handleThreadCreated,
	'thread.updated': handleThreadUpdated,
	'thread.deleted': handleThreadDeleted,
	'message.created': handleMessageCreated,
	'message.patched': handleMessagePatched,
	'message.deleted': handleMessageDeleted,
	'message.chunk': handleMessageChunk,
	'tool_call.starting': handleToolCallStarting,
	'tool_call.created': handleToolCallCreated,
	'tool_call.updated': handleToolCallUpdated,
	'inference.started': handleInferenceStarted,
	'inference.ended': handleInferenceEnded,
	'inference.error': handleInferenceError,
	'elicitation_request': handleElicitationRequest,
	'elicitation_resolved': handleElicitationResolved,
	'embedding.error': handleEmbeddingError,
	'embedding.embedded': handleEmbeddingEmbedded,
	'embedding.removed': handleEmbeddingRemoved,
	'workspace_state.updated': handleWorkspaceStateUpdated,
	'thread_state.updated': handleThreadStateUpdated,
	'message_state.updated': handleMessageStateUpdated,
};

export function useChatEventsStream() {
	useEffect(() => {
		console.log('[Chat SSE] Creating EventSource connection to /api/chat/events');
		const es = new EventSource('/api/chat/events');

		es.onopen = () => {
			console.log('[Chat SSE] ✅ Connection opened successfully');
		};

		const handleEvent = (e: MessageEvent) => {
			const event = JSON.parse(e.data) as IBridgeEvent;
			const handler = eventHandlers[event.type];
			if (handler) {
				handler(event);
			}
		};

		// Register listeners per event type
		es.addEventListener('thread.created', handleEvent);
		es.addEventListener('thread.updated', handleEvent);
		es.addEventListener('thread.deleted', handleEvent);
		es.addEventListener('message.created', handleEvent);
		es.addEventListener('message.patched', handleEvent);
		es.addEventListener('message.deleted', handleEvent);
		es.addEventListener('message.chunk', handleEvent);
		es.addEventListener('tool_call.starting', handleEvent);
		es.addEventListener('tool_call.created', handleEvent);
		es.addEventListener('tool_call.updated', handleEvent);
		es.addEventListener('inference.started', handleEvent);
		es.addEventListener('inference.ended', handleEvent);
		es.addEventListener('inference.error', handleEvent);
		es.addEventListener('elicitation_request', handleEvent);
		es.addEventListener('elicitation_resolved', handleEvent);
		es.addEventListener('embedding.error', handleEvent);
		es.addEventListener('embedding.embedded', handleEvent);
		es.addEventListener('embedding.removed', handleEvent);
		es.addEventListener('workspace_state.updated', handleEvent);
		es.addEventListener('thread_state.updated', handleEvent);
		es.addEventListener('message_state.updated', handleEvent);
		es.onerror = (err) => {
			console.error('[Chat SSE] ❌ Connection error:', err);
		};

		return () => {
			console.log('[Chat SSE] Cleaning up EventSource connection');
			es.close();
		};
	}, []);
}
