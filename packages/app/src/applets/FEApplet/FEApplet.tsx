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
import type { IAppletFn, TAppletDefinition } from "@warpcore/realmcore";
import { EAppletHostType, EAppletScope } from "@warpcore/realmcore";
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
import type { IAppletAPIFE } from "../lib/types";
import { GuardrailBadge, GuardrailPicker } from "../ui/GuardrailBadge";
import { ModeTabs } from "../ui/ModeTabs";
import { MonitorButton } from "../ui/MonitorButton";
import { SenderBadge } from "../ui/SenderBadge";

const EMPTY_TODOS: ITodoItem[] = [];
const EMPTY_GUARDRAILS: Record<string, IGuardrailDefinition> = {};
const EMPTY_ARRAY: Array<any> = [];
const EMPTY_OBJ: Record<any, any> = {};

const GuardrailToolPicker = React.memo(
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

const AgentPicker = React.memo(
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

function useGuardrailItems(): TDropdownItem[] {
	const guardrails = useStore((s) => s.guardrails) || EMPTY_GUARDRAILS;
	return useMemo(
		() => Object.values(guardrails).map((g) => ({ label: g.name, value: g.id })),
		[guardrails],
	);
}

function useModeItems(): TDropdownItem[] {
	const modes = useStore((s) => s.modes);
	const currentThreadId = useStore((s) => s.currentThreadId);
	const threads = useStore((s) => s.threads);
	const folderId = currentThreadId ? threads[currentThreadId]?.folderId : null;
	return useMemo(() => {
		const scope = folderId || "global";
		return Object.values(modes)
			.filter((m: IMode) => m.scope === "global" || m.scope === scope)
			.map((m: IMode) => ({ label: m.name, value: m.id }));
	}, [modes, scope]);
}

const TodoPanel = React.memo(() => {
	const threadId = useStore((s) => s.currentThreadId);
	const todos = useStore((s) => {
		if (!threadId) return EMPTY_TODOS;
		return (s.getCurrentThreadState(s)?.todos as ITodoItem[]) || EMPTY_TODOS;
	});
	const setThreadState = useStore((s) => s.setThreadState);
	const annotations = useStore((s) => s.annotations);
	const addAnnotation = useStore((s) => s.addAnnotation);
	const removeAnnotation = useStore((s) => s.removeAnnotation);

	const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
	const [addText, setAddText] = useState("");
	const [draftText, setDraftText] = useState("");
	const editRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingIndex !== null) {
			setDraftText(todos[editingIndex]?.text || "");
		}
	}, [editingIndex, todos]);

	const addTodoAnnotation = useCallback(
		(updatedTodos: ITodoItem[]) => {
			// const existing = annotations.find(a => a.selectedText.startsWith('<todos>'));
			// if (existing) removeAnnotation(existing.id);
			// const formatted = updatedTodos.map((t, i) => `${i + 1}. ${t.text} ${t.status === 'done' ? '[DONE]' : '[PENDING]'}`).join('\\n');
			// addAnnotation(`<todos>\\n${formatted}\\n</todos>`, 'Updated Todos');
		},
		[annotations, addAnnotation, removeAnnotation],
	);

	const toggleDone = useCallback(
		(index: number) => {
			const updated = todos.map((t, j) =>
				j === index ? { ...t, status: t.status === "done" ? "pending" : "done" } : t,
			);
			setThreadState(threadId, { todos: updated, todoEtag: nanoid(6) });
			addTodoAnnotation(updated);
		},
		[todos, setThreadState, threadId, addTodoAnnotation],
	);

	const startEdit = useCallback((index: number) => {
		setEditingIndex(index);
		setTimeout(() => editRef.current?.focus(), 0);
	}, []);

	const saveEdit = useCallback(() => {
		if (editingIndex === null) return;
		const trimmed = draftText.trim();
		if (!trimmed) {
			setEditingIndex(null);
			return;
		}
		const updated = todos.map((t, j) => (j === editingIndex ? { ...t, text: trimmed } : t));
		setThreadState(threadId, { todos: updated, todoEtag: nanoid(6) });
		setEditingIndex(null);
		addTodoAnnotation(updated);
	}, [editingIndex, draftText, todos, setThreadState, threadId, addTodoAnnotation]);

	const cancelEdit = useCallback(() => {
		setEditingIndex(null);
	}, []);

	const deleteTodo = useCallback(
		(index: number) => {
			const updated = todos.filter((_, j) => j !== index);
			setThreadState(threadId, { todos: updated, todoEtag: nanoid(6) });
			setDeleteConfirm(null);
			addTodoAnnotation(updated);
		},
		[todos, setThreadState, threadId, addTodoAnnotation],
	);

	const addTodo = useCallback(() => {
		const trimmed = addText.trim();
		if (!trimmed) return;
		const newTodos = [...todos, { text: trimmed, status: "pending" }];
		setThreadState(threadId, { todos: newTodos, todoEtag: nanoid(6) });
		setAddText("");
		addTodoAnnotation(newTodos);
	}, [addText, todos, setThreadState, threadId, addTodoAnnotation]);

	const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
		setDraggingIndex(index);
		e.dataTransfer.setData("index", String(index));
		e.dataTransfer.effectAllowed = "move";
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setDragOverIndex(index);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			const fromIndex = parseInt(e.dataTransfer.getData("index"), 10);
			if (draggingIndex === null || isNaN(fromIndex)) {
				setDraggingIndex(null);
				setDragOverIndex(null);
				return;
			}
			const toIndex = dragOverIndex !== null ? dragOverIndex : todos.length;
			const updated = [...todos];
			const [item] = updated.splice(fromIndex, 1);
			updated.splice(toIndex, 0, item);
			setThreadState(threadId, { todos: updated, todoEtag: nanoid(6) });
			setDraggingIndex(null);
			setDragOverIndex(null);
			addTodoAnnotation(updated);
		},
		[draggingIndex, dragOverIndex, todos, setThreadState, threadId, addTodoAnnotation],
	);

	const handleDragEnd = useCallback(() => {
		setDraggingIndex(null);
		setDragOverIndex(null);
	}, []);

	if (!todos.length) {
		return (
			<Box p="3">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center" mb="2">
					No todos yet
				</Text>
				<Input
					size="xs"
					fontSize="xs"
					value={addText}
					onChange={(e) => setAddText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addTodo();
					}}
					placeholder="Add todo..."
				/>
			</Box>
		);
	}

	return (
		<VStack gap="3" p="2" align="stretch">
			{todos.map((todo, i) => (
				<Box
					key={i}
					borderWidth="2px"
					borderColor={
						dragOverIndex === i ? "var(--wc-accent-blue-border)" : "transparent"
					}
					// borderRadius="md"
					// p="2"
					// py="1"
					// bg="var(--wc-bg-subtle)"
					opacity={draggingIndex === i ? 0.6 : 1}
					draggable
					onDragStart={(e) => handleDragStart(e, i)}
					onDragOver={(e) => handleDragOver(e, i)}
					onDragLeave={() => setDragOverIndex(null)}
					onDrop={handleDrop}
					onDragEnd={handleDragEnd}
				>
					<Flex gap="1.5" align="center">
						<Box
							cursor="pointer"
							flexShrink={0}
							display="flex"
							alignItems="center"
							justifyContent="center"
							w="14px"
							h="14px"
							borderWidth="1px"
							borderColor={
								todo.status === "done"
									? "var(--wc-accent-green)"
									: "var(--wc-border-default)"
							}
							borderRadius="sm"
							bg="transparent"
							mr="1"
							onClick={() => toggleDone(i)}
						>
							{todo.status === "done" && (
								<Check size={12} strokeWidth={3} color="var(--wc-accent-green)" />
							)}
						</Box>

						<Text
							fontSize="xs"
							fontWeight="600"
							color="var(--wc-text-faint)"
							flexShrink={0}
						>
							{i}.
						</Text>

						{editingIndex === i ? (
							<Flex gap="1" flex="1" minW="0" align="center">
								<Input
									ref={editRef}
									size="xs"
									fontSize="xs"
									flex="1"
									minW="0"
									value={draftText}
									onChange={(e) => setDraftText(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") saveEdit();
										if (e.key === "Escape") cancelEdit();
									}}
									onBlur={saveEdit}
								/>
								<Box cursor="pointer" onClick={saveEdit}>
									<Check size={12} color="var(--wc-text-muted)" />
								</Box>
								<Box cursor="pointer" onClick={cancelEdit}>
									<XCircle size={12} color="var(--wc-text-muted)" />
								</Box>
							</Flex>
						) : (
							<>
								<Text
									fontSize="xs"
									color={
										todo.status === "done"
											? "var(--wc-text-muted)"
											: "var(--wc-text-primary)"
									}
									textDecoration={
										todo.status === "done" ? "line-through" : "none"
									}
									flex="1"
									minW="0"
									overflow="hidden"
									textOverflow="ellipsis"
									whiteSpace="nowrap"
								>
									{todo.text}
								</Text>
								<Box
									cursor="grab"
									_hover={{ color: "var(--wc-text-primary)" }}
									flexShrink={0}
									display="flex"
									alignItems="center"
									px="0.5"
								>
									<MdDragHandle size={15} color="var(--wc-text-muted)" />
								</Box>
								<Box
									w="1px"
									h="12px"
									bg="var(--wc-border-subtle)"
									flexShrink={0}
									mx="1"
								/>
								<Box
									cursor="pointer"
									_hover={{ color: "var(--wc-text-primary)" }}
									onClick={() => startEdit(i)}
								>
									<Edit2 size={12} color="var(--wc-text-muted)" />
								</Box>
								<Box
									cursor="pointer"
									_hover={{ color: "var(--wc-accent-red)" }}
									onClick={() => setDeleteConfirm(i)}
									ml="2"
								>
									<Trash2 size={12} color="var(--wc-accent-red)" />
								</Box>
							</>
						)}
					</Flex>
				</Box>
			))}

			<Input
				size="xs"
				fontSize="xs"
				value={addText}
				onChange={(e) => setAddText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") addTodo();
				}}
				placeholder="Add todo..."
			/>

			{deleteConfirm !== null && (
				<ConfirmDialog
					title="Delete Todo"
					message={`Are you sure you want to delete "${todos[deleteConfirm]?.text}"?`}
					isOpen={true}
					onConfirm={() => deleteTodo(deleteConfirm)}
					onCancel={() => setDeleteConfirm(null)}
					confirmLabel="Delete"
				/>
			)}
		</VStack>
	);
});

