import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Bot, Loader } from "lucide-react";
import React from "react";
import { useStore } from "@/store";
import { useShallow } from "zustand/shallow";
import { NotificationMessageRow } from "./NotificationMessageRow";

interface SubthreadRowProps {
	childThreadId: string;
	parentThreadId: string;
	selected: Set<string>;
	onToggle: (id: string) => void;
}

export const SubthreadRow = React.memo(
	({ childThreadId, parentThreadId, selected, onToggle }: SubthreadRowProps) => {
		const threadTitle = useStore((s) => s.threads[childThreadId]?.title);
		const originalAgent = useStore(
			(s) =>
				s.threadStates[childThreadId]?.originalAgent as
					| { id: string; name: string }
					| undefined,
		);
		const currentStatus = useStore(
			(s) => s.threadStates[childThreadId]?.currentStatus as string | undefined,
		);
		const isRunning = useStore((s) => s.isRunningByThread[childThreadId] ?? false);
		const notificationIds = useStore(
			useShallow((s): string[] => {
				const threadNotifs = s.notificationsByThread[parentThreadId] ?? {};
				const ids: string[] = [];
				for (const id of Object.keys(threadNotifs)) {
					const n = threadNotifs[id];
					if (n.senderId === childThreadId) {
						ids.push(id);
					}
				}
				return ids;
			}),
		);

		if (!isRunning && notificationIds.length === 0) return null;

		return (
			<VStack gap="2" align="stretch" w="full">
				<HStack gap="2" align="flex-start">
					<Box flex="1" minWidth="0">
						<HStack gap="1.5" align="center">
							{originalAgent ? (
								<>
									<Bot size={12} color="var(--wc-text-muted)" />
									<Text
										fontSize="xs"
										fontWeight="600"
										color="var(--wc-text-primary)"
									>
										{originalAgent.name}
									</Text>
								</>
							) : (
								<Text fontSize="xs" fontWeight="600" color="var(--wc-text-faint)">
									Loading…
								</Text>
							)}
							<Text
								fontSize="xs"
								color="var(--wc-text-muted)"
								overflow="hidden"
								textOverflow="ellipsis"
								whiteSpace="nowrap"
							>
								{threadTitle}
							</Text>
						</HStack>

						{isRunning && (
							<HStack gap="1.5" align="center" mt="1">
								<Loader
									size={12}
									color="var(--wc-accent-yellow-strong)"
									className="animate-spin"
								/>
								<Text
									fontSize="xs"
									color="var(--wc-text-muted)"
									overflow="hidden"
									textOverflow="ellipsis"
									whiteSpace="nowrap"
								>
									{currentStatus ?? "Running…"}
								</Text>
							</HStack>
						)}
					</Box>
				</HStack>

				{notificationIds.length > 0 && (
					<Box pl="2">
						{notificationIds.map((id) => (
							<NotificationMessageRow
								key={id}
								notificationId={id}
								threadId={parentThreadId}
								selected={selected.has(id)}
								onToggle={() => onToggle(id)}
							/>
						))}
					</Box>
				)}
			</VStack>
		);
	},
);
