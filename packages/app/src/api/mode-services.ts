import type { IMode, IModeCreatePayload, IToolAttachment, TModeId } from "@warpcore/shared";
import { api } from "./client";

export async function createMode(payload: IModeCreatePayload): Promise<IMode> {
	const res = await api.post<IMode>("/modes", payload);
	if (!res.ok) throw new Error(res.error ?? "Unable to create mode");
	return res.data!;
}

export async function updateMode(id: TModeId, payload: Partial<IMode>): Promise<IMode> {
	const res = await api.put<IMode>(`/modes/${id}`, payload);
	if (!res.ok) throw new Error(res.error ?? "Unable to update mode");
	return res.data!;
}

export async function deleteMode(id: TModeId): Promise<void> {
	const res = await api.del<null>(`/modes/${id}`);
	if (!res.ok) throw new Error(res.error ?? "Unable to delete mode");
}

export async function updateModeTools(id: TModeId, tools: IToolAttachment[]): Promise<IMode> {
	const res = await api.patch<IMode>(`/modes/${id}/tools`, { tools });
	if (!res.ok) throw new Error(res.error ?? "Unable to update mode tools");
	return res.data!;
}

export async function updateModeGuardrails(
	id: TModeId,
	activeGuardrails: string[],
): Promise<IMode> {
	const res = await api.patch<IMode>(`/modes/${id}/guardrails`, { activeGuardrails });
	if (!res.ok) throw new Error(res.error ?? "Unable to update mode guardrails");
	return res.data!;
}

export async function updateModeAgents(id: TModeId, allowedAgents: string[]): Promise<IMode> {
	const res = await api.patch<IMode>(`/modes/${id}/agents`, { allowedAgents });
	if (!res.ok) throw new Error(res.error ?? "Unable to update mode agents");
	return res.data!;
}
