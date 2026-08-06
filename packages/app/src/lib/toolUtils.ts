import type { IMode, IToolAttachment } from "@warpcore/shared";

export function computeModeUnionTools(
	modes: Record<string, IMode>,
	isModeActive: boolean,
	currentThreadId: string | null,
	threads: Record<string, { folderId?: string | null }>,
): IToolAttachment[] | null {
	if (!isModeActive) return null;
	const result: IToolAttachment[] = [];
	const seen = new Set<string>();
	const folderId = currentThreadId ? threads[currentThreadId]?.folderId : null;
	const scope = folderId || "global";
	for (const m of Object.values(modes).filter((m) => m.scope === "global" || m.scope === scope)) {
		for (const t of m.allowedTools) {
			if (typeof t === "string") continue;
			const key = `${t.serverName}:${t.toolName}`;
			if (!seen.has(key)) {
				seen.add(key);
				result.push(t);
			}
		}
	}
	return result;
}
