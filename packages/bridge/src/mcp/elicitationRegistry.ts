import type { IElicitationResponse } from '../types';

// How long an elicitation may stay unanswered before the awaiting caller gets
// rejected. Users occasionally take minutes to respond to approval prompts;
// beyond this the prompt is stale and the orchestrator pass should unblock.
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

interface IPendingElicitation {
	resolve: (response: IElicitationResponse) => void;
	reject: (err: Error) => void;
	serverName: string;
	createdAt: number;
	timer: ReturnType<typeof setTimeout>;
}

export class ElicitationRegistry {
	private pending: Record<string, IPendingElicitation> = {};

	register(id: string, serverName: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<IElicitationResponse> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const entry = this.pending[id];
				if (!entry) return;
				delete this.pending[id];
				reject(new Error('Elicitation timed out'));
			}, timeoutMs);
			timer.unref?.();
			this.pending[id] = { resolve, reject, serverName, createdAt: Date.now(), timer };
		});
	}

	resolve(id: string, response: IElicitationResponse): boolean {
		const entry = this.pending[id];
		if (!entry) return false;
		clearTimeout(entry.timer);
		entry.resolve(response);
		delete this.pending[id];
		return true;
	}

	cancelAllForServer(serverName: string): string[] {
		const cancelled: string[] = [];
		for (const [id, entry] of Object.entries(this.pending)) {
			if (entry.serverName === serverName) {
				clearTimeout(entry.timer);
				entry.reject(new Error('Cancelled'));
				delete this.pending[id];
				cancelled.push(id);
			}
		}
		return cancelled;
	}

	has(id: string): boolean {
		return id in this.pending;
	}
}
