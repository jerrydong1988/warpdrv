import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import type { AppState } from '@/store/types';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '@/components/ToastProvider';
import { useThreadConfig } from '@/hooks/useThreadConfig';
import { useThreadAttachedTools } from '@/hooks/useThreadAttachedTools';
import { useSlashCommandProcessor } from '@/hooks/useSlashCommandProcessor';
import { useOnNewV2 } from '@/hooks/useOnNewV2';
import { useDerivedMsgsForUI } from '@/hooks/useChatSelectors';
import { parseThreadMeta } from '@/pages/Chat/assistant-ui/ServerSelector';
import mermaid from 'mermaid';
import type { IChatPreset } from '@warpcore/shared';
import type { ThreadMessage } from '@assistant-ui/react';
import { useExternalStoreRuntime } from '@assistant-ui/react';
import { nanoid } from 'nanoid';
import { attachmentAdapter, getFileDataURL } from './chat-adapters';
import { useThreadsAndFolders } from './assistant-ui/thread-list';

export interface UseChatInnerResult {
	selectedPresetId: string | null;
	setSelectedPresetId: (id: string | null) => void;
	generateTitle: boolean;
	currentThreadId: string | null;
	threadInStore: any;
	threadMessages: Record<string, unknown>;
	isRunning: boolean;
	headMessageId: string | null;
	branchTokenCount: number;
	currentServerId: string | null;
	isValidServer: boolean;
	contextSize: number;
	currentSystemPrompt: string;
	currentInferenceParams: Record<string, unknown>;
	currentWhisperServerId: string | null;
	currentAutoEmbed: boolean | undefined;
	attachAllTools: boolean;
	attachedTools: any;
	runtime: any;
	isLoadingThread: boolean;
	handleParamsChange: (params: Record<string, unknown>) => void;
	handleSystemPromptChange: (prompt: string) => void;
	handlePresetSelect: (presetId: string | null, preset: IChatPreset | null) => void;
	chatConfigValue: any;
}

