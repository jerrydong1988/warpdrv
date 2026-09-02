import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFileSync } from 'child_process';
import AdmZip from 'adm-zip';
import { EPostActionType, EPostActionStatus, type IDownload } from '@warpcore/shared';
import { validateBackend } from './backendValidator';
import { validateWhisperBackend } from './whisperBackendValidator';
import { locateBinary } from './binaryLocator';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { emitDevicesUpdate } from '../routes/backends';
import type { IBackend, IWhisperBackend } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';
import crypto from 'crypto';
const BACKENDS_PREFIX = 'backends:';
const WHISPER_BACKENDS_PREFIX = 'whisperBackends:';
type TPersistFn = (dl: IDownload) => Promise<void>;
type TEmitFn = (dl: IDownload) => void;
type TPostActionHandler = (dl: IDownload, payload: Record<string, unknown>) => Promise<void>;
function isPathWithin(base: string, target: string): boolean {
	const rel = path.relative(base, target);
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function extractArchive(dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const destDir = payload.destDir as string;
	const archivePath = dl.destPath;
	if (!destDir) throw new Error('extractArchive: destDir missing in payload');
	if (!fs.existsSync(archivePath)) throw new Error(`extractArchive: archive not found at ${archivePath}`);
	fs.mkdirSync(destDir, { recursive: true });
	const absDest = path.resolve(destDir);
	const ext = path.extname(archivePath).toLowerCase();
	if (ext === '.zip') {
		const zip = new AdmZip(archivePath);
		// Zip Slip prevention: validate every entry path before extraction.
		// Uses path.relative containment (NOT a bare startsWith) so that
		// entries like `x/../../<destBasename>-evil/...` cannot escape.
		const entries = zip.getEntries();
		for (const entry of entries) {
			if (!entry.entryName || entry.entryName.startsWith('/') || entry.entryName.includes('\\')) {
				throw new Error(`extractArchive: blocked unsafe zip entry '${entry.entryName}'`);
			}
			const extractedPath = path.resolve(absDest, entry.entryName);
			if (!isPathWithin(absDest, extractedPath)) {
				throw new Error(`extractArchive: blocked path traversal in zip entry '${entry.entryName}'`);
			}
		}
		zip.extractAllTo(destDir, true);
	} else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
		// Validate every tar member before extraction (tar -tzf lists names
		// without writing anything). Blocks `../` members and absolute paths,
		// which GNU tar strips silently but busybox/minimal tars may honor.
		let members: string[];
		try {
			members = execFileSync('tar', ['-tzf', archivePath], {
				encoding: 'utf8',
				maxBuffer: 32 * 1024 * 1024,
				stdio: ['ignore', 'pipe', 'ignore'],
			}).split('\n');
		} catch (err) {
			throw new Error(`extractArchive: failed to list tar contents: ${err instanceof Error ? err.message : String(err)}`);
		}
		for (const member of members) {
			if (!member) continue;
			if (member.startsWith('/') || member.includes('\\')) {
				throw new Error(`extractArchive: blocked unsafe tar member '${member}'`);
			}
			const memberPath = path.resolve(absDest, member);
			if (!isPathWithin(absDest, memberPath)) {
				throw new Error(`extractArchive: blocked path traversal in tar member '${member}'`);
			}
		}
		await new Promise<void>((resolve, reject) => {
			const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
			proc.on('error', reject);
			proc.on('exit', (code) => {
				if (code === 0) resolve();
				else reject(new Error(`tar exited with code ${code}`));
			});
		});
	} else {
		throw new Error(`extractArchive: unsupported archive type ${ext}`);
	}
}
async function locateBinaryAction(dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const rootDir = payload.rootDir as string;
	const binaryName = payload.binaryName as string;
	const contextKey = payload.contextKey as string;
	if (!rootDir) throw new Error('locateBinary: rootDir missing in payload');
	if (!binaryName) throw new Error('locateBinary: binaryName missing in payload');
	if (!contextKey) throw new Error('locateBinary: contextKey missing in payload');
	const found = locateBinary({ rootDir, binaryName });
	if (!found) throw new Error(`locateBinary: ${binaryName} not found under ${rootDir}`);
	if (!dl.postActions) return;
	for (let i = 0; i < dl.postActions.length; i++) {
		const action = dl.postActions[i];
		if (!action) continue;
		if (action.payload && typeof action.payload === 'object' && (action.payload as Record<string, unknown>)[contextKey] === '__LOCATED__') {
			(action.payload as Record<string, unknown>)[contextKey] = found;
		}
	}
}
async function chmodExecutable(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	if (!binaryPath) throw new Error('chmodExecutable: binaryPath missing in payload');
	if (os.platform() === 'win32') return;
	if (!fs.existsSync(binaryPath)) throw new Error(`chmodExecutable: binary not found at ${binaryPath}`);
	fs.chmodSync(binaryPath, 0o755);
}
async function registerLlamaBackend(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	const name = payload.name as string;
	const description = (payload.description as string) ?? '';
	const defaultArgs = (payload.defaultArgs as string[]) ?? [];
	if (!binaryPath) throw new Error('registerLlamaBackend: binaryPath missing in payload');
	if (!name) throw new Error('registerLlamaBackend: name missing in payload');
	if (!fs.existsSync(binaryPath)) throw new Error(`registerLlamaBackend: binary not found at ${binaryPath}`);
	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();
	const validation = await validateBackend(binaryPath, id);
	const backend: IBackend = {
		id,
		name,
		path: binaryPath,
		defaultArgs,
		description,
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		buildNumber: validation.buildInfo?.buildNumber ?? '',
		gitCommit: validation.buildInfo?.gitCommit ?? '',
		capabilities: validation.capabilities ?? undefined,
		detectedDevices: validation.devices,
		createdAt: now,
		updatedAt: now,
	};
	await store.put(BACKENDS_PREFIX + id, backend);
	sseManager.emit('backends:update', backend);
	await emitDevicesUpdate();
}
async function registerWhisperBackend(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	const name = payload.name as string;
	const description = (payload.description as string) ?? '';
	const defaultArgs = (payload.defaultArgs as string[]) ?? [];
	if (!binaryPath) throw new Error('registerWhisperBackend: binaryPath missing in payload');
	if (!name) throw new Error('registerWhisperBackend: name missing in payload');
	if (!fs.existsSync(binaryPath)) throw new Error(`registerWhisperBackend: binary not found at ${binaryPath}`);
	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();
	const validation = await validateWhisperBackend(binaryPath);
	const backend: IWhisperBackend = {
		id,
		name,
		path: binaryPath,
		defaultArgs,
		description,
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		createdAt: now,
		updatedAt: now,
	};
	await store.put(WHISPER_BACKENDS_PREFIX + id, backend);
	sseManager.emit('whisperBackends:update', backend);
}
async function rescanModels(_dl: IDownload, _payload: Record<string, unknown>): Promise<void> {
	// Previously a stub that threw 'not implemented', which failed any download
	// that used this action. Now triggers a real rescan of the configured model
	// roots (used e.g. after installing a backend/embedding model).
	const { rescanAllModels } = await import('../routes/models');
	await rescanAllModels();
}
const HANDLERS: Record<EPostActionType, TPostActionHandler> = {
	[EPostActionType.EXTRACT_ARCHIVE]: extractArchive,
	[EPostActionType.LOCATE_BINARY]: locateBinaryAction,
	[EPostActionType.CHMOD_EXECUTABLE]: chmodExecutable,
	[EPostActionType.REGISTER_LLAMA_BACKEND]: registerLlamaBackend,
	[EPostActionType.REGISTER_WHISPER_BACKEND]: registerWhisperBackend,
	[EPostActionType.RESCAN_MODELS]: rescanModels,
};
export async function runPostActions(dl: IDownload, persist: TPersistFn, emit: TEmitFn): Promise<void> {
	if (!dl.postActions || dl.postActions.length === 0) return;
	for (let i = 0; i < dl.postActions.length; i++) {
		const action = dl.postActions[i];
		if (!action) continue;
		const handler = HANDLERS[action.type];
		if (!handler) {
			action.status = EPostActionStatus.FAILED;
			action.error = `Unknown post-action type: ${action.type}`;
			await persist(dl);
			emit(dl);
			throw new Error(action.error);
		}
		action.status = EPostActionStatus.RUNNING;
		action.error = null;
		await persist(dl);
		emit(dl);
		try {
			await handler(dl, action.payload);
			action.status = EPostActionStatus.COMPLETED;
			await persist(dl);
			emit(dl);
		} catch (err) {
			action.status = EPostActionStatus.FAILED;
			action.error = String(err);
			await persist(dl);
			emit(dl);
			throw err;
		}
	}
}
