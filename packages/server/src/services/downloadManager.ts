import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloaderHelper } from 'node-downloader-helper';
import { EDownloadStatus, EDownloadType, EHubSource, type IDownload, type TDownloadId, type IResumeState, type IDownloadPostAction } from '@warpcore/shared';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { runPostActions } from './postActions';

const DOWNLOADS_PREFIX = 'downloads:';

// In-memory map of active downloader instances
const activeDownloaders = new Map<TDownloadId, DownloaderHelper>();

// In-memory download state (synced to store for history)
const downloadState = new Map<TDownloadId, IDownload>();

// Ids cancelled via cancelDownload — the downloader's async 'stop' event fires
// after helper.stop() and would otherwise overwrite CANCELLED with PAUSED.
const cancelledDownloads = new Set<TDownloadId>();

function makeDownloadId(): TDownloadId {
	return crypto.randomBytes(8).toString('hex');
}

// Hugging Face repo authors/names and file paths are interpolated into both
// the download URL and local path.join() destinations. Reject anything that
// could escape the destination directory or the HF domain.
const HF_REPO_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function sanitizeDownloadPaths(author: string, modelName: string, filename: string): void {
	if (!HF_REPO_SEGMENT_RE.test(author)) {
		throw new Error(`Invalid model author: ${author}`);
	}
	if (!HF_REPO_SEGMENT_RE.test(modelName)) {
		throw new Error(`Invalid model name: ${modelName}`);
	}
	if (!filename || typeof filename !== 'string') {
		throw new Error('Invalid filename');
	}
	// Nested sub-directories are supported, but no absolute paths, no empty or
	// dot segments, and no `..` traversal.
	if (
		filename.startsWith('/') ||
		filename.startsWith('\\') ||
		filename.startsWith('..') ||
		filename.split(/[\\/]/).some(seg => seg === '' || seg === '.' || seg === '..')
	) {
		throw new Error(`Invalid filename: ${filename}`);
	}
}

function quantFromFilename(filename: string): string {
	const match = filename.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|NVFP\d+|FP16|F16|F32|BF16)/i);
	return match ? match[1]!.toUpperCase() : '';
}

// Build the raw download URL for a hub file. HuggingFace resolves through
// /resolve/main/, ModelScope streams from its /repo API endpoint.
export function hubDownloadUrl(
	source: EHubSource,
	author: string,
	modelName: string,
	filename: string,
): string {
	if (source === EHubSource.MODELSCOPE) {
		return `https://modelscope.cn/api/v1/models/${author}/${modelName}/repo?FilePath=${encodeURIComponent(filename)}`;
	}
	return `https://huggingface.co/${author}/${modelName}/resolve/main/${filename}`;
}

function emitDownloadUpdate(dl: IDownload): void {
	sseManager.emit('downloads:update', { [dl.id]: dl });
}

async function persistDownload(dl: IDownload): Promise<void> {
	downloadState.set(dl.id, dl);
	await store.put(DOWNLOADS_PREFIX + dl.id, dl);
}

