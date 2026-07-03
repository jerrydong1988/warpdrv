import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import { I18nErrorCode } from '@warpcore/shared';
import type { IPreset, IPresetCreatePayload } from '@warpcore/shared';

const PREFIX = 'presets:';

export const presetsRouter = Router();

// GET /api/presets
presetsRouter.get('/', async (_req, res) => {
	const presets = await store.list<IPreset>(PREFIX);
	res.json({ ok: true, data: presets, total: presets.length, error: null });
});

// POST /api/presets
presetsRouter.post('/', async (req, res) => {
	const payload = req.body as IPresetCreatePayload;

	if (!payload.name?.trim()) {
		res.status(400).json({ ok: false, data: null, error: I18nErrorCode.NAME_REQUIRED });
		return;
	}

	const id = crypto.randomBytes(6).toString('hex');

	const preset: IPreset = {
		id,
		name: payload.name.trim(),
		backendId: payload.backendId,
		modelPath: payload.modelPath,
		mmprojPath: payload.mmprojPath,
		params: payload.params,
		createdAt: Date.now(),
	};

	await store.put(PREFIX + id, preset);
	res.status(201).json({ ok: true, data: preset, error: null });
});

// DELETE /api/presets/:id
presetsRouter.delete('/:id', async (req, res) => {
	const existing = await store.get<IPreset>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: I18nErrorCode.PRESET_NOT_FOUND });
		return;
	}
	await store.del(PREFIX + req.params.id);
	res.json({ ok: true, data: null, error: null });
});
