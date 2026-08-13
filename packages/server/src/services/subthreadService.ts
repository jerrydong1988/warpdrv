import type { Orchestrator, SqlitePersistence, SseBroadcaster } from "@warpcore/bridge/server";
import { EToolApprovalMode } from "@warpcore/bridge";
import type { IAgent, IToolAttachment } from "@warpcore/shared";
import { EReasoningEffort, genThreadId } from "@warpcore/shared";
import type { IServer } from "@warpcore/shared";
import { SUBAGENT_SYSTEM_PROMPT } from "../applets/BEApplet/prompts";
import { getMode } from "./modeStore";
import { store } from "../util/store";

export interface ISubThreadInfo {
	threadId: string;
	title: string;
	pendingMessages: number;
}

export class SubthreadService {
	private persistence: SqlitePersistence;
	private orchestrator: Orchestrator;
	private broadcaster: SseBroadcaster;

	constructor(
		persistence: SqlitePersistence,
		orchestrator: Orchestrator,
		broadcaster: SseBroadcaster,
	) {
		this.persistence = persistence;
		this.orchestrator = orchestrator;
		this.broadcaster = broadcaster;
	}

	async listSubthreads(parentThreadId: string): Promise<ISubThreadInfo[]> {
		const subThreads = await this.persistence.listThreads({ parentId: parentThreadId });
		const notifications = await this.persistence.notificationList(
			parentThreadId,
			false, // exclude consumed
			false, // exclude hidden
		);

		// Count pending notifications per subthread
		const pendingCountMap = new Map<string, number>();
		for (const n of notifications) {
			if (n.senderType === "thread") {
				pendingCountMap.set(n.senderId, (pendingCountMap.get(n.senderId) ?? 0) + 1);
			}
		}

		return subThreads.map((t) => ({
			threadId: t.id,
			title: t.title,
			pendingMessages: pendingCountMap.get(t.id) ?? 0,
		}));
	}

