import type { Orchestrator, SqlitePersistence, SseBroadcaster } from "@warpcore/bridge/server";
import { EToolApprovalMode } from "@warpcore/bridge";
import type { IAgent, IToolAttachment } from "@warpcore/shared";
import { genThreadId } from "@warpcore/shared";
import type { IServer } from "@warpcore/shared";
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
			if (n.senderType === "subthread") {
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
		agentId: string,
		message: string,
		title: string,
	): Promise<{ threadId: string }> {
		// 1. Look up parent thread to get folderId
		const parentThread = await this.persistence.getThread(parentThreadId);
		if (!parentThread) {
			throw new Error(`Parent thread ${parentThreadId} not found`);
		}

		// 2. Look up agent
		const agent = await this.persistence.getAgent(agentId);
		if (!agent) {
			throw new Error(`Agent ${agentId} not found`);
		}

		// 3. Resolve agent's prompt for systemPrompt
		let systemPrompt = "";
		if (agent.promptId) {
			const prompt = await this.persistence.getChatPrompt(agent.promptId);
			if (prompt) {
				systemPrompt = prompt.content;
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

		// 6. Save agent's tools
		if (agent.tools.length > 0) {
			await this.persistence.saveThreadAttachedTools(newThreadId, false, agent.tools);
		}

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
					inferenceParams: {},
					folderId: parentThread.folderId,
				},
				abortController.signal,
			)
			.catch((err) => {
				console.error(`[Subthread] Inference failed for thread ${newThreadId}:`, err);
			});

		return { threadId: newThreadId };
	}
}
