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

import { GuardrailErrorItem, TGuardrailIssueEntry } from "./GuardrailErrorItem";
import { GuardrailIssueItem } from "./GuardrailIssueItem";

export const GuardrailAccordion = React.memo(
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
