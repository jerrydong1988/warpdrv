import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IGuardrailDefinition } from '@warpcore/shared';

export const guardrailsSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	guardrails: {},
});
