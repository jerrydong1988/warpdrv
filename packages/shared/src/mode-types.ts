export type TModeId = string;

export interface IMode {
	id: TModeId;
	name: string;
	scope: 'global' | string;
	prompt?: string;
	allowedTools: string[];
}

export interface IModeCreatePayload {
	name: string;
	scope: 'global' | string;
	prompt?: string;
	allowedTools: string[];
}
