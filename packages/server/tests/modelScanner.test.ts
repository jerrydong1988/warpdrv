import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	storeGet: vi.fn(async (): Promise<unknown[]> => []),
	storePut: vi.fn(async () => undefined),
	defaultMetadata: () => ({
		architecture: 'qwen35',
		quantType: 'Q4_K_M',
		paramCount: '27B',
		parameterCount: 27_000_000_000,
		nLayers: 64,
		nKvHeads: 8,
		embeddingDim: 4096,
		feedForwardDim: 12288,
		contextLength: 262144,
		fileSize: 0,
		vocabSize: 0,
		parserVersion: 2,
	}),
	parseGgufMetadata: vi.fn(),
}));

vi.mock('../src/util/store', () => ({
	store: {
		get: mocks.storeGet,
		put: mocks.storePut,
	},
}));

vi.mock('../src/services/ggufParser', () => ({
	GGUF_METADATA_PARSER_VERSION: 2,
	parseGgufMetadata: mocks.parseGgufMetadata,
	estimateParamCountFromSize: vi.fn(() => '27B'),
	extractParamCount: vi.fn(() => 'unknown'),
	formatParamCount: vi.fn((value: number) => `${Number((value / 1e9).toFixed(2))}B`),
	inferQuantTypeFromFileName: vi.fn(() => 'unknown'),
}));

import { findMmprojFilePaths, scanAllModelRoots } from '../src/services/modelScanner';

const tempRoots: string[] = [];

beforeEach(() => {
	mocks.storeGet.mockResolvedValue([]);
	mocks.storePut.mockResolvedValue(undefined);
	mocks.parseGgufMetadata.mockReset();
	mocks.parseGgufMetadata.mockImplementation(async () => mocks.defaultMetadata());
});

afterEach(async () => {
	await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('model scanner projector discovery', () => {
	it('recognizes case-insensitive GGUF extensions and exposes every same-directory projector', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'warpcore-mmproj-'));
		tempRoots.push(root);
		const modelDir = path.join(root, 'unsloth', 'Qwen3.8-27B-GGUF');
		await fs.mkdir(modelDir, { recursive: true });
		await Promise.all([
			fs.writeFile(path.join(modelDir, 'Qwen3.8-27B-Q4_K_M.GGUF'), ''),
			fs.writeFile(path.join(modelDir, 'mmproj-Z.gguf'), ''),
			fs.writeFile(path.join(modelDir, 'mmproj-A.GGUF'), ''),
		]);

		const models = await scanAllModelRoots([root]);

		expect(models).toHaveLength(1);
		expect(models[0]?.primaryFile?.fileName).toBe('Qwen3.8-27B-Q4_K_M.GGUF');
		expect(models[0]?.mmprojFile?.fileName).toBe('mmproj-A.GGUF');
		expect(models[0]?.files.filter(file => file.isMmproj).map(file => file.fileName))
			.toEqual(['mmproj-A.GGUF', 'mmproj-Z.gguf']);
		expect(await findMmprojFilePaths(modelDir)).toEqual([
			path.join(modelDir, 'mmproj-A.GGUF'),
			path.join(modelDir, 'mmproj-Z.gguf'),
		]);
	});
});

describe('model scanner metadata accuracy', () => {
	it('parses every shard and sums exact tensor-shape parameter counts', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'warpcore-shards-'));
		tempRoots.push(root);
		const modelDir = path.join(root, 'publisher', 'Exact-Model');
		await fs.mkdir(modelDir, { recursive: true });
		await Promise.all([
			fs.writeFile(path.join(modelDir, 'Exact-Model-Q4_K_M-00001-of-00003.gguf'), 'one'),
			fs.writeFile(path.join(modelDir, 'Exact-Model-Q4_K_M-00002-of-00003.gguf'), 'two'),
			fs.writeFile(path.join(modelDir, 'Exact-Model-Q4_K_M-00003-of-00003.gguf'), 'three'),
		]);
		mocks.parseGgufMetadata
			.mockResolvedValueOnce({ ...mocks.defaultMetadata(), parameterCount: 40_000_000_000, paramCount: '40B' })
			.mockResolvedValueOnce({ ...mocks.defaultMetadata(), parameterCount: 41_000_000_000, paramCount: '41B' })
			.mockResolvedValueOnce({ ...mocks.defaultMetadata(), parameterCount: 39_500_000_000, paramCount: '39.5B' });

		const models = await scanAllModelRoots([root]);

		expect(mocks.parseGgufMetadata).toHaveBeenCalledTimes(3);
		expect(models).toHaveLength(1);
		expect(models[0]?.primaryFile?.metadata?.paramCount).toBe('120.5B');
		expect(models[0]?.primaryFile?.metadata?.parameterCount).toBe(40_000_000_000);
	});

	it('reparses legacy cached metadata instead of preserving unknown values forever', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'warpcore-cache-'));
		tempRoots.push(root);
		const modelDir = path.join(root, 'publisher', 'Cached-Model');
		const filePath = path.join(modelDir, 'Cached-Model-Q4_K_M.gguf');
		await fs.mkdir(modelDir, { recursive: true });
		await fs.writeFile(filePath, 'model');
		mocks.storeGet.mockResolvedValue([{
			id: 'legacy', user: 'publisher', name: 'Cached-Model-Q4_K_M', dirPath: modelDir,
			files: [{
				fileName: path.basename(filePath), filePath, sizeMb: 0,
				metadata: { architecture: 'unknown', paramCount: 'unknown', quantType: 'unknown' },
				shardIndex: null, shardTotal: null, isMmproj: false, parentModel: null,
			}],
			primaryFile: null, mmprojFile: null, totalSizeMb: 0,
		}]);

		const models = await scanAllModelRoots([root]);

		expect(mocks.parseGgufMetadata).toHaveBeenCalledTimes(1);
		expect(models[0]?.primaryFile?.metadata?.quantType).toBe('Q4_K_M');
		expect(models[0]?.primaryFile?.metadata?.paramCount).toBe('27B');
	});

	it('can force a current cached model to reparse without invalidating other files', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'warpcore-force-'));
		tempRoots.push(root);
		const modelDir = path.join(root, 'publisher', 'Current-Model');
		const filePath = path.join(modelDir, 'Current-Model-Q4_K_M.gguf');
		await fs.mkdir(modelDir, { recursive: true });
		await fs.writeFile(filePath, 'model');
		const fileStat = await fs.stat(filePath);
		mocks.storeGet.mockResolvedValue([{
			id: 'current', user: 'publisher', name: 'Current-Model-Q4_K_M', dirPath: modelDir,
			files: [{
				fileName: path.basename(filePath), filePath, sizeMb: 0,
				sizeBytes: fileStat.size, modifiedAtMs: fileStat.mtimeMs,
				metadata: mocks.defaultMetadata(),
				shardIndex: null, shardTotal: null, isMmproj: false, parentModel: null,
			}],
			primaryFile: null, mmprojFile: null, totalSizeMb: 0,
		}]);

		await scanAllModelRoots([root], new Set([filePath]));

		expect(mocks.parseGgufMetadata).toHaveBeenCalledTimes(1);
	});
});
