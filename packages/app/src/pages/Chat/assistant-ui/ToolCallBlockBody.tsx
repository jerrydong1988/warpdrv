import React, { useMemo } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { ToolCallBlock } from '@/pages/Chat/assistant-ui/ToolCallBlock';
import { useStore } from '@/store';
import { EToolCallStatus } from '@warpcore/bridge';
import { autoResolveRenderer } from './tool-renderers/resolver';
import { WithErrorBoundary } from '../../../components/WithErrorBoundary';
import { ToolCallUiSpace } from '../ui-space/ToolCallUiSpace';

interface IToolCallBlockBodyProps {
	toolCallId: string;
	toolName: string;
	serverName?: string;
	args: Record<string, unknown>;
	result?: unknown;
	messageId: string;
}

export const ToolCallBlockBody = React.memo(({
	toolCallId, toolName, serverName, args, result, messageId
}: IToolCallBlockBodyProps) => {
	const serverState = useStore(s => serverName ? s.mcpServers[serverName] : undefined);
	const toolCallRenderers = useStore(s => s.toolCallRenderers);
	const toolCall = useStore(s => s.toolCallsById[toolCallId]);
	const displayStatus: EToolCallStatus = toolCall?.status ?? EToolCallStatus.COMPLETED;

	const body = useMemo(() => {
		const fallback = <ToolCallBlock args={JSON.stringify(args)} result={result ? JSON.stringify(result) : undefined} />;
		// Priority 1: explicit mcp.json renderer config
		const rendererCfg = serverState?.warpdrv?.renderers?.[toolName];
		const ExplicitComponent = rendererCfg ? toolCallRenderers[rendererCfg.component]?.component : undefined;
		if (rendererCfg && ExplicitComponent) {
			const mappedArgs: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(args)) {
				const targetKey = rendererCfg.propsMap?.[k] ?? k;
				mappedArgs[targetKey] = v;
			}
			return (
				<WithErrorBoundary fallback={fallback}>
					<ExplicitComponent {...mappedArgs} {...(rendererCfg.props ?? {})} result={result} />
				</WithErrorBoundary>
			);
		}
		// Priority 2: auto-match via keywords + canRender
		const resolved = autoResolveRenderer(toolName, args, toolCallRenderers);
		if (resolved) {
			const { component: AutoComponent, props } = resolved;
			return (
				<WithErrorBoundary fallback={fallback}>
					<AutoComponent {...props} result={result} />
				</WithErrorBoundary>
			);
		}
		// Priority 3: default fallback
		return fallback;
	}, [serverState, toolName, toolCallRenderers, args, result]);

	return (
		<ToolCallUiSpace toolCallId={toolCallId} messageId={messageId}>
			{displayStatus === EToolCallStatus.ERROR && toolCall?.error && (
					<Box px="3" py="2">
				<Text fontSize="calc(var(--chat-font-size) - 3px)" color="var(--wc-accent-red)" whiteSpace="pre-wrap" wordBreak="break-word">{toolCall.error}</Text>
			</Box>
			)}
			<Box overflowX="auto" w="full">
				{body}
			</Box>
		</ToolCallUiSpace>
	);
});