const CompactIndicator = React.memo(
	({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
		const messageId = useAuiState((s) => s.message.id);
		const slashCommands = useStore((s) => s.messageStates[messageId]?.slashCommands);
		const hasCompact = (slashCommands as Array<IExtractedSlashCommand> | undefined)?.some(
			(cmd) => cmd.name === "compact",
		);

		if (!hasCompact) return children;
		return (
			<>
				{children}
				<Box display="flex" alignItems="center" gap="2" mt="2">
					<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
					<Text
						fontSize="sm"
						fontWeight="600"
						color="var(--wc-accent-yellow-glow)"
						letterSpacing="0.1em"
					>
						COMPACTION
					</Text>
					<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
				</Box>
			</>
		);
	},
);

const ModeChangeIndicator = React.memo(
	({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
		const messageId = useAuiState((s) => s.message.id);
		const role = useAuiState((s) => s.message.role);
		const currentThreadId = useStore((s) => s.currentThreadId);
		const currentModeMarker = useStore((s) => s.messageStates[messageId]?.modeMarker) as
			| { id: string; name: string }
			| undefined;
		const currentMode = useStore((s) => {
			const m = s.messageStates[messageId]?.modeMarker as { id: string } | undefined;
			return m ? s.modes[m.id] : undefined;
		});

		const prevUserMsgId = useMemo(() => {
			if (!currentModeMarker) return null;
			const st = useStore.getState();
			const threadMsgs = st.messagesByThread?.[currentThreadId];
			if (!threadMsgs) return null;

			let curr = threadMsgs[messageId]?.parentId;
			while (curr) {
				const msg = threadMsgs[curr];
				if (!msg) break;
				if (msg.role === "user" && curr !== messageId) {
					return curr;
				}
				curr = msg.parentId ?? null;
			}
			return null;
		}, [messageId, currentModeMarker]);

		const prevModeMarker = useStore((s) =>
			prevUserMsgId
				? (s.messageStates[prevUserMsgId]?.modeMarker as { id: string } | undefined)
				: undefined,
		);

		const modeChangeInfo = useMemo(() => {
			if (!currentModeMarker) return null;
			if (!prevUserMsgId) return null;
			if (!prevModeMarker) return null;
			if (currentModeMarker.id !== prevModeMarker.id) {
				return {
					modeName: currentModeMarker.name,
					modeColor: currentMode?.color || "#ffffff",
				};
			}
			return null;
		}, [messageId, currentModeMarker, currentMode, prevModeMarker]);

		if (role !== "user" || !modeChangeInfo) return children;

		return (
			<>
				<Box display="flex" alignItems="center" gap="2" mb="2">
					<Box flex="1" borderTopWidth="2px" borderColor={modeChangeInfo.modeColor} />
					<Text
						fontSize="sm"
						fontWeight="600"
						color={modeChangeInfo.modeColor}
						letterSpacing="0.1em"
						textTransform={"uppercase"}
					>
						{modeChangeInfo.modeName}
					</Text>
					<Box flex="1" borderTopWidth="2px" borderColor={modeChangeInfo.modeColor} />
				</Box>
				{children}
			</>
		);
	},
);

const ModeToolViolationIndicator = React.memo(
	({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
		const messageId = useAuiState((s) => s.message.id);
		const blockedToolName = useStore((s) => s.messageStates[messageId]?.blockedToolName) as
			| string
			| undefined;

		if (!blockedToolName) return children;

		return (
			<>
				{children}
				<Box
					display="flex"
					alignItems="center"
					gap="2"
					mt="2"
					px="2"
					py="1"
					mx="4"
					borderRadius="md"
					bg="var(--wc-bg-surface-2)"
					borderLeftWidth="3px"
					borderColor="var(--wc-accent-red)"
				>
					<Ban size={14} color="var(--wc-accent-red)" />
					<Text fontSize="xs" color="var(--wc-accent-red)" fontWeight="500">
						Tool call to &quot;{blockedToolName}&quot; was blocked by mode restrictions
					</Text>
				</Box>
			</>
		);
	},
);

const GuardrailRow = React.memo(({ guardrail }: { guardrail: IGuardrailDefinition }) => {
	const [expanded, setExpanded] = useState(false);
	const [editingName, setEditingName] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [draftName, setDraftName] = useDependantState(guardrail.name);
	const [draftPrompt, setDraftPrompt] = useDependantState(guardrail.prompt || "");
	const [draftMessagesCount, setDraftMessagesCount] = useDependantState(
		guardrail.messagesCount ?? 0,
	);
	const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const promptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateGuardrail = useCallback(
		async (patch: Partial<IGuardrailDefinition>) => {
			try {
				await updateGuardrailApi(guardrail.id, { ...guardrail, ...patch });
			} catch (e) {
				console.error("Failed to update guardrail:", e);
			}
		},
		[guardrail],
	);

	const flushName = useCallback(async () => {
		if (draftName === guardrail.name) return;
		try {
			await updateGuardrailApi(guardrail.id, { ...guardrail, name: draftName });
		} catch (e) {
			console.error("Failed to rename guardrail:", e);
		}
	}, [draftName, guardrail]);

	const handleNameBlur = useCallback(() => {
		setEditingName(false);
		if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
		nameSaveTimerRef.current = setTimeout(flushName, 200);
	}, [flushName]);

	const flushPrompt = useCallback(() => {
		updateGuardrail({ prompt: draftPrompt });
	}, [draftPrompt, updateGuardrail]);

	const handlePromptBlur = useCallback(() => {
		if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		promptSaveTimerRef.current = setTimeout(flushPrompt, 200);
	}, [flushPrompt]);

	useEffect(() => {
		return () => {
			if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
			if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		};
	}, []);

	const handleDelete = async () => {
		try {
			await deleteGuardrailApi(guardrail.id);
		} catch (e) {
			console.error("Failed to delete guardrail:", e);
		}
	};

	return (
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
				{expanded ? (
					<ChevronDown size={14} color="var(--wc-text-muted)" />
				) : (
					<ChevronRight size={14} color="var(--wc-text-muted)" />
				)}
				{editingName ? (
					<Input
						size="xs"
						fontSize="xs"
						fontWeight="600"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onBlur={handleNameBlur}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleNameBlur();
						}}
						onClick={(e) => e.stopPropagation()}
						flex="1"
						minW="0"
					/>
				) : (
					<Flex align="center" gap="1.5" flex="1" minW="0">
						<Text
							fontSize="xs"
							fontWeight="600"
							color="var(--wc-text-primary)"
							textOverflow="ellipsis"
							overflow="hidden"
						>
							{draftName}
						</Text>

						<Edit2
							size={10}
							color="var(--wc-text-faint)"
							style={{ cursor: "pointer", flexShrink: 0 }}
							onClick={(e) => {
								e.stopPropagation();
								setEditingName(true);
							}}
						/>
					</Flex>
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
							value={guardrail.serverId}
							onChange={(id) => updateGuardrail({ serverId: id })}
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
							Trigger only on tool calls
						</Text>
						<GuardrailToolPicker
							value={guardrail.triggerOnTools || []}
							onChange={(tools) => updateGuardrail({ triggerOnTools: tools })}
							onClick={(e) => e.stopPropagation()}
						/>
					</Box>

					<Flex gap="2" align="center">
						<Switch.Root
							size="sm"
							checked={guardrail.inferenceParams?.enableThinking as boolean}
							onCheckedChange={(details) => {
								const newParams = {
									...(guardrail.inferenceParams || {}),
									enableThinking: details.checked,
								};
								updateGuardrail({ inferenceParams: newParams });
							}}
							onClick={(e) => e.stopPropagation()}
						>
							<Switch.HiddenInput />
							<Switch.Control
								css={{
									bg: (guardrail.inferenceParams?.enableThinking as boolean)
										? "var(--wc-switch-active)"
										: "var(--wc-bg-active)",
								}}
							>
								<Switch.Thumb css={{ bg: "var(--wc-special-switch-thumb)" }} />
							</Switch.Control>
						</Switch.Root>
						<Text fontSize="xs" color="var(--wc-text-primary)">
							Enable thinking
						</Text>
					</Flex>

					{!!guardrail.inferenceParams?.enableThinking && (
						<Box>
							<Text
								fontSize="9px"
								fontWeight="600"
								color="var(--wc-text-muted)"
								textTransform="uppercase"
								letterSpacing="0.04em"
								mb="1"
							>
								Reasoning effort
							</Text>
							<SegmentGroup.Root
								value={
									(guardrail.inferenceParams?.reasoningEffort as string) ||
									"medium"
								}
								onValueChange={(details) => {
									const newParams = {
										...(guardrail.inferenceParams || {}),
										reasoningEffort: details.value,
									};
									updateGuardrail({ inferenceParams: newParams });
								}}
							>
								<SegmentGroup.Indicator />
								<SegmentGroup.Items items={["low", "medium", "high"]} />
							</SegmentGroup.Root>
						</Box>
					)}

					<Flex gap="2" align="center">
						<Switch.Root
							size="sm"
							checked={guardrail.includeBaseMessage ?? false}
							onCheckedChange={(details) =>
								updateGuardrail({ includeBaseMessage: details.checked })
							}
							onClick={(e) => e.stopPropagation()}
						>
							<Switch.HiddenInput />
							<Switch.Control
								css={{
									bg:
										(guardrail.includeBaseMessage ?? false)
											? "var(--wc-switch-active)"
											: "var(--wc-bg-active)",
								}}
							>
								<Switch.Thumb css={{ bg: "var(--wc-special-switch-thumb)" }} />
							</Switch.Control>
						</Switch.Root>
						<Text fontSize="xs" color="var(--wc-text-primary)">
							Include root message
						</Text>
					</Flex>

					<Box>
						<Text
							fontSize="9px"
							fontWeight="600"
							color="var(--wc-text-muted)"
							textTransform="uppercase"
							letterSpacing="0.04em"
							mb="1"
						>
							Include previous n messages
						</Text>
						<Input
							size="xs"
							fontSize="xs"
							type="number"
							min={0}
							value={draftMessagesCount}
							onChange={(e) => setDraftMessagesCount(Number(e.target.value))}
							onBlur={() => updateGuardrail({ messagesCount: draftMessagesCount })}
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
							value={guardrail.promptId || ""}
							onChange={(promptId) =>
								updateGuardrail({ promptId: promptId || undefined })
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
							Custom Prompt
						</Text>
						<Textarea
							size="xs"
							fontSize="11px"
							value={draftPrompt}
							onChange={(e) => setDraftPrompt(e.target.value)}
							onBlur={handlePromptBlur}
							rows={3}
							resize="vertical"
							placeholder="Custom rules..."
						/>
					</Box>

					<Flex justifyContent="flex-end">
						<Button
							size="xs"
							fontSize="10px"
							px="2"
							py="1"
							borderRadius="sm"
							bg="var(--wc-accent-red-bg-8)"
							color="var(--wc-accent-red)"
							borderWidth="1px"
							borderColor="var(--wc-accent-red-border)"
							_hover={{ bg: "var(--wc-accent-red-hover)" }}
							onClick={() => setDeleteConfirmOpen(true)}
						>
							<Trash2 size={10} style={{ marginRight: "4px" }} />
							Delete
						</Button>
					</Flex>
				</VStack>
			)}

			{deleteConfirmOpen && (
				<ConfirmDialog
					title="Delete Guardrail"
					message={`Are you sure you want to delete "${draftName}"?`}
					isOpen={true}
					onConfirm={handleDelete}
					onCancel={() => setDeleteConfirmOpen(false)}
					confirmLabel="Delete"
				/>
			)}
		</Box>
	);
});

const GuardrailsPanel = React.memo(() => {
	const guardrails = useStore((s) => s.guardrails) || EMPTY_GUARDRAILS;
	const items = Object.values(guardrails);

	if (!items.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No guardrails
				</Text>
			</Box>
		);
	}

	return (
		<WithErrorBoundary name="GuardrailsPanel">
			<VStack gap="2" p="3" align="stretch">
				{items.map((g) => (
					<GuardrailRow key={g.name} guardrail={g} />
				))}
			</VStack>
		</WithErrorBoundary>
	);
});

const ModeRow = React.memo(({ mode }: { mode: IMode }) => {
	const [expanded, setExpanded] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [draftName, setDraftName] = useDependantState(mode.name);
	const [draftPrompt, setDraftPrompt] = useDependantState(mode.prompt || "");
	const [draftColor, setDraftColor] = useDependantState(mode.color || "#a78bfa");
	const [draftTools, setDraftTools] = useDependantState(mode.allowedTools);
	const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const promptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateMode = useCallback(
		async (patch: Partial<IMode>) => {
			try {
				await updateModeApi(mode.id, patch);
			} catch (e) {
				console.error("Failed to update mode:", e);
			}
		},
		[mode.id],
	);

	const handleNameBlur = useCallback(() => {
		if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
		nameSaveTimerRef.current = setTimeout(() => {
			if (draftName !== mode.name) {
				updateMode({ name: draftName || "" });
			}
		}, 200);
	}, [draftName, mode.name, updateMode]);

	const handlePromptBlur = useCallback(() => {
		if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		promptSaveTimerRef.current = setTimeout(() => {
			if (draftPrompt !== (mode.prompt || "")) {
				updateMode({ prompt: draftPrompt || undefined });
			}
		}, 200);
	}, [draftPrompt, mode.prompt, updateMode]);

	useEffect(() => {
		return () => {
			if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
			if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		};
	}, []);

	const handleDelete = async () => {
		try {
			await deleteModeApi(mode.id);
		} catch (e) {
			console.error("Failed to delete mode:", e);
		}
		setDeleteConfirmOpen(false);
	};

	const mc = mode.color || "#a78bfa";

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
					<Box
						style={{
							width: "10px",
							height: "10px",
							borderRadius: "3px",
							background: mc,
							flexShrink: 0,
						}}
					/>
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
								Color
							</Text>
							<ColorPicker.Root
								defaultValue={parseColor(draftColor)}
								onValueChange={(details) => {
									const hex = details.value.toString("hex");
									setDraftColor(hex);
									updateMode({ color: hex });
								}}
							>
								<ColorPicker.HiddenInput />
								<ColorPicker.Control>
									<ColorPicker.Input />
									<ColorPicker.Trigger />
								</ColorPicker.Control>
								<ColorPicker.Positioner>
									<ColorPicker.Content>
										<ColorPicker.Area />
										<ColorPicker.Sliders />
									</ColorPicker.Content>
								</ColorPicker.Positioner>
							</ColorPicker.Root>
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
								Allowed tools
							</Text>
							<GuardrailToolPicker
								value={draftTools}
								onChange={(tools) => {
									setDraftTools(tools);
									updateMode({ allowedTools: tools });
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
								Active guardrails
							</Text>
							<GuardrailPicker
								value={mode.activeGuardrails || []}
								onChange={(ids) => updateModeGuardrailsApi(mode.id, ids)}
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
								Allowed agents
							</Text>
							<AgentPicker
								value={mode.allowedAgents || []}
								onChange={(agents) => {
									updateMode({ allowedAgents: agents });
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
								Saved Prompt
							</Text>
							<PromptPicker
								value={mode.promptId || ""}
								onChange={(promptId) =>
									updateMode({ promptId: promptId || undefined })
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
								Tail prompt
							</Text>
							<Textarea
								size="xs"
								fontSize="xs"
								rows={3}
								placeholder="Optional tail prompt..."
								value={draftPrompt}
								onChange={(e) => setDraftPrompt(e.target.value)}
								onBlur={handlePromptBlur}
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
					title="Delete Mode"
					message={`Are you sure you want to delete "${mode.name}"?`}
					isOpen={true}
					onConfirm={handleDelete}
					onCancel={() => setDeleteConfirmOpen(false)}
					confirmLabel="Delete"
				/>
			)}
		</>
	);
});

const ModesPanel = React.memo(() => {
	const modes = useStore((s) => s.modes);
	const threads = useStore((s) => s.threads);
	const currentThreadId = useStore((s) => s.currentThreadId);

	const folderId = currentThreadId ? threads[currentThreadId]?.folderId : null;
	const scope = folderId || "global";

	const availableModes = useMemo(() => {
		return Object.values(modes).filter((m) => m.scope === "global" || m.scope === scope);
	}, [modes, scope]);

	if (!availableModes.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No modes
				</Text>
			</Box>
		);
	}

	return (
		<VStack gap="2" p="3" align="stretch" height="100%">
			{availableModes.map((m) => (
				<ModeRow key={m.id} mode={m} />
			))}
		</VStack>
	);
});

/* ============================================================
 * Prompts Panel — list, edit, rename, delete user prompts
 * ============================================================ */

const PromptRow = React.memo(({ prompt }: { prompt: IChatPrompt }) => {
	const [expanded, setExpanded] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [draftName, setDraftName] = useDependantState(prompt.name);
	const [draftContent, setDraftContent] = useDependantState(prompt.content);
	const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const contentSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updatePrompt = useCallback(
		async (patch: { name?: string; content?: string }) => {
			try {
				await useStore.getState().updateChatPrompt(prompt.id, patch);
			} catch (e) {
				console.error("Failed to update prompt:", e);
			}
		},
		[prompt.id],
	);

	const handleNameBlur = useCallback(() => {
		if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
		nameSaveTimerRef.current = setTimeout(() => {
			if (draftName !== prompt.name) {
				updatePrompt({ name: draftName || "" });
			}
		}, 200);
	}, [draftName, prompt.name, updatePrompt]);

	const handleContentBlur = useCallback(() => {
		if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
		contentSaveTimerRef.current = setTimeout(() => {
			if (draftContent !== prompt.content) {
				updatePrompt({ content: draftContent });
			}
		}, 200);
	}, [draftContent, prompt.content, updatePrompt]);

	useEffect(() => {
		return () => {
			if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
			if (contentSaveTimerRef.current) clearTimeout(contentSaveTimerRef.current);
		};
	}, []);

	const handleDelete = async () => {
		try {
			await useStore.getState().removeChatPrompt(prompt.id);
		} catch (e) {
			console.error("Failed to delete prompt:", e);
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
					<FileText size={14} color="var(--wc-text-muted)" style={{ flexShrink: 0 }} />
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
								Content
							</Text>
							<Textarea
								size="xs"
								fontSize="xs"
								rows={6}
								placeholder="Prompt content..."
								value={draftContent}
								onChange={(e) => setDraftContent(e.target.value)}
								onBlur={handleContentBlur}
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
					title="Delete Prompt"
					message={`Are you sure you want to delete "${prompt.name}"?`}
					isOpen={true}
					onConfirm={handleDelete}
					onCancel={() => setDeleteConfirmOpen(false)}
					confirmLabel="Delete"
				/>
			)}
		</>
	);
});

const PromptsPanel = React.memo(() => {
	const prompts = useStore((s) => s.chatPrompts);

	if (!prompts.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No prompts
				</Text>
			</Box>
		);
	}

	return (
		<WithErrorBoundary name="PromptsPanel">
			<VStack gap="2" p="3" align="stretch">
				{prompts.map((p) => (
					<PromptRow key={p.id} prompt={p} />
				))}
			</VStack>
		</WithErrorBoundary>
	);
});

