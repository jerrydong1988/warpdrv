// ============================================================
// warpbridge/src/store/index.ts
// Zustand store for frontend state management.
// Universal — browser + Node (Zustand works in both).
// Uses Immer pattern for mutable-like state updates.
// ============================================================

import type {
	IChatThread,
	IChatMessage,
	IToolCall,
	IMessagePatch,
	TThreadId,
	TMessageId,
	TMessagePartId,
	TToolCallId,
	TFolderId,
	IMcpServerState,
	IServerPermission,
	IToolPermission,
	IThreadToolPermission,
	IElicitationRequest,
	IToolAttachment,
	IThreadPatch,
	IMessagePart,
} from '../types';
import { EMessagePartType } from '../types';
import type { WritableDraft } from 'immer';

// ============================================================
// Immer-compatible set/get types (matches WarpCore pattern)
// ============================================================
export type ImmerSet<T> = (fn: (state: WritableDraft<T>) => void) => void;
export type ImmerGet<T> = () => T;

// ============================================================
// Store state shape
// ============================================================
export interface IChatStoreState {
	// Threads - flat map keyed by thread ID
	threads: Record<TThreadId, IChatThread>;

	// Messages - nested map: threadId -> messageId -> IChatMessage
	messagesByThread: Record<TThreadId, Record<TMessageId, IChatMessage>>;
	chunksByMessageId: Record<string, {
		partId: string,
		chunk: string,
		lastUpdate: Date,
	}>;

	// In-memory head tracking (NOT persisted to DB)
	headMessageIdByThread: Record<TThreadId, TMessageId>;

	// Tool calls - global flat map
	toolCallsById: Record<TToolCallId, IToolCall>;
	startingToolsByMessage: Record<TMessageId, string[]>;

	// Inference state per thread
	isRunningByThread: Record<TThreadId, boolean>;

	// Last inference error (cleared after toast is shown)
	inferenceError: { threadId: TThreadId; messageId: TMessageId; error: string } | null;

	// Last embedding error (cleared after toast is shown)
	embeddingError: { error: string } | null;

	// Embedding status - messageIds that have embeddings for current selection
	embeddingStatusByMessage: Record<TMessageId, true>;
	setThreadEmbeddingStatuses: (messageIds: string[]) => void;
	applyEmbeddingEmbedded: (messageId: string) => void;
	removeEmbeddingStatus: (messageId: string) => void;
	clearEmbeddingStatuses: () => void;

	// MCP State
	mcpServers: Record<string, IMcpServerState>;
	serverPermissions: IServerPermission[];
	toolPermissions: IToolPermission[];
	threadToolPermissions: Record<TThreadId, IThreadToolPermission[]>;

	// Current chat state (for active thread context)
	currentThreadId: TThreadId | null;
	currentSystemPrompt: string;
	currentInferenceParams: Record<string, unknown>;
	tempThreadServerId: string | null;
	tempAutoEmbed: boolean;
	tempThreadState: Record<string, unknown>;
	selectedWhisperServerId: string | null;

	// Attached tools (for active thread context)
	attachAllTools: boolean;
	attachedTools: IToolAttachment[];
	// Elicitations (per thread)
	elicitationByThread: Record<TThreadId, IElicitationRequest>;

