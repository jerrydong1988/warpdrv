// ============================================================
// warpbridge/src/orchestrator/index.ts
//
// Each inference pass produces ONE assistant message. If the model
// emits tool calls, they finish (auto-execute or wait for approval),
// and a NEW assistant message is created as a child of the last tool
// message for the next pass. No appending across tool boundaries.
//
// All state changes emit events via the broadcaster. No direct SSE.
// ============================================================
import crypto from 'crypto';
import type { EventNode } from '@warpcore/realmcore';
import { buildLlamaInferenceParams } from './inferenceParams';
import type { IMcpClient, IPermissions, IPersistence, IBridgeBroadcaster } from '../types/interfaces';
import type {
	ICompletionRequest,
	IToolDefinition,
	IToolCall,
	IOpenAITool,
	IChatMessageStats,
	IChatMessage,
	IMessagePart,
	IMessagePartToolCall,
	TMessageId,
	TThreadId,
	TFolderId,
} from '../types';
import { EChatRole, EMessagePartType, EToolCallStatus, EToolApprovalMode } from '../types';
import { parseSSEBuffer, accumulateToolCallDelta, finalizeToolCalls, type IToolCallAccumulator } from '../parser';
import { validateToolArgs, cleanSchema } from '../validation';
import { convertMessagesToOpenAIFormat, type TOpenAIMessage } from '../messageConverter';

const MAX_PASSES = 10;

// No chunk from the model for this long means it is wedged, not thinking.
const STREAM_IDLE_TIMEOUT_MS = 120_000;

// A tool call that never returns (hanging MCP server) used to hold the whole
// inference pass — and the thread with it — open forever.
const TOOL_EXEC_TIMEOUT_MS = 5 * 60_000;

// ReadableStreamReadResult is not in every lib set this package compiles with.
type TStreamReadResult = Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>;

export interface IOrchestratorConfig {
	mcpClient: IMcpClient;
	permissions: IPermissions;
	persistence: IPersistence;
	broadcaster: IBridgeBroadcaster;
	eventNode: EventNode;
	onMcpServersChanged?: (servers: Record<string, unknown>) => void;
	inferenceAuthHeader?: string; // Authorization header value for inference calls (e.g. 'Bearer <token>')
}

interface ITurnState {
	assistantMessageId: TMessageId;
	partOrderCounter: number;
	currentTextPart: { id: string; text: string } | null;
	currentReasoningPart: { id: string; text: string } | null;
}

interface IPassResult {
	hadToolCalls: boolean;
	needsAsk: boolean;
	lastToolMessageId: TMessageId | null;
}

export interface IPureCompletionResult {
	content: IMessagePart[];
	stats: IChatMessageStats | null;
	finishReason: string;
}

export type TPureCompletionChunkHandler = (partType: string, deltaText: string) => void;

// Track in-flight inference URLs per thread so resume can continue
const threadInferenceUrls: Map<TThreadId, string> = new Map();
const MAX_TRACKED_INFERENCE_URLS = 200;

export class Orchestrator {
	private mcpClient: IMcpClient;
	private permissions: IPermissions;
	private persistence: IPersistence;
	private broadcaster: IBridgeBroadcaster;
	private eventNode: EventNode;
	private pureCompletionControllers: Record<string, AbortController> = {};
	private inferenceAuthHeader?: string;

	constructor(config: IOrchestratorConfig) {
		this.mcpClient = config.mcpClient;
		this.permissions = config.permissions;
		this.persistence = config.persistence;
		this.broadcaster = config.broadcaster;
		this.eventNode = config.eventNode;
		this.inferenceAuthHeader = config.inferenceAuthHeader;
		this.installStateHandlers();
	}

	private installStateHandlers(): void {
		this.eventNode.fn('bridge.getAllMessageStatesByThread', async (api) => {
			const threadId = api.payload as string;
			return await this.persistence.getMessageStatesByThreadId(threadId);
		});

		this.eventNode.fn('bridge.getThreadState', async (api) => {
			const threadId = api.payload as string;
			return await this.persistence.getThreadState(threadId);
		});

		this.eventNode.fn('bridge.getWorkspaceState', async (api) => {
			const folderId = api.payload as string;
			return await this.persistence.getWorkspaceState(folderId);
		});

		this.eventNode.fn('bridge.getMessageState', async (api) => {
			const messageId = api.payload as string;
			return await this.persistence.getMessageState(messageId);
		});

		this.eventNode.fn('bridge.getToolCallsForMessage', async (api) => {
			const messageId = api.payload as string;
			return await this.persistence.getToolCallsForMessage(messageId);
		});

		this.eventNode.fn('bridge.updateMessageState', async (api) => {
			const payload = api.payload as { messageId: string; data: Record<string, unknown> };
			await this.persistence.updateMessageState(payload.messageId, payload.data);
		});

		this.eventNode.fn('bridge.listGuardrails', async () => {
			return await this.persistence.listGuardrails();
		});

		this.eventNode.fn('bridge.getMode', async (api) => {
			const id = api.payload as string;
			return await this.persistence.getMode(id);
		});

		this.eventNode.fn('bridge.handlePureCompletion', async (api) => {
			const payload = api.payload as {
				inferenceRequestId: string;
				inferenceUrl: string;
				messages: Array<TOpenAIMessage>;
				inferenceParams?: Record<string, unknown>;
			};
			const { inferenceRequestId, inferenceUrl, messages, inferenceParams } = payload;
			if (!inferenceRequestId) throw new Error('inferenceRequestId is required');
			// The id is client-supplied. A second caller reusing an in-flight id used
			// to replace the first controller (making that run uncancellable) and its
			// cleanup then deleted the entry that no longer belonged to it.
			if (this.pureCompletionControllers[inferenceRequestId]) {
				throw new Error(`Pure completion request ${inferenceRequestId} is already in flight`);
			}
			const controller = new AbortController();
			this.pureCompletionControllers[inferenceRequestId] = controller;
			try {
				return await this.handlePureCompletions(
					inferenceUrl,
					messages,
					inferenceParams || {},
					(partType, deltaText) => {
						this.eventNode.broadcast('bridge.pure_completion_chunk.' + inferenceRequestId, { partType, deltaText });
					},
					controller.signal,
				);
			} finally {
				if (this.pureCompletionControllers[inferenceRequestId] === controller) {
					delete this.pureCompletionControllers[inferenceRequestId];
				}
			}
		});

		this.eventNode.fn('bridge.cancelPureCompletion', async (api) => {
			const id = api.payload as string;
			const controller = this.pureCompletionControllers[id];
			if (controller) {
				controller.abort();
				delete this.pureCompletionControllers[id];
			}
			return { cancelled: !!controller };
		});
	}

