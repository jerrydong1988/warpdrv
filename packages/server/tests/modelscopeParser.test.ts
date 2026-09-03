// Tests for the ModelScope hub integration: response mapping, param-range
// filtering and per-source download URL construction.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EHubSource } from '@warpcore/shared';
import {
	mapModelscopeModel,
	filterModelsByParams,
} from '../src/services/modelscopeParser';
import type { IModelscopeRawModel } from '../src/services/modelscopeParser';

// downloadManager pulls in the store, which resolves its paths at import
// time — isolate it behind a temp data dir, same as storePersistence tests.
let dir: string;
let hubDownloadUrl: typeof import('../src/services/downloadManager').hubDownloadUrl;

beforeAll(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpcore-ms-'));
	process.env.WARPCORE_DATA_DIR = dir;
	({ hubDownloadUrl } = await import('../src/services/downloadManager'));
});

afterAll(() => {
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
	delete process.env.WARPCORE_DATA_DIR;
});

describe('mapModelscopeModel', () => {
	it('maps the openapi model shape to IHubModel', () => {
		const raw: IModelscopeRawModel = {
			id: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
			display_name: '千问2.5-7B-Instruct-GGUF',
			downloads: 207557,
			likes: 78,
			license: 'apache-2.0',
			tasks: ['text-generation'],
			created_at: '2024-09-18T03:19:02Z',
			last_modified: '2026-08-07T14:08:29Z',
			params: 7615616512,
			tags: ['license:apache-2.0', 'library:gguf'],
		};

		const model = mapModelscopeModel(raw, EHubSource.MODELSCOPE);
		expect(model.id).toBe('Qwen/Qwen2.5-7B-Instruct-GGUF');
		expect(model.author).toBe('Qwen');
		expect(model.modelId).toBe('Qwen2.5-7B-Instruct-GGUF');
		expect(model.downloads).toBe(207557);
		expect(model.likes).toBe(78);
		expect(model.pipelineTag).toBe('text-generation');
		expect(model.lastModified).toBe('2026-08-07T14:08:29Z');
		expect(model.createdAt).toBe('2024-09-18T03:19:02Z');
		expect(model.tags).toEqual(['license:apache-2.0', 'library:gguf']);
		expect(model.source).toBe(EHubSource.MODELSCOPE);
		expect(model.params).toBe(7615616512);
	});

	it('tolerates missing optional fields', () => {
		const model = mapModelscopeModel({ id: 'owner/name' }, EHubSource.MODELSCOPE);
		expect(model.downloads).toBe(0);
		expect(model.likes).toBe(0);
		expect(model.pipelineTag).toBe('');
		expect(model.params).toBeUndefined();
	});
});

describe('filterModelsByParams', () => {
	const base = (over: Partial<{ params?: number; id: string; tags: string[] }>) => {
		const id = over.id ?? 'owner/model';
		return {
			id,
			author: id.split('/')[0] ?? 'owner',
			modelId: id.split('/')[1] ?? 'model',
			downloads: 0,
			likes: 0,
			lastModified: '',
			createdAt: '',
			tags: over.tags ?? [],
			pipelineTag: '',
			source: EHubSource.MODELSCOPE,
			params: over.params,
		};
	};

	it('keeps everything when no range is set', () => {
		const models = [base({ params: 7.6e9 }), base({ params: undefined })];
		expect(filterModelsByParams(models, 0, 0)).toHaveLength(2);
	});

	it('filters by the hub-reported params field', () => {
		const models = [
			base({ params: 7.6e9 }),
			base({ params: 27e9 }),
			base({ params: 122e9 }),
		];
		const out = filterModelsByParams(models, 10, 100);
		expect(out.map(m => m.params)).toEqual([27e9]);
	});

	it('falls back to XB hints in tags/model id', () => {
		const models = [
			base({ id: 'owner/Qwen3.6-27B-Q8_0', tags: [] }),
			base({ id: 'owner/BigModel', tags: ['custom_tag:8B'] }),
		];
		const out = filterModelsByParams(models, 10, 100);
		expect(out.map(m => m.modelId)).toEqual(['Qwen3.6-27B-Q8_0']);
	});

	it('keeps models whose size cannot be determined (permissive)', () => {
		const models = [base({ id: 'owner/Step-3.7' }), base({ params: 7.6e9 })];
		expect(filterModelsByParams(models, 10, 100)).toHaveLength(1);
	});
});

describe('hubDownloadUrl', () => {
	it('builds HuggingFace resolve URLs by default', () => {
		expect(hubDownloadUrl(EHubSource.HUGGINGFACE, 'author', 'model', 'file.gguf'))
			.toBe('https://huggingface.co/author/model/resolve/main/file.gguf');
	});

	it('builds ModelScope repo URLs with encoded paths', () => {
		expect(hubDownloadUrl(EHubSource.MODELSCOPE, 'author', 'model', 'sub dir/file.gguf'))
			.toBe('https://modelscope.cn/api/v1/models/author/model/repo?FilePath=sub%20dir%2Ffile.gguf');
	});
});