export function useChatInner(): UseChatInnerResult {
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const generateTitle = useStore(s => !s.settings.disableTitleGen);

	// Error handlers
	const { toast } = useToast();
	const inferenceError = useStore(s => s.inferenceError);
	const embeddingError = useStore(s => s.embeddingError);

	useEffect(() => {
		if (inferenceError) {
			toast('error', inferenceError.error);
			useStore.setState(s => { s.inferenceError = null; });
		}
	}, [inferenceError, toast]);

	useEffect(() => {
		if (embeddingError) {
			toast('error', embeddingError.error);
			useStore.setState(s => { s.embeddingError = null; });
		}
	}, [embeddingError, toast]);

	// Mermaid theme
	const theme = useStore(s => s.settings.theme);
	useEffect(() => {
		const styles = getComputedStyle(document.documentElement);
		const get = (v: string) => styles.getPropertyValue(v).trim();
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			themeVariables: {
				primaryColor: get('--wc-bg-card') || '#1f1f23',
				primaryTextColor: get('--wc-text-primary') || '#dedede',
				primaryBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				lineColor: get('--wc-text-secondary') || 'rgba(255,255,255,0.7)',
				secondaryColor: get('--wc-bg-page') || '#131313',
				tertiaryColor: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				clusterBkg: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				actorBkg: get('--wc-bg-card') || 'rgba(255,255,255,0.02)',
				actorBorder: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				actorTextColor: get('--wc-text-primary') || '#dedede',
				noteBkgColor: get('--wc-bg-card') || 'rgba(255,255,255,0.02)',
				noteBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				noteTextColor: get('--wc-text-primary') || '#dedede',
				activationBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				activationBackgroundColor: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				sequenceNumberColor: get('--wc-text-muted') || 'rgba(255,255,255,0.4)',
			},
		});
	}, [theme]);

	// Thread server info
	const tempThreadServerId = useStore(s => s.tempThreadServerId);
	const tempAutoEmbed = useStore(s => s.tempAutoEmbed);
	const selectedWhisperServerId = useStore(s => s.selectedWhisperServerId);
	const thread = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);

	const threadServerId = useMemo(() =>
		thread?.meta ? parseThreadMeta(thread.meta).serverId : null,
		[thread]
	);

	const currentThreadId = useStore(s => s.currentThreadId);
	const currentServerId = useMemo(() =>
		threadServerId ?? tempThreadServerId,
		[threadServerId, tempThreadServerId]
	);
	const currentAutoEmbed = useMemo(() => {
		if (thread?.meta) {
			try { return JSON.parse(thread.meta).enableAutoEmbed; } catch { /* ignore */ }
		}
		return tempAutoEmbed;
	}, [thread?.meta, tempAutoEmbed]);
	const currentWhisperServerId = selectedWhisperServerId;

	const serversMap = useStore(s => s.servers);
	const currentServer = useMemo(() => currentServerId ? serversMap[currentServerId] : null, [currentServerId, serversMap]);
	const isValidServer = Boolean(currentServerId && currentServer?.status === EServerStatus.RUNNING);
	const contextSize = useMemo(() => currentServer?.params?.contextSize ?? 0, [currentServer]);

	// Thread config
	const { handleParamsChange, handleSystemPromptChange, currentSystemPrompt, currentInferenceParams } = useThreadConfig(selectedPresetId);
	useThreadAttachedTools();
	const attachAllTools = useStore(s => s.attachAllTools);
	const attachedTools = useStore(s => s.attachedTools);

	// Thread loader
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const setHeadMessageId = useStore(s => s.setHeadMessageId);
	const threadMessages = useStore(s => s.currentThreadId ? s.messagesByThread[s.currentThreadId] || {} : {});
	const isRunning = useStore(s => s.currentThreadId ? s.isRunningByThread[s.currentThreadId] ?? false : false);
	const { msgRepo, branchTokenCount } = useDerivedMsgsForUI(threadMessages, currentThreadId, null, isRunning);
	const threadInStore = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);
	const [isLoadingThread, setIsLoadingThread] = useState(false);

	const seedThreadMessages = useStore(s => s.seedThreadMessages);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	const initWorkspaceState = useStore(s => s.initWorkspaceState);
	const initThreadState = useStore(s => s.initThreadState);
	const initMessageStates = useStore(s => s.initMessageStates);
	const selectedEmbeddingServerId = useStore(s => s.selectedEmbeddingServerId);
	const setThreadEmbeddingStatuses = useStore(s => s.setThreadEmbeddingStatuses);
	const clearEmbeddingStatuses = useStore(s => s.clearEmbeddingStatuses);

	useEffect(() => {
		if (!currentThreadId || !threadInStore) return;
		if (!selectedEmbeddingServerId) {
			clearEmbeddingStatuses();
			return;
		}
		fetch(`/api/chat/threads/${currentThreadId}/embeddings?serverId=${encodeURIComponent(selectedEmbeddingServerId)}`)
			.then(res => res.ok ? res.json() : null)
			.then(data => {
				if (data) setThreadEmbeddingStatuses(data.data?.messageIds ?? []);
				else clearEmbeddingStatuses();
			})
			.catch(() => clearEmbeddingStatuses());
	}, [currentThreadId, selectedEmbeddingServerId]);

	const emptyMsgs: Record<string, unknown> = {};

	useEffect(() => {
		if (!currentThreadId) { setIsLoadingThread(false); return; }
		if (!threadInStore) { setIsLoadingThread(false); return; }
		if (threadMessages !== emptyMsgs) { setIsLoadingThread(false); return; }

		setIsLoadingThread(true);

		async function loadThread() {
			const res = await fetch(`/api/chat/threads/${currentThreadId ?? ''}`);
			if (res.ok) {
				const response = await res.json();
				const data = response.data;
				seedThreadMessages(currentThreadId as string, data?.messages ?? []);

				const tcRes = await fetch(`/api/mcp/tool-calls/thread/${currentThreadId}`);
				if (tcRes.ok) {
					const { data: tcs } = await tcRes.json();
					for (const tc of tcs) { applyToolCallCreated(tc); }
				}

				const folderId = data?.folderId;
				const statePromises: Promise<any>[] = [];
				if (folderId) {
					statePromises.push(fetch(`/api/chat/workspaces/${folderId}/state`).then(res => res.ok ? res.json() : null));
				} else {
					statePromises.push(Promise.resolve(null));
				}
				statePromises.push(fetch(`/api/chat/threads/${currentThreadId}/state`).then(res => res.ok ? res.json() : null));
				statePromises.push(fetch(`/api/chat/threads/${currentThreadId}/message-states`).then(res => res.ok ? res.json() : null));
				const [wsStateRes, threadStateRes, msgStatesRes] = await Promise.all(statePromises);
				if (wsStateRes?.data !== undefined && wsStateRes?.data !== null && folderId) {
					initWorkspaceState(folderId, wsStateRes.data);
				}
				if (threadStateRes?.data !== undefined && threadStateRes?.data !== null) {
					initThreadState(currentThreadId!, threadStateRes.data);
				}
				if (msgStatesRes?.data) {
					initMessageStates(msgStatesRes.data);
				}

				if (selectedEmbeddingServerId) {
					const embRes = await fetch(`/api/chat/threads/${currentThreadId}/embeddings?serverId=${encodeURIComponent(selectedEmbeddingServerId)}`);
					if (embRes.ok) {
						const { data: embData } = await embRes.json();
						setThreadEmbeddingStatuses(embData?.messageIds ?? []);
					}
				}
			}
			setIsLoadingThread(false);
		}
		loadThread();
	}, [currentThreadId, threadInStore, threadMessages, selectedEmbeddingServerId, seedThreadMessages, applyToolCallCreated, setThreadEmbeddingStatuses, initWorkspaceState, initThreadState, initMessageStates]);

	// Runtime
	const executeCommands = useSlashCommandProcessor();
	const threadsAPI = useThreadsAndFolders();
	const onNewV2 = useOnNewV2(executeCommands);

	const onReloadV2 = useCallback(async (parentId: string | null) => {
		if (!isValidServer || !parentId || !currentThreadId) return;
		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				threadId: currentThreadId,
				parentId,
				serverId: currentServerId,
				whisperServerId: currentWhisperServerId,
				enableAutoEmbed: currentAutoEmbed,
				systemPrompt: currentSystemPrompt,
				inferenceParams: currentInferenceParams,
				presetId: selectedPresetId,
				generateTitle,
				attachAllTools,
				attachedTools: attachAllTools ? undefined : attachedTools,
			}),
		});
	}, [currentThreadId, currentSystemPrompt, currentInferenceParams, currentServerId, currentWhisperServerId, currentAutoEmbed, isValidServer, attachAllTools, attachedTools, selectedPresetId, generateTitle]);

	const onCancel = useCallback(async () => {
		if (currentThreadId && isValidServer) {
			await fetch(`/api/chat/cancel/${currentThreadId}`, { method: 'POST' });
		}
	}, [currentThreadId, isValidServer]);

	const onEdit = useCallback(async (message: any) => {
		if (!currentThreadId) return;
		const messageId = message?.sourceId;
		if (!messageId) {
			console.error('[onEdit] No sourceId found in:', message);
			return;
		}
		const text = (message.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
		const parts = [{
			id: globalThis.crypto.randomUUID(),
			type: 'text' as const,
			orderIndex: 0,
			text,
		}];
		await fetch(`/api/chat/messages/${messageId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parts }),
		});
	}, [currentThreadId]);

	const runtime = useExternalStoreRuntime<ThreadMessage>({
		messageRepository: msgRepo,
		isRunning,
		onNew: onNewV2,
		onEdit,
		onReload: onReloadV2,
		onCancel,
		isDisabled: false,
		setMessages: (newMessages: any) => {
			const lastMessage = newMessages[newMessages.length - 1] as any;
			if (currentThreadId && lastMessage && !isRunning) {
				setHeadMessageId(currentThreadId, lastMessage.id);
			}
		},
		adapters: {
			threadList: {
				onSwitchToNewThread: async () => setCurrentThreadId(nanoid(6)),
				onSwitchToThread: async (threadId: string) => setCurrentThreadId(threadId),
				threads: Object.values(threadsAPI.threads).map((t: any) => ({ ...t, status: 'regular' as const })),
				threadId: currentThreadId ?? undefined,
			},
			attachments: attachmentAdapter,
		},
	});

	const handlePresetSelect = useCallback((presetId: string | null, preset: IChatPreset | null) => {
		setSelectedPresetId(presetId);
		if (preset) {
			handleParamsChange(preset.params as unknown as Record<string, unknown>);
			handleSystemPromptChange(preset.systemPrompt);
		} else {
			handleParamsChange({ } as unknown as Record<string, unknown>);
			handleSystemPromptChange('');
		}
	}, [handleParamsChange, handleSystemPromptChange]);

	const chatConfigValue = useMemo(() => {
		const setBoth = (updates: { reasoningEffort: any; enableThinking: boolean }) => {
			handleParamsChange({ ...currentInferenceParams, ...updates });
		};
		return {
			reasoningEffort: currentInferenceParams.reasoningEffort,
			onReasoningEffortChange: (v: any) => setBoth({ reasoningEffort: v, enableThinking: v !== 0 }),
			enableThinking: currentInferenceParams.enableThinking,
			onEnableThinkingChange: (v: boolean) => setBoth({ reasoningEffort: v ? 1 : 0, enableThinking: v }),
			contextSize,
		};
	}, [currentInferenceParams, contextSize, handleParamsChange]);

	return {
		selectedPresetId,
		setSelectedPresetId,
		generateTitle,
		currentThreadId,
		threadInStore,
		threadMessages,
		isRunning,
		headMessageId: null,
		branchTokenCount,
		currentServerId,
		isValidServer,
		contextSize,
		currentSystemPrompt,
		currentInferenceParams,
		currentWhisperServerId,
		currentAutoEmbed,
		attachAllTools,
		attachedTools,
		runtime,
		isLoadingThread,
		handleParamsChange,
		handleSystemPromptChange,
		handlePresetSelect,
		chatConfigValue,
	};
}
