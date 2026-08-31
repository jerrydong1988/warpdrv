import { EMessagePartType, type TThreadId } from "@warpcore/bridge";
import { useStore } from "@/store";

const TRUNCATE = 80;

function truncateText(text: string): string | null {
	const t = text.replace(/\s+/g, " ").trim();
	if (!t) return null;
	return t.length > TRUNCATE ? t.slice(0, TRUNCATE) + "…" : t;
}

export function useThreadLiveStatus(threadId: TThreadId | null): string | null {
	const headId = useStore((s) => (threadId ? (s.headMessageIdByThread[threadId] ?? null) : null));
	const headMsg = useStore((s) =>
		threadId && headId ? (s.messagesByThread[threadId]?.[headId] ?? null) : null,
	);
	const lastPart =
		headMsg && headMsg.content.length > 0 ? headMsg.content[headMsg.content.length - 1]! : null;
	const toolName = useStore((s) =>
		lastPart?.type === EMessagePartType.TOOL_CALL
			? (s.toolCallsById[lastPart.toolCallId]?.toolName ?? null)
			: null,
	);

	if (lastPart?.type === EMessagePartType.TOOL_CALL) {
		return toolName ? `calling ${toolName}…` : "calling tool…";
	}
	if (lastPart?.type === EMessagePartType.TEXT) {
		return truncateText(lastPart.text);
	}
	return null;
}