// Shared DownloaderHelper event handler setup
function setupDownloaderEvents(
	helper: DownloaderHelper,
	dl: IDownload,
	id: TDownloadId,
): void {
	helper.on('start', () => {
		dl.status = EDownloadStatus.DOWNLOADING;
		persistDownload(dl);
	});

	helper.on('progress', (stats) => {
		dl.fileSizeBytes = stats.total ?? 0;
		dl.downloadedBytes = stats.downloaded;
		dl.progress = stats.progress;
		dl.speedBps = stats.speed;
		dl.status = EDownloadStatus.DOWNLOADING;
		downloadState.set(dl.id, dl);
	});

	helper.on('end', async () => {
		dl.progress = 100;
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		if (dl.postActions && dl.postActions.length > 0) {
			dl.status = EDownloadStatus.INSTALLING;
			await persistDownload(dl);
			emitDownloadUpdate(dl);
		}
		try {
			await runPostActions(dl, persistDownload, emitDownloadUpdate);
			dl.status = EDownloadStatus.COMPLETED;
			dl.completedAt = Date.now();
		} catch (err) {
			dl.status = EDownloadStatus.FAILED;
			dl.error = String(err);
			dl.completedAt = Date.now();
		}
		await persistDownload(dl);
		emitDownloadUpdate(dl);
	});

	helper.on('error', async (err) => {
		dl.status = EDownloadStatus.FAILED;
		const errorMsg = err.message ?? String(err);
		console.error(`[Download Error] ID: ${id}, URL: ${dl.sourceUrl ?? dl.destPath}, Filename: ${dl.filename}, DestDir: ${dl.destRoot}, Error: ${errorMsg}`);
		dl.error = errorMsg;
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		await persistDownload(dl);
		emitDownloadUpdate(dl);
	});

	helper.on('stop', async () => {
		// If this download was explicitly cancelled, keep CANCELLED instead of
		// flipping back to PAUSED (the 'stop' event races cancelDownload).
		if (cancelledDownloads.has(id)) {
			cancelledDownloads.delete(id);
			activeDownloaders.delete(id);
			await persistDownload(dl);
			emitDownloadUpdate(dl);
			return;
		}
		dl.status = EDownloadStatus.PAUSED;
		dl.speedBps = 0;
		const resumeState = helper.getResumeState();
		dl.resumeState = {
			downloaded: resumeState.downloaded,
			filePath: resumeState.filePath,
			fileName: resumeState.fileName,
			total: resumeState.total,
		} as IResumeState;
		activeDownloaders.delete(id);
		await persistDownload(dl);
		emitDownloadUpdate(dl);
	});
}

export async function startDownload(
	author: string,
	modelName: string,
	filename: string,
	destRoot: string,
	fileParts: string[] = [],
	partIndex: number = 0,
	groupKey?: string,
	source: EHubSource = EHubSource.HUGGINGFACE,
): Promise<IDownload> {
	sanitizeDownloadPaths(author, modelName, filename);
	const id = makeDownloadId();

	// Handle nested directories - create full path including subdirectories
	const fileDirname = path.dirname(filename);
	const destDir = fileDirname && fileDirname !== '.'
		? path.join(destRoot, author, modelName, fileDirname)
		: path.join(destRoot, author, modelName);
	const destPath = path.join(destRoot, author, modelName, filename);
	const url = hubDownloadUrl(source, author, modelName, filename);

	// Create directory structure (including any nested dirs from the file path)
	fs.mkdirSync(destDir, { recursive: true });

	// If fileParts not provided, use just the filename
	const allParts = fileParts.length > 0 ? fileParts : [filename];

	console.log('[DownloadManager] Starting download:', {
		id,
		filename,
		fileDirname,
		url,
		destDir,
		destPath,
		fileName: path.basename(filename),
		allParts,
		partIndex,
	});

	const dl: IDownload = {
		id,
		source,
		author,
		modelName,
		filename,
		quantType: quantFromFilename(filename),
		destRoot,
		destPath,
		fileSizeBytes: 0,
		downloadedBytes: 0,
		status: EDownloadStatus.DOWNLOADING,
		speedBps: 0,
		progress: 0,
		error: null,
		startedAt: Date.now(),
		completedAt: null,
resumeState: null,
		fileParts: allParts,
		partIndex,
		groupKey,
	};
	const helper = new DownloaderHelper(url, destDir, {
		fileName: path.basename(filename), // Only use basename for the actual file name
		override: false,
		removeOnStop: false, // Keep partial file when paused
		removeOnFail: false, // Keep partial file on failure
		resumeIfFileExists: true,
		resumeOnIncomplete: true,
		resumeOnIncompleteMaxRetry: 3,
	});

	setupDownloaderEvents(helper, dl, id);

	activeDownloaders.set(id, helper);
	await persistDownload(dl);

	console.log(`[Download Start] ID: ${id}, URL: ${url}, Filename: ${filename}, DestDir: ${destDir}, DestPath: ${destPath}`);

	helper.start().catch(async (err) => {
		dl.status = EDownloadStatus.FAILED;
		dl.error = String(err);
		activeDownloaders.delete(id);
		await persistDownload(dl);
		emitDownloadUpdate(dl);
	});

	return dl;
}

