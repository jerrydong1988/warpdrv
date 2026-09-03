import { describe, expect, it } from 'vitest';
import { convertMessagesToOpenAIFormat, mergeConsecutiveMessages } from '../src/messageConverter';
import { EChatRole, EMessagePartType, EToolCallStatus } from '../src/types';
import type { IChatMessage, IMessagePart, IToolCall } from '../src/types';

let seq = 0;
function textPart(text: string): IMessagePart {
	return { id: `p-${++seq}`, type: EMessagePartType.TEXT, orderIndex: seq, text };
}

function toolCallPart(toolCallId: string): IMessagePart {
	return { id: `p-${++seq}`, type: EMessagePartType.TOOL_CALL, orderIndex: seq, toolCallId };
}

function attachmentPart(overrides: Partial<Extract<IMessagePart, { type: EMessagePartType.ATTACHMENT }>>): IMessagePart {
	return {
		id: `p-${++seq}`,
		type: EMessagePartType.ATTACHMENT,
		orderIndex: seq,
		data: 'raw-bytes',
		mimeType: 'text/plain',
		fileName: 'notes.txt',
		fileSize: 10,
		...overrides,
	};
}

function msg(role: EChatRole, content: IMessagePart[]): IChatMessage {
	return {
		id: `m-${++seq}`,
		parentId: null,
		threadId: 'thread-1',
		role,
		content,
		stats: null,
		createdAt: seq,
	};
}

function toolCall(overrides: Partial<IToolCall>): IToolCall {
	return {
		id: `tc-${++seq}`,
		messageId: 'm-x',
		threadId: 'thread-1',
		serverName: 'srv',
		toolName: 'lookup',
		arguments: '{}',
		result: null,
		status: EToolCallStatus.COMPLETED,
		error: null,
		createdAt: 0,
		resolvedAt: null,
		...overrides,
	};
}

describe('convertMessagesToOpenAIFormat', () => {
	it('maps user messages to role user with joined text', () => {
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.USER, [textPart('Hello'), textPart(' world')])],
			{},
		);
		expect(result).toEqual([{ role: 'user', content: 'Hello world' }]);
	});

	it('maps assistant messages with text', () => {
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.ASSISTANT, [textPart('I am here')])],
			{},
		);
		expect(result).toEqual([{ role: 'assistant', content: 'I am here' }]);
	});

	it('skips system messages (they are injected separately)', () => {
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.SYSTEM, [textPart('be nice')])],
			{},
		);
		expect(result).toEqual([]);
	});

	it('returns [] for empty message list', () => {
		expect(convertMessagesToOpenAIFormat([], {})).toEqual([]);
	});

	it('maps assistant tool-call parts to tool_calls via toolCallsById', () => {
		const tc = toolCall({ id: 'tc-1', toolName: 'lookup', arguments: '{"q":"x"}' });
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.ASSISTANT, [textPart('checking'), toolCallPart('tc-1')])],
			{ 'tc-1': tc },
		);
		expect(result).toEqual([
			{
				role: 'assistant',
				content: 'checking',
				tool_calls: [
					{ id: 'tc-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } },
				],
			},
		]);
	});

	it('drops assistant tool-call parts whose id is not in toolCallsById', () => {
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.ASSISTANT, [textPart('hi'), toolCallPart('ghost')])],
			{},
		);
		expect(result).toEqual([{ role: 'assistant', content: 'hi' }]);
	});

	it('maps tool messages to role tool with tool_call_id and resolved result', () => {
		const tc = toolCall({ id: 'tc-1', result: 'done' });
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.TOOL, [toolCallPart('tc-1')])],
			{ 'tc-1': tc },
		);
		expect(result).toEqual([{ role: 'tool', content: 'done', tool_call_id: 'tc-1' }]);
	});

	it('reports unresolved tool calls as an error payload', () => {
		const pending = toolCall({ id: 'tc-1', status: EToolCallStatus.PENDING });
		const errored = toolCall({ id: 'tc-2', status: EToolCallStatus.ERROR, error: 'boom' });
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.TOOL, [toolCallPart('tc-1'), toolCallPart('tc-2')])],
			{ 'tc-1': pending, 'tc-2': errored },
		);
		expect(result).toEqual([
			{ role: 'tool', content: JSON.stringify({ error: 'Tool call lookup was never executed' }), tool_call_id: 'tc-1' },
			{ role: 'tool', content: JSON.stringify({ error: 'boom' }), tool_call_id: 'tc-2' },
		]);
	});

	it('keeps image attachments as image_url parts and prefixes data URLs', () => {
		const att = attachmentPart({ mimeType: 'image/png', data: 'iVBORw0KGgo=' });
		const result = convertMessagesToOpenAIFormat(
			[msg(EChatRole.USER, [textPart('look'), att])],
			{},
		);
		expect(result).toEqual([
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'look' },
					{ type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
				],
			},
		]);
	});

	it('keeps a pre-built data URL unchanged', () => {
		const att = attachmentPart({ mimeType: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' });
		const result = convertMessagesToOpenAIFormat([msg(EChatRole.USER, [att])], {});
		const content = result[0]!.content as Array<{ image_url?: { url: string } }>;
		expect(content[0]!.image_url!.url).toBe('data:image/png;base64,iVBORw0KGgo=');
	});

	it('turns non-image attachments with extracted text into text blocks', () => {
		const att = attachmentPart({ mimeType: 'text/plain', extractedText: 'file body' });
		const result = convertMessagesToOpenAIFormat([msg(EChatRole.USER, [att])], {});
		expect(result).toEqual([
			{ role: 'user', content: [{ type: 'text', text: '--- notes.txt ---\nfile body' }] },
		]);
	});
});

describe('mergeConsecutiveMessages', () => {
	it('merges consecutive same-role text messages into one', () => {
		const merged = mergeConsecutiveMessages([
			msg(EChatRole.USER, [textPart('a')]),
			msg(EChatRole.USER, [textPart('b')]),
			msg(EChatRole.ASSISTANT, [textPart('c')]),
		]);
		expect(merged).toHaveLength(2);
		expect(merged[0]!.content.map(p => (p as { text?: string }).text)).toEqual(['a', 'b']);
		expect((merged[1]!.content[0] as { text?: string }).text).toBe('c');
	});

	it('does not merge across different roles', () => {
		const merged = mergeConsecutiveMessages([
			msg(EChatRole.USER, [textPart('a')]),
			msg(EChatRole.ASSISTANT, [textPart('b')]),
		]);
		expect(merged).toHaveLength(2);
	});

	it('does not merge messages containing tool-call parts', () => {
		const merged = mergeConsecutiveMessages([
			msg(EChatRole.ASSISTANT, [toolCallPart('tc-1')]),
			msg(EChatRole.ASSISTANT, [textPart('after')]),
		]);
		expect(merged).toHaveLength(2);
	});

	it('never merges tool-role messages', () => {
		const merged = mergeConsecutiveMessages([
			msg(EChatRole.TOOL, [textPart('a')]),
			msg(EChatRole.TOOL, [textPart('b')]),
		]);
		expect(merged).toHaveLength(2);
	});

	it('handles empty input', () => {
		expect(mergeConsecutiveMessages([])).toEqual([]);
	});
});
