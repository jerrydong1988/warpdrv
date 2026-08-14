import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import { Monitor, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo } from "react";
import { useStore } from "@/store";
import type { TThreadId } from "@warpcore/bridge";
import { SubthreadRow } from "./SubthreadRow";

export const MonitorBox = memo(() => {
	const monitorBoxOpen = useStore((s) => s.monitorBoxOpen);
	const setMonitorBoxOpen = useStore((s) => s.setMonitorBoxOpen);
	const currentThreadId = useStore((s) => s.currentThreadId);
	const threads = useStore((s) => s.threads);

	const childThreadIds = useMemo(() => {
		if (!currentThreadId) return [] as TThreadId[];
		const ids: TThreadId[] = [];
		for (const id of Object.keys(threads)) {
			if (threads[id]?.parentId === currentThreadId) {
				ids.push(id as TThreadId);
			}
		}
		ids.sort((a, b) => threads[a].createdAt - threads[b].createdAt);
		return ids;
	}, [currentThreadId, threads]);

	useEffect(() => {
		if (!monitorBoxOpen || !childThreadIds.length) return;
		const state = useStore.getState();
		const unloaded: TThreadId[] = [];
		for (const id of childThreadIds) {
			if (!state.threadStates[id]) {
				unloaded.push(id);
			}
		}
		if (unloaded.length === 0) return;
		const promises = unloaded.map((id) =>
			fetch(`/api/chat/threads/${id}/state`)
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => {
					if (data?.data) {
						state.initThreadState(id, data.data);
					}
				})
				.catch(() => {}),
		);
		Promise.allSettled(promises);
	}, [monitorBoxOpen, childThreadIds]);

	const handleClose = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setMonitorBoxOpen(false);
		},
		[setMonitorBoxOpen],
	);

	if (!monitorBoxOpen) return null;

	return (
		<Box
			minW="48rem"
			shadow="0 10px 10px 10px rgba(0,0,0,0.15)"
			borderWidth="1px"
			borderColor="var(--wc-border-default)"
			borderRadius="lg"
			bg="var(--wc-bg-elevated)"
			overflow="hidden"
		>
			<HStack
				gap="2"
				px="3"
				py="2"
				borderBottomWidth={1}
				borderBottomColor="var(--wc-border-subtle)"
			>
				<Monitor size={13} color="var(--wc-text-tertiary)" />
				<Text
					fontSize="calc(var(--chat-font-size) - 3px)"
					fontWeight="600"
					color="var(--wc-text-primary)"
				>
					Monitoring
				</Text>
				<Box flex="1" />
				<Box
					as="button"
					display="flex"
					alignItems="center"
					justifyContent="center"
					width="20px"
					height="20px"
					borderRadius="sm"
					color="var(--wc-text-muted)"
					_hover={{ bg: "var(--wc-bg-hover)", color: "var(--wc-accent-red)" }}
					onClick={handleClose}
					title="Close"
				>
					<X size={12} />
				</Box>
			</HStack>

			<Box maxH="500px" overflowY="auto" overflowX="hidden" p="3">
				{childThreadIds.length === 0 ? (
					<Text fontSize="sm" color="var(--wc-text-faint)" textAlign="center" py="4">
						No child threads
					</Text>
				) : (
					<VStack gap="3" align="stretch" w="full">
						{childThreadIds.map((childId) => (
							<SubthreadRow
								key={childId}
								childThreadId={childId}
								parentThreadId={currentThreadId}
							/>
						))}
					</VStack>
				)}
			</Box>
		</Box>
	);
});
