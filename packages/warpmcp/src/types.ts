import type { IAccessToken, ITodoItem } from '@warpcore/shared';
export interface IEmbeddingSearchResult {
	messageId: string;
	text: string;
	distance: number;
}
export interface IWarpmcpDeps {
	isRemote: (req: { ip: string; connection: { remoteAddress: string } }) => boolean;
	validateBearerToken: (authHeader: string | undefined) => Promise<IAccessToken | null>;
	getFsAllowedRoots: () => string[];
	exposeExternal?: boolean; // true when bound to 0.0.0.0 — auth must always be required
	embeddingSearch?: (query: string, topK: number, topic: string) => Promise<IEmbeddingSearchResult[]>;
	todoRead?: (threadId: string) => Promise<ITodoItem[]>;
	todoAdd?: (threadId: string, todo: ITodoItem, index?: number) => Promise<ITodoItem[]>;
	todoRemove?: (threadId: string, index: number) => Promise<ITodoItem[]>;
	todoUpdate?: (threadId: string, index: number, status: ITodoItem['status']) => Promise<ITodoItem[]>;
	todoClear?: (threadId: string) => Promise<ITodoItem[]>;
}
export interface IStartArgs extends IWarpmcpDeps {
	port: number;
	exposeExternal: boolean;
}
export interface IStartResult {
	port: number;
	bindHost: string;
}
