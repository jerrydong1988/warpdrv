import { Router } from 'express';
import { store } from '../util/store';
import { scanAllModelRoots } from '../services/modelScanner';
import { sseManager } from '../services/sseManagerInstance';
import type { ISettings, IModel } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { GGUF_METADATA_PARSER_VERSION } from '../services/ggufParser';

const SETTINGS_KEY = 'settings:general';
const MODELS_KEY = 'models:cache';

// Cached scan results (refreshed on demand)
let cachedModels: IModel[] = [];
let lastScanAt = 0;

// Load cached models from store on startup, or scan if cache is empty
export async function loadCachedModels(): Promise<void> {
	try {
		const cached = await store.get<IModel[]>(MODELS_KEY);
		const cacheNeedsMetadataRefresh = cached?.some(model => model.files.some(file =>
			!file.isMmproj && file.metadata?.parserVersion !== GGUF_METADATA_PARSER_VERSION,
		)) ?? false;
		if (cached && cached.length > 0 && !cacheNeedsMetadataRefresh) {
			cachedModels = cached;
			lastScanAt = Date.now();
			console.log(`[models] Loaded ${cachedModels.length} cached models`);
		} else {
			// No cache, or a parser upgrade made its metadata stale.
			const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
			if (settings.modelRoots.length > 0) {
				console.log(cacheNeedsMetadataRefresh
					? '[models] Metadata cache is stale, rescanning...'
					: '[models] No cache found, scanning...');
				cachedModels = await scanAllModelRoots(settings.modelRoots);
				lastScanAt = Date.now();
				await store.put(MODELS_KEY, cachedModels);
				console.log(`[models] Initial scan complete: ${cachedModels.length} models`);
			} else if (cached && cached.length > 0) {
				cachedModels = cached;
				lastScanAt = Date.now();
			}
		}
	} catch (err) {
		console.warn('[models] Failed to load cached models:', err);
	}
}

export const modelsRouter = Router();

// GET /api/models — list all scanned models
modelsRouter.get('/', async (_req, res) => {
	res.json({ ok: true, data: cachedModels, total: cachedModels.length, error: null });
});

// POST /api/models/scan — trigger a fresh scan of all model roots
modelsRouter.post('/scan', async (_req, res) => {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

	if (settings.modelRoots.length === 0) {
		res.json({ ok: true, data: [], total: 0, error: 'No model directories configured' });
		return;
	}

	const scanned = await rescanAllModels();
	res.json({ ok: true, data: scanned, total: scanned.length, error: null });
});

// Shared scan implementation — used by the HTTP route and the download
// RESCAN_MODELS post-action.
export async function rescanAllModels(forceFilePaths: ReadonlySet<string> = new Set()): Promise<IModel[]> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	if (settings.modelRoots.length === 0) return cachedModels;

	const before = cachedModels.length;
	cachedModels = await scanAllModelRoots(settings.modelRoots, forceFilePaths);
	lastScanAt = Date.now();
	await store.put(MODELS_KEY, cachedModels);

	const changed = cachedModels.length - before;
	const changeMsg = changed > 0 ? ` (+${changed})` : changed < 0 ? ` (${changed})` : '';
	console.log(`[models] Scan complete: ${cachedModels.length} models${changeMsg}`);

	sseManager.emit('models:init', cachedModels);
	return cachedModels;
}

// GET /api/models/scan-status
modelsRouter.get('/scan-status', (_req, res) => {
	res.json({
		ok: true,
		data: {
			modelCount: cachedModels.length,
			lastScanAt,
		},
		error: null,
	});
});

// Expose for other routes to use
export function getCachedModels(): IModel[] {
	return cachedModels;
}

// PUT /api/models/:id - update model metadata (e.g., recommendedInferenceParams)
modelsRouter.put('/:id', async (req, res) => {
	const modelId = req.params.id;
	const updateData = req.body as { recommendedInferenceParams?: string };

	const modelIndex = cachedModels.findIndex(m => m.id === modelId);
	if (modelIndex === -1) {
		res.status(404).json({ ok: false, data: null, error: 'Model not found' });
		return;
	}

	const model = cachedModels[modelIndex];
	const updatedModel = { ...model } as IModel;

	if (updateData.recommendedInferenceParams !== undefined) {
		updatedModel.recommendedInferenceParams = updateData.recommendedInferenceParams;
	}

	cachedModels[modelIndex] = updatedModel;

	// Save updated cache
	try {
		await store.put(MODELS_KEY, cachedModels);
		sseManager.emit('models:update', [updatedModel]);
		res.json({ ok: true, data: updatedModel, error: null });
	} catch (err) {
		console.error('[models] Failed to save updated model:', err);
		res.json({ ok: false, data: null, error: String(err) });
	}
});

modelsRouter.post('/:id/reparse', async (req, res) => {
	const modelId = req.params.id;
	const model = cachedModels.find(m => m.id === modelId);
	if (!model || !model.primaryFile) {
		res.status(404).json({ ok: false, data: null, error: 'Model or primary file not found' });
		return;
	}

	// A split GGUF needs every shard reparsed before its exact parameter count
	// can be reconstructed. Force only this model's files while retaining cache
	// hits for the rest of the configured roots.
	const forceFilePaths = new Set(
		model.files.filter(file => !file.isMmproj).map(file => file.filePath),
	);
	const reparsedModels = await rescanAllModels(forceFilePaths);
	const reparsedModel = reparsedModels.find(candidate => candidate.id === modelId);
	if (!reparsedModel) {
		res.status(404).json({ ok: false, data: null, error: 'Model or primary file not found' });
		return;
	}

	res.json({ ok: true, data: reparsedModel, error: null });
});