const TGuardrailIssueEntry = { guardrailName: "", issue: {} as IGuardrailIssue };
type TGuardrailIssueEntry = typeof TGuardrailIssueEntry;

const GuardrailErrorItem = React.memo(
	({ guardrailName, error }: { guardrailName: string; error: IGuardrailError }) => {
		return (
			<Box
				p="2"
				borderRadius="md"
				bg="var(--wc-bg-subtle)"
				borderWidth="1px"
				borderColor="var(--wc-accent-red-border)"
			>
				<Flex justifyContent="space-between" align="flex-start" mb="0.5">
					<HStack gap="2" flex="1" minW="0" align="flex-start">
						<XCircle
							size={18}
							color="var(--wc-accent-red)"
							style={{ marginTop: "3px" }}
						/>
						<Badge
							px="1.5"
							py="0.5"
							mt="0.5"
							fontSize="sm"
							color="var(--wc-text-secondary)"
							bg="var(--wc-bg-active)"
						>
							{guardrailName}
						</Badge>
						<Text fontSize="md" color="var(--wc-accent-red)">
							Parse Error
						</Text>
					</HStack>
				</Flex>
				<Text color="var(--wc-text-muted)" fontFamily="mono" fontSize="xs" pl="6" mb="1">
					{error.message}
				</Text>
				{error.rawResponse && (
					<Text
						color="var(--wc-text-faint)"
						fontFamily="mono"
						fontSize="xs"
						pl="6"
						overflow="hidden"
						textOverflow="ellipsis"
						whiteSpace="nowrap"
					>
						Raw: {error.rawResponse.substring(0, 200)}
						{error.rawResponse.length > 200 ? "..." : ""}
					</Text>
				)}
			</Box>
		);
	},
);

