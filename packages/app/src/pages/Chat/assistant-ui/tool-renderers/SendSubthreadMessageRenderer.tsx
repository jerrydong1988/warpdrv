import { Box, HStack, Text } from "@chakra-ui/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import React, { useMemo } from "react";
import type { IToolCallRenderer, TCanRenderResult } from "@/store/types";

const TRUNCATE_AT = 80;

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) + "…" : s;
}

export const SendSubthreadMessageRenderer = React.memo(
	({ message, subThreadId }: { message?: string; subThreadId?: string }) => {
		const isSub = subThreadId !== undefined;
		return (
			<Box px="3" py="2">
				<HStack gap="2" align="center" mb="1.5">
					{isSub ? (
						<ArrowDown size={12} color="var(--wc-text-secondary)" />
					) : (
						<ArrowUp size={12} color="var(--wc-text-secondary)" />
					)}
					<Text fontWeight="600" color="var(--wc-text-secondary)">
						{isSub ? "To subthread" : "To superthread"}
					</Text>
				</HStack>
				<Box
					bg="var(--wc-overlay-dim)"
					borderRadius="sm"
					p="2"
					whiteSpace="pre-wrap"
					wordBreak="break-word"
				>
					<Text color="var(--wc-text-primary)">{message}</Text>
				</Box>
			</Box>
		);
	},
);

export const SendSubthreadMessageRendererMeta: IToolCallRenderer = {
	component: SendSubthreadMessageRenderer,
	keywords: ["subthread_send_message", "superthread_send_message"],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		if (typeof args.message !== "string") return false;
		return {
			message: args.message,
			subThreadId: args.subThreadId,
		};
	},
	renderMini: React.memo(({ args }) => {
		const { label, dir } = useMemo(() => {
			const message = String(args?.message ?? "");
			const isSub = args?.subThreadId !== undefined;
			return {
				label: truncate(message, TRUNCATE_AT),
				dir: isSub ? "↓ " : "↑ ",
			};
		}, [args]);
		return (
			<Text whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
				Send{" "}
				<Text as="span" color="var(--wc-text-muted)">
					{dir}
					{label}
				</Text>
			</Text>
		);
	}),
};
