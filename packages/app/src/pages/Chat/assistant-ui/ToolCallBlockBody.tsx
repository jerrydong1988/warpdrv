import React, { useMemo } from 'react';
import { ToolCallBlock } from '@/pages/Chat/assistant-ui/ToolCallBlock';
import { useStore } from '@/store';
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
			{body}
		</ToolCallUiSpace>
	);
});