	// A model server that stops mid-stream used to leave reader.read() pending
	// forever, holding the HTTP request and its SSE client open forever.
	private async readWithIdleTimeout(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		idleMs: number,
	): Promise<TStreamReadResult> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`Inference stream produced no data for ${Math.round(idleMs / 1000)}s`)),
						idleMs,
					);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	// A hanging MCP server used to hold the whole inference pass — and the thread
	// behind it — open indefinitely. Bound the wait and surface a timeout as the
	// tool's error result instead.
	private async executeToolCallBounded(
		serverName: string,
		toolName: string,
		args: Record<string, unknown>,
		threadId: TThreadId,
	): Promise<{ content: unknown; isError: boolean }> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const pending = this.mcpClient.executeToolCall(serverName, toolName, args, threadId);
		// The call keeps running after a timeout; swallow its late settlement so it
		// cannot surface as an unhandled rejection.
		Promise.resolve(pending).catch(() => {});
		try {
			return await Promise.race([
				pending,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`Tool ${serverName}.${toolName} did not return within ${Math.round(TOOL_EXEC_TIMEOUT_MS / 1000)}s`)),
						TOOL_EXEC_TIMEOUT_MS,
					);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	// Walk parentId chain from a given message ID up to root, return root-to-leaf
	private buildBranchChain(allMessages: IChatMessage[], fromMessageId: TMessageId | null | undefined): IChatMessage[] {
		if (!fromMessageId) return [];
		const msgMap = new Map<TMessageId, IChatMessage>();
		for (const m of allMessages) msgMap.set(m.id, m);

		const chain: IChatMessage[] = [];
		// parentId is data we do not control (imported threads, a hand-edited DB).
		// A cycle used to spin here forever, holding the request open.
		const seen = new Set<TMessageId>();
		let currentId: TMessageId | null | undefined = fromMessageId;
		while (currentId) {
			if (seen.has(currentId)) break;
			seen.add(currentId);
			const msg = msgMap.get(currentId);
			if (!msg) break;
			chain.push(msg);
			currentId = msg.parentId ?? undefined;
		}
		return chain.reverse();
	}

	// Build the full message chain for an inference pass:
	// workspace context + system prompt + branch history from DB + any extra messages.
	private async buildMessageChain(
		request: ICompletionRequest,
		fromMessageId: TMessageId | undefined,
		extraMessages: Array<TOpenAIMessage> = [],
	): Promise<Array<TOpenAIMessage>> {
		const baseMessages: Array<TOpenAIMessage> = [];

		if (request.folderId) {
			const ctx = await this.buildWorkspaceContext(request.folderId);
			if (ctx) baseMessages.push(ctx);
		}

		if (request.systemPrompt) {
			baseMessages.push({ role: 'system', content: request.systemPrompt });
		}

		const allMessages = await this.persistence.getMessages(request.threadId);
		const allToolCalls = await this.persistence.getToolCallsForThread(request.threadId);
		const toolCallsMap: Record<string, IToolCall> = {};
		for (const tc of allToolCalls) toolCallsMap[tc.id] = tc;

		const branchChain = this.buildBranchChain(allMessages, fromMessageId);

		// Pipe branch for compaction — applet can truncate
		const processedChain = await this.eventNode.pipe(
			'bridge.buildBranchChain',
			{
				allMessages,
				branch: branchChain,
				request,
				fromMessageId,
				extraMessages,
			},
			'.',
			branchChain,
		) as IChatMessage[];

		const openAIMessages = convertMessagesToOpenAIFormat(processedChain, toolCallsMap);
		baseMessages.push(...openAIMessages);
		baseMessages.push(...extraMessages);

		return baseMessages;
	}

	private async buildWorkspaceContext(folderId: TFolderId): Promise<{ role: 'system'; content: string } | null> {
		const workspace = await this.persistence.getWorkspace(folderId);
		if (!workspace) return null;
		const folder = await this.persistence.getFolder(folderId);
		if (!folder) return null;
		const desc = (workspace.data as Record<string, unknown>)?.description as string | undefined;
		const content = desc ? `Workspace: ${folder.name}\n${desc}` : `Workspace: ${folder.name}`;
		return { role: 'system', content };
	}

	private async resolveWsVars(threadId: TThreadId): Promise<Record<string, unknown> | null> {
		const thread = await this.persistence.getThread(threadId);
		if (!thread) return null;

		if (thread.folderId) {
			const folder = await this.persistence.getFolder(thread.folderId);
			if (!folder) return null;
			const workspace = await this.persistence.getWorkspace(thread.folderId);
			const wsVars: Record<string, unknown> = {
				threadId,
				folderId: folder.id,
				topic: folder.topic,
				name: folder.name,
			};
			if (workspace) {
				for (const [key, value] of Object.entries(workspace.data)) {
					wsVars[key] = value;
				}
			}
			return wsVars;
		}

		return { threadId, folderId: null, topic: 'global', name: 'global' };
	}

	private async resolveThreadVars(threadId: TThreadId): Promise<Record<string, unknown> | null> {
		const threadState = await this.persistence.getThreadState(threadId);
		let result = threadState || {};
		if (!result.projectRoot) {
			const thread = await this.persistence.getThread(threadId);
			if (thread?.folderId) {
				const wsState = await this.persistence.getWorkspaceState(thread.folderId);
				if (wsState?.projectRoot) {
					result = { ...result, projectRoot: wsState.projectRoot };
				}
			}
		}
		return Object.keys(result).length > 0 ? result : null;
	}

	// V2: builds message chain from persistence instead of receiving it from frontend
	async handleCompletionV2(
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		try {
			// Auto-create thread if needed
			let thread = await this.persistence.getThread(request.threadId);
			let isNewThread: boolean = false;
			if (!thread) {
				isNewThread = true;
				const now = Date.now();
				let title = 'New Chat';
				if (request.userMessage) {
					title = this.truncateTitle(request.userMessage.content);
				}
				thread = {
					id: request.threadId,
					title,
					folderId: request.folderId ?? null,
					systemPrompt: '',
					meta: JSON.stringify({ serverId: request.serverId ?? null, whisperServerId: request.whisperServerId ?? null, tags: [], enableAutoEmbed: request.enableAutoEmbed ?? false }),
					totalPromptTokens: 0,
					totalCompletionTokens: 0,
					createdAt: now,
					updatedAt: now,
				};
				await this.persistence.createThread(thread);
				if (request.threadState) await this.persistence.updateThreadState(thread.id, request.threadState);
				await this.persistence.setThreadConfig({
					threadId: request.threadId,
					presetId: request.presetId ?? null,
					systemPrompt: request.systemPrompt ?? '',
					params: JSON.stringify(request.inferenceParams ?? {}),
				});
				this.broadcaster.emit({ type: 'thread.created', thread });
			}

			// Stash inference URL for post-approval resume
			threadInferenceUrls.set(request.threadId, inferenceUrl);
			// Bound the map — entries were previously never evicted, growing
			// without limit over a long-lived server.
			if (threadInferenceUrls.size > MAX_TRACKED_INFERENCE_URLS) {
				const oldest = threadInferenceUrls.keys().next().value;
				if (oldest !== undefined) threadInferenceUrls.delete(oldest);
			}

			// Determine parent for the first assistant message
			let parentForAssistant: string | null = request.parentId ?? null;

			// If userMessage content provided, bridge generates ID and saves
			let userMsg: IChatMessage | null = null;
			if (request.userMessage) {
				const userMessageId = crypto.randomUUID();
				const content: IMessagePart[] = [{
					id: crypto.randomUUID(),
					type: EMessagePartType.TEXT,
					orderIndex: 0,
					text: request.userMessage.content,
				}];

				if (request.attachments?.length) {
					for (const att of request.attachments) {
						content.push({
							id: crypto.randomUUID(),
							type: EMessagePartType.ATTACHMENT,
							orderIndex: content.length,
							data: att.data,
							mimeType: att.mimeType,
							fileName: att.fileName,
							fileSize: att.fileSize,
							extractedText: att.extractedText,
						});
					}
				}

				const userActualTokens = content.reduce((acc, p) => {
					if (p.type === EMessagePartType.TEXT || p.type === EMessagePartType.REASONING) return acc + (p.text ?? '').length;
					if (p.type === EMessagePartType.ATTACHMENT) return acc + (p.data?.length ?? 0);
					return acc;
				}, 0);
				userMsg = {
					id: userMessageId,
					parentId: request.parentId ?? null,
					threadId: request.threadId,
					role: EChatRole.USER,
					content,
					stats: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, actualTokens: Math.ceil(userActualTokens / 4) },
					createdAt: Date.now(),
				};
				await this.persistence.createMessage(userMsg);
				await this.persistence.incrementThreadTokens(request.threadId, userMsg.stats!.actualTokens ?? 0, 0);
				if (request.messageState) {
					await this.persistence.updateMessageState(userMessageId, request.messageState);
				}
				this.broadcaster.emit({ type: 'message.created', message: userMsg });
				parentForAssistant = userMessageId;
			}
			const enabledTools = await this.resolveEnabledTools(request);

			// Build base messages for LLM context — V2: from persistence
			const baseMessages = await this.buildMessageChain(request, request.parentId ?? undefined);
			if (userMsg) {
				userMsg = await this.eventNode.pipe(
					'bridge.preConvertNewMsg',
					{ request, userMsg },
					'.',
					userMsg,
				) as IChatMessage;

				const converted = convertMessagesToOpenAIFormat([userMsg], {});
				baseMessages.push(...converted);
			}

			await this.executePass(
				inferenceUrl,
				request,
				parentForAssistant,
				baseMessages,
				enabledTools,
				abortSignal,
			);

			// Fire title generation after response completes (fire-and-forget)
			if (request.userMessage && !!request.generateTitle && isNewThread) {
				this.generateTitle(inferenceUrl, request.userMessage.content)
					.then(title => {
						this.persistence.updateThread(request.threadId, { title });
						this.broadcaster.emit({ type: 'thread.updated', threadId: request.threadId, updates: { title } });
					})
					.catch(() => {
						// Title generation failed, keep truncated title
					});
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (abortSignal.aborted) {
				this.broadcaster.emit({
					type: 'inference.ended',
					threadId: request.threadId,
					messageId: request.parentId ?? crypto.randomUUID(),
				});
			} else {
				console.error('[Orchestrator] handleCompletionV2 error:', errorMsg);
				this.broadcaster.emit({
					type: 'inference.error',
					threadId: request.threadId,
					messageId: request.parentId ?? crypto.randomUUID(),
					error: errorMsg,
				});
			}
		}
	}

	// Execute one inference pass: create assistant message, run inference,
	// emit lifecycle events, and recursively trigger the next pass if tool
	// calls auto-resolved. Does NOT loop.
	private async executePass(
		inferenceUrl: string,
		request: ICompletionRequest,
		parentId: TMessageId | null,
		messages: Array<TOpenAIMessage>,
		enabledTools: IToolDefinition[],
		abortSignal: AbortSignal,
		passCount: number = 0,
	): Promise<void> {
		if (abortSignal.aborted) return;

		// Enforce max pass depth to prevent infinite recursion from misbehaving models
		if (passCount >= MAX_PASSES) {
			console.warn(`[Orchestrator] Max passes (${MAX_PASSES}) exceeded, stopping tool call loop`);
			return;
		}

		// Create new assistant message for this pass
		const assistantMsg = await this.createAssistantMessage(request.threadId, parentId);
		const turn: ITurnState = {
			assistantMessageId: assistantMsg.id,
			partOrderCounter: 0,
			currentTextPart: null,
			currentReasoningPart: null,
		};

		this.broadcaster.emit({
			type: 'inference.started',
			threadId: request.threadId,
			messageId: assistantMsg.id,
		});
		let result: IPassResult | null = null;
		try {
			result = await this.runPass(
				inferenceUrl,
				messages,
				enabledTools,
				request,
				abortSignal,
				turn,
			);
		} finally {
			// Final checkpoint patch with full message state, then inference.ended
			const finalMessage = await this.persistence.getMessage(assistantMsg.id);
			if (finalMessage) {
				this.broadcaster.emit({
					type: 'message.patched',
					messageId: assistantMsg.id,
					threadId: request.threadId,
					updates: {
						stats: finalMessage.stats ?? undefined,
						replaceParts: finalMessage.content,
					},
				});
			}
			this.broadcaster.emit({
				type: 'inference.ended',
				threadId: request.threadId,
				messageId: assistantMsg.id,
			});
			this.eventNode.broadcast('bridge.inference.finish', {
				threadId: request.threadId,
				messageId: assistantMsg.id,
				inferenceUrl,
				messages,
				message: finalMessage,
			});
		}

		// Stop conditions: waiting for approval, or no tool calls fired
		if (!result) return;
		if (result.needsAsk) return;
		if (!result.hadToolCalls) return;

		// Tool calls auto-resolved — trigger next pass with new assistant message
		// child of the last tool message. Recursive, not iterative.
		await this.executePass(
			inferenceUrl,
			request,
			result.lastToolMessageId,
			messages,
			enabledTools,
			abortSignal,
			passCount + 1,
		);
	}

	private async createAssistantMessage(threadId: TThreadId, parentId: TMessageId | null): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: crypto.randomUUID(),
			parentId,
			threadId,
			role: EChatRole.ASSISTANT,
			content: [],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: 'message.created', message: msg });
		return msg;
	}

	private async createToolMessage(threadId: TThreadId, parentId: TMessageId, toolCallId: string): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: crypto.randomUUID(),
			parentId,
			threadId,
			role: EChatRole.TOOL,
			content: [{
				id: crypto.randomUUID(),
				type: EMessagePartType.TOOL_CALL,
				orderIndex: 0,
				toolCallId,
			}],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: 'message.created', message: msg });
		return msg;
	}

	// Single inference pass. Streams to llama-server, persists parts,
	// emits chunk and patch events. Returns whether tool calls fired.
	private async runPass(
		inferenceUrl: string,
		messages: Array<TOpenAIMessage>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
		abortSignal: AbortSignal,
		turn: ITurnState,
	): Promise<IPassResult> {
		const openAiTools: IOpenAITool[] = enabledTools.map(t => ({
			type: 'function' as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: cleanSchema(t.inputSchema),
			},
		}));
		const hasTools = openAiTools.length > 0;

		let finalMessages = [...messages];
		finalMessages = await this.eventNode.pipe(
			'bridge.preInference',
			{ request, messages: finalMessages },
			'.',
			finalMessages,
		) as Array<TOpenAIMessage>;

		const body: Record<string, unknown> = {
			model: 'model',
			messages: finalMessages,
			stream: true,
			...(hasTools ? { tools: openAiTools } : {}),
			...this.buildInferenceParams(request.inferenceParams),
		};

		const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.inferenceAuthHeader ? { Authorization: this.inferenceAuthHeader } : {}) },
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok || !response.body) {
			const errBody = await response.text().catch(() => '');
			const errorMessage = `Inference error ${response.status}: ${errBody}`;
			console.error(`[Orchestrator] ${errorMessage}`);
			this.broadcaster.emit({
				type: 'inference.error',
				threadId: request.threadId,
				messageId: turn.assistantMessageId,
				error: errorMessage,
			});
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let fullText = '';
		let reasoningText = '';
		let timings: Record<string, number> | null = null;
		let usage: Record<string, number> | null = null;
		let finishReason = '';
		const toolCallAccumulators: Record<number, IToolCallAccumulator> = {};
		let streamError: string | null = null;

		try {
			while (true) {
				let result: TStreamReadResult;
				try {
					result = await this.readWithIdleTimeout(reader, STREAM_IDLE_TIMEOUT_MS);
				} catch (err) {
					streamError = err instanceof Error ? err.message : String(err);
					break;
				}
				if (result.done) {
					break;
				}
				buffer += decoder.decode(result.value, { stream: true });
				const { chunks, remaining, done: sseDone } = parseSSEBuffer(buffer);
				buffer = remaining;

				for (const chunk of chunks) {
					if (abortSignal.aborted) {
						await this.flushReasoningPart(turn);
						await this.flushTextPart(turn);
						return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
					}
					if (chunk.error || chunk.warpcore_event === 'error') {
						streamError = chunk.error ?? 'Inference error from server';
						break;
					}
					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						fullText += delta.content;
						if (turn.currentReasoningPart) { await this.flushReasoningPart(turn); }
						if (!turn.currentTextPart) {
							turn.currentTextPart = { id: crypto.randomUUID(), text: '' };
							this.broadcaster.emit({
								type: 'message.patched',
								messageId: turn.assistantMessageId,
								threadId: request.threadId,
								updates: {
									addParts: [{
										id: turn.currentTextPart.id,
										type: EMessagePartType.TEXT,
										orderIndex: turn.partOrderCounter,
										text: '',
									}],
								},
							});
						}
						turn.currentTextPart.text += delta.content;
						this.broadcaster.emit({
							type: 'message.chunk',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							partId: turn.currentTextPart.id,
							partType: EMessagePartType.TEXT,
							deltaText: delta.content,
						});
					}

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						if (turn.currentTextPart) { await this.flushTextPart(turn); }
						if (!turn.currentReasoningPart) {
							turn.currentReasoningPart = { id: crypto.randomUUID(), text: '' };
							this.broadcaster.emit({
								type: 'message.patched',
								messageId: turn.assistantMessageId,
								threadId: request.threadId,
								updates: {
									addParts: [{
										id: turn.currentReasoningPart.id,
										type: EMessagePartType.REASONING,
										orderIndex: turn.partOrderCounter,
										text: '',
									}],
								},
							});
						}
						turn.currentReasoningPart.text += delta.reasoning_content;
						this.broadcaster.emit({
							type: 'message.chunk',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							partId: turn.currentReasoningPart.id,
							partType: EMessagePartType.REASONING,
							deltaText: delta.reasoning_content,
						});
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							const hadName = !!toolCallAccumulators[tc.index]?.name;
							accumulateToolCallDelta(toolCallAccumulators, tc);
							if (!hadName) {
								const name = toolCallAccumulators[tc.index]?.name;
								if (name) {
									this.broadcaster.emit({
										type: 'tool_call.starting',
										threadId: request.threadId,
										messageId: turn.assistantMessageId,
										name,
									});
								}
							}
						}
					}

		const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) {
						finishReason = fr;
					}
		if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
				if (sseDone) {
					break;
				}
			}

			// Flush any final unterminated SSE line — usage/timings/error chunks
			// frequently arrive without a trailing newline and were dropped.
			if (buffer.trim()) {
				const { chunks: finalChunks } = parseSSEBuffer(buffer, true);
				buffer = '';
				for (const chunk of finalChunks) {
					if (chunk.error || chunk.warpcore_event === 'error') {
						streamError = chunk.error ?? 'Inference error from server';
						break;
					}
					const delta = chunk.choices?.[0]?.delta;
					if (delta?.content) {
						fullText += delta.content;
						if (turn.currentReasoningPart) { await this.flushReasoningPart(turn); }
						if (!turn.currentTextPart) {
							turn.currentTextPart = { id: crypto.randomUUID(), text: '' };
							this.broadcaster.emit({
								type: 'message.patched',
								messageId: turn.assistantMessageId,
								threadId: request.threadId,
								updates: {
									addParts: [{
										id: turn.currentTextPart.id,
										type: EMessagePartType.TEXT,
										orderIndex: turn.partOrderCounter,
										text: '',
									}],
								},
							});
						}
						turn.currentTextPart.text += delta.content;
						this.broadcaster.emit({
							type: 'message.chunk',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							partId: turn.currentTextPart.id,
							partType: EMessagePartType.TEXT,
							deltaText: delta.content,
						});
					}
					const fr2 = chunk.choices?.[0]?.finish_reason;
					if (fr2) finishReason = fr2;
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}
		} finally {
			// Always release the upstream stream: an early return or a throw used to
			// leave the response body (and the connection to the model) open.
			try { await reader.cancel(); } catch { /* already closed */ }
			await this.flushReasoningPart(turn);
			await this.flushTextPart(turn);
		}

		if (streamError) {
			this.broadcaster.emit({
				type: 'inference.error',
				threadId: request.threadId,
				messageId: turn.assistantMessageId,
				error: streamError,
			});
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		const finalToolCalls = finalizeToolCalls(toolCallAccumulators);

		if (timings || usage) {
			const actualTokens = Math.ceil((fullText.length + reasoningText.length) / 4);
			const stats: IChatMessageStats = {
				promptTokens: (usage?.prompt_tokens ?? timings?.prompt_n ?? 0),
				completionTokens: (usage?.completion_tokens ?? timings?.predicted_n ?? 0),
				reasoningTokens: (usage?.reasoning_tokens ?? 0),
				actualTokens,
				promptPerSecond: timings?.prompt_per_second ?? 0,
				predictedPerSecond: timings?.predicted_per_second ?? 0,
				promptMs: timings?.prompt_ms ?? 0,
				predictedMs: timings?.predicted_ms ?? 0,
			};
			await this.persistence.updateMessage(turn.assistantMessageId, { stats });
			this.broadcaster.emit({
				type: 'message.patched',
				messageId: turn.assistantMessageId,
				threadId: request.threadId,
				updates: { stats },
			});
			await this.persistence.incrementThreadTokens(
				request.threadId,
				0,
				stats.actualTokens ?? 0,
			);
		}

		messages.push({
			role: 'assistant',
			content: fullText || null,
			tool_calls: finalToolCalls.map(tc => ({
				id: tc.id,
				type: 'function',
				function: { name: tc.name, arguments: tc.arguments },
			})),
		});

		if (finalToolCalls.length === 0 || finishReason !== 'tool_calls') {
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		// Process tool calls — chain tool messages linearly off the assistant
		let needsAsk = false;
		let lastToolMessageId: TMessageId | null = null;
		let previousToolMessageId: TMessageId = turn.assistantMessageId;

		for (const tc of finalToolCalls) {
			if (abortSignal.aborted) return { hadToolCalls: true, needsAsk: false, lastToolMessageId };

			const enabledTool = enabledTools.find(t => t.name === tc.name);
			const serverName = enabledTool?.serverName ?? this.mcpClient.findToolServer(tc.name);
			//console.log('[Orch] tool call:', { toolName: tc.name, serverName, threadId: request.threadId });
			let args: Record<string, unknown> = {};
			let validationError: string | null = null;
			try { args = JSON.parse(tc.arguments || '{}'); } catch (parseErr) {
				// Malformed tool arguments — treat as validation error instead of silently using {}
				console.warn(`[Orchestrator] Failed to parse tool arguments for '${tc.name}':`, parseErr);
				validationError = `Malformed tool arguments: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
			}

			if (!serverName) {
				validationError = `No MCP server for tool '${tc.name}'`;
			} else {
				const toolDef = enabledTools.find(t => t.name === tc.name);
				if (toolDef) {
					const validation = validateToolArgs(toolDef.inputSchema, args);
					if (!validation.valid) {
						validationError = `Invalid arguments: ${validation.errors.join(', ')}`;
					}
				}
			}

			// Use model's raw tool call ID for correlation with guardrails
			const toolCallId = tc.id;
			const toolMessageId = crypto.randomUUID();

			const toolCallRecord: IToolCall = {
				id: toolCallId,
				messageId: toolMessageId,
				threadId: request.threadId,
				serverName: serverName ?? '',
				toolName: tc.name,
				arguments: JSON.stringify(args),
				result: validationError ? JSON.stringify({ error: validationError }) : null,
				status: validationError ? EToolCallStatus.ERROR : EToolCallStatus.PENDING,
				error: validationError,
				createdAt: Date.now(),
				resolvedAt: validationError ? Date.now() : null,
			};

			// Order: tool_call.created -> message.patched (assistant gets tool_call part) -> message.created (tool message)
			await this.persistence.createToolCall(toolCallRecord);
			this.broadcaster.emit({ type: 'tool_call.created', toolCall: toolCallRecord });

			const toolPart: IMessagePart = {
				id: crypto.randomUUID(),
				type: EMessagePartType.TOOL_CALL,
				orderIndex: turn.partOrderCounter++,
				toolCallId,
			};
			await this.persistence.appendMessagePart(turn.assistantMessageId, toolPart);
			this.broadcaster.emit({
				type: 'message.patched',
				messageId: turn.assistantMessageId,
				threadId: request.threadId,
				updates: { addParts: [toolPart] },
			});

			// Tool message chained off previous tool message (or assistant for first)
			const toolMsg: IChatMessage = {
				id: toolMessageId,
				parentId: previousToolMessageId,
				threadId: request.threadId,
				role: EChatRole.TOOL,
				content: [{
					id: crypto.randomUUID(),
					type: EMessagePartType.TOOL_CALL,
					orderIndex: 0,
					toolCallId,
				}],
				stats: null,
				createdAt: Date.now(),
			};
			await this.persistence.createMessage(toolMsg);
			this.broadcaster.emit({ type: 'message.created', message: toolMsg });

			previousToolMessageId = toolMessageId;
			lastToolMessageId = toolMessageId;

			if (validationError) {
				messages.push({
					role: 'tool',
					content: toolCallRecord.result!,
					tool_call_id: tc.id,
				});
				continue;
			}

			const approvalMode = await this.permissions.getToolApprovalMode(request.threadId, serverName!, tc.name);
			//console.log('[Orch] approvalMode:', approvalMode);

			if (approvalMode === EToolApprovalMode.ASK) {
				needsAsk = true;
				continue;
			}

			if (approvalMode === EToolApprovalMode.DENIED) {
				const deniedTc: IToolCall = {
					...toolCallRecord,
					status: EToolCallStatus.DENIED,
					result: JSON.stringify({ error: 'Tool call denied by policy' }),
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: deniedTc.status,
					result: deniedTc.result,
					resolvedAt: deniedTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: deniedTc });
				messages.push({
					role: 'tool',
					content: deniedTc.result!,
					tool_call_id: tc.id,
				});
				continue;
			}

			// ALLOWED — execute now
			const executingTc: IToolCall = { ...toolCallRecord, status: EToolCallStatus.EXECUTING };
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: executingTc });

			try {
				const wsVars = await this.resolveWsVars(request.threadId);
				const tsVars = await this.resolveThreadVars(request.threadId);
				const finalArgs = this.mcpClient.prepareToolArgs(serverName!, tc.name, args, wsVars, tsVars);
				const mcpResult = await this.executeToolCallBounded(serverName!, tc.name, finalArgs, request.threadId);
				const resultStr = JSON.stringify(mcpResult.content);
				const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;
				const completedTc: IToolCall = {
					...toolCallRecord,
					status: finalStatus,
					result: resultStr,
					error: mcpResult.isError ? resultStr : null,
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: finalStatus,
					result: resultStr,
					error: mcpResult.isError ? resultStr : null,
					resolvedAt: completedTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: completedTc });
				messages.push({
					role: 'tool',
					content: resultStr,
					tool_call_id: tc.id,
				});
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				const errorResult = JSON.stringify({ error: errorMsg });
				const erroredTc: IToolCall = {
					...toolCallRecord,
					status: EToolCallStatus.ERROR,
					error: errorMsg,
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: EToolCallStatus.ERROR,
					error: errorMsg,
					resolvedAt: erroredTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: erroredTc });
				messages.push({
					role: 'tool',
					content: errorResult,
					tool_call_id: tc.id,
				});
			}
		}

		return { hadToolCalls: true, needsAsk, lastToolMessageId };
	}

	private async flushTextPart(turn: ITurnState): Promise<void> {
		if (!turn.currentTextPart || !turn.currentTextPart.text) return;
		await this.persistence.appendMessagePart(turn.assistantMessageId, {
			id: turn.currentTextPart.id,
			type: EMessagePartType.TEXT,
			orderIndex: turn.partOrderCounter++,
			text: turn.currentTextPart.text,
		});
		turn.currentTextPart = null;
	}

	private async flushReasoningPart(turn: ITurnState): Promise<void> {
		if (!turn.currentReasoningPart || !turn.currentReasoningPart.text) return;
		await this.persistence.appendMessagePart(turn.assistantMessageId, {
			id: turn.currentReasoningPart.id,
			type: EMessagePartType.REASONING,
			orderIndex: turn.partOrderCounter++,
			text: turn.currentReasoningPart.text,
		});
		turn.currentReasoningPart = null;
	}

	// V2: builds message chain from persistence instead of receiving it from frontend
	async resumeToolCallV2(
		toolCallId: string,
		decision: 'approve' | 'deny',
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error('Tool call not found');
		if (tc.status !== EToolCallStatus.PENDING) throw new Error(`Tool call is ${tc.status}, not PENDING`);

		if (decision === 'deny') {
			const deniedTc: IToolCall = {
				...tc,
				status: EToolCallStatus.DENIED,
				result: JSON.stringify({ error: 'Tool call denied by user' }),
				resolvedAt: Date.now(),
			};
			await this.persistence.updateToolCall(toolCallId, {
				status: deniedTc.status,
				result: deniedTc.result,
				resolvedAt: deniedTc.resolvedAt,
			});
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: deniedTc });
		} else {
			const executingTc: IToolCall = { ...tc, status: EToolCallStatus.EXECUTING };
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: executingTc });

			try {
				const args = JSON.parse(tc.arguments);
				const wsVars = await this.resolveWsVars(tc.threadId);
				const tsVars = await this.resolveThreadVars(tc.threadId);
				const finalArgs = this.mcpClient.prepareToolArgs(tc.serverName, tc.toolName, args, wsVars, tsVars);
				const mcpResult = await this.executeToolCallBounded(tc.serverName, tc.toolName, finalArgs, tc.threadId);
				const resultStr = JSON.stringify(mcpResult.content);
				const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;
				const completedTc: IToolCall = {
					...tc,
					status: finalStatus,
					result: resultStr,
					error: mcpResult.isError ? resultStr : null,
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: finalStatus,
					result: resultStr,
					error: mcpResult.isError ? resultStr : null,
					resolvedAt: completedTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: completedTc });
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				const erroredTc: IToolCall = {
					...tc,
					status: EToolCallStatus.ERROR,
					error: errorMsg,
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: EToolCallStatus.ERROR,
					error: errorMsg,
					resolvedAt: erroredTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: erroredTc });
			}
		}

		// Check if any other tool calls in the same parent assistant message
		// are still pending. If so, wait for them too.
		let assistantMsg: IChatMessage | null = null;
		let cursorId: TMessageId | null = tc.messageId;
		while (cursorId) {
			const cursorMsg = await this.persistence.getMessage(cursorId);
			if (!cursorMsg || cursorMsg.role !== EChatRole.TOOL) {
				assistantMsg = cursorMsg ?? null;
				break;
			}
			cursorId = cursorMsg.parentId;
		}

		if (!assistantMsg) return;

		const allInChain = await Promise.all(
			assistantMsg.content
				.filter((p): p is IMessagePartToolCall => p.type === EMessagePartType.TOOL_CALL)
				.map(p => p.toolCallId)
				.map(id => this.persistence.getToolCall(id))
		);
		const stillBlocking = allInChain.some(t =>
			t && (t.status === EToolCallStatus.PENDING || t.status === EToolCallStatus.EXECUTING || t.status === EToolCallStatus.DENIED)
		);
		if (stillBlocking) return;

		// Convert resolved tool calls to OpenAI format and append to messages
		// const toolOpenAIMessages = allInChain
		// 	.filter((tc): tc is IToolCall => tc !== null)
		// 	.map(tc => ({
		// 		role: 'tool' as const,
		// 		content: tc.result ?? JSON.stringify({ error: tc.error }),
		// 		tool_call_id: tc.id,
		// 	}));

		// All tool calls resolved — trigger next inference pass
		const enabledTools = await this.resolveEnabledTools(request);
		const baseMessages = await this.buildMessageChain(request, tc.messageId);

		await this.executePass(
			inferenceUrl,
			request,
			tc.messageId,
			baseMessages,
			enabledTools,
			abortSignal,
		);
	}

	private buildInferenceParams(params: Record<string, unknown>): Record<string, unknown> {
		return buildLlamaInferenceParams(params);
	}

	private async resolveEnabledTools(request: ICompletionRequest): Promise<IToolDefinition[]> {
		// Save to DB — convenience for UI reload only, doesn't affect filtering
		if (!request.skipToolsSave && (request.attachAllTools !== undefined || request.attachedTools !== undefined)) {
			await this.persistence.saveThreadAttachedTools(
				request.threadId,
				request.attachAllTools ?? false,
				request.attachedTools ?? []
			);
		}

		// Filter — ONLY from request, no DB fallback
		const attachAllTools = request.attachAllTools ?? false;
		const attachedTools = request.attachedTools;
		const allTools = this.mcpClient.getAllTools();

		let result: IToolDefinition[];

		if (attachAllTools) {
			result = await this.permissions.getEnabledTools(request.threadId, allTools);
		} else if (attachedTools && attachedTools.length > 0) {
			const filtered = allTools.filter(t =>
				attachedTools.some(a => a.serverName === t.serverName && a.toolName === t.name)
			);
			result = await this.permissions.getEnabledTools(request.threadId, filtered);
		} else {
			result = [];
		}

		// Stabilize order: sort by serverName, then tool name
		result.sort((a, b) =>
			a.serverName === b.serverName
				? a.name.localeCompare(b.name)
				: a.serverName.localeCompare(b.serverName)
		);

		return result;
	}

	private generateTitle(inferenceUrl: string, userContent: string): Promise<string> {
		return fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.inferenceAuthHeader ? { Authorization: this.inferenceAuthHeader } : {}) },
			body: JSON.stringify({
				model: 'model',
				messages: [
					{ role: 'user', content: 'Generate a concise 3-5 word title for the conversation below. Return ONLY the title text, no quotes, no explanation.\n\n' + userContent },
				],
				stream: false,
				max_tokens: 30,
				temperature: 0.3,
				chat_template_kwargs: { enable_thinking: false },
			}),
		})
			.then(res => {
				if (!res.ok || !res.body) throw new Error('Title generation failed');
				return res.json();
			})
			.then(body => {
				const data = body as { choices?: { message?: { content?: string } }[] } | null;
				const title = data?.choices?.[0]?.message?.content ?? '';
				if (!title) throw new Error('Empty title response');
				return title.replace(/^["']|["']$/g, '').trim();
			});
	}

	private truncateTitle(text: string): string {
		const words = text.split(/\s+/).filter(Boolean).slice(0, 5);
		return words.join(' ') || 'New Chat';
	}

	async handlePureCompletions(
		inferenceUrl: string,
		messages: Array<TOpenAIMessage>,
		inferenceParams: Record<string, unknown>,
		onChunk?: TPureCompletionChunkHandler,
		abortSignal?: AbortSignal,
	): Promise<IPureCompletionResult> {
		const body: Record<string, unknown> = {
			model: 'model',
			messages,
			stream: true,
			...this.buildInferenceParams(inferenceParams),
		};

		const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.inferenceAuthHeader ? { Authorization: this.inferenceAuthHeader } : {}) },
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok || !response.body) {
			const errBody = await response.text().catch(() => '');
			throw new Error(`Inference error ${response.status}: ${errBody}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let fullText = '';
		let reasoningText = '';
		let timings: Record<string, number> | null = null;
		let usage: Record<string, number> | null = null;
		let finishReason = '';
		let streamError: string | null = null;

		const parts: IMessagePart[] = [];
		let partOrder = 0;
		let currentTextPart: { id: string; text: string } | null = null;
		let currentReasoningPart: { id: string; text: string } | null = null;

		const flushText = (): void => {
			if (!currentTextPart || !currentTextPart.text) return;
			parts.push({
				id: currentTextPart.id,
				type: EMessagePartType.TEXT,
				orderIndex: partOrder++,
				text: currentTextPart.text,
			});
			currentTextPart = null;
		};

		const flushReasoning = (): void => {
			if (!currentReasoningPart || !currentReasoningPart.text) return;
			parts.push({
				id: currentReasoningPart.id,
				type: EMessagePartType.REASONING,
				orderIndex: partOrder++,
				text: currentReasoningPart.text,
			});
			currentReasoningPart = null;
		};

		try {
			while (true) {
				let result: TStreamReadResult;
				try {
					result = await this.readWithIdleTimeout(reader, STREAM_IDLE_TIMEOUT_MS);
				} catch (err) {
					streamError = err instanceof Error ? err.message : String(err);
					break;
				}
				if (result.done) break;
				buffer += decoder.decode(result.value, { stream: true });
				const { chunks, remaining } = parseSSEBuffer(buffer);
				buffer = remaining;

				for (const chunk of chunks) {
					if (abortSignal?.aborted) {
						flushReasoning();
						flushText();
						return { content: parts, stats: null, finishReason: 'aborted' };
					}
					if (chunk.error || chunk.warpcore_event === 'error') {
						streamError = chunk.error ?? 'Inference error from server';
						break;
					}

					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						fullText += delta.content;
						if (currentReasoningPart) flushReasoning();
						if (!currentTextPart) {
							currentTextPart = { id: crypto.randomUUID(), text: '' };
						}
						currentTextPart.text += delta.content;
						onChunk?.('text', delta.content);
					}

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						if (currentTextPart) flushText();
						if (!currentReasoningPart) {
							currentReasoningPart = { id: crypto.randomUUID(), text: '' };
						}
						currentReasoningPart.text += delta.reasoning_content;
						onChunk?.('reasoning', delta.reasoning_content);
					}

					const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) finishReason = fr;
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}

			// Flush the final unterminated SSE line (usage/timings/error chunks
			// often arrive without a trailing newline and were dropped).
			if (buffer.trim()) {
				const { chunks: finalChunks } = parseSSEBuffer(buffer, true);
				buffer = '';
				for (const chunk of finalChunks) {
					if (chunk.error || chunk.warpcore_event === 'error') {
						streamError = chunk.error ?? 'Inference error from server';
						break;
					}
					const delta = chunk.choices?.[0]?.delta;
					if (delta?.content) {
						fullText += delta.content;
						if (currentReasoningPart) flushReasoning();
						if (!currentTextPart) {
							currentTextPart = { id: crypto.randomUUID(), text: '' };
						}
						currentTextPart.text += delta.content;
						onChunk?.('text', delta.content);
					}
					const fr2 = chunk.choices?.[0]?.finish_reason;
					if (fr2) finishReason = fr2;
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}
		} finally {
			// Release the upstream response body on every exit path.
			try { await reader.cancel(); } catch { /* already closed */ }
			flushReasoning();
			flushText();
		}

		if (streamError) {
			throw new Error(streamError);
		}

		const actualTokens = Math.ceil((fullText.length + reasoningText.length) / 4);
		const stats: IChatMessageStats | null = (timings || usage)
			? {
				promptTokens: (usage?.prompt_tokens ?? timings?.prompt_n ?? 0),
				completionTokens: (usage?.completion_tokens ?? timings?.predicted_n ?? 0),
				reasoningTokens: (usage?.reasoning_tokens ?? 0),
				actualTokens,
				promptPerSecond: timings?.prompt_per_second ?? 0,
				predictedPerSecond: timings?.predicted_per_second ?? 0,
				promptMs: timings?.prompt_ms ?? 0,
				predictedMs: timings?.predicted_ms ?? 0,
			}
			: null;

		return { content: parts, stats, finishReason };
	}
}
