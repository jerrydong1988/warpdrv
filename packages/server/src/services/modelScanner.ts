import fs from 'node:fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { IModel, IGgufFile, IGgufMetadata } from '@warpcore/shared';
import {
	GGUF_METADATA_PARSER_VERSION,
	estimateParamCountFromSize,
	extractParamCount,
	formatParamCount,
	inferQuantTypeFromFileName,
	parseGgufMetadata,
} from './ggufParser';
import { store } from '../util/store';
import type { Dirent } from 'node:fs';

const MODELS_CACHE_KEY = 'models:cache';
export const MODEL_SCAN_PARSE_CONCURRENCY = 4;

type TaskLimiter = <T>(task: () => Promise<T>) => Promise<T>;

function createTaskLimiter(maxConcurrent: number): TaskLimiter {
	let active = 0;
	const waiters: Array<() => void> = [];

	return async <T>(task: () => Promise<T>): Promise<T> => {
		if (active >= maxConcurrent) {
			await new Promise<void>(resolve => waiters.push(resolve));
		}
		active += 1;

		try {
			return await task();
		} finally {
			active -= 1;
			waiters.shift()?.();
		}
	};
}

// Shard pattern: -00001-of-00003.gguf
const SHARD_REGEX = /-(\d{5})-of-(\d{5})\.gguf$/i;
// mmproj pattern
const MMPROJ_REGEX = /mmproj/i;