const GuardrailAccordion = React.memo(
	({
		children,
		issues,
		isProcessing,
		processingNames,
		errorEntries,
	}: {
		children: React.ReactNode;
		issues: TGuardrailIssueEntry[];
		isProcessing: boolean;
		processingNames: string[];
		errorEntries?: Array<[string, IGuardrailError]>;
	}) => {
		const chatFontSize = useStore((s) => s.settings.chatFontSize ?? 14);
		const totalViolations = useMemo(
			() => issues.filter((i) => i.issue.type === EGuardrailIssueType.VIOLATION).length,
			[issues],
		);
		const totalWarnings = useMemo(
			() => issues.filter((i) => i.issue.type === EGuardrailIssueType.WARNING).length,
			[issues],
		);
		const totalErrors = (errorEntries || []).length;
		const allClear = !isProcessing && issues.length === 0 && totalErrors === 0;

		return (
			<>
				{children}
				<Box mx="15px" mt="1" mb="2">
					<AccordionRoot collapsible>
						<AccordionItemComp
							value="guardrails"
							borderRadius="10px"
							borderWidth="1px"
							borderColor="var(--wc-border-subtle)"
						>
							<AccordionItemTrigger
								style={{
									borderRadius: "10px 10px 0 0",
									background: "var(--wc-bg-card)",
									border: "none",
									cursor: "pointer",
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									width: "100%",
								}}
								px="2.5"
								py="1.5"
								_hover={{ bg: "var(--wc-bg-subtle)" }}
								css={{
									"&[data-state=open] .chevron": { transform: "rotate(180deg)" },
								}}
							>
								<HStack gap="2">
									{(totalViolations > 0 || totalErrors > 0) && (
										<GoShield
											size={chatFontSize}
											color="var(--wc-accent-red)"
										/>
									)}
									{!totalViolations && !totalErrors && totalWarnings > 0 && (
										<GoShield
											size={chatFontSize}
											color="var(--wc-accent-yellow)"
										/>
									)}
									{isProcessing && (
										<Spinner size="xs" color="var(--wc-text-muted)" />
									)}
									{allClear && (
										<GoShieldCheck
											size={chatFontSize}
											color="var(--wc-accent-green-icon)"
											opacity={0.8}
										/>
									)}
									{(totalViolations > 0 || totalErrors > 0) && (
										<Badge
											color="var(--wc-accent-red)"
											bg="var(--wc-accent-red-bg-8)"
											px="1.5"
											py="0.5"
											fontSize="11px"
										>
											{totalViolations + totalErrors} Issue
											{totalViolations + totalErrors !== 1 ? "s" : ""}
										</Badge>
									)}
									{totalWarnings > 0 && (
										<Badge
											color="var(--wc-accent-yellow)"
											bg="var(--wc-accent-yellow-bg-8)"
											px="1.5"
											py="0.5"
											fontSize="11px"
										>
											{totalWarnings} Warnings
										</Badge>
									)}
								</HStack>
								<HStack gap="2" align="center">
									<ChevronDown
										size={16}
										color="var(--wc-text-muted)"
										className="chevron"
										css={{ transition: "transform 0.15s ease" }}
									/>
								</HStack>
							</AccordionItemTrigger>
							<AccordionItemContent>
								<Box p="2.5">
									{allClear ? (
										<Text fontSize="sm" color="var(--wc-accent-green)">
											All clear
										</Text>
									) : (
										<VStack gap="2" align="stretch">
											{processingNames.map((name) => (
												<HStack key={name} gap="2">
													<Spinner size="sm" />
													<Text
														fontSize="sm"
														color="var(--wc-text-muted)"
													>
														Processing {name}...
													</Text>
												</HStack>
											))}
											{errorEntries?.map(([name, error], i) => (
												<GuardrailErrorItem
													key={`error-${i}`}
													guardrailName={name}
													error={error}
												/>
											))}
											{issues.map(({ guardrailName, issue }, i) => (
												<GuardrailIssueItem
													key={i}
													guardrailName={guardrailName}
													item={issue}
												/>
											))}
										</VStack>
									)}
								</Box>
							</AccordionItemContent>
						</AccordionItemComp>
					</AccordionRoot>
				</Box>
			</>
		);
	},
);