	// Actions
	applyThreadCreated: (thread: IChatThread) => void;
		applyThreadUpdated: (threadId: TThreadId, updates: IThreadPatch) => void;
	applyThreadDeleted: (threadId: TThreadId) => void;
	applyMessageCreated: (message: IChatMessage) => void;
	applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) => void;
	applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) => void;
	applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) => void;
	applyToolCallStarting: (messageId: TMessageId, name: string) => void;
	applyToolCallCreated: (toolCall: IToolCall) => void;
	applyToolCallUpdated: (toolCall: IToolCall) => void;
	applyInferenceStarted: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceError: (threadId: TThreadId, messageId: TMessageId, error: string) => void;
	applyEmbeddingError: (error: string) => void;
	applyElicitationRequest: (threadId: TThreadId, request: IElicitationRequest) => void;
	applyElicitationResolved: (id: string) => void;
	seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) => void;
	setThreads: (threads: Record<TThreadId, IChatThread>) => void;
	setHeadMessageId: (threadId: TThreadId, messageId: TMessageId) => void;

	// Current chat state actions
	setCurrentThreadId: (id: TThreadId | null) => void;
	setCurrentSystemPrompt: (prompt: string) => void;
	setCurrentInferenceParams: (params: Record<string, unknown>) => void;
	setTempThreadServerId: (id: string | null) => void;
	setTempAutoEmbed: (v: boolean) => void;
	setSelectedWhisperServerId: (id: string | null) => void;

	// Attached tools actions
	setAttachedTools: (attachAll: boolean, tools: IToolAttachment[]) => void;

	// MCP Actions
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) => void;
	setThreadToolPermissions: (threadId: TThreadId, perms: IThreadToolPermission[]) => void;

	// Persisted states
	workspaceStates: Record<TFolderId, Record<string, unknown>>;
	threadStates: Record<TThreadId, Record<string, unknown>>;
	messageStates: Record<TMessageId, Record<string, unknown>>;
	setWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => void;
	getCurrentThreadState: (s?: IChatStoreState) => IChatStoreState["tempThreadState"] | undefined;
	setThreadState: (threadId: TThreadId | null, data: Record<string, unknown>) => void;
	setMessageState: (messageId: TMessageId, data: Record<string, unknown>) => void;
	initWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => void;
	initThreadState: (threadId: TThreadId, data: Record<string, unknown>) => void;
	initMessageStates: (states: Array<{ messageId: TMessageId; data: Record<string, unknown> }>) => void;
	applyWorkspaceStateUpdated: (folderId: TFolderId, data: Record<string, unknown>) => void;
	applyThreadStateUpdated: (threadId: TThreadId, data: Record<string, unknown>) => void;
	applyMessageStateUpdated: (messageId: TMessageId, data: Record<string, unknown>) => void;

	reset: () => void;
}

// ============================================================
// Helper: Flush buffered chunks to message part
// ============================================================
function flushChunksToPart<TState extends IChatStoreState>(
	draft: WritableDraft<TState>,
	messageId: TMessageId,
	msg: IChatMessage,
): void {
	const buffer = draft.chunksByMessageId[messageId];
	if (!buffer || buffer.chunk.length === 0) return;

	const existingPart = msg.content.find((p: IMessagePart) => p.id === buffer.partId);
	if (existingPart && (existingPart.type === EMessagePartType.TEXT || existingPart.type === EMessagePartType.REASONING)) {
		existingPart.text += buffer.chunk;
	}

	delete draft.chunksByMessageId[messageId];
}

// ============================================================
// Helper: Find new head message after deletion
// ============================================================
function findNewHeadMessage(
	threadMessages: Record<TMessageId, IChatMessage>,
	messageId: TMessageId,
	parentId: string | null,
): TMessageId {
	let newHead: TMessageId | null = null;
	let newestCreatedAt = -1;

	for (const sibling of Object.values(threadMessages)) {
		if (sibling.id !== messageId && sibling.parentId === parentId) {
			if (sibling.createdAt > newestCreatedAt) {
				newestCreatedAt = sibling.createdAt;
				newHead = sibling.id;
			}
		}
	}

	return newHead || (parentId as TMessageId);
}

// ============================================================
// Helper: Promote children after message deletion
// ============================================================
function promoteChildrenAfterDeletion<TState extends IChatStoreState>(
	draft: WritableDraft<TState>,
	threadId: TThreadId,
	messageId: TMessageId,
	grandParentId: string | null,
): void {
	for (const child of Object.values(draft.messagesByThread[threadId] ?? {})) {
		if (child.parentId === messageId) {
			child.parentId = grandParentId as TMessageId | null;
		}
	}
}

// ============================================================
// Helper: Resolve elicitation by ID and delete it
// ============================================================
function resolveElicitationById<TState extends IChatStoreState>(
	draft: WritableDraft<TState>,
	id: string,
): void {
	for (const [tid, e] of Object.entries(draft.elicitationByThread)) {
		if (e.id === id) delete draft.elicitationByThread[tid];
	}
}

// ============================================================
// Helper: Calculate head message from array
// ============================================================
function calculateHeadMessage(messages: IChatMessage[]): IChatMessage | null {
	if (messages.length === 0) return null;
	let headMsg = messages[0]!;
	for (let i = 1; i < messages.length; i++) {
		const candidate = messages[i]!;
		if (candidate.createdAt > headMsg.createdAt ||
			(candidate.createdAt === headMsg.createdAt && candidate.id > headMsg.id)) {
			headMsg = candidate;
		}
	}
	return headMsg;
}

