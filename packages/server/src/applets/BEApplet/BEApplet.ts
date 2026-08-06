import { text } from "node:stream/consumers";
import {
	EChatRole,
	EMessagePartType,
	type IChatMessage,
	type IMessagePart,
	type TOpenAIMessage,
} from "@warpcore/bridge";
import type { IAppletFn, TAppletDefinition } from "@warpcore/realmcore";
import { EAppletHostType, EAppletScope } from "@warpcore/realmcore";
import type {
	IGuardrailDefinition,
	IGuardrailError,
	IGuardrailIssue,
	IMode,
	IServer,
	ITodoItem,
} from "@warpcore/shared";
import { parseMessyLLMArray } from "@warpcore/shared";
import { getMode, listModes } from "../../services/modeStore";
import { store } from "../../util/store";
import type { IAppletAPIBE } from "../lib/types";
import {
	ALLOWED_TOOLS_PROMPT,
	ALLOWED_TOOLS_REMINDER_SYSTEM_PROMPT,
	COMPACTION_PROMPT,
	GUARDRAIL_PROMPT,
	GUARDRAIL_RULESET_GENERIC_PROMPT,
	MODE_SYSTEM_PROMPT,
	TRAILING_SYSTEM_PROMPT,
} from "./prompts";

const GUARDRAILS_DEFAULT_INFERENCE_PARAMS = {
	enableThinking: false,
	reasoningEffort: "none",
};

const USE_MODE_DEF_TAIL = false;
const USE_MODE_CURRENT_TAIL = false;

function injectSystemPrompt(
	messages: TOpenAIMessage[],
	text: string,
	position: "prepend" | "append" = "prepend",
): void {
	const firstMsg = messages[0];
	if (firstMsg?.role === "system") {
		if (typeof firstMsg.content === "string") {
			messages[0] = {
				...firstMsg,
				content:
					position === "prepend"
						? text + "\n" + firstMsg.content
						: firstMsg.content + text,
			};
		} else {
			const partIndex = firstMsg.content?.findIndex((p) => p.type === "text") || -1;
			if (partIndex >= 0) {
				const newContent = firstMsg.content!.map((p, i) =>
					i === partIndex
						? {
								...p,
								text:
									position === "prepend"
										? text + "\n" + (p.text ?? "")
										: (p.text ?? "") + text,
							}
						: p,
				);
				messages[0] = { ...firstMsg, content: newContent };
			} else {
				messages[0] = {
					...firstMsg,
					content:
						position === "prepend"
							? [{ type: "text", text }]
							: [...(firstMsg.content || []), { type: "text", text }],
				};
			}
		}
	} else {
		messages.unshift({ role: "system", content: text });
	}
}

