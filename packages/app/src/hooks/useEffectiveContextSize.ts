import { effectiveContextPerChat, type TServerId } from "@warpcore/shared";
import { useMemo } from "react";
import { useStore } from "../store";

// Returns the effective context size available to a single chat on the given
// server, taking into account parallelSlots and kvUnified.
// Selectors return primitives only (no object creation, no Object.values/keys).
export function useEffectiveContextSize(currentServerId: TServerId | null): number {
	const contextSize = useStore((s) =>
		currentServerId ? (s.servers[currentServerId]?.params?.contextSize ?? 0) : 0,
	);
	const parallelSlots = useStore((s) =>
		currentServerId ? (s.servers[currentServerId]?.params?.parallelSlots ?? 0) : 0,
	);
	const kvUnified = useStore((s) =>
		currentServerId ? (s.servers[currentServerId]?.params?.kvUnified ?? false) : false,
	);

	return useMemo(
		() => effectiveContextPerChat({ contextSize, parallelSlots, kvUnified }),
		[contextSize, parallelSlots, kvUnified],
	);
}
