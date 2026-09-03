import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { getLocalVersion } from '../src/routes/update';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const serverWorkspace = path.join(repoRoot, 'packages', 'server');
const release = JSON.parse(fs.readFileSync(path.join(repoRoot, 'release.json'), 'utf8')) as { version: string };

describe('getLocalVersion', () => {
	it('finds the repository release file when npm starts in the server workspace', () => {
		const originalCwd = process.cwd();
		const resourceDir = process.env.WARPCORE_RESOURCE_DIR;
		delete process.env.WARPCORE_RESOURCE_DIR;
		process.chdir(serverWorkspace);

		try {
			expect(getLocalVersion()).toBe(release.version);
		} finally {
			process.chdir(originalCwd);
			if (resourceDir === undefined) delete process.env.WARPCORE_RESOURCE_DIR;
			else process.env.WARPCORE_RESOURCE_DIR = resourceDir;
		}
	});
});
