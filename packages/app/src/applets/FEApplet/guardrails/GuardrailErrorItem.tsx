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

export const TGuardrailIssueEntry = { guardrailName: "", issue: {} as IGuardrailIssue };
export type TGuardrailIssueEntry = typeof TGuardrailIssueEntry;

export const GuardrailErrorItem = React.memo(
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