const GuardrailResults = React.memo(
	({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
		const messageId = useAuiState((s) => s.message.id);
		const role = useAuiState((s) => s.message.role);
		const results = useStore((s) => s.messageStates[messageId]?.guardrailResults) as Record<
			string,
			IGuardrailIssue[] | boolean
		>;
		const errors = useStore((s) => s.messageStates[messageId]?.guardrailErrors) as Record<
			string,
			IGuardrailError
		>;

		const entries = useMemo(() => (results ? Object.entries(results) : EMPTY_ARRAY), [results]);
		const processingNames = useMemo(
			() => entries.filter(([, v]) => v === false).map(([name]) => name),
			[entries],
		);
		const doneEntries = useMemo(() => entries.filter(([, v]) => Array.isArray(v)), [entries]);
		const isProcessing = processingNames.length > 0;

		const errorEntries = useMemo(() => {
			if (!errors) return EMPTY_ARRAY;
			return Object.entries(errors).filter(([name]) => {
				// Only include errors for guardrails that are in the results (meaning they were active)
				return results && name in results;
			});
		}, [errors, results]);

		const allIssues = useMemo(() => {
			const collected: TGuardrailIssueEntry[] = [];
			for (const [name, result] of doneEntries) {
				for (const item of result as IGuardrailIssue[]) {
					collected.push({ guardrailName: name, issue: item });
				}
			}
			const violations = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.VIOLATION)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			const warnings = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.WARNING)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			return [...violations, ...warnings];
		}, [doneEntries]);

		if (role !== "assistant" || !results) return children;
		else if (allIssues.length === 0 && errorEntries.length === 0) return children;

		return (
			<GuardrailAccordion
				issues={allIssues}
				isProcessing={isProcessing}
				processingNames={processingNames}
				errorEntries={errorEntries}
			>
				{children}
			</GuardrailAccordion>
		);
	},
);

