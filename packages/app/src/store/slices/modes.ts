import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IMode, TModeId } from '@warpcore/shared';

export const modesSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	modes: {},
});