/**
 * Starts downloads for all parts of a split model simultaneously
 * Returns an array of download IDs that were started
 */
export async function startMultiPartDownload(
	author: string,
	modelName: string,
	fileParts: string[],
	destRoot: string,
	source: EHubSource = EHubSource.HUGGINGFACE,
): Promise<string[]> {
	const downloadIds: string[] = [];

	// Cap concurrent shard downloads — launching every part simultaneously
	// opened 10+ parallel connections to Hugging Face per model.
	const MAX_CONCURRENT_SHARDS = 3;
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(MAX_CONCURRENT_SHARDS, fileParts.length) }, async () => {
		while (nextIndex < fileParts.length) {
			const index = nextIndex++;
			const filename = fileParts[index];
			if (!filename) continue;
			const dl = await startDownload(author, modelName, filename, destRoot, fileParts, index, undefined, source);
			downloadIds.push(dl.id);
		}
	});

	await Promise.all(workers);
	return downloadIds;
}

export async function pauseDownload(id: TDownloadId): Promise<boolean> {
	const helper = activeDownloaders.get(id);
	if (!helper) return false;
	helper.stop();
	return true;
}

export async function resumeDownload(id: TDownloadId): Promise<boolean> {
	const dl = downloadState.get(id) ?? await store.get<IDownload>(DOWNLOADS_PREFIX + id);
	if (!dl || dl.status !== EDownloadStatus.PAUSED) return false;

	// Older persisted downloads predate the hub source field — treat them as
	// HuggingFace entries, which is what they were.
	const url = hubDownloadUrl(dl.source ?? EHubSource.HUGGINGFACE, dl.author, dl.modelName, dl.filename);
	const destDir = path.dirname(dl.destPath);

	// Check if we have saved resume state and the partial file exists
	const hasResumeState = dl.resumeState !== null && fs.existsSync(dl.resumeState.filePath);
	const partialPath = dl.resumeState?.filePath ?? (dl.destPath + '.download');
	const hasPartialFile = fs.existsSync(partialPath);
	const partialSize = hasPartialFile ? fs.statSync(partialPath).size : 0;

	// Start fresh if no valid resume state or partial file is missing/empty
	const startFresh = !hasResumeState || !hasPartialFile || partialSize === 0;

	const helper = new DownloaderHelper(url, destDir, {
		fileName: path.basename(dl.filename), // Only use basename since destDir already has subdirs
		override: startFresh,
		removeOnStop: false,
		removeOnFail: false,
	});

	setupDownloaderEvents(helper, dl, id);

	activeDownloaders.set(id, helper);
	dl.status = EDownloadStatus.DOWNLOADING;

	// Reset progress if starting fresh
	if (startFresh) {
		dl.downloadedBytes = 0;
		dl.progress = 0;
		dl.resumeState = null;
		helper.start().catch(async (err) => {
			dl.status = EDownloadStatus.FAILED;
			dl.error = String(err);
			activeDownloaders.delete(id);
			await persistDownload(dl);
			emitDownloadUpdate(dl);
		});
	} else {
		// Use resumeFromFile with saved state
		helper.resumeFromFile(partialPath, {
			total: dl.fileSizeBytes,
			fileName: dl.filename,
		}).catch(async (err) => {
			dl.status = EDownloadStatus.FAILED;
			dl.error = String(err);
			activeDownloaders.delete(id);
			await persistDownload(dl);
			emitDownloadUpdate(dl);
		});
	}

	await persistDownload(dl);
	emitDownloadUpdate(dl);
	return true;
}

