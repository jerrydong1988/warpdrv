// ============================================================
// ModelScope (魔搭) hub parser — search, detail and file listing
// ============================================================

import { EHubSource } from '@warpcore/shared';
import type { IHubModel, IHubFile } from '@warpcore/shared';
import { mapFilesToHubFiles, processGgufFiles } from './hubParser';

export const MODELSCOPE_API = 'https://modelscope.cn';

// Raw shape of one model in GET /openapi/v1/models
export interface IModelscopeRawModel {
	id: string;
	display_name?: string;
	description?: string;
	downloads?: number;
	likes?: number;
	license?: string;
	tasks?: string[];
	created_at?: string;
	last_modified?: string;
	file_size?: number;
	params?: number;
	tags?: string[];
	private?: boolean;
	gated?: boolean;
}

export interface IModelscopeRawFile {
	Path: string;
	Size: number;
	Type: string;
	Name: string;
}

// Map the openapi search response to the shared IHubModel shape
export function mapModelscopeModel(raw: IModelscopeRawModel, source: EHubSource): IHubModel {
	const [author = '', modelId = ''] = (raw.id ?? '').split('/');
	return {
		id: raw.id ?? '',
		author,
		modelId,
		downloads: Number(raw.downloads ?? 0),
		likes: Number(raw.likes ?? 0),
		lastModified: raw.last_modified ?? '',
		createdAt: raw.created_at ?? '',
		tags: raw.tags ?? [],
		pipelineTag: raw.tasks?.[0] ?? '',
		source,
		params: raw.params !== undefined && Number.isFinite(Number(raw.params)) ? Number(raw.params) : undefined,
	};
}

// Client-side parameter-range filter shared by both hubs. Uses the raw
// params field when the hub reports it, then falls back to "XB" hints in
// tags/model id. Models with no determinable size are kept (permissive).
export function filterModelsByParams(models: IHubModel[], paramsMin: number, paramsMax: number): IHubModel[] {
	if (paramsMin <= 0 && paramsMax <= 0) return models;
	return models.filter(m => {
		let paramB: number | null = null;
		if (m.params !== undefined && m.params > 0) {
			paramB = m.params / 1e9;
		} else {
			const allText = [...m.tags, m.modelId, m.id].join(' ');
			const match = allText.match(/(\d+\.?\d*)[Bb]/);
			paramB = match ? parseFloat(match[1]!) : null;
		}
		if (paramB === null) return true; // can't determine, include it
		if (paramsMin > 0 && paramB < paramsMin) return false;
		if (paramsMax > 0 && paramB > paramsMax) return false;
		return true;
	});
}

// Search ModelScope models via the public openapi
export async function searchModelscopeModels(
	query: string,
	sort: string,
	order: string,
	paramsMin: number,
	paramsMax: number,
): Promise<IHubModel[]> {
	// ModelScope sort values differ from HF: default | downloads | likes |
	// last_modified | created_at. Descending order is the API default; an
	// explicit ascending request is not supported, so reverse client-side.
	const sortMap: Record<string, string> = {
		downloads: 'downloads',
		likes: 'likes',
		modified: 'last_modified',
		created: 'created_at',
	};
	const searchParams = new URLSearchParams({
		search: query.trim(),
		page_number: '1',
		// The API rejects page_size above 50 (HTTP 400)
		page_size: '50',
		sort: sortMap[sort] ?? 'default',
	});

	const response = await fetch(`${MODELSCOPE_API}/openapi/v1/models?${searchParams}`);
	if (!response.ok) {
		throw new Error(`ModelScope API returned ${response.status}`);
	}
	const payload = await response.json() as {
		success?: boolean;
		data?: { models?: IModelscopeRawModel[] };
	};
	const rawModels = payload.data?.models ?? [];
	const models = rawModels.map(m => mapModelscopeModel(m, EHubSource.MODELSCOPE));

	const filtered = filterModelsByParams(models, paramsMin, paramsMax);
	return order === 'asc' ? filtered.reverse() : filtered;
}

// List all .gguf/.bin files in a ModelScope repo. Recursive=true returns a
// flat list with full paths, so no manual directory walking is needed.
export async function fetchModelscopeGgufFiles(author: string, modelName: string): Promise<{ path: string; size: number; type: string }[]> {
	const url = `${MODELSCOPE_API}/api/v1/models/${author}/${modelName}/repo/files?Recursive=true`;
	const response = await fetch(url);
	if (!response.ok) return [];
	const payload = await response.json() as { Data?: { Files?: IModelscopeRawFile[] } };
	const files = payload.Data?.Files ?? [];
	return files
		.filter(f => f.Type === 'blob')
		.map(f => ({ path: f.Path, size: f.Size, type: 'file' }))
		.filter(f => f.path.endsWith('.gguf') || f.path.endsWith('.bin'));
}

// Fetch full model detail (metadata + readme + mapped files)
export async function fetchModelscopeModelDetail(
	author: string,
	modelName: string,
	modelRoots: string[],
): Promise<{
	model: IHubModel;
	files: IHubFile[];
	readme: string;
} | null> {
	const detailUrl = `${MODELSCOPE_API}/openapi/v1/models/${author}/${modelName}`;
	const response = await fetch(detailUrl);
	if (!response.ok) return null;

	const payload = await response.json() as {
		success?: boolean;
		data?: IModelscopeRawModel & { readme?: string };
	};
	const raw = payload.data;
	if (!raw) return null;

	const rawFiles = await fetchModelscopeGgufFiles(author, modelName);
	const mapped = mapFilesToHubFiles(rawFiles, author, modelName, modelRoots);
	const files = processGgufFiles(mapped);

	return {
		model: mapModelscopeModel(raw, EHubSource.MODELSCOPE),
		files,
		readme: raw.readme ?? '',
	};
}
