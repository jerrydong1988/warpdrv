import { Box, HStack, Text } from "@chakra-ui/react";
import { Monitor, X } from "lucide-react";
import { memo, useCallback } from "react";
import { useStore } from "@/store";

export const MonitorBox = memo(() => {
	const monitorBoxOpen = useStore((s) => s.monitorBoxOpen);
	const setMonitorBoxOpen = useStore((s) => s.setMonitorBoxOpen);

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
			w="48rem"
			shadow="0 10px 10px 10px rgba(0,0,0,0.15)"
			borderWidth="1px"
			borderColor="var(--wc-border-default)"
			borderRadius="lg"
			bg="var(--wc-bg-elevated)"
			overflow="hidden"
		>
			{/* Header */}
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

			{/* Body — empty placeholder */}
			<Box py="6" display="flex" alignItems="center" justifyContent="center">
				<Text fontSize="sm" color="var(--wc-text-faint)">
					Monitoring data will appear here
				</Text>
			</Box>
		</Box>
	);
});
