import React, { createContext } from 'react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { useStore } from '@/store';
import { Flex } from '@chakra-ui/react';
import { ChatLayout } from './ChatLayout';
import { ChatPageHeader } from './ChatPageHeader';
import { ChatSearchDialog } from './ChatSearchDialog';
import type { IChatPreset } from '@warpcore/shared';
import { EReasoningEffort } from '@warpcore/shared';
import './assistant-ui/styles/assistant-ui.css';

export interface IChatConfig {
	reasoningEffort: EReasoningEffort;
	onReasoningEffortChange: (v: EReasoningEffort) => void;
	enableThinking: boolean;
	onEnableThinkingChange: (v: boolean) => void;
	contextSize: number;
}

export const ChatConfigContext = createContext<IChatConfig>({
	reasoningEffort: EReasoningEffort.NONE,
	onReasoningEffortChange: () => {},
	enableThinking: false,
	onEnableThinkingChange: () => {},
	contextSize: 0,
});

export const BranchTokensContext = React.createContext(0);

export const ChatPage = React.memo(() => {
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const [threadsListCollapsed, setThreadsListCollapsed] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const chatSidebarOpen = useStore(s => s.chatSidebarOpen);
	const setChatSidebarOpen = useStore(s => s.setChatSidebarOpen);
	const currentThreadId = useStore(s => s.currentThreadId);

	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<ChatPageHeader
				onNewChat={() => setCurrentThreadId(nanoid(6))}
				onToggleThreadsList={() => setThreadsListCollapsed(!threadsListCollapsed)}
				threadsListCollapsed={threadsListCollapsed}
				onToggleSidebar={() => setChatSidebarOpen(!chatSidebarOpen)}
				sidebarOpen={chatSidebarOpen}
			/>
			<Flex flex="1" overflow="hidden" pt="60px">
				<Flex flex="1" overflow="hidden">
					<ChatLayout threadsListCollapsed={threadsListCollapsed} onOpenSearch={() => setSearchOpen(true)} />
				</Flex>
			</Flex>
			<ChatSearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} currentThreadId={currentThreadId} />
		</Flex>
	);
});
