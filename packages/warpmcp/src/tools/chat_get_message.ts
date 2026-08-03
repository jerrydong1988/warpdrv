import type { IWarpmcpDeps } from '../types';

export const chatGetMessageDefinition = {
	name: 'chat_get_message',
	description: 'Retrieve the full content of a specific chat message by its ID. Use this after chat_search to get complete message content.',
	inputSchema: {
		type: 'object',
		properties: {
			messageId: { type: 'string', description: 'The message ID to retrieve' },
		},
		required: ['messageId'],
	},
	resultLimit: 40960,
};

export interface IChatGetMessageResult {
	messageId: string;
	role: string;
	content: string;
}

export async function chatGetMessageHandler(
	deps: IWarpmcpDeps,
	args: { messageId: string },
): Promise<IChatGetMessageResult> {
	if (!deps.chatGetMessage) {
		throw '[warpmcp] chatGetMessage function not found';
	}
	const message = await deps.chatGetMessage(args.messageId);
	if (!message) {
		throw `[warpmcp] Message not found: ${args.messageId}`;
	}

	// Extract text content from message parts
	const textParts = message.content
		.filter((part: any) => part.type === 'text' || part.type === 'reasoning')
		.map((part: any) => part.text)
		.join('\n');

	return {
		messageId: message.id,
		role: message.role,
		content: textParts,
	};
}
