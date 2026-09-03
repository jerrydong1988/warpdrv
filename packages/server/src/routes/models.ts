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
let pendingStartupRefreshReason: 'missing' | 'stale' | null = null;
let activeRescan: Promise<IModel[]> | null = null;
let scanStartedAt = 0;
let lastScanError: string | null = null;

// Hydrate immediately from disk on startup. A missing or stale cache is
// refreshed only after the HTTP listener is ready, so a large GGUF library
// never blocks the desktop shell while it waits for the control API port.
export async function loadCachedModels(): Promise<void> {
	pendingStartupRefreshReason = null;
	try {
		const cached = await store.get<IModel[]>(MODELS_KEY);
		const cacheNeedsMetadataRefresh = cached?.some(model => model.files.some(file =>
			!file.isMmproj && file.metadata?.parserVersion !== GGUF_METADATA_PARSER_VERSION,
		)) ?? false;

		if (cached && cached.length > 0) {
			cachedModels = cached;
			lastScanAt = Date.now();
			console.log(`[models] Loaded ${cachedModels.length} cached models${cacheNeedsMetadataRefresh ? ' (metadata refresh pending)' : ''}`);
		} else {
			cachedModels = [];
			lastScanAt = 0;
		}

		if (!cached?.length || cacheNeedsMetadataRefresh) {
			const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
			if (settings.modelRoots.length > 0) {
				pendingStartupRefreshReason = cacheNeedsMetadataRefresh ? 'stale' : 'missing';
			}
		}
	} catch (err) {
		console.warn('[models] Failed to load cached models:', err);
	}
}

// Called after httpServer.listen(). The returned promise is intentionally safe
// to run in the background; callers may await it in tests or maintenance tools.
export async function startPendingModelRefresh(): Promise<IModel[] | null> {
	const reason = pendingStartupRefreshReason;
	if (!reason) return null;
	pendingStartupRefreshReason = null;
	console.log(reason === 'stale'
		? '[models] Refreshing stale metadata cache in the background...'
		: '[models] Building initial model cache in the background...');

	try {
		return await rescanAllModels();
	} catch (err) {
		pendingStartupRefreshReason = reason;
		throw err;
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
async function performRescanAllModels(forceFilePaths: ReadonlySet<string>): Promise<IModel[]> {
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

export function rescanAllModels(forceFilePaths: ReadonlySet<string> = new Set()): Promise<IModel[]> {
	// Ordinary refreshes share the current scan. A forced reparse queues behind
	// it so the explicit user request is not lost.
	if (activeRescan && forceFilePaths.size === 0) return activeRescan;

	const previousScan = activeRescan;
	const scan = (async () => {
		if (previousScan) {
			try {
				await previousScan;
			} catch {
				// A forced reparse should still get its own attempt.
			}
		}
		lastScanError = null;
		return performRescanAllModels(forceFilePaths);
	})();

	activeRescan = scan;
	if (scanStartedAt === 0) scanStartedAt = Date.now();
	void scan.then(
		() => {
			if (activeRescan === scan) {
				activeRescan = null;
				scanStartedAt = 0;
			}
		},
		(err: unknown) => {
			lastScanError = err instanceof Error ? err.message : String(err);
			if (activeRescan === scan) {
				activeRescan = null;
				scanStartedAt = 0;
			}
		},
	);
	return scan;
}

// GET /api/models/scan-status
modelsRouter.get('/scan-status', (_req, res) => {
	res.json({
		ok: true,
		data: {
			modelCount: cachedModels.length,
			lastScanAt,
			isScanning: activeRescan !== null,
			scanStartedAt,
			lastScanError,
			refreshPending: pendingStartupRefreshReason !== null,
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
