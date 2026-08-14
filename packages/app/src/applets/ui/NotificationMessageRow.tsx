import { Box, Collapsible, HStack, Text } from "@chakra-ui/react";
import type { INotification } from "@warpcore/shared";
import { Loader, X } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useStore } from "@/store";

interface NotificationMessageRowProps {
	notificationId: string;
	threadId: string;
}

export const NotificationMessageRow = React.memo(
	({ notificationId, threadId }: NotificationMessageRowProps) => {
		const notification = useStore((s) => s.notificationsByThread[threadId]?.[notificationId]);
		const [expanded, setExpanded] = useState(false);
		const [actioning, setActioning] = useState(false);

		const handleHide = useCallback(
			async (e: React.MouseEvent) => {
				e.stopPropagation();
				if (actioning) return;
				setActioning(true);
				try {
					await fetch(`/api/chat/notifications/${threadId}/${notificationId}/hide`, {
						method: "POST",
					});
				} catch {
					// SSE will handle the update
				} finally {
					setActioning(false);
				}
			},
			[threadId, notificationId, actioning],
		);

		const handleSend = useCallback(
			async (e: React.MouseEvent) => {
				e.stopPropagation();
				if (actioning) return;
				setActioning(true);
				try {
					await fetch(`/api/chat/notifications/${threadId}/${notificationId}/consume`, {
						method: "POST",
					});
				} catch {
					// SSE will handle the update
				} finally {
					setActioning(false);
				}
			},
			[threadId, notificationId, actioning],
		);

		if (!notification) return null;

		const message = (notification.payload.message as string) ?? "";

		return (
			<Collapsible.Root open={expanded} onOpenChange={(o) => setExpanded(o.open)}>
				<Box
					borderWidth="1px"
					borderColor="var(--wc-border-subtle)"
					borderRadius="md"
					bg="var(--wc-bg-surface)"
					overflow="hidden"
					mb="1"
				>
					<Box px="2" py="1.5" cursor="pointer" onClick={() => setExpanded(!expanded)}>
						<HStack gap="1" align="flex-start">
							<Box flex="1" minWidth="0">
								<Text
									fontSize="xs"
									color="var(--wc-text-primary)"
									lineClamp={expanded ? undefined : 2}
									whiteSpace="pre-wrap"
								>
									{message}
								</Text>
							</Box>
							<Box
								as="button"
								display="flex"
								alignItems="center"
								justifyContent="center"
								width="16px"
								height="16px"
								borderRadius="sm"
								color="var(--wc-text-muted)"
								_hover={{ bg: "var(--wc-bg-hover)", color: "var(--wc-accent-red)" }}
								onClick={handleHide}
								title="Hide"
							>
								<X size={10} />
							</Box>
							<Box
								as="button"
								px="1.5"
								py="0.5"
								borderRadius="sm"
								bg={
									actioning
										? "var(--wc-bg-subtle)"
										: "var(--wc-accent-green-bg-15)"
								}
								color={
									actioning ? "var(--wc-text-muted)" : "var(--wc-accent-green)"
								}
								fontSize="xs"
								fontWeight="500"
								cursor={actioning ? "not-allowed" : "pointer"}
								_hover={{
									bg: actioning ? undefined : "var(--wc-accent-green-hover)",
								}}
								onClick={handleSend}
								title="Send / Consume"
							>
								{actioning ? <Loader size={10} className="animate-spin" /> : "Send"}
							</Box>
						</HStack>
					</Box>
				</Box>
			</Collapsible.Root>
		);
	},
);
