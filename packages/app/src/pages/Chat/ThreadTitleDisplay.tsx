import { HStack, Text, VStack } from "@chakra-ui/react";
import React, { useMemo } from "react";
import { useStore } from "@/store";

export const ThreadTitleDisplay = React.memo(() => {
	const threadTitle = useStore((s) =>
		s.currentThreadId ? s.threads[s.currentThreadId]?.title || "New Chat" : "New Chat",
	);
	const currentThreadId = useStore((s) => s.currentThreadId);
	const currentStatus = useStore((s) =>
		s.currentThreadId ? s.threadStates[s.currentThreadId]?.currentStatus : undefined,
	);
	const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
	const workspaceName = useStore((s) => {
		if (!s.activeWorkspaceId || !s.folders) return null;
		const folder = s.folders.find((f) => f.id === s.activeWorkspaceId);
		return folder?.name ?? null;
	});

	return (
		<VStack align="start" gap={0}>
			<HStack gap="2">
				{workspaceName && (
					<Text fontSize="14px" fontWeight="500" color="var(--wc-text-primary)">
						{workspaceName}
					</Text>
				)}
				{workspaceName && (
					<Text fontSize="14px" color="var(--wc-text-muted)">
						/
					</Text>
				)}
				<Text
					fontSize="14px"
					fontWeight="600"
					letterSpacing="-0.02em"
					color="var(--wc-text-header-title)"
				>
					{threadTitle}
				</Text>
			</HStack>
			{currentStatus && (
				<Text fontSize="12px" color="var(--wc-text-muted)">
					{currentStatus}
				</Text>
			)}
		</VStack>
	);
});
