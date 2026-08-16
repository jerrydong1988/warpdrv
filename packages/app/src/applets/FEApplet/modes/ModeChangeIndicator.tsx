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

export const ModeChangeIndicator = React.memo(
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
