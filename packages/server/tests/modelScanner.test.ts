import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/util/store', () => ({
	store: {
		get: vi.fn(async () => []),
		put: vi.fn(async () => undefined),
	},
}));

vi.mock('../src/services/ggufParser', () => ({
	parseGgufMetadata: vi.fn(async () => ({
		architecture: 'qwen35',
		quantType: 'Q4_K_M',
		paramCount: '27B',
		nLayers: 64,
		contextLength: 262144,
	})),
	estimateParamCountFromSize: vi.fn(() => '27B'),
}));

import { findMmprojFilePaths, scanAllModelRoots } from '../src/services/modelScanner';

const tempRoots: string[] = [];

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