export async function cancelDownload(id: TDownloadId): Promise<boolean> {
	const helper = activeDownloaders.get(id);
	if (helper) {
		cancelledDownloads.add(id);
		helper.stop();
	}
	activeDownloaders.delete(id);

	const dl = downloadState.get(id) ?? await store.get<IDownload>(DOWNLOADS_PREFIX + id);
	if (!dl) return false;

	dl.status = EDownloadStatus.CANCELLED;
	dl.speedBps = 0;
	dl.completedAt = Date.now();
	await persistDownload(dl);
	emitDownloadUpdate(dl);

	// Clean up partial file - use resumeState.filePath if available, otherwise fallback to default
	const partial = dl.resumeState?.filePath ?? (dl.destPath + '.download');
	try { fs.unlinkSync(partial); } catch { /* best-effort */ }

	return true;
}

export async function getAllDownloads(): Promise<IDownload[]> {
	// Merge in-memory state (has latest progress) with persisted history
	const persisted = await store.list<IDownload>(DOWNLOADS_PREFIX);
	const merged = new Map<string, IDownload>();

	for (const dl of persisted) merged.set(dl.id, dl);
	for (const [id, dl] of downloadState) merged.set(id, dl);

	return [...merged.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export async function clearDownloadHistory(): Promise<void> {
	const all = await store.list<IDownload>(DOWNLOADS_PREFIX);
	for (const dl of all) {
		if (dl.status !== EDownloadStatus.DOWNLOADING && dl.status !== EDownloadStatus.PAUSED) {
			await store.del(DOWNLOADS_PREFIX + dl.id);
			downloadState.delete(dl.id);
		}
	}
	const remaining = await getAllDownloads();
	sseManager.emit('downloads:init', remaining.reduce((acc, dl) => {
		acc[dl.id] = dl;
		return acc;
	}, {} as Record<string, IDownload>));
}

export function getAllDownloadsRecord(): Record<string, IDownload> {
	const result: Record<string, IDownload> = {};
	for (const [id, dl] of downloadState.entries()) {
		result[id] = dl;
	}
	return result;
}
export async function startGenericDownload(
	sourceUrl: string,
	destDir: string,
	filename: string,
	postActions: IDownloadPostAction[] = [],
	groupKey?: string,
): Promise<IDownload> {
	// Defense-in-depth: even though current callers pass curated release-manifest
	// values, never let a caller write outside destDir via `filename`, and only
	// allow http(s) sources.
	if (!/^https?:\/\//i.test(sourceUrl)) {
		throw new Error(`Invalid download URL: ${sourceUrl}`);
	}
	if (
		!filename || typeof filename !== 'string' ||
		filename.startsWith('/') || filename.startsWith('\\') ||
		filename.split(/[\\/]/).some(seg => seg === '' || seg === '.' || seg === '..')
	) {
		throw new Error(`Invalid filename: ${filename}`);
	}
	const id = makeDownloadId();
	const destPath = path.join(destDir, filename);
	fs.mkdirSync(destDir, { recursive: true });
	const dl: IDownload = {
		id,
		downloadType: EDownloadType.GENERIC,
		sourceUrl,
		postActions,
		groupKey,
		author: '',
		modelName: '',
		filename,
		quantType: '',
		destRoot: destDir,
		destPath,
		fileSizeBytes: 0,
		downloadedBytes: 0,
		status: EDownloadStatus.DOWNLOADING,
		speedBps: 0,
		progress: 0,
		error: null,
		startedAt: Date.now(),
		completedAt: null,
		resumeState: null,
		fileParts: [filename],
		partIndex: 0,
	};
	const helper = new DownloaderHelper(sourceUrl, destDir, {
		fileName: filename,
		override: false,
		removeOnStop: false,
		removeOnFail: false,
		resumeIfFileExists: true,
		resumeOnIncomplete: true,
		resumeOnIncompleteMaxRetry: 3,
	});
	setupDownloaderEvents(helper, dl, id);
	activeDownloaders.set(id, helper);
	await persistDownload(dl);
	helper.start().catch(async (err) => {
		dl.status = EDownloadStatus.FAILED;
		dl.error = String(err);
		activeDownloaders.delete(id);
		await persistDownload(dl);
		emitDownloadUpdate(dl);
	});
	return dl;
}
