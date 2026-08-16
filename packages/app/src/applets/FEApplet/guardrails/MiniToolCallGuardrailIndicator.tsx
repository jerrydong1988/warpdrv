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

import { EMPTY_ARRAY } from "../constants";

export const MiniToolCallGuardrailIndicator = React.memo(
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