const ToolCallGuardrailIssues = React.memo(
	({
		children,
		toolCallId,
		messageId,
	}: {
		children: React.ReactNode;
		toolCallId: string;
		messageId: string;
	}) => {
		const results = useStore((s) => s.messageStates[messageId]?.guardrailResults) as Record<
			string,
			IGuardrailIssue[] | boolean
		>;

		const entries = useMemo(() => (results ? Object.entries(results) : EMPTY_ARRAY), [results]);
		const processingNames = useMemo(
			() => entries.filter(([, v]) => v === false).map(([name]) => name),
			[entries],
		);
		const doneEntries = useMemo(() => entries.filter(([, v]) => Array.isArray(v)), [entries]);
		const isProcessing = processingNames.length > 0;

		const issues = useMemo(() => {
			const collected: TGuardrailIssueEntry[] = [];
			for (const [name, result] of doneEntries) {
				for (const item of result as IGuardrailIssue[]) {
					if (item.toolCallId === toolCallId) {
						collected.push({ guardrailName: name, issue: item });
					}
				}
			}
			const violations = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.VIOLATION)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			const warnings = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.WARNING)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			return [...violations, ...warnings];
		}, [doneEntries, toolCallId]);

		if (!results) return children;

		return (
			<GuardrailAccordion
				issues={issues}
				isProcessing={isProcessing}
				processingNames={processingNames}
			>
				{children}
			</GuardrailAccordion>
		);
	},
);

const NonToolGuardrailResults = React.memo(
	({
		children,
		toolCallId: _toolCallId,
		messageId,
	}: {
		children: React.ReactNode;
		toolCallId: string;
		messageId: string;
	}) => {
		const results = useStore((s) => s.messageStates[messageId]?.guardrailResults) as Record<
			string,
			IGuardrailIssue[] | boolean
		>;
		const errors = useStore((s) => s.messageStates[messageId]?.guardrailErrors) as Record<
			string,
			IGuardrailError
		>;

		const entries = useMemo(() => (results ? Object.entries(results) : EMPTY_ARRAY), [results]);
		const processingNames = useMemo(
			() => entries.filter(([, v]) => v === false).map(([name]) => name),
			[entries],
		);
		const doneEntries = useMemo(() => entries.filter(([, v]) => Array.isArray(v)), [entries]);
		const isProcessing = processingNames.length > 0;

		const errorEntries = useMemo(() => {
			if (!errors) return EMPTY_ARRAY;
			return Object.entries(errors).filter(([name]) => results && name in results);
		}, [errors, results]);

		const issues = useMemo(() => {
			const collected: TGuardrailIssueEntry[] = [];
			for (const [name, result] of doneEntries) {
				for (const item of result as IGuardrailIssue[]) {
					if (item.toolCallId === undefined) {
						collected.push({ guardrailName: name, issue: item });
					}
				}
			}
			const violations = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.VIOLATION)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			const warnings = collected
				.filter((i) => i.issue.type === EGuardrailIssueType.WARNING)
				.sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
			return [...violations, ...warnings];
		}, [doneEntries]);

		if (!results) return children;
		if (issues.length === 0 && errorEntries.length === 0) return children;

		return (
			<GuardrailAccordion
				issues={issues}
				isProcessing={isProcessing}
				processingNames={processingNames}
				errorEntries={errorEntries}
			>
				{children}
			</GuardrailAccordion>
		);
	},
);

const MiniToolCallGuardrailIndicator = React.memo(
	({
		children,
		toolCallId,
		messageId,
	}: {
		children: React.ReactNode;
		toolCallId: string;
		messageId: string;
	}) => {
		const results = useStore((s) => s.messageStates[messageId]?.guardrailResults) as Record<
			string,
			IGuardrailIssue[] | boolean
		>;
		const chatFontSize = useStore((s) => s.settings.chatFontSize ?? 14);

		const entries = useMemo(() => (results ? Object.entries(results) : EMPTY_ARRAY), [results]);
		const isProcessing = useMemo(() => entries.some(([, v]) => v === false), [entries]);
		const doneEntries = useMemo(() => entries.filter(([, v]) => Array.isArray(v)), [entries]);

		const violationCount = useMemo(() => {
			let count = 0;
			for (const [, result] of doneEntries) {
				for (const item of result as IGuardrailIssue[]) {
					if (
						item.toolCallId === toolCallId &&
						item.type === EGuardrailIssueType.VIOLATION
					)
						count++;
				}
			}
			return count;
		}, [doneEntries, toolCallId]);

		const warningCount = useMemo(() => {
			let count = 0;
			for (const [, result] of doneEntries) {
				for (const item of result as IGuardrailIssue[]) {
					if (item.toolCallId === toolCallId && item.type === EGuardrailIssueType.WARNING)
						count++;
				}
			}
			return count;
		}, [doneEntries, toolCallId]);

		if (!results) return children;

		return (
			<HStack gap="1" align="center" whiteSpace="nowrap">
				{children}
				{violationCount > 0 && (
					<GoShield size={chatFontSize} color="var(--wc-accent-red)" />
				)}
				{!violationCount && warningCount > 0 && (
					<GoShield size={chatFontSize} color="var(--wc-accent-yellow)" />
				)}
				{!isProcessing && !violationCount && !warningCount && (
					<GoShieldCheck
						size={chatFontSize}
						color="var(--wc-accent-green-icon)"
						opacity={0.8}
					/>
				)}
			</HStack>
		);
	},
);

const GuardrailIssueItem = React.memo(
	({ guardrailName, item }: { guardrailName: string; item: IGuardrailIssue }) => {
		const addAnnotation = useStore((s) => s.addAnnotation);
		const isViolation = item.type === EGuardrailIssueType.VIOLATION;

		return (
			<Box
				p="2"
				borderRadius="md"
				bg="var(--wc-bg-subtle)"
				borderWidth="1px"
				borderColor={
					isViolation ? "var(--wc-accent-red-border)" : "var(--wc-accent-yellow-border)"
				}
			>
				<Flex justifyContent="space-between" align="flex-start" mb={"0.5"}>
					<HStack gap="2" flex="1" minW="0" align={"flex-start"}>
						{isViolation ? (
							<XCircle
								size={18}
								color="var(--wc-accent-red)"
								style={{ marginTop: "3px" }}
							/>
						) : (
							<AlertTriangle
								size={18}
								color="var(--wc-accent-yellow)"
								style={{ marginTop: "3px" }}
							/>
						)}
						<Badge
							px="1.5"
							py="0.5"
							mt="0.5"
							fontSize="sm"
							color="var(--wc-text-secondary)"
							bg="var(--wc-bg-active)"
						>
							{guardrailName}
						</Badge>
						<Text fontSize="md" color="var(--wc-text-primary)" textOverflow="ellipsis">
							{item.issue}
						</Text>
					</HStack>
					<Box
						as="button"
						onClick={() => addAnnotation(item.quote, item.issue)}
						title="Add to annotations"
						flexShrink={0}
						ml="2"
						p="1"
						borderRadius="4px"
						border="none"
						bg="transparent"
						cursor="pointer"
						color="var(--wc-text-muted)"
						_hover={{ bg: "var(--wc-bg-subtle)", color: "var(--wc-text-primary)" }}
					>
						<TbMessage2Plus size={18} />
					</Box>
				</Flex>
				<Text
					color="var(--wc-text-muted)"
					fontFamily="mono"
					fontStyle="italic"
					textOverflow="ellipsis"
					overflow="hidden"
					pl="6"
				>
					{item.quote}
				</Text>
			</Box>
		);
	},
);

