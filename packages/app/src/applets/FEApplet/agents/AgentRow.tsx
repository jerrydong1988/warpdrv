import { useAuiState } from "@assistant-ui/react";
import {
	AccordionItem as AccordionItemComp,
	AccordionItemContent,
	AccordionItemTrigger,
	AccordionRoot,
	Badge,
	Box,
	Button,
	ColorPicker,
	Flex,
	HStack,
	Input,
	parseColor,
	SegmentGroup,
	Spinner,
	Switch,
	Tabs,
	Text,
	Textarea,
	VStack,
} from "@chakra-ui/react";
import { EMcpServerStatus } from "@warpcore/bridge";
import type {
	IAgent,
	IGuardrailDefinition,
	IGuardrailError,
	IGuardrailIssue,
	IChatPrompt,
	IMode,
	ITodoItem,
	IToolAttachment,
	TModeId,
} from "@warpcore/shared";
import { EGuardrailIssueType, EReasoningEffort } from "@warpcore/shared";
import {
	AlertTriangle,
	Ban,
	Bot,
	Check,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Edit2,
	FileText,
	Trash2,
	XCircle,
} from "lucide-react";
import { nanoid } from "nanoid";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaShieldAlt } from "react-icons/fa";
import { GoShield, GoShieldCheck } from "react-icons/go";
import { LuListTodo } from "react-icons/lu";
import { MdDragHandle } from "react-icons/md";
import { TbMessage2Plus } from "react-icons/tb";
import { TiFlowSwitch } from "react-icons/ti";
import {
	createGuardrail as createGuardrailApi,
	deleteGuardrail as deleteGuardrailApi,
	updateGuardrail as updateGuardrailApi,
} from "@/api/guardrail-services";
import {
	createAgent as createAgentApi,
	deleteAgent as deleteAgentApi,
	updateAgent as updateAgentApi,
} from "@/api/agent-services";
import {
	createMode as createModeApi,
	deleteMode as deleteModeApi,
	updateMode as updateModeApi,
	updateModeGuardrails as updateModeGuardrailsApi,
	updateModeAgents as updateModeAgentsApi,
} from "@/api/mode-services";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { PromptPicker } from "@/components/PromptPicker";
import { ServerPicker } from "@/components/ServerPicker";
import { WithErrorBoundary } from "@/components/WithErrorBoundary";
import { useDependantState } from "@/hooks/useDependantState";
import type { IExtractedSlashCommand } from "@/pages/Chat/assistant-ui/docToString";
import type { TDropdownItem } from "@/pages/Chat/assistant-ui/slash-command/SlashCmdDropdown";
import { parseGuardrailValue } from "@/pages/Chat/assistant-ui/slash-command/SlashCmdGuardrails";
import { parseAgentValue } from "@/pages/Chat/assistant-ui/slash-command/SlashCmdAgentSelector";
import { parseToolValue } from "@/pages/Chat/assistant-ui/slash-command/SlashCmdToolSelector";
import { useStore } from "@/store";
import type { TUiSpaceComponentDef } from "@/store/slices/uiSpaces";
import { EUISpaceLoc } from "@/store/slices/uiSpaces";

import { GuardrailToolPicker } from "../guardrails/GuardrailToolPicker";
import { GuardrailPicker } from "../../ui/GuardrailBadge";

