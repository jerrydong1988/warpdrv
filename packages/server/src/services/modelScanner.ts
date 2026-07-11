import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { IModel, IGgufFile } from '@warpcore/shared';
import { parseGgufMetadata } from './ggufParser';
import { store } from '../util/store';
import { Dirent } from 'fs';

const MODELS_CACHE_KEY = 'models:cache';
const MAX_SCAN_DEPTH = 20;

// Shard pattern: -00001-of-00003.gguf
const SHARD_REGEX = /-(\d{5})-of-(\d{5})\.gguf$/i;
// mmproj pattern
const MMPROJ_REGEX = /mmproj/i;

function makeModelId(dirPath: string, parentModel: string): string {
	return crypto.createHash('md5').update(`${dirPath}:${parentModel}`).digest('hex').slice(0, 12);
}

// Build IGgufFile for a single .gguf entry, reusing cached metadata where possible
async function buildGgufFile(
	dirPath: string,
	fileName: string,
	cachedFilesByPath: Map<string, IGgufFile>,
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
	let metadata = cachedFile?.metadata ?? null;

	const shouldParse = !isMmproj && (shardIndex === null || shardIndex === 1);
	if (shouldParse && !metadata) metadata = await parseGgufMetadata(filePath);

	return {
		fileName,
		filePath,
		sizeMb,
		metadata,
		shardIndex,
		shardTotal,
		isMmproj,
		parentModel,
	};
}

interface ScanEntry {
	dirPath: string;
	depth: number;
	ancestorMmproj: IGgufFile | null;
	userSegment: string | null;
}

// Iteratively walk directories using a queue to avoid stack overflow
async function scanDirIterative(
	rootPath: string,
	cachedModels: IModel[],
): Promise<IModel[]> {
	const queue: ScanEntry[] = [{ dirPath: rootPath, depth: 0, ancestorMmproj: null, userSegment: null }];
	const results: IModel[] = [];

	while (queue.length > 0) {
		const { dirPath, depth, ancestorMmproj, userSegment } = queue.shift()!;

		if (depth > MAX_SCAN_DEPTH) {
			console.warn(`[modelScanner] Max scan depth (${MAX_SCAN_DEPTH}) exceeded at ${dirPath}, stopping recursion`);
			continue;
		}

		let entries: Dirent[];
		try {
			entries = await fs.readdir(dirPath, { withFileTypes: true });
		} catch (err) {
			console.error(`[modelScanner] Cannot read ${dirPath}:`, err);
			continue;
		}

		const ggufEntries = entries.filter(e => e.isFile() && e.name.endsWith('.gguf'));
		const subDirs = entries.filter(e => e.isDirectory());

		// Build IGgufFile for every gguf in this dir (if any)
		const cachedDirModels = cachedModels.filter(m => m.dirPath === dirPath);
		const cachedFilesByPath = new Map<string, IGgufFile>();
		for (const m of cachedDirModels) {
			for (const f of m.files) cachedFilesByPath.set(f.filePath, f);
		}

		const dirFiles: IGgufFile[] = [];
		for (const entry of ggufEntries) {
			const ggufFile = await buildGgufFile(dirPath, entry.name, cachedFilesByPath);
			dirFiles.push(ggufFile);
		}

		// Resolve mmproj for this dir: same-dir wins over ancestor
		const sameDirMmproj = dirFiles.find(f => f.isMmproj) ?? null;
		const effectiveMmproj = sameDirMmproj ?? ancestorMmproj;

		// Group non-mmproj files in this dir by parentModel and emit IModels
		const modelGroups = new Map<string, IGgufFile[]>();
		for (const file of dirFiles) {
			if (file.isMmproj) continue;
			const key = file.parentModel || file.fileName.replace(/\.gguf$/i, '');
			if (!modelGroups.has(key)) modelGroups.set(key, []);
			modelGroups.get(key)!.push(file);
		}

		for (const [parentModel, groupFiles] of modelGroups) {
			const allGroupFiles = effectiveMmproj ? [...groupFiles, effectiveMmproj] : groupFiles;

			const modelFiles = groupFiles;
			const nonShardFiles = modelFiles.filter(f => f.shardIndex === null);
			const firstShards = modelFiles.filter(f => f.shardIndex === 1);

			let primaryFile: IGgufFile | null = null;
			if (nonShardFiles.length > 0) primaryFile = nonShardFiles.sort((a, b) => b.sizeMb - a.sizeMb)[0] ?? null;
			else if (firstShards.length > 0) primaryFile = firstShards[0] ?? null;

			let totalSizeMb = 0;
			if (primaryFile && primaryFile.shardTotal) {
				totalSizeMb = modelFiles.filter(f => f.shardIndex !== null).reduce((sum, f) => sum + f.sizeMb, 0);
			} else if (primaryFile) {
				totalSizeMb = primaryFile.sizeMb;
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

		// Queue subdirs for processing
		const childMmproj = sameDirMmproj ?? ancestorMmproj;
		for (const subDir of subDirs) {
			const childPath = path.join(dirPath, subDir.name);
			const childUserSegment = userSegment ?? subDir.name;
			queue.push({
				dirPath: childPath,
				depth: depth + 1,
				ancestorMmproj: childMmproj,
				userSegment: childUserSegment,
			});
		}
	}

	return results;
}

// Scan all configured model roots with caching
export async function scanAllModelRoots(roots: string[]): Promise<IModel[]> {
	let cachedModels: IModel[] = [];
	try {
		cachedModels = await store.get<IModel[]>(MODELS_CACHE_KEY) ?? [];
	} catch (err) {
		console.warn('[modelScanner] Failed to load cache:', err);
	}

	const beforeCount = cachedModels.length;

	const scanned: IModel[] = [];
	for (const root of roots) {
		const models = await scanDirIterative(root, cachedModels);
		scanned.push(...models);
	}

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
