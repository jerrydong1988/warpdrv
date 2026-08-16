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

export const AgentPicker = React.memo(
	({
		value,
		onChange,
		onClick,
	}: {
		value: string[];
		onChange: (agents: string[]) => void;
		onClick?: (e: React.MouseEvent) => void;
	}) => {
		const agents = useStore((s) => s.agents);
		const servers = useStore((s) => s.servers);
		const [isOpen, setIsOpen] = useState(false);
		const dropdownRef = useRef<HTMLDivElement | null>(null);
		const triggerRef = useRef<HTMLDivElement | null>(null);

		const availableAgents = useMemo(() => Object.values(agents) as IAgent[], [agents]);

		const selectedSet = useMemo(() => new Set(value), [value]);

		// Count only ids that still exist (drop deleted agents)
		const validCount = useMemo(() => {
			const validIds = new Set(availableAgents.map((a) => a.id));
			return [...selectedSet].filter((aid) => validIds.has(aid)).length;
		}, [selectedSet, availableAgents]);

		const handleToggle = useCallback(
			(id: string) => {
				// Reconstruct from live agents so deleted agent ids are dropped
				const validIds = new Set(availableAgents.map((a) => a.id));
				const next = new Set([...selectedSet].filter((aid) => validIds.has(aid)));
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				onChange([...next]);
			},
			[selectedSet, onChange, availableAgents],
		);

		useEffect(() => {
			if (!isOpen) return;
			const handler = (e: MouseEvent) => {
				if (
					dropdownRef.current?.contains(e.target as Node) ||
					triggerRef.current?.contains(e.target as Node)
				)
					return;
				setIsOpen(false);
			};
			document.addEventListener("mousedown", handler);
			return () => document.removeEventListener("mousedown", handler);
		}, [isOpen]);

		return (
			<Box position="relative">
				<Box
					ref={triggerRef}
					borderWidth="1px"
					borderColor="var(--wc-border-default)"
					borderRadius="md"
					bg="var(--wc-bg-subtle)"
					px="2.5"
					py="1.5"
					cursor="pointer"
					minH="32px"
					onClick={(e) => {
						onClick?.(e);
						setIsOpen(!isOpen);
					}}
				>
					<Text
						fontSize="xs"
						color={validCount > 0 ? "var(--wc-text-primary)" : "var(--wc-text-faint)"}
					>
						{validCount > 0 ? `${validCount} agent(s)` : "No agents allowed"}
					</Text>
				</Box>
				{isOpen && (
					<Box
						ref={dropdownRef}
						position="absolute"
						top="100%"
						left={0}
						zIndex={10000}
						minW="260px"
						maxW="320px"
						maxH="280px"
						overflowY="auto"
						borderWidth="1px"
						borderColor="var(--wc-border-overlay)"
						borderRadius="lg"
						bg="var(--wc-bg-elevated)"
						shadow="lg"
						p="2"
					>
						{availableAgents.length === 0 && (
							<Text
								fontSize="xs"
								color="var(--wc-text-faint)"
								textAlign="center"
								p="3"
							>
								No agents available
							</Text>
						)}
						{availableAgents.map((agent) => {
							const isSelected = selectedSet.has(agent.id);
							const toolCount = agent.tools?.length ?? 0;
							return (
								<Box
									key={agent.id}
									display="flex"
									flexDirection="column"
									gap="1"
									p="2"
									borderRadius="md"
									cursor="pointer"
									bg={isSelected ? "var(--wc-bg-selected)" : "transparent"}
									_hover={{
										bg: isSelected
											? "var(--wc-bg-selected)"
											: "var(--wc-bg-card)",
									}}
									onClick={(e) => {
										e.stopPropagation();
										handleToggle(agent.id);
									}}
								>
									<Box display="flex" alignItems="center" gap="1.5">
										{isSelected && (
											<Check size={12} color="var(--wc-accent-green)" />
										)}
										{!isSelected && (
											<Bot
												size={13}
												color="var(--wc-text-muted)"
												flexShrink={0}
											/>
										)}
										<Text fontWeight="600" fontSize="sm" flex="1" minW="0">
											{agent.name}
										</Text>
										<Badge
											size="xs"
											fontSize="9px"
											bg="var(--wc-bg-subtle)"
											color="var(--wc-text-muted)"
											borderRadius="sm"
											px="1.5"
											flexShrink={0}
										>
											{toolCount} tool{toolCount === 1 ? "" : "s"}
										</Badge>
									</Box>
									{agent.description && (
										<Text
											fontSize="12px"
											color="var(--wc-text-faint)"
											lineHeight="1.3"
											maxH="2.6em"
											overflow="hidden"
											pl={isSelected ? "4" : "5"}
										>
											{agent.description}
										</Text>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</Box>
		);
	},
);