export const AgentRow = React.memo(({ agent }: { agent: IAgent }) => {
	const [expanded, setExpanded] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [draftName, setDraftName] = useDependantState(agent.name);
	const [draftDescription, setDraftDescription] = useDependantState(agent.description);
	const [draftTools, setDraftTools] = useDependantState(agent.tools);
	// const [draftAutoApproveTools, setDraftAutoApproveTools] = useDependantState(
	// 	agent.autoApproveTools,
	// );
	const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const descSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateAgent = useCallback(
		async (patch: Partial<IAgent>) => {
			try {
				await updateAgentApi(agent.id, patch);
			} catch (e) {
				console.error("Failed to update agent:", e);
			}
		},
		[agent.id],
	);

	const handleNameBlur = useCallback(() => {
		if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
		nameSaveTimerRef.current = setTimeout(() => {
			if (draftName !== agent.name) {
				updateAgent({ name: draftName || "" });
			}
		}, 200);
	}, [draftName, agent.name, updateAgent]);

	const handleDescBlur = useCallback(() => {
		if (descSaveTimerRef.current) clearTimeout(descSaveTimerRef.current);
		descSaveTimerRef.current = setTimeout(() => {
			if (draftDescription !== agent.description) {
				updateAgent({ description: draftDescription });
			}
		}, 200);
	}, [draftDescription, agent.description, updateAgent]);

	useEffect(() => {
		return () => {
			if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
			if (descSaveTimerRef.current) clearTimeout(descSaveTimerRef.current);
		};
	}, []);

	const handleDelete = async () => {
		try {
			await deleteAgentApi(agent.id);
		} catch (e) {
			console.error("Failed to delete agent:", e);
		}
		setDeleteConfirmOpen(false);
	};

	return (
		<>
			<Box
				borderWidth="1px"
				borderColor="var(--wc-border-subtle)"
				borderRadius="md"
				bg="var(--wc-bg-subtle)"
				overflow="visible"
			>
				<Flex
					align="center"
					gap="2"
					p="2.5"
					cursor="pointer"
					onClick={() => setExpanded(!expanded)}
				>
					<Bot size={14} color="var(--wc-text-muted)" style={{ flexShrink: 0 }} />
					<Input
						size="xs"
						fontSize="xs"
						fontWeight="600"
						color="var(--wc-text-primary)"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onBlur={handleNameBlur}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleNameBlur();
						}}
						onClick={(e) => e.stopPropagation()}
						flex="1"
						minW="0"
						bg="transparent"
						borderColor="var(--wc-border-subtle)"
						borderWidth="1px"
						borderRadius="sm"
						_focus={{ borderColor: "var(--wc-border-active)" }}
					/>
					{expanded ? (
						<ChevronDown size={14} color="var(--wc-text-muted)" />
					) : (
						<ChevronRight size={14} color="var(--wc-text-muted)" />
					)}
				</Flex>

				{expanded && (
					<VStack gap="2.5" px="2.5" pb="2.5" pt="0" align="stretch">
						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Server
							</Text>
							<ServerPicker
								value={agent.serverId}
								onChange={(id) => updateAgent({ serverId: id })}
							/>
						</Box>

						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Saved Prompt
							</Text>
							<PromptPicker
								value={agent.promptId || ""}
								onChange={(promptId) =>
									updateAgent({ promptId: promptId || undefined })
								}
							/>
						</Box>

						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Tools
							</Text>
							<GuardrailToolPicker
								value={draftTools}
								onChange={(tools) => {
									setDraftTools(tools);
									updateAgent({ tools, autoApproveTools: tools });
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						</Box>

						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Pre-approved tools
							</Text>
							<Text fontSize="xs" color="var(--wc-text-faint)">
								All tools are pre-approved
							</Text>
						</Box>

						{/* Auto-approve tools picker temporarily removed — all tools are pre-approved via the
								"Tools" picker above (which also writes to autoApproveTools).
							<Box>
								<Text
									fontSize="9px"
									fontWeight="600"
									color="var(--wc-text-muted)"
									textTransform="uppercase"
									letterSpacing="0.04em"
									mb="1"
								>
									Auto-approve tools
								</Text>
								<GuardrailToolPicker
									value={draftAutoApproveTools}
									onChange={(tools) => {
										setDraftAutoApproveTools(tools);
										updateAgent({ autoApproveTools: tools });
									}}
									onClick={(e) => e.stopPropagation()}
								/>
							</Box>
							*/}

						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Active guardrails
							</Text>
							<GuardrailPicker
								value={agent.guardrails || []}
								onChange={(ids) => updateAgent({ guardrails: ids })}
								onClick={(e) => e.stopPropagation()}
							/>
						</Box>

						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Description
							</Text>
							<Textarea
								size="xs"
								fontSize="xs"
								rows={3}
								placeholder="Agent description..."
								value={draftDescription}
								onChange={(e) => setDraftDescription(e.target.value)}
								onBlur={handleDescBlur}
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								borderWidth="1px"
								borderRadius="md"
							/>
						</Box>

						<Flex justify="flex-end">
							<Button
								size="xs"
								fontSize="xs"
								color="var(--wc-accent-red)"
								bg="var(--wc-accent-red-bg-8)"
								leftIcon={<Trash2 size={12} />}
								onClick={(e) => {
									e.stopPropagation();
									setDeleteConfirmOpen(true);
								}}
							>
								Delete
							</Button>
						</Flex>
					</VStack>
				)}
			</Box>

			{deleteConfirmOpen && (
				<ConfirmDialog
					title="Delete Agent"
					message={`Are you sure you want delete "${agent.name}"?`}
					isOpen={true}
					onConfirm={handleDelete}
					onCancel={() => setDeleteConfirmOpen(false)}
					confirmLabel="Delete"
				/>
			)}
		</>
	);
});

/* ============================================================
 * Agents Panel — list of agents
 * ============================================================ */

export const EMPTY_AGENTS: Record<string, IAgent> = {};

export const AgentsPanel = React.memo(() => {
	const agents = useStore((s) => s.agents) || EMPTY_AGENTS;
	const items = Object.values(agents);

	if (!items.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No agents
				</Text>
			</Box>
		);
	}

	return (
		<WithErrorBoundary name="AgentsPanel">
			<VStack gap="2" p="3" align="stretch" height="100%">
				{items.map((a) => (
					<AgentRow key={a.id} agent={a} />
				))}
			</VStack>
		</WithErrorBoundary>
	);
});