	async createSubthread(
		parentThreadId: string,
		agentName: string,
		message: string,
		title: string,
	): Promise<{ threadId: string }> {
		// 1. Look up parent thread to get folderId
		const parentThread = await this.persistence.getThread(parentThreadId);
		if (!parentThread) {
			throw new Error(`Parent thread ${parentThreadId} not found`);
		}

		// 2. Look up agent by name
		const agent = await this.persistence.getAgentByName(agentName);
		if (!agent) {
			throw new Error(`Agent "${agentName}" not found`);
		}

		// 2.5. Check if the current mode or thread-level agent restrictions allow this agent
		const threadState = await this.persistence.getThreadState(parentThreadId);
		const modeId = threadState?.modeId as string | undefined;
		if (modeId) {
			const mode = await getMode(modeId);
			if (mode) {
				if (!mode.allowedAgents.includes(agentName)) {
					throw new Error(`Agent '${agentName}' is blocked by mode restrictions.`);
				}
			}
		} else {
			const activeAgents = threadState?.activeAgents as string[] | undefined;
			if (activeAgents && activeAgents.length > 0) {
				if (!activeAgents.includes(agentName)) {
					throw new Error(`Agent '${agentName}' is blocked by thread restrictions.`);
				}
			}
		}

		// 3. Resolve agent's prompt for systemPrompt (prepend sub-agent prompt)
		let systemPrompt = SUBAGENT_SYSTEM_PROMPT;
		if (agent.promptId) {
			const prompt = await this.persistence.getChatPrompt(agent.promptId);
			if (prompt) {
				systemPrompt += "\n\n" + prompt.content;
			}
		}

		// 4. Generate new thread ID
		const newThreadId = genThreadId();
		const now = Date.now();

		// 5. Create thread
		await this.persistence.createThread({
			id: newThreadId,
			title,
			folderId: parentThread.folderId,
			parentId: parentThreadId,
			systemPrompt,
			meta: JSON.stringify({
				serverId: agent.serverId,
				whisperServerId: null,
				tags: [],
				enableAutoEmbed: false,
			}),
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
			createdAt: now,
			updatedAt: now,
		});

		// 6. Save agent's tools (always include superthread_send_message)
		const superthreadTool = { serverName: "warpmcp", toolName: "superthread_send_message" };
		const allTools = [
			...agent.tools.filter(
				(t) => !(t.serverName === "warpmcp" && t.toolName === "superthread_send_message"),
			),
			superthreadTool,
		];
		await this.persistence.saveThreadAttachedTools(newThreadId, false, allTools);

		// 7. Set auto-approve permissions
		for (const tool of agent.autoApproveTools) {
			await this.persistence.setThreadToolPermission(
				newThreadId,
				tool.serverName,
				tool.toolName,
				true,
				EToolApprovalMode.ALLOWED,
			);
		}
		// Always auto-approve superthread_send_message
		const hasSuperthreadAutoApprove = agent.autoApproveTools.some(
			(t) => t.serverName === "warpmcp" && t.toolName === "superthread_send_message",
		);
		if (!hasSuperthreadAutoApprove) {
			await this.persistence.setThreadToolPermission(
				newThreadId,
				"warpmcp",
				"superthread_send_message",
				true,
				EToolApprovalMode.ALLOWED,
			);
		}

		// 8. Get server for inference URL
		const server = await store.get<IServer>("servers:" + agent.serverId);
		if (!server) {
			throw new Error(`Server ${agent.serverId} not found`);
		}

		// 9. Emit thread.created event
		const thread = await this.persistence.getThread(newThreadId);
		if (thread) {
			this.broadcaster.emit({ type: "thread.created", thread });
		}

		// 9.5. Set thread config with agent's reasoning level
		if (agent.reasoningEffort) {
			await this.persistence.setThreadConfig({
				threadId: newThreadId,
				presetId: null,
				systemPrompt,
				params: JSON.stringify({
					reasoningEffort: agent.reasoningEffort,
					enableThinking: agent.reasoningEffort !== EReasoningEffort.NONE,
				}),
			});
		}

		// 10. Trigger inference via handleCompletionV2
		const inferenceUrl = `http://127.0.0.1:${server.port}`;
		const abortController = new AbortController();

		this.orchestrator
			.handleCompletionV2(
				inferenceUrl,
				{
					threadId: newThreadId,
					serverId: agent.serverId,
					userMessage: { content: message },
					attachedTools: agent.tools,
					skipToolsSave: true,
					inferenceParams: agent.reasoningEffort
						? {
								reasoningEffort: agent.reasoningEffort,
								enableThinking: agent.reasoningEffort !== EReasoningEffort.NONE,
							}
						: {},
					folderId: parentThread.folderId,
				},
				abortController.signal,
			)
			.catch((err) => {
				console.error(`[Subthread] Inference failed for thread ${newThreadId}:`, err);
			});

		return { threadId: newThreadId };
	}

	async sendToSubthread(
		parentThreadId: string,
		targetSubThreadId: string,
		message: string,
	): Promise<{ notificationId: string; threadId: string }> {
		const notification = await this.persistence.notificationCreate({
			threadId: targetSubThreadId,
			notificationType: "agent",
			notificationSubtype: "message",
			senderType: "thread",
			senderId: parentThreadId,
			payload: { message },
		});
		this.broadcaster.emit({ type: "notification.created", notification });
		return { notificationId: notification.id, threadId: targetSubThreadId };
	}

	async sendToSuperthread(
		currentThreadId: string,
		message: string,
	): Promise<{ notificationId: string; threadId: string }> {
		const thread = await this.persistence.getThread(currentThreadId);
		if (!thread || !thread.parentId) {
			throw new Error(`Thread ${currentThreadId} has no parent`);
		}
		const notification = await this.persistence.notificationCreate({
			threadId: thread.parentId,
			notificationType: "agent",
			notificationSubtype: "message",
			senderType: "thread",
			senderId: currentThreadId,
			payload: { message },
		});
		this.broadcaster.emit({ type: "notification.created", notification });
		return { notificationId: notification.id, threadId: thread.parentId };
	}
}
