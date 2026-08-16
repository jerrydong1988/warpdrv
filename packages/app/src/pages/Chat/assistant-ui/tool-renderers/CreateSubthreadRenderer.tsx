import { Box, HStack, Text } from "@chakra-ui/react";
import { Bot } from "lucide-react";
import React, { useMemo } from "react";
import type { IToolCallRenderer, TCanRenderResult } from "@/store/types";

export const CreateSubthreadRenderer = React.memo(
	({ agentName, title, message }: { agentName?: string; title?: string; message?: string }) => {
		return (
			<Box px="3" py="2">
				<HStack gap="2" align="center" mb="1.5">
					<Bot size={12} color="var(--wc-text-secondary)" />
					<Text fontWeight="600" color="var(--wc-text-secondary)">
						{agentName ?? "agent"}: {title ?? "(untitled)"}
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

export const CreateSubthreadRendererMeta: IToolCallRenderer = {
	component: CreateSubthreadRenderer,
	keywords: ["create_subthread"],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		if (typeof args.message !== "string") return false;
		return {
			agentName: args.agentName,
			title: args.title,
			message: args.message,
		};
	},
	renderMini: React.memo(({ args }) => {
		const { agentName, title } = useMemo(
			() => ({
				agentName: String(args?.agentName ?? "unknown"),
				title: String(args?.title ?? "untitled"),
			}),
			[args],
		);
		return (
			<Text whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
				{agentName}
				<Text as="span" color="var(--wc-text-muted)">
					: {title}
				</Text>
			</Text>
		);
	}),
};
