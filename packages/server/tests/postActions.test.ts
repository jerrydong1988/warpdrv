import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import {
	EDownloadStatus,
	EPostActionStatus,
	EPostActionType,
	type IDownload,
} from '@warpcore/shared';
import { assertNoSymlinkComponents, runPostActions } from '../src/services/postActions';

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpcore-post-actions-'));
	tempDirs.push(dir);
	return dir;
}

function makeDownload(archivePath: string, destDir: string): IDownload {
	return {
		id: 'post-action-test',
		author: '',
		modelName: '',
		filename: path.basename(archivePath),
		quantType: '',
		destRoot: path.dirname(destDir),
		destPath: archivePath,
		fileSizeBytes: 0,
		downloadedBytes: 0,
		status: EDownloadStatus.COMPLETED,
		speedBps: 0,
		progress: 100,
		error: null,
		startedAt: Date.now(),
		completedAt: Date.now(),
		resumeState: null,
		fileParts: [],
		partIndex: 0,
		postActions: [{
			type: EPostActionType.EXTRACT_ARCHIVE,
			payload: { destDir },
			status: EPostActionStatus.PENDING,
			error: null,
		}],
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe('archive post-actions', () => {
	it('extracts a normal zip inside the requested directory', async () => {
		const root = makeTempDir();
		const archivePath = path.join(root, 'backend.zip');
		const destDir = path.join(root, 'backend');
		const zip = new AdmZip();
		zip.addFile('bin/server.txt', Buffer.from('ok'));
		zip.writeZip(archivePath);

		const dl = makeDownload(archivePath, destDir);
		await runPostActions(dl, async () => undefined, () => undefined);

		expect(fs.readFileSync(path.join(destDir, 'bin', 'server.txt'), 'utf8')).toBe('ok');
		expect(dl.postActions?.[0]?.status).toBe(EPostActionStatus.COMPLETED);
	});

	it('rejects an existing symbolic-link component below the extraction root', () => {
		const root = makeTempDir();
		const destDir = path.join(root, 'dest');
		const outsideDir = path.join(root, 'outside');
		fs.mkdirSync(destDir);
		fs.mkdirSync(outsideDir);
		fs.symlinkSync(outsideDir, path.join(destDir, 'linked'), 'junction');

		expect(() => assertNoSymlinkComponents(destDir, 'linked/payload.bin'))
			.toThrow(/symbolic-link destination/);
	});
});
