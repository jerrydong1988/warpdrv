import type { SqlitePersistence } from '@warpcore/bridge/server';
import type { ISearchResult, IChatMessage } from '@warpcore/bridge';

export class ChatSearchToolService {
	private persistence: SqlitePersistence;

	constructor(persistence: SqlitePersistence) {
		this.persistence = persistence;
	}

	async searchMessages(query: string, options: { mode: 'everywhere' | 'thread'; threadId?: string; limit?: number; offset?: number }): Promise<ISearchResult[]> {
		return this.persistence.searchMessages(query, options);
	}

	async getMessage(messageId: string): Promise<IChatMessage | null> {
		return this.persistence.getMessage(messageId);
	}
}
