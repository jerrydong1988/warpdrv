import { api } from './client';
import type { IMode, IModeCreatePayload, TModeId } from '@warpcore/shared';

export async function createMode(payload: IModeCreatePayload): Promise<IMode> {
	const res = await api.post<IMode>('/modes', payload);
	if (!res.ok) throw new Error(res.error);
	return res.data!;
}

export async function deleteMode(id: TModeId): Promise<void> {
	const res = await api.delete<null>(`/modes/${id}`);
	if (!res.ok) throw new Error(res.error);
}
