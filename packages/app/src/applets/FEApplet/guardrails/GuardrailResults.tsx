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

import { GuardrailAccordion } from "./GuardrailAccordion";
import { EMPTY_ARRAY } from "../constants";

export const GuardrailResults = React.memo(
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
