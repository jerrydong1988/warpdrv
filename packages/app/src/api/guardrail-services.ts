import { api } from './client';
import type { IGuardrailDefinition, IGuardrailCreatePayload } from '@warpcore/shared';

export async function listGuardrails(): Promise<Record<string, IGuardrailDefinition>> {
	const res = await api.get<Record<string, IGuardrailDefinition>>('/guardrails');
	if (!res.ok) throw new Error(res.error ?? 'Unknown error');
	return res.data!;
}

export async function createGuardrail(payload: IGuardrailCreatePayload): Promise<IGuardrailDefinition> {
	const res = await api.post<IGuardrailDefinition>('/guardrails', payload);
	if (!res.ok) throw new Error(res.error ?? 'Unknown error');
	return res.data!;
}

export async function updateGuardrail(name: string, payload: Partial<IGuardrailDefinition>): Promise<IGuardrailDefinition> {
	const res = await api.put<IGuardrailDefinition>(`/guardrails/${encodeURIComponent(name)}`, payload);
	if (!res.ok) throw new Error(res.error ?? 'Unknown error');
	return res.data!;
}

export async function deleteGuardrail(name: string): Promise<void> {
	const res = await api.del<null>(`/guardrails/${encodeURIComponent(name)}`);
	if (!res.ok) throw new Error(res.error ?? 'Unknown error');
}