export async function findMmprojFilePaths(dirPath: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		return entries
			.filter(entry => entry.isFile() && /\.gguf$/i.test(entry.name) && MMPROJ_REGEX.test(entry.name))
			.map(entry => path.join(dirPath, entry.name))
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

function makeModelId(dirPath: string, parentModel: string): string {
	return crypto.createHash('md5').update(`${dirPath}:${parentModel}`).digest('hex').slice(0, 12);
}

// Build IGgufFile for a single .gguf entry, reusing cached metadata where possible
async function buildGgufFile(
	dirPath: string,
	fileName: string,
	cachedFilesByPath: Map<string, IGgufFile>,
	forceFilePaths: ReadonlySet<string>,
	runParseLimited: TaskLimiter,
): Promise<IGgufFile> {
	const filePath = path.join(dirPath, fileName);
	const stat = await fs.stat(filePath);
	const sizeMb = Math.round(stat.size / (1024 * 1024));

	const shardMatch = fileName.match(SHARD_REGEX);
	const shardIndex = shardMatch ? parseInt(shardMatch[1]!, 10) : null;
	const shardTotal = shardMatch ? parseInt(shardMatch[2]!, 10) : null;
	const parentModel = shardMatch ? fileName.replace(SHARD_REGEX, '') : null;

	const isMmproj = MMPROJ_REGEX.test(fileName);

	const cachedFile = cachedFilesByPath.get(filePath);
	const cacheIsCurrent = !forceFilePaths.has(filePath)
		&& cachedFile?.metadata?.parserVersion === GGUF_METADATA_PARSER_VERSION
		&& cachedFile.sizeBytes === stat.size
		&& cachedFile.modifiedAtMs === stat.mtimeMs;
	let metadata = cacheIsCurrent ? cachedFile.metadata : null;

	// Every shard owns a disjoint tensor directory. Parse all of them so the
	// model's exact parameter count can be reconstructed instead of estimating
	// it from the combined byte size.
	if (!isMmproj && !metadata) {
		metadata = await runParseLimited(() => parseGgufMetadata(filePath));
		if (!metadata) metadata = fallbackMetadata(filePath, stat.size);
	}

	return {
		fileName,
		filePath,
		sizeMb,
		sizeBytes: stat.size,
		modifiedAtMs: stat.mtimeMs,
		metadata,
		shardIndex,
		shardTotal,
		isMmproj,
		parentModel,
	};
}

// Keep filename-derived information visible even when a corrupt/incomplete
// file cannot be parsed. parserVersion is deliberately omitted so a later scan
// retries the header rather than making a transient failure sticky in cache.
function fallbackMetadata(filePath: string, fileSize: number): IGgufMetadata {
	return {
		architecture: 'unknown',
		paramCount: extractParamCount('', filePath),
		quantType: inferQuantTypeFromFileName(filePath),
		nLayers: 0,
		nKvHeads: 0,
		embeddingDim: 0,
		feedForwardDim: 0,
		contextLength: 0,
		fileSize,
		vocabSize: 0,
		tensorCount: 0,
	};
}

// Recursively walk a directory, emitting IModels for each shard bundle found
// ancestorMmprojFiles: nearest mmproj set seen on the descent path so far
// userSegment: first dir name under root (null until we descend one level)
async function scanDirRecursive(
	dirPath: string,
	ancestorMmprojFiles: IGgufFile[],
	userSegment: string | null,
	cachedModels: IModel[],
	visitedPaths: Set<string>,
	forceFilePaths: ReadonlySet<string>,
	runParseLimited: TaskLimiter,
): Promise<IModel[]> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch (err) {
		console.error(`[modelScanner] Cannot read ${dirPath}:`, err);
		return [];
	}

	const ggufEntries = entries
		.filter(e => e.isFile() && /\.gguf$/i.test(e.name))
		.sort((a, b) => a.name.localeCompare(b.name));
	const subDirs = entries
		.filter(e => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	const results: IModel[] = [];

	// Build IGgufFile for every gguf in this dir (if any)
	const cachedDirModels = cachedModels.filter(m => m.dirPath === dirPath);
	const cachedFilesByPath = new Map<string, IGgufFile>();
	for (const m of cachedDirModels) {
		for (const f of m.files) cachedFilesByPath.set(f.filePath, f);
	}

	const dirFiles = (await Promise.all(ggufEntries.map(async entry => {
		// A single unreadable/corrupt file must not abort the whole scan
		// (previously one bad file killed the root scan and overwrote the
		// model cache with a partial result).
		try {
			const ggufFile = await buildGgufFile(
				dirPath,
				entry.name,
				cachedFilesByPath,
				forceFilePaths,
				runParseLimited,
			);
			// if (ggufFile.metadata?.architecture === 'whisper') continue;
			return ggufFile;
		} catch (err) {
			console.error(`[modelScanner] Skipping unreadable GGUF ${path.join(dirPath, entry.name)}:`, err instanceof Error ? err.message : err);
			return null;
		}
	}))).filter((file): file is IGgufFile => file !== null);

	// Resolve mmproj candidates for this dir: same-dir wins over the nearest
	// ancestor. Keep every candidate so the launch UI can expose an explicit
	// choice; the first deterministic filename remains the automatic default.
	const sameDirMmprojFiles = dirFiles.filter(f => f.isMmproj);
	const effectiveMmprojFiles = sameDirMmprojFiles.length > 0 ? sameDirMmprojFiles : ancestorMmprojFiles;
	const effectiveMmproj = effectiveMmprojFiles[0] ?? null;

	// Group non-mmproj files in this dir by parentModel and emit IModels
	const modelGroups = new Map<string, IGgufFile[]>();
	for (const file of dirFiles) {
		if (file.isMmproj) continue;
		const key = file.parentModel || file.fileName.replace(/\.gguf$/i, '');
		if (!modelGroups.has(key)) modelGroups.set(key, []);
		modelGroups.get(key)!.push(file);
	}

	for (const [parentModel, groupFiles] of modelGroups) {
		const allGroupFiles = effectiveMmprojFiles.length > 0 ? [...groupFiles, ...effectiveMmprojFiles] : groupFiles;

		const modelFiles = groupFiles;
		const nonShardFiles = modelFiles.filter(f => f.shardIndex === null);
		const firstShards = modelFiles.filter(f => f.shardIndex === 1);

		let primaryFile: IGgufFile | null = null;
		if (nonShardFiles.length > 0) primaryFile = nonShardFiles.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0] ?? null;
		else if (firstShards.length > 0) primaryFile = firstShards[0] ?? null;

		let totalSizeBytes = 0;
		let totalSizeMb = 0;
		if (primaryFile && primaryFile.shardTotal) {
			totalSizeBytes = modelFiles
				.filter(f => f.shardIndex !== null)
				.reduce((sum, f) => sum + (f.sizeBytes ?? f.sizeMb * 1024 * 1024), 0);
		} else if (primaryFile) {
			totalSizeBytes = primaryFile.sizeBytes ?? primaryFile.sizeMb * 1024 * 1024;
		}
		totalSizeMb = Math.round(totalSizeBytes / (1024 * 1024));

		// Exact per-file tensor counts are additive. Only aggregate a shard bundle
		// when every declared shard is present; a partial download must not be
		// presented as the full model size.
		const parameterFiles = primaryFile?.shardTotal
			? modelFiles.filter(file => file.shardIndex !== null)
			: primaryFile ? [primaryFile] : [];
		const expectedFileCount = primaryFile?.shardTotal ?? (primaryFile ? 1 : 0);
		const uniqueShardIndexes = new Set(parameterFiles.map(file => file.shardIndex));
		const completeFileSet = parameterFiles.length === expectedFileCount
			&& (primaryFile?.shardTotal
				? uniqueShardIndexes.size === expectedFileCount
					&& parameterFiles.every(file => (file.shardIndex ?? 0) >= 1 && (file.shardIndex ?? 0) <= expectedFileCount)
				: true);
		const hasExactCounts = completeFileSet && parameterFiles.every(file => {
			const count = file.metadata?.parameterCount;
			return Number.isSafeInteger(count) && (count ?? 0) > 0;
		});

		if (primaryFile?.metadata && hasExactCounts) {
			const exactTotal = parameterFiles.reduce((sum, file) => sum + (file.metadata!.parameterCount ?? 0), 0);
			primaryFile.metadata.paramCount = formatParamCount(exactTotal);
		}

		// When the name carries no size token, fall back to a size-based
		// estimate (total bytes / bits-per-weight of the quant type). The
		// group total is used so multi-shard models estimate from the full
		// size; the "≈" prefix marks the value as approximate.
		if (primaryFile?.metadata && primaryFile.metadata.paramCount === 'unknown' && totalSizeBytes > 0) {
			const estimated = estimateParamCountFromSize(totalSizeBytes, primaryFile.metadata.quantType);
			if (estimated !== 'unknown') primaryFile.metadata.paramCount = estimated;
		}

		const id = makeModelId(dirPath, parentModel);
		const cachedSameId = cachedModels.find(m => m.id === id);

		const model: IModel = {
			id,
			user: userSegment ?? 'unknown',
			name: parentModel,
			dirPath,
			files: allGroupFiles,
			primaryFile,
			mmprojFile: effectiveMmproj,
			totalSizeMb,
			recommendedInferenceParams: cachedSameId?.recommendedInferenceParams,
		};

		results.push(model);
	}

	// Recurse into subdirs (with symlink cycle detection)
	const childMmprojFiles = sameDirMmprojFiles.length > 0 ? sameDirMmprojFiles : ancestorMmprojFiles;

	const childResults = await Promise.all(subDirs.map(async subDir => {
		const childPath = path.join(dirPath, subDir.name);
		const resolvedChildPath = await fs.realpath(childPath).catch(() => childPath);
		if (visitedPaths.has(resolvedChildPath)) return []; // Skip symlink cycle / already-visited dir
		visitedPaths.add(resolvedChildPath);
		const childUserSegment = userSegment ?? subDir.name;
		return scanDirRecursive(
			childPath,
			childMmprojFiles,
			childUserSegment,
			cachedModels,
			visitedPaths,
			forceFilePaths,
			runParseLimited,
		);
	}));
	for (const childModels of childResults) results.push(...childModels);

	return results;
}