const fn: IAppletFn<IAppletAPIBE> = async (api) => {
	console.log("[BEApplet] Started");

	api.onReady(() => {
		api.eventNode.hook("/warpcore", "bridge.buildBranchChain", async (eventApi) => {
			const payload = eventApi.payload as {
				branch: Array<{ id: string }>;
				request: { threadId: string };
			};

			const threadState = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.getThreadState",
				payload.request.threadId,
			)) as Record<string, unknown> | null;

			const messageStates = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.getAllMessageStatesByThread",
				payload.request.threadId,
			)) as Array<{ messageId: string; data: Record<string, unknown> }>;

			const stateById: Record<string, Record<string, unknown>> = {};
			for (const ms of messageStates) {
				stateById[ms.messageId] = ms.data;
			}

			const modeId = threadState?.modeId as string | undefined;
			let mode: IMode | null = null;
			if (modeId) mode = await getMode(modeId);

			let newResult = [...(eventApi.result as Array<IChatMessage>)];

			// ---- MODE INJECTION ----

			if (mode && !USE_MODE_DEF_TAIL && !USE_MODE_CURRENT_TAIL) {
				newResult = newResult.map((msg) => {
					if (msg.role !== EChatRole.USER) return msg;
					const msgMode =
						(stateById[msg.id]?.modeMarker as { id: string; name: string }) ||
						undefined;
					if (!msgMode) return msg;

					const newMsg = {
						...msg,
						content: [
							...msg.content,
							{
								type: EMessagePartType.TEXT,
								text: `<system-reminder>ACTIVE MODE: ${msgMode.name}</system-reminder>`,
							} as IMessagePart,
						],
					};

					return newMsg;
				});
			}

			// ---- compaction base slice ----

			if (threadState?.ignoreCompactionBase === true) return newResult;

			let compactionBaseIndex = -1;
			const branch = eventApi.result as Array<IChatMessage>;
			for (let i = branch.length - 1; i >= 0; i--) {
				const msgState = stateById[branch[i]!.id];
				const commands = msgState?.slashCommands as Array<{ name: string }> | undefined;
				if (commands?.some((c) => c.name === "compact")) {
					compactionBaseIndex = i;
					break;
				}
			}

			if (compactionBaseIndex === -1) return newResult;
			newResult = newResult.slice(compactionBaseIndex);

			// ---- Done ----

			return newResult;
		});

		api.eventNode.hook("/warpcore", "bridge.preInference", async (eventApi) => {
			const payload = eventApi.payload as {
				request: { messageState?: Record<string, unknown>; threadId: string };
			};

			const commands = payload.request.messageState?.slashCommands as
				| Array<{ name: string }>
				| undefined;
			if (commands?.some((c) => c.name === "compact")) return;

			const threadState = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.getThreadState",
				payload.request.threadId,
			)) as Record<string, unknown> | null;

			// Load workspace state for projectRoot fallback
			let wsState: Record<string, unknown> | null = null;
			const folderId = (payload.request as any).folderId as string | undefined;
			if (folderId) {
				wsState = (await api.eventNode.invoke(
					"/warpcore",
					"bridge.getWorkspaceState",
					folderId,
				)) as Record<string, unknown> | null;
			}

			let content = "";
			const messages = [...(eventApi.result as Array<TOpenAIMessage>)];

			// --- Project Root ---

			const projectRoot = (threadState?.projectRoot || wsState?.projectRoot) as
				| string
				| undefined;

			// Inject project root into system prompt (independent of mode)
			if (projectRoot) {
				injectSystemPrompt(messages, `\nProject Root\n${projectRoot}\n`, "append");
			}

			// --- Mode section ---

			const modeId = threadState?.modeId as string | undefined;
			let mode: IMode | null = null;
			if (modeId) mode = await getMode(modeId);

			if (mode) {
				if (USE_MODE_DEF_TAIL) {
					injectSystemPrompt(messages, ALLOWED_TOOLS_REMINDER_SYSTEM_PROMPT);

					if (mode.prompt) content += `ACTIVE MODE: ${mode.name}\n${mode.prompt}\n`;

					const toolNames =
						typeof mode.allowedTools[0] === "string"
							? mode.allowedTools
							: mode.allowedTools.map((t: any) => t.toolName);

					if (toolNames.length)
						content += `\n${ALLOWED_TOOLS_PROMPT}\nALLOWED TOOLS: ${toolNames.join(", ")}\n`;
					else
						content +=
							"ALLOWED TOOLS: CURRENTLY ALL TOOLS ARE STRICTLY NOT ALLOWED! DO NOT CALL ANY TOOLS!";
				} else {
					const modesArr = await listModes();

					injectSystemPrompt(
						messages,
						`${MODE_SYSTEM_PROMPT}\n${modesArr
							.filter((mode) => mode.prompt?.length)
							.map((mode, i) => {
								let toolMessage = "";
								const toolNames =
									typeof mode.allowedTools[0] === "string"
										? mode.allowedTools
										: mode.allowedTools.map((t: any) => t.toolName);

								if (toolNames.length) toolMessage += toolNames.join(", ");
								else toolMessage += "TOOLS ARE NOT ALLOWED IN THIS MODE!";

								return `--- MODE ${mode.name} ---\n\n ${mode.prompt}\n\nALLOWED TOOLS: ${toolMessage}\n---`;
							})
							.join(`\n\n`)}\n`,
					);

					if (mode.prompt) {
						if (USE_MODE_CURRENT_TAIL) content += `ACTIVE MODE: ${mode.name}\n`;
					}
				}

				if (content.length) {
					console.log("[BEApplet: Appending Tail Prompt]");
					const lastIndex = messages.length - 1;

					if (lastIndex < 0) {
						console.warn("No message found to inject trailing message! Strange..");
						return messages;
					}

					const trailingContent =
						"\n<system-reminder>\n" +
						TRAILING_SYSTEM_PROMPT +
						"\n" +
						content +
						"\n</system-reminder>";
					const lastMsg = messages[lastIndex]!;

					let newLastMsg: typeof lastMsg;
					if (typeof lastMsg.content === "string") {
						newLastMsg = { ...lastMsg, content: lastMsg.content + trailingContent };
					} else {
						const partIndex = lastMsg.content.findIndex((p) => p.type === "text");
						if (partIndex >= 0) {
							const newContent = lastMsg.content.map((p, i) =>
								i === partIndex
									? { ...p, text: (p.text ?? "") + trailingContent }
									: p,
							);
							newLastMsg = { ...lastMsg, content: newContent };
						} else {
							const newContent = [
								...lastMsg.content,
								{ type: "text", text: trailingContent },
							];
							newLastMsg = { ...lastMsg, content: newContent };
						}
					}
					const newMessages = messages.map((m, i) => (i === lastIndex ? newLastMsg : m));
					return newMessages;
				} else return messages;
			}
		});

		api.eventNode.hook("/warpcore", "bridge.preConvertNewMsg", async (eventApi) => {
			const payload = eventApi.payload as {
				request: { messageState?: Record<string, unknown>; threadId: string };
			};

			let userMsg = eventApi.result as IChatMessage;

			// ---- MODE INJECTION (same as buildBranchChain) ----

			const threadState = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.getThreadState",
				payload.request.threadId,
			)) as Record<string, unknown> | null;

			const modeId = threadState?.modeId as string | undefined;
			let mode: IMode | null = null;
			if (modeId) mode = await getMode(modeId);

			if (mode && !USE_MODE_DEF_TAIL && !USE_MODE_CURRENT_TAIL) {
				const modeMarker = payload.request.messageState?.modeMarker as
					| { id: string; name: string }
					| undefined;
				if (modeMarker) {
					userMsg = {
						...userMsg,
						content: [
							...userMsg.content,
							{
								type: EMessagePartType.TEXT,
								text: `<system-reminder>ACTIVE MODE: ${modeMarker.name}</system-reminder>`,
							} as IMessagePart,
						],
					};
				}
			}

			// ---- COMPACT ----

			const commands = payload.request.messageState?.slashCommands as
				| Array<{ name: string }>
				| undefined;
			if (commands?.some((c) => c.name === "compact")) {
				for (const part of userMsg.content) {
					if (part.type === "text") {
						part.text = COMPACTION_PROMPT + part.text;
						break;
					}
				}
			}

			return userMsg;
		});

		api.eventNode.on("/warpcore", "bridge.inference.finish", async (eventApi) => {
			const payload = eventApi.payload as {
				threadId: string;
				messageId: string;
				inferenceUrl: string;
				messages: Array<TOpenAIMessage>;
				message: IChatMessage;
			};
			const { threadId, messageId, inferenceUrl, messages, message } = payload;

			const threadState = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.getThreadState",
				threadId,
			)) as Record<string, unknown> | null;

			// Resolve active guardrail names: from mode if set, else from threadState
			const modeId = threadState?.modeId as string | undefined;
			let activeNames: string[] = [];
			if (modeId) {
				const mode = (await api.eventNode.invoke(
					"/warpcore",
					"bridge.getMode",
					modeId,
				)) as { activeGuardrails?: string[] } | null;
				activeNames = mode?.activeGuardrails || [];
			} else {
				activeNames = (threadState?.activeGuardrails as string[]) || [];
			}
			if (!activeNames.length) return;

			// Fetch all guardrail definitions from DB
			const allDefinitions = (await api.eventNode.invoke(
				"/warpcore",
				"bridge.listGuardrails",
			)) as Record<string, IGuardrailDefinition>;
			if (!allDefinitions) return;

			// Look up definitions for active names
			const activeGuardrails = activeNames
				.map((name) => allDefinitions[name])
				.filter((g): g is IGuardrailDefinition => !!g);
			if (!activeGuardrails.length) return;

			// Find current turn boundary
			const assistantIndex = messages.map((m) => m.role).lastIndexOf("assistant");
			const beforePart3 =
				assistantIndex !== -1 ? messages.slice(0, assistantIndex) : messages;

			// Tool names from the assistant message
			const lastAssistant = messages[assistantIndex];
			const toolNames =
				lastAssistant?.tool_calls?.map((tc) => tc.function.name.toLowerCase()) || [];

			// Filter guardrails by triggerOnTools
			const applicableGuardrails = activeGuardrails.filter((g) => {
				if (!g.triggerOnTools) return true;
				const tools =
					typeof g.triggerOnTools[0] === "string"
						? g.triggerOnTools
								.split(",")
								.map((t: string) => t.trim().toLowerCase())
								.filter(Boolean)
						: g.triggerOnTools.map((t: any) => t.toolName.toLowerCase());
				if (!tools.length) return true;
				return tools.some((t) => toolNames.includes(t));
			});
			if (!applicableGuardrails.length) return;

			// Immediately mark all as processing
			const initialResults: Record<string, boolean> = {};
			for (const g of applicableGuardrails) {
				initialResults[g.name] = false;
			}
			await api.eventNode.invoke("/warpcore", "bridge.updateMessageState", {
				messageId,
				data: { guardrailResults: initialResults },
			});

			// Process one by one, save each result
			for (const guardrail of applicableGuardrails) {
				try {
					if (!guardrail.serverId) {
						throw (
							'[BEApplet] Guardrail "' + guardrail.name + '" has no server configured'
						);
					}
					const grServer = await store.get<IServer>("servers:" + guardrail.serverId);
					if (!grServer)
						throw "[BEApplet] Guardrail server not found:" + guardrail.serverId;

					const grInferenceUrl = `http://127.0.0.1:${grServer.port}` || inferenceUrl;

					const toText = (m: TOpenAIMessage) => {
						if (m.role === "system") {
							if (m.content === "<base>") return `--- Conversation Root ---`;
							else if (m.content === "<latest>") return `--- Recent Messages ---`;
							else if (m.content === "<review>") return `--- Message to Review ---`;
						}

						const content =
							typeof m.content === "string"
								? m.content
								: Array.isArray(m.content)
									? m.content.find((c: any) => c.type === "text")?.text || ""
									: "";
						let result = `[${m.role}]: ${content}`;
						if (m.tool_calls?.length) {
							result +=
								"\n" +
								m.tool_calls
									.map(
										(tc) =>
											`toolCallId=${tc.id}\ntoolName=${tc.function.name}\nbody=${tc.function.arguments}`,
									)
									.join("\n");
						}
						return result;
					};

					const part1: Array<TOpenAIMessage> = [];
					const part2: Array<TOpenAIMessage> = [];
					const part3: Array<TOpenAIMessage> = [];

					// Part 3 - always included, just the assistant message
					part3.push({ role: "system", content: "<review>" });
					part3.push(messages[assistantIndex]!);

					// Part 1 - base from beforePart3
					if (guardrail.includeBaseMessage) {
						if (beforePart3.length >= 1) {
							part1.push({ role: "system", content: "<base>" });
							part1.push(beforePart3[0]!);
						}
						if (beforePart3.length >= 2) part1.push(beforePart3[1]!);
					}

					// Part 2 - last N from beforePart3
					if (guardrail.messagesCount && guardrail.messagesCount > 0) {
						part2.push({ role: "system", content: "<latest>" });
						part2.push(...beforePart3.slice(-guardrail.messagesCount));
					}

					// Merge with dedup (part 1/2 can overlap)
					const all = [...part1, ...part2, ...part3];
					const seen = new Set<TOpenAIMessage>();
					const context = all.filter((m) => {
						if (seen.has(m)) return false;
						seen.add(m);
						return true;
					});
					const contextTexts = context.map(toText);
					const grSysPrompt =
						GUARDRAIL_PROMPT +
						"\n" +
						(guardrail.prompt || GUARDRAIL_RULESET_GENERIC_PROMPT) +
						"Conversation/Message is below as given by the user.";
					const prompt = contextTexts.join("\n");

					const result = await api.eventNode.invoke(
						"/warpcore",
						"bridge.handlePureCompletion",
						{
							inferenceRequestId: guardrail.name + "-" + messageId,
							inferenceUrl: grInferenceUrl,

							messages: [
								{
									role: "system",
									content: grSysPrompt,
								},
								{
									role: "user",
									content: prompt,
								},
							],

							inferenceParams: {
								...GUARDRAILS_DEFAULT_INFERENCE_PARAMS,
								...guardrail.inferenceParams,
							},
						},
					);

					const text =
						result.content?.filter((c: any) => c.type === "text")?.[0]?.text || "Error";
					const parsed = parseMessyLLMArray(text) as IGuardrailIssue[];
					if (!parsed) {
						throw new Error("Failed to parse guardrail JSON output");
					}

					// Read existing results, merge, save
					const existing = (await api.eventNode.invoke(
						"/warpcore",
						"bridge.getMessageState",
						messageId,
					)) as Record<string, unknown>;
					const currentResults =
						(existing?.guardrailResults as Record<string, any>) || {};
					const currentErrors =
						(existing?.guardrailErrors as Record<string, IGuardrailError>) || {};

					await api.eventNode.invoke("/warpcore", "bridge.updateMessageState", {
						messageId,
						data: {
							guardrailResults: { ...currentResults, [guardrail.name]: parsed },
							guardrailErrors: { ...currentErrors },
						},
					});
				} catch (err) {
					console.error("[BEApplet] Guardrail error:", guardrail.name, err);
					const errorMessage = err instanceof Error ? err.message : String(err);
					const text = result?.content?.filter((c: any) => c.type === "text")?.[0]?.text;
					const existing = (await api.eventNode.invoke(
						"/warpcore",
						"bridge.getMessageState",
						messageId,
					)) as Record<string, unknown>;
					const currentResults =
						(existing?.guardrailResults as Record<string, any>) || {};
					const currentErrors =
						(existing?.guardrailErrors as Record<string, IGuardrailError>) || {};

					await api.eventNode.invoke("/warpcore", "bridge.updateMessageState", {
						messageId,
						data: {
							guardrailResults: { ...currentResults, [guardrail.name]: [] },
							guardrailErrors: {
								...currentErrors,
								[guardrail.name]: { message: errorMessage, rawResponse: text },
							},
						},
					});
				}
			}
		});
	});
};

export const BEApplet: TAppletDefinition<IAppletAPIBE> = {
	name: "BEApplet",
	description: "Backend applet",
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
