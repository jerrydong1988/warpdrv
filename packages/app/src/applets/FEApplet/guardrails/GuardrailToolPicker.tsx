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

export const GuardrailToolPicker = React.memo(
	({
		value,
		onChange,
		onClick,
	}: {
		value: IToolAttachment[];
		onChange: (tools: IToolAttachment[]) => void;
		onClick?: (e: React.MouseEvent) => void;
	}) => {
		const mcpServers = useStore((s) => s.mcpServers);
		const [isOpen, setIsOpen] = useState(false);
		const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
		const dropdownRef = useRef<HTMLDivElement | null>(null);
		const triggerRef = useRef<HTMLDivElement | null>(null);

		const connectedServers = useMemo(() => {
			const entries = Object.entries(mcpServers).filter(
				([, s]) => s.status === EMcpServerStatus.CONNECTED,
			);
			return entries as [
				string,
				{ status: EMcpServerStatus; tools: { name: string; description: string }[] },
			][];
		}, [mcpServers]);

		const selectedSet = useMemo(() => {
			const s = new Set<string>();
			for (const t of value) s.add(`${t.serverName}:${t.toolName}`);
			return s;
		}, [value]);

		const handleToggle = (serverName: string, toolName: string) => {
			const key = `${serverName}:${toolName}`;
			const next = new Set(selectedSet);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			const result: IToolAttachment[] = [];
			for (const k of next) {
				const idx = k.indexOf(":");
				if (idx > 0)
					result.push({ serverName: k.slice(0, idx), toolName: k.slice(idx + 1) });
			}
			onChange(result);
		};

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

		const totalSelected = value.length;

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
						color={
							totalSelected > 0 ? "var(--wc-text-primary)" : "var(--wc-text-faint)"
						}
					>
						{totalSelected > 0 ? `${totalSelected} tool(s)` : "All tool calls"}
					</Text>
				</Box>
				{isOpen && (
					<Box
						ref={dropdownRef}
						position="absolute"
						top="100%"
						left={0}
						zIndex={10000}
						minW="220px"
						maxW="280px"
						maxH="250px"
						overflowY="auto"
						borderWidth="1px"
						borderColor="var(--wc-border-overlay)"
						borderRadius="lg"
						bg="var(--wc-bg-elevated)"
						shadow="lg"
						p="2"
					>
						{connectedServers.map(([serverName, state]) => {
							const isExpanded = expandedServers.has(serverName);
							const activeCount = state.tools.filter((t) =>
								selectedSet.has(`${serverName}:${t.name}`),
							).length;
							return (
								<Box key={serverName}>
									<Box
										display="flex"
										alignItems="center"
										justifyContent="space-between"
										p="1.5"
										borderRadius="md"
										cursor="pointer"
										fontSize="9px"
										fontWeight="600"
										color={
											activeCount > 0
												? "var(--wc-accent-blue)"
												: "var(--wc-text-muted)"
										}
										textTransform="uppercase"
										letterSpacing="0.05em"
										_hover={{ bg: "var(--wc-bg-card)" }}
										onClick={(e) => {
											e.stopPropagation();
											setExpandedServers((prev) => {
												const n = new Set(prev);
												isExpanded
													? n.delete(serverName)
													: n.add(serverName);
												return n;
											});
										}}
									>
										<span
											style={{
												display: "flex",
												alignItems: "center",
												gap: "4px",
											}}
										>
											{isExpanded ? (
												<ChevronDown size={10} />
											) : (
												<ChevronRight size={10} />
											)}
											{serverName}
										</span>
										<span
											fontSize="8px"
											fontWeight={400}
											color="var(--wc-text-faint)"
										>
											{state.tools.length}
											{activeCount ? ` (${activeCount})` : ""}
										</span>
									</Box>
									{isExpanded && (
										<Box pl="2">
											{state.tools.map((tool) => {
												const isSelected = selectedSet.has(
													`${serverName}:${tool.name}`,
												);
												return (
													<Box
														key={tool.name}
														display="flex"
														alignItems="center"
														gap="6px"
														p="1"
														borderRadius="md"
														cursor="pointer"
														fontSize="11px"
														color="var(--wc-text-primary)"
														bg={
															isSelected
																? "var(--wc-bg-selected)"
																: "transparent"
														}
														_hover={{
															bg: isSelected
																? "var(--wc-bg-selected)"
																: "var(--wc-bg-card)",
														}}
														onClick={() =>
															handleToggle(serverName, tool.name)
														}
													>
														{isSelected && (
															<Check
																size={10}
																color="var(--wc-accent-blue)"
															/>
														)}
														<span
															overflow="hidden"
															textOverflow="ellipsis"
															whiteSpace="nowrap"
														>
															{tool.name}
														</span>
													</Box>
												);
											})}
										</Box>
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