// Scan all configured model roots with caching
export async function scanAllModelRoots(
	roots: string[],
	forceFilePaths: ReadonlySet<string> = new Set(),
): Promise<IModel[]> {
	let cachedModels: IModel[] = [];
	try {
		cachedModels = await store.get<IModel[]>(MODELS_CACHE_KEY) ?? [];
	} catch (err) {
		console.warn('[modelScanner] Failed to load cache:', err);
	}

	const beforeCount = cachedModels.length;
	const runParseLimited = createTaskLimiter(MODEL_SCAN_PARSE_CONCURRENCY);

	const rootResults = await Promise.all(roots.map(async root => {
		const visited = new Set<string>();
		try { visited.add(await fs.realpath(root)); } catch { visited.add(path.resolve(root)); }
		return scanDirRecursive(root, [], null, cachedModels, visited, forceFilePaths, runParseLimited);
	}));
	const scanned = rootResults.flat();

	const scannedIds = new Set(scanned.map(m => m.id));
	const removed = cachedModels.filter(m => !scannedIds.has(m.id)).length;

	try {
		await store.put(MODELS_CACHE_KEY, scanned);
		const msg = `[modelScanner] Saved cache: ${scanned.length} models`;
		if (removed > 0) console.log(`${msg} (removed ${removed} from removed directories)`);
		else if (scanned.length !== beforeCount) console.log(`${msg} (${scanned.length - beforeCount} changed)`);
		else console.log(msg);
	} catch (err) {
		console.warn('[modelScanner] Failed to save cache:', err);
	}

	return scanned;
}
