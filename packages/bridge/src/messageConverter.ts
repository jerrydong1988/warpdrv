// ============================================================
// warpbridge/src/messageConverter.ts
// Message conversion utilities - universal (no Node/browser deps)
// ============================================================

import type { IChatMessage, IToolCall, IMessagePartToolCall } from './types';
import { EChatRole, EMessagePartType } from './types';

export type TOpenAIMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
	tool_call_id?: string;
};

export function mergeConsecutiveMessages(messages: IChatMessage[]): IChatMessage[] {
	const result: IChatMessage[] = []
	
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i]!
		const last = result[result.length - 1]
		
		if (last && last.role === msg.role && msg.role !== EChatRole.TOOL) {
			last.content = [...last.content, ...msg.content]
		} else {
			result.push({ ...msg, content: [...msg.content] })
		}
	}
	
	return result
}

function buildUserMessage(msg: IChatMessage): TOpenAIMessage {
	const textParts = msg.content.filter(p => p.type === EMessagePartType.TEXT);
	const attachmentParts = msg.content.filter(p => p.type === EMessagePartType.ATTACHMENT);

	if (attachmentParts.length === 0) {
		const content = textParts.map(p => p.text || '').join('');
		return { role: 'user', content };
	}

	const contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
	for (const part of textParts) {
		if (part.text) contentArray.push({ type: 'text', text: part.text });
	}
	for (const att of attachmentParts) {
		if (att.mimeType.startsWith('image/')) {
			const dataUrl = att.data.startsWith('data:') ? att.data : `data:${att.mimeType};base64,${att.data}`;
			contentArray.push({ type: 'image_url', image_url: { url: dataUrl } });
		} else if (att.extractedText) {
			contentArray.push({ type: 'text', text: `--- ${att.fileName} ---\n${att.extractedText}` });
		}
	}
	return { role: 'user', content: contentArray };
}

function buildAssistantMessage(msg: IChatMessage, toolCallsById: Record<string, IToolCall>): TOpenAIMessage | null {
	const textParts = msg.content.filter(p => p.type === EMessagePartType.TEXT);
	const content = textParts.map(p => p.text || '').join('');

	const toolCallParts = msg.content.filter(p => p.type === EMessagePartType.TOOL_CALL);
	const toolCalls: TOpenAIMessage['tool_calls'] = [];
	for (const part of toolCallParts) {
		const toolCallId = (part as IMessagePartToolCall).toolCallId;
		const tc = toolCallId ? toolCallsById[toolCallId] : undefined;
		if (tc) {
			toolCalls.push({
				id: tc.id,
				type: 'function',
				function: { name: tc.toolName, arguments: tc.arguments },
			});
		}
	}

	if (!content && toolCalls.length === 0) return null;

	const assistantMsg: TOpenAIMessage = { role: 'assistant' };
	if (content) assistantMsg.content = content;
	if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
	return assistantMsg;
}

function buildToolMessage(msg: IChatMessage, toolCallsById: Record<string, IToolCall>): TOpenAIMessage[] {
	const toolCallParts = msg.content.filter(p => p.type === EMessagePartType.TOOL_CALL);
	const result: TOpenAIMessage[] = [];

	for (const part of toolCallParts) {
		const toolCallId = (part as IMessagePartToolCall).toolCallId;
		const tc = toolCallId ? toolCallsById[toolCallId] : undefined;
		if (tc && tc.result !== null) {
			result.push({ role: 'tool', content: tc.result, tool_call_id: tc.id });
		}
	}
	return result;
}

export function convertMessagesToOpenAIFormat(
	messages: IChatMessage[],
	toolCallsById: Record<string, IToolCall>,
): TOpenAIMessage[] {
	const result: TOpenAIMessage[] = [];
	messages = mergeConsecutiveMessages(messages);

	for (const msg of messages) {
		switch (msg.role) {
			case EChatRole.USER:
				result.push(buildUserMessage(msg));
				break;
			case EChatRole.ASSISTANT:
				const assistantMsg = buildAssistantMessage(msg, toolCallsById);
				if (assistantMsg) result.push(assistantMsg);
				break;
			case EChatRole.TOOL:
				result.push(...buildToolMessage(msg, toolCallsById));
				break;
		}
	}

	return result;
}