const GuardrailShieldCheck = React.memo(() => {
	const messageId = useAuiState((s) => s.message.id);
	const role = useAuiState((s) => s.message.role);
	const chatFontSize = useStore((s) => s.settings.chatFontSize ?? 14);

	const results = useStore((s) => s.messageStates[messageId]?.guardrailResults) as Record<
		string,
		IGuardrailIssue[] | boolean
	>;

	const entries = useMemo(() => (results ? Object.entries(results) : EMPTY_ARRAY), [results]);
	const isProcessing = useMemo(() => entries.some(([, v]) => v === false), [entries]);
	const doneEntries = useMemo(() => entries.filter(([, v]) => Array.isArray(v)), [entries]);

	const totalIssues = useMemo(() => {
		let count = 0;
		for (const [, result] of doneEntries) {
			for (const item of result as IGuardrailIssue[]) {
				if (
					item.type === EGuardrailIssueType.VIOLATION ||
					item.type === EGuardrailIssueType.WARNING
				)
					count++;
			}
		}
		return count;
	}, [doneEntries]);

	const allClear = !isProcessing && doneEntries.length > 0 && totalIssues === 0;

	if (role !== "assistant" || !results || !allClear) return null;
	return <GoShieldCheck size={chatFontSize} color="var(--wc-accent-green-icon)" opacity={0.8} />;
});

const toggleActiveGuardrail = (guardrailName: string, activate: boolean) => {
	const state = useStore.getState();
	const threadId = state.currentThreadId;
	const ts = state.getCurrentThreadState(state);
	const modeId = ts?.modeId as string | undefined;
	const activeNames =
		((modeId ? state.modes[modeId]?.activeGuardrails : ts?.activeGuardrails) as string[]) || [];

	const newNames = activate
		? [...activeNames, guardrailName]
		: activeNames.filter((n) => n !== guardrailName);

	if (modeId && state.modes[modeId]) {
		updateModeGuardrailsApi(modeId, newNames);
	} else {
		state.setThreadState(threadId, { activeGuardrails: newNames });
	}
};

/* ============================================================
 * Agent Row — expandable row with editable fields
 * ============================================================ */

