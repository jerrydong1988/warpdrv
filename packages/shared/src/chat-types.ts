// ============================================================
// shared/src/chat-types.ts
// Core chat identifiers, roles and message-part types.
// These live in `shared` so the package has zero dependencies on
// @warpcore/bridge (bridge re-exports them for backward compatibility).
// Universal — no Node or browser dependencies.
// ============================================================

// ============================================================
// Identifiers
// ============================================================
export type TThreadId = string;
export type TMessageId = string;
export type TMessagePartId = string;
export type TToolCallId = string;

// ============================================================
// Enums
// ============================================================
export enum EChatRole {
	SYSTEM = 'system',
	USER = 'user',
	ASSISTANT = 'assistant',
	TOOL = 'tool',
}

export enum EMessagePartType {
	TEXT = 'text',
	REASONING = 'reasoning',
	TOOL_CALL = 'tool_call',
	ATTACHMENT = 'attachment',
}

// ============================================================
// Message parts
// ============================================================
export type IMessagePart =
	| IMessagePartText
	| IMessagePartReasoning
	| IMessagePartToolCall
	| IMessagePartAttachment;

export interface IMessagePartAttachment extends IMessagePartBase {
	type: EMessagePartType.ATTACHMENT;
	data: string;
	mimeType: string;
	fileName: string;
	fileSize: number;
	extractedText?: string;
}

export interface IMessagePartBase {
	id: TMessagePartId;
	type: EMessagePartType;
	orderIndex: number;
}

export interface IMessagePartText extends IMessagePartBase {
	type: EMessagePartType.TEXT;
	text: string;
}

export interface IMessagePartReasoning extends IMessagePartBase {
	type: EMessagePartType.REASONING;
	text: string;
}

export interface IMessagePartToolCall extends IMessagePartBase {
	type: EMessagePartType.TOOL_CALL;
	toolCallId: TToolCallId;
}
