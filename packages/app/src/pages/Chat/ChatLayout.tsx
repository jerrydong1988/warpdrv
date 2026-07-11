import { ChatConfigContext, BranchTokensContext } from './ChatPage';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WithErrorBoundary } from '@/components/WithErrorBoundary';
import { Thread } from './assistant-ui/thread';
import { ThreadList } from './assistant-ui/thread-list';
import { ChatSidebar } from './ChatSidebar';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Box, Flex } from '@chakra-ui/react';
import { useChatInner } from './use-chat-hooks';

interface IChatLayoutProps {
	threadsListCollapsed: boolean;
	onOpenSearch?: () => void;
}

export function ChatLayout({ threadsListCollapsed, onOpenSearch }: IChatLayoutProps) {
	const chat = useChatInner();

	return (
		<ChatConfigContext.Provider value={chat.chatConfigValue}>
			<TooltipProvider>
				<AssistantRuntimeProvider runtime={chat.runtime}>
				<Flex flex="1" h="100%" overflow="hidden" className="dark" style={{ background: "var(--wc-bg-page)" }}>
						{!threadsListCollapsed && (
						<Box
							w="300px"
							minW="300px"
							borderRightWidth="1px"
							borderColor="var(--wc-border-subtle)"
							h="full"
							py="3"
							display="flex"
							flexDirection="column"
						>
							<Flex flex="1" flexDirection="column" overflow="hidden" gap="3">
								<ThreadList onOpenSearch={onOpenSearch} />
							</Flex>
						</Box>
						)}
						<Box flex="1" overflow="hidden">
							<BranchTokensContext value={chat.branchTokenCount}>
								<WithErrorBoundary >
									<Thread key={chat.currentThreadId} isLoading={chat.isLoadingThread} currentServerId={chat.currentServerId} />
								</WithErrorBoundary>
							</BranchTokensContext>
						</Box>
						<ChatSidebar
							configParams={chat.currentInferenceParams as any}
							configSystemPrompt={chat.currentSystemPrompt}
							configSelectedPresetId={chat.selectedPresetId}
							onConfigParamsChange={chat.handleParamsChange}
							onConfigSystemPromptChange={chat.handleSystemPromptChange}
							onConfigPresetSelect={chat.handlePresetSelect}
						/>
					</Flex>
				</AssistantRuntimeProvider>
			</TooltipProvider>
		</ChatConfigContext.Provider>
	);
}
