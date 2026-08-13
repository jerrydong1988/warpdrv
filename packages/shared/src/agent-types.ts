import type { IToolAttachment } from "./types";

export type TAgentId = string;

export interface IAgent {
	id: TAgentId;
	name: string;
	serverId: string;
	promptId?: string;
	tools: IToolAttachment[];
	autoApproveTools: IToolAttachment[];
	description: string;
	createdAt: number;
	updatedAt: number;
}

export interface IAgentCreatePayload {
	name: string;
	serverId: string;
	promptId?: string;
	tools?: IToolAttachment[];
	autoApproveTools?: IToolAttachment[];
	description?: string;
}
