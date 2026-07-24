import { store } from '../util/store';
import type { IMode, TModeId } from '@warpcore/shared';

const MODE_PREFIX = 'mode:';

function modeKey(id: TModeId): string { return `${MODE_PREFIX}${id}`; }

export async function listModes(): Promise<IMode[]> {
	return store.list<IMode>(MODE_PREFIX);
}

export async function listModesByScope(scope: string): Promise<IMode[]> {
	const all = await listModes();
	if (scope === 'global') return all;
	return all.filter(m => m.scope === scope || m.scope === 'global');
}

export async function getMode(id: TModeId): Promise<IMode | null> {
	return store.get<IMode>(modeKey(id));
}

export async function putMode(mode: IMode): Promise<void> {
	await store.put<IMode>(modeKey(mode.id), mode);
}

export async function deleteMode(id: TModeId): Promise<void> {
	await store.del(modeKey(id));
}
