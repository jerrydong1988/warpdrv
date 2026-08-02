import React from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { Trash2 } from 'lucide-react';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

export const CodeGraphClearRenderer = React.memo((props: {
	result?: unknown;
}) => {
	if (props.result === undefined) {
		return null;
	}
	return (
		<Box px="3" py="2">
			{/* Header removed — info shown in mini renderer */}
			{/* <HStack gap="2" align="center">
				<Trash2 size={13} color="var(--wc-accent-red-alt)" />
								<Text fontSize="calc(var(--chat-font-size) - 2px)" color="var(--wc-text-muted)">Code graph index cleared</Text>
			</HStack> */}
		</Box>
	);
});

export const CodeGraphClearRendererMeta: IToolCallRenderer = {
	component: CodeGraphClearRenderer,
	keywords: ['code_graph_clear'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		return {};
	},
  renderMini: React.memo(() => (
    <HStack gap="1" align="center">
      <Trash2 size="var(--chat-font-size)" color="var(--wc-text-muted)" />
      <Text whiteSpace="nowrap">Code Graph cleared</Text>
    </HStack>
  )),
};