// ============================================================
// Slice creator — for use with Zustand's slice pattern.
// Uses Immer for mutable-like updates. Compatible with WarpCore's store.
// Generic over state type to allow integration with superset types (e.g. AppState)
// ============================================================
export function createChatStoreSlice<TState extends IChatStoreState>(
	set: ImmerSet<TState>,
	_get: ImmerGet<TState>,
): IChatStoreState {
	const initialState = {
		threads: {} as Record<TThreadId, IChatThread>,
		startingToolsByMessage: {} as Record<TMessageId, string[]>,
		messagesByThread: {} as Record<TThreadId, Record<TMessageId, IChatMessage>>,
		chunksByMessageId: {},
		headMessageIdByThread: {} as Record<TThreadId, TMessageId>,
		toolCallsById: {} as Record<TToolCallId, IToolCall>,
		isRunningByThread: {} as Record<TThreadId, boolean>,
		inferenceError: null,
		embeddingError: null,
		embeddingStatusByMessage: {} as Record<TMessageId, true>,
		mcpServers: {} as Record<string, IMcpServerState>,
		serverPermissions: [] as IServerPermission[],
		toolPermissions: [] as IToolPermission[],
		threadToolPermissions: {} as Record<TThreadId, IThreadToolPermission[]>,
		currentThreadId: null as TThreadId | null,
		currentSystemPrompt: '',
		currentInferenceParams: {} as Record<string, unknown>,
		tempThreadServerId: null,
		tempAutoEmbed: false,
		tempThreadState: {} as Record<string, unknown>,
		selectedWhisperServerId: null,
		attachAllTools: false,
		attachedTools: [] as IToolAttachment[],
		elicitationByThread: {} as Record<TThreadId, IElicitationRequest>,
		workspaceStates: {} as Record<TFolderId, Record<string, unknown>>,
		threadStates: {} as Record<TThreadId, Record<string, unknown>>,
		messageStates: {} as Record<TMessageId, Record<string, unknown>>,
	};

	return {
		...initialState,

		// ============================================================
		// Thread actions
		// ============================================================
		applyThreadCreated: (thread: IChatThread) =>
			set((draft) => {
				draft.threads[thread.id] = thread;
			}),

		applyThreadUpdated: (threadId: TThreadId, updates: IThreadPatch) =>
			set((draft) => {
				const thread = draft.threads[threadId];
				if (thread) {
					if (updates.title !== undefined) draft.threads[threadId]!.title = updates.title;
					if (updates.folderId !== undefined) draft.threads[threadId]!.folderId = updates.folderId;
					if (updates.systemPrompt !== undefined) draft.threads[threadId]!.systemPrompt = updates.systemPrompt;
					if (updates.meta !== undefined) draft.threads[threadId]!.meta = updates.meta;
					if (updates.totalPromptTokens !== undefined) draft.threads[threadId]!.totalPromptTokens = updates.totalPromptTokens;
					if (updates.totalCompletionTokens !== undefined) draft.threads[threadId]!.totalCompletionTokens = updates.totalCompletionTokens;
				}
			}),

		applyThreadDeleted: (threadId: TThreadId) =>
			set((draft) => {
				delete draft.threads[threadId];
				delete draft.headMessageIdByThread[threadId];
				delete draft.isRunningByThread[threadId];
				delete draft.elicitationByThread[threadId];
				delete draft.threadToolPermissions[threadId];
				delete draft.threadStates[threadId];

				const msgs = draft.messagesByThread[threadId];
				if (msgs) {
					for (const messageId of Object.keys(msgs)) {
						delete draft.embeddingStatusByMessage[messageId];
						delete draft.messageStates[messageId];
					}
				}
				delete draft.messagesByThread[threadId];

				if (draft.currentThreadId === threadId) {
					draft.currentThreadId = crypto.randomUUID();
				}
			}),

		// ============================================================
		// Message actions
		// ============================================================
		applyMessageCreated: (message: IChatMessage) =>
			set((draft) => {
				if (!draft.messagesByThread[message.threadId]) {
					draft.messagesByThread[message.threadId] = {};
				}
				const threadMessages = draft.messagesByThread[message.threadId]!;
				threadMessages[message.id] = message;
				draft.headMessageIdByThread[message.threadId] = message.id;
			}),

		applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;

				flushChunksToPart(draft, messageId, msg);

				if (updates.stats !== undefined) {
					msg.stats = updates.stats;
				}

				if (updates.replaceParts !== undefined) {
					msg.content = [...updates.replaceParts];
					return;
				}

				if (updates.addParts !== undefined) {
					for (const part of updates.addParts) {
						const existingIndex = msg.content.findIndex((p: IMessagePart) => p.id === part.id);
						if (existingIndex >= 0) {
							draft.messagesByThread[threadId]![messageId]!.content[existingIndex]! = part;
						} else {
							msg.content.push(part);
						}
					}
				}
			}),

		applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;

				if (draft.headMessageIdByThread[threadId] === messageId) {
					const threadMessages = draft.messagesByThread[threadId] ?? {};
					draft.headMessageIdByThread[threadId] = findNewHeadMessage(threadMessages, messageId, msg.parentId);
				}

				const grandParentId = msg.parentId;
				promoteChildrenAfterDeletion(draft, threadId, messageId, grandParentId);

				delete draft.messagesByThread[threadId]?.[messageId];
				delete draft.messageStates[messageId];
			}),

		applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;

				const buffer = draft.chunksByMessageId[messageId];
				const now = Date.now();
				const part = msg.content.find((p: IMessagePart) => p.id === partId);

				const flushBuffer = (buf: { partId: string; chunk: string }) => {
					const existingPart = msg.content.find((p: IMessagePart) => p.id === buf.partId);
					if (existingPart && (existingPart.type === EMessagePartType.TEXT || existingPart.type === EMessagePartType.REASONING)) {
						existingPart.text += buf.chunk;
					} else {
						const newPart: IMessagePart = {
							id: buf.partId,
							type: EMessagePartType.TEXT,
							orderIndex: msg.content.length,
							text: buf.chunk,
						};
						msg.content.push(newPart);
					}
				};

				const ensurePartExists = () => {
					if (!part) {
						const newPart: IMessagePart = {
							id: partId,
							type: EMessagePartType.TEXT,
							orderIndex: msg.content.length,
							text: deltaText,
						};
						msg.content.push(newPart);
					} else {
						if (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING) {
							part.text += deltaText;
						}
					}
				};

				if (!buffer) {
					ensurePartExists();
					draft.chunksByMessageId[messageId] = {
						partId,
						chunk: '',
						lastUpdate: new Date(now),
					};
					return;
				}

				if (buffer.partId !== partId) {
					flushBuffer(buffer);
					ensurePartExists();
					draft.chunksByMessageId[messageId] = {
						partId,
						chunk: '',
						lastUpdate: new Date(now),
					};
					return;
				}

				const timeDelta = now - buffer.lastUpdate.getTime();
				if (timeDelta <= 100) {
					buffer.chunk += deltaText;
				} else {
					flushBuffer(buffer);
					if (part && (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING)) {
						part.text += deltaText;
					}
					buffer.chunk = '';
					buffer.lastUpdate = new Date(now);
				}
			}),

		// ============================================================
		// Tool call actions
		// ============================================================
		applyToolCallStarting: (messageId: TMessageId, name: string) =>
			set((draft) => {
				if (!draft.startingToolsByMessage[messageId]) {
					draft.startingToolsByMessage[messageId] = [];
				}
				draft.startingToolsByMessage[messageId]!.push(name);
			}),
		applyToolCallCreated: (toolCall: IToolCall) =>
			set((draft) => {
				draft.toolCallsById[toolCall.id] = toolCall;
			}),

		applyToolCallUpdated: (toolCall: IToolCall) =>
			set((draft) => {
				if (draft.toolCallsById[toolCall.id]) {
					Object.assign(draft.toolCallsById[toolCall.id]!, toolCall);
				}
			}),

		// ============================================================
		// Inference state actions
		// ============================================================
		applyInferenceStarted: (threadId: TThreadId, _messageId: TMessageId) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = true;
			}),

		applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = false;
				delete draft.startingToolsByMessage[messageId];
			}),

		applyInferenceError: (threadId: TThreadId, messageId: TMessageId, error: string) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = false;
				draft.inferenceError = { threadId, messageId, error };
				delete draft.startingToolsByMessage[messageId];
			}),

		// ============================================================
		// Embedding actions
		// ============================================================
		applyEmbeddingError: (error: string) =>
			set((draft) => {
				draft.embeddingError = { error };
			}),
		setThreadEmbeddingStatuses: (messageIds: string[]) =>
			set((draft) => {
				draft.embeddingStatusByMessage = {};
				for (const id of messageIds) {
					draft.embeddingStatusByMessage[id] = true;
				}
			}),
		applyEmbeddingEmbedded: (messageId: string) =>
			set((draft) => {
				draft.embeddingStatusByMessage[messageId] = true;
			}),
		removeEmbeddingStatus: (messageId: string) =>
			set((draft) => {
				delete draft.embeddingStatusByMessage[messageId];
			}),
		clearEmbeddingStatuses: () =>
			set((draft) => {
				draft.embeddingStatusByMessage = {};
			}),

		// ============================================================
		// Elicitation actions
		// ============================================================
		applyElicitationRequest: (threadId: TThreadId, request: IElicitationRequest) =>
			set((draft) => {
				draft.elicitationByThread[threadId] = request;
			}),
		applyElicitationResolved: (id: string) =>
			set((draft) => {
				resolveElicitationById(draft, id);
			}),

		// ============================================================
		// Initial seeding from API fetch
		// ============================================================
		seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) =>
			set((draft) => {
				if (!draft.messagesByThread[threadId]) {
					draft.messagesByThread[threadId] = {};
				}

				for (const msg of messages) {
					draft.messagesByThread[threadId]![msg.id] = msg;
				}

				const headMsg = calculateHeadMessage(messages);
				if (headMsg) {
					draft.headMessageIdByThread[threadId] = headMsg.id;
				}
			}),

		// Thread selection
		setThreads: (threads: Record<TThreadId, IChatThread>) =>
			set((draft) => {
				draft.threads = threads;
			}),

		setHeadMessageId: (threadId: TThreadId, messageId: TMessageId) =>
			set((draft) => {
				draft.headMessageIdByThread[threadId] = messageId;
			}),

		// ============================================================
		// Current chat state actions
		// ============================================================
		setCurrentThreadId: (id: TThreadId | null) =>
			set((draft) => {
				draft.currentThreadId = id;
				draft.tempAutoEmbed = false;
				draft.tempThreadState = {};
			}),

		setCurrentSystemPrompt: (prompt: string) =>
			set((draft) => {
				draft.currentSystemPrompt = prompt;
			}),

		setCurrentInferenceParams: (params: Record<string, unknown>) =>
			set((draft) => {
				draft.currentInferenceParams = params;
			}),

		setTempThreadServerId: (id: string | null) =>
			set((draft) => {
				draft.tempThreadServerId = id;
			}),

		setTempAutoEmbed: (v: boolean) =>
			set((draft) => {
				draft.tempAutoEmbed = v;
			}),

		setSelectedWhisperServerId: (id: string | null) =>
			set((draft) => {
				draft.selectedWhisperServerId = id;
			}),

		// ============================================================
		// Attached tools actions
		// ============================================================
		setAttachedTools: (attachAll: boolean, tools: IToolAttachment[]) =>
			set((draft) => {
				draft.attachAllTools = attachAll;
				draft.attachedTools = tools;
			}),

		// ============================================================
		// MCP Actions
		// ============================================================
		setMcpServers: (servers: Record<string, IMcpServerState>) =>
			set((draft) => {
				draft.mcpServers = servers;
			}),

		setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) =>
			set((draft) => {
				draft.serverPermissions = serverPerms;
				draft.toolPermissions = toolPerms;
			}),

		setThreadToolPermissions: (threadId: TThreadId, perms: IThreadToolPermission[]) =>
			set((draft) => {
				draft.threadToolPermissions[threadId] = perms;
			}),

		// ============================================================
		// Persisted state actions
		// ============================================================
		setWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => {
			set((draft) => {
				draft.workspaceStates[folderId] = { ...(draft.workspaceStates[folderId] || {}), ...data };
			});
		},
		getCurrentThreadState: (s) => {
			s = s || _get();
			const t = s.currentThreadId;
			const haveThread = !!t && s.threads[t];
			return haveThread ? s.threadStates[t] : s.tempThreadState;
		},
		setThreadState: (threadId: TThreadId | null, data: Record<string, unknown>) => {
			set((draft) => {
				const threadInStore = threadId && draft.threads[threadId];
				if (threadId && threadInStore) draft.threadStates[threadId] = { ...(draft.threadStates[threadId] || {}), ...data };
				else draft.tempThreadState = { ...draft.tempThreadState, ...data };
			});
		},
		setMessageState: (messageId: TMessageId, data: Record<string, unknown>) => {
			set((draft) => {
				draft.messageStates[messageId] = { ...(draft.messageStates[messageId] || {}), ...data };
			});
		},
		initWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.workspaceStates[folderId] = data;
			}),
		initThreadState: (threadId: TThreadId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.threadStates[threadId] = data;
			}),
		initMessageStates: (states: Array<{ messageId: TMessageId; data: Record<string, unknown> }>) =>
			set((draft) => {
				for (const { messageId, data } of states) {
					draft.messageStates[messageId] = data;
				}
			}),
		applyWorkspaceStateUpdated: (folderId: TFolderId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.workspaceStates[folderId] = { ...(draft.workspaceStates[folderId] || {}), ...data };
			}),
		applyThreadStateUpdated: (threadId: TThreadId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.threadStates[threadId] = { ...(draft.threadStates[threadId] || {}), ...data };
			}),
		applyMessageStateUpdated: (messageId: TMessageId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.messageStates[messageId] = { ...(draft.messageStates[messageId] || {}), ...data };
			}),

		// ============================================================
		// Reset
		// ============================================================
		reset: () =>
			set(() => ({ ...initialState })),
	};
}