const AgentRow = React.memo(({ agent }: { agent: IAgent }) => {
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

const EMPTY_AGENTS: Record<string, IAgent> = {};

const AgentsPanel = React.memo(() => {
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

const fn: IAppletFn<IAppletAPIFE> = async (api) => {
	console.log("[FEApplet] Started!");

	api.onReady(() => {
		console.log("[FEApplet] OnReady!");

		api.registerSlashCommand({
			name: "compact",
			description:
				"Compact the conversation thread. Add a message in chat for custom instructions.",
			params: {},
			consumesInput: true,
			inputPlaceholder: "Compact instructions...",
			execute: async (api, params) => {
				console.log("[FEApplet] /compact executed");
			},
		});

		api.registerSlashCommand({
			name: "create_guardrail",
			description: "Create a custom guardrail",
			params: {
				name: { type: "string", description: "Guardrail name", index: 0 },
				tools: {
					type: "message_type",
					description: "Trigger only on specific tool calls (empty = all messages)",
					index: 1,
				},
				server: {
					type: "server",
					description: "Server used for processing (empty = same as chat server)",
					index: 2,
				},
				prompt: {
					type: "dropdown",
					description: "Saved prompt to use (optional)",
					index: 3,
					props: {
						items: usePromptIdItems,
					},
				},
			},
			consumesInput: true,
			inputPlaceholder: "Guardrail prompt...",
			execute: async (_api, params, extraParams) => {
				const created = await createGuardrailApi({
					name: params.name!,
					serverId: params.server || "",
					promptId: params.prompt || undefined,
					prompt: extraParams?.prompt,
					triggerOnTools: parseToolValue(params.tools || ""),
				});
				toggleActiveGuardrail(created.id, true);
			},
		});

		api.registerSlashCommand({
			name: "guardrail",
			description: "Activate or deactivate a guardrail",
			params: {
				name: {
					type: "dropdown",
					description: "Guardrail name",
					index: 0,
					props: {
						items: useGuardrailItems,
					},
				},
				action: {
					type: "dropdown",
					description: "on/off",
					index: 1,
					props: {
						items: [
							{ label: "on", value: "on" },
							{ label: "off", value: "off" },
						],
					},
				},
			},
			execute: async (_api, params) => {
				toggleActiveGuardrail(params.name!, params.action === "on");
			},
		});

		api.registerSlashCommand({
			name: "todo",
			description: "Add a new todo item",
			params: {},
			consumesInput: true,
			inputPlaceholder: "Todo item text...",
			execute: async (_api, _params, extraParams) => {
				const text = extraParams?.prompt;
				if (!text) return;
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const ts = state.getCurrentThreadState(state);
				const todos = (ts?.todos || EMPTY_TODOS) as ITodoItem[];
				state.setThreadState(threadId, {
					todos: [...todos, { text, status: "pending" }],
					todoEtag: nanoid(6),
				});
			},
		});

		api.registerSlashCommand({
			name: "set_project_root",
			description: "Set the project root directory for this thread",
			params: {
				path: {
					type: "directory",
					description: "Path to project root directory",
					index: 0,
				},
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				if (!threadId) return;
				state.setThreadState(threadId, { projectRoot: params.path });
			},
		});

		api.registerSlashCommand({
			name: "create_mode",
			description: "Create a new mode with allowed tools, agents, and optional tail prompt",
			params: {
				name: { type: "string", description: "Mode name", index: 0 },
				color: { type: "color", description: "Mode color", index: 1 },
				tools: { type: "tools", description: "Allowed tools", index: 2 },
				agents: { type: "agents", description: "Allowed agents", index: 3 },
				guardrails: { type: "guardrails", description: "Active guardrails", index: 4 },
				prompt: {
					type: "dropdown",
					description: "Saved prompt to use (optional)",
					index: 5,
					props: {
						items: usePromptIdItems,
					},
				},
			},
			consumesInput: true,
			inputPlaceholder: "More instructions.",
			execute: async (_api, params, extraParams) => {
				await createModeApi({
					id: nanoid(6),
					name: params.name!,
					scope: "global",
					color: params.color || "#a78bfa",
					promptId: params.prompt || undefined,
					prompt: extraParams?.prompt || undefined,
					allowedTools: parseToolValue(params.tools || ""),
					allowedAgents: parseAgentValue(params.agents || ""),
					activeGuardrails: parseGuardrailValue(params.guardrails || ""),
				});
			},
		});

		api.registerSlashCommand({
			name: "mode",
			description: "Set or clear a mode for this thread",
			params: {
				action: {
					type: "dropdown",
					description: "set or clear",
					index: 0,
					props: {
						items: [
							{ label: "set", value: "set" },
							{ label: "clear", value: "clear" },
						],
					},
				},
				name: {
					type: "dropdown",
					description: "Mode name",
					index: 1,
					props: {
						items: useModeItems,
					},
				},
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				if (params.action === "clear") {
					state.setThreadState(threadId, { modeId: null });
				} else {
					state.setThreadState(threadId, { modeId: params.name });
				}
			},
		});

		// Chat Prompts
		function usePromptItems(): TDropdownItem[] {
			const prompts = useStore((s) => s.chatPrompts);
			return useMemo(() => prompts.map((p) => ({ label: p.name, value: p.name })), [prompts]);
		}

		function usePromptIdItems(): TDropdownItem[] {
			const prompts = useStore((s) => s.chatPrompts);
			return useMemo(() => prompts.map((p) => ({ label: p.name, value: p.id })), [prompts]);
		}

		api.registerSlashCommand({
			name: "prompt",
			description: "Inject a saved prompt into your message",
			params: {
				name: {
					type: "dropdown",
					description: "Prompt name",
					index: 0,
					props: {
						items: usePromptItems,
					},
				},
			},
			consumesInput: true,
			inputPlaceholder: "Additional context...",
			execute: async (_api, _params) => {
				// Injection happens in bridge.preCompletion hook
			},
		});

		api.registerSlashCommand({
			name: "create_prompt",
			description: "Create a saved prompt",
			params: {
				name: { type: "string", description: "Prompt name", index: 0 },
			},
			consumesInput: true,
			inputPlaceholder: "Prompt content...",
			execute: async (_api, params, extraParams) => {
				const content = extraParams?.prompt;
				if (!content) return;
				await api.useStore.getState().addChatPrompt({ name: params.name!, content });
			},
		});

		api.registerSlashCommand({
			name: "create_agent",
			description:
				"Create a new agent with server, prompt, tools, and auto-approve permissions",
			params: {
				name: { type: "string", description: "Agent name", index: 0 },
				server: { type: "server", description: "Server for the agent", index: 1 },
				prompt: {
					type: "dropdown",
					description: "Saved prompt (optional)",
					index: 2,
					props: {
						items: usePromptIdItems,
					},
				},
				tools: { type: "tools", description: "Tools the agent can use", index: 3 },
				// autoApprove: { type: "tools", description: "Tools to auto-approve", index: 4 },
				guardrails: { type: "guardrails", description: "Guardrails to attach", index: 4 },
				reasoningLevel: {
					type: "dropdown",
					description: "Reasoning level (none/low/medium/high)",
					index: 5,
					props: {
						items: [
							{ label: "none", value: EReasoningEffort.NONE },
							{ label: "low", value: EReasoningEffort.LOW },
							{ label: "medium", value: EReasoningEffort.MEDIUM },
							{ label: "high", value: EReasoningEffort.HIGH },
						],
					},
				},
			},
			consumesInput: true,
			inputPlaceholder: "Agent description...",
			execute: async (_api, params, extraParams) => {
				await createAgentApi({
					name: params.name!,
					serverId: params.server || "",
					promptId: params.prompt || undefined,
					tools: parseToolValue(params.tools || ""),
					// autoApproveTools: parseToolValue(params.autoApprove || ""),
					autoApproveTools: parseToolValue(params.tools || ""),
					description: extraParams?.prompt || "",
					reasoningEffort: params.reasoningLevel,
					guardrails: parseGuardrailValue(params.guardrails || ""),
				});
			},
		});

		api.registerUiSpaceComponent(EUISpaceLoc.TODOS_PANEL, TodoPanel, {
			label: "To-Do",
			icon: LuListTodo,
		});
		api.registerUiSpaceComponent(EUISpaceLoc.GUARDRAILS_PANEL, GuardrailsPanel, {
			label: "Guardrails",
			icon: FaShieldAlt,
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MODES_PANEL, ModesPanel, {
			label: "Modes",
			icon: TiFlowSwitch,
		});
		api.registerUiSpaceComponent(EUISpaceLoc.PROMPTS_PANEL, PromptsPanel, {
			label: "Prompts",
			icon: FileText,
		});
		api.registerUiSpaceComponent(EUISpaceLoc.AGENTS_PANEL, AgentsPanel, {
			label: "Agents",
			icon: Bot,
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, CompactIndicator, {
			label: "Compact Indicator",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, ModeChangeIndicator, {
			label: "ModeChangeIndicator",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, ModeToolViolationIndicator, {
			label: "ModeToolViolationIndicator",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.TOOL_CALL, ToolCallGuardrailIssues, {
			label: "ToolCallGuardrailIssues",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.PENDING_TOOL_CALL, ToolCallGuardrailIssues, {
			label: "ToolCallGuardrailIssues",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.PENDING_TOOL_CALL, NonToolGuardrailResults, {
			label: "NonToolGuardrailResults",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MINI_TOOL_CALL, MiniToolCallGuardrailIndicator, {
			label: "MiniToolCallGuardrailIndicator",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, GuardrailResults, {
			label: "GuardrailResults",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, SenderBadge, {
			label: "SenderBadge",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE_FOOTER, GuardrailShieldCheck, {
			label: "GuardrailShieldCheck",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.COMPOSER, ModeTabs, {
			label: "Mode",
			align: "start",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.COMPOSER, GuardrailBadge, {
			label: "Guardrails",
			align: "end",
		});
		api.registerUiSpaceComponent(EUISpaceLoc.COMPOSER, MonitorButton, {
			label: "Monitor",
			align: "end",
		});

		const blockingSlashCommands = [
			"guardrail",
			"create_guardrail",
			"todo",
			"create_mode",
			"mode",
			"set_project_root",
			"create_prompt",
			"create_agent",
		];

		// Prompt injection hook: /prompt <name> prepends saved prompt content to message
		api.eventNode.hook("..", "bridge.preCompletion", async (eventApi) => {
			const payload = eventApi.payload as {
				slashCommands: Array<{ name: string; params: Record<string, string> }>;
				body: { userMessage: { content: string } };
			};
			const promptCmd = payload.slashCommands.find((cmd) => cmd.name === "prompt");
			if (promptCmd) {
				const state = useStore.getState();
				const prompt = state.chatPrompts.find((p) => p.name === promptCmd.params.name);
				if (prompt) {
					const existing = payload.body.userMessage.content.trim();
					if (existing) {
						payload.body.userMessage.content = prompt.content + "\n\n" + existing;
					} else {
						payload.body.userMessage.content = prompt.content;
					}
					// Remove processed /prompt commands so duplicate hook copies don't re-inject
					payload.slashCommands = payload.slashCommands.filter(
						(cmd) => cmd.name !== "prompt",
					);
				}
			}
			return eventApi.result;
		});

		// Compact hook
		api.eventNode.hook("..", "bridge.preCompletion", async (eventApi) => {
			const payload = eventApi.payload as {
				slashCommands: Array<{ name: string }>;
				body: { userMessage: { content: string } };
			};
			const hasCompact = payload.slashCommands.some((cmd) => cmd.name === "compact");
			if (hasCompact && !payload.body.userMessage.content.trim()) {
				payload.body.userMessage.content = "Continue";
			}
			return eventApi.result;
		});

		api.eventNode.hook("..", "bridge.preCompletion", async (eventApi) => {
			const payload = eventApi.payload as {
				slashCommands: Array<{ name: string }>;
				body: { userMessage: { content: string } };
			};
			const hasBlocking = payload.slashCommands.some((cmd) =>
				blockingSlashCommands.includes(cmd.name),
			);
			if (!hasBlocking) {
				const state = useStore.getState();
				const annotations = state.annotations;
				if (annotations.length > 0) {
					const lines = annotations.map(
						(a, i) => `${i + 1}. "${a.selectedText}"\n   ${a.comment}`,
					);
					const fullText = (
						lines.join("\n\n") +
						(payload.body.userMessage.content.trim()
							? "\n\n" + payload.body.userMessage.content
							: "")
					).trim();
					payload.body.userMessage.content = fullText;
					state.clearAnnotations();
				}
			}
			return eventApi.result;
		});

		api.eventNode.hook("..", "bridge.preCompletion", async (eventApi) => {
			const payload = eventApi.payload as { slashCommands: Array<{ name: string }> };
			for (const cmd of payload.slashCommands) {
				if (blockingSlashCommands.includes(cmd.name)) {
					console.log("Skip cmd hook - aborting send!");
					return false;
				}
			}
			return eventApi.result;
		});
	});
};

export const FEApplet: TAppletDefinition<IAppletAPIFE> = {
	name: "FEApplet",
	description: "Frontend applet",
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.GLOBAL,
};
