import type { IMode, TModeId } from "@warpcore/shared";
import type { AppState, ImmerGet, ImmerSet } from "../types";

export const modesSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	modes: {},
});
