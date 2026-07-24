import { Router } from 'express';
import { nanoid } from 'nanoid';
import { listModes, putMode, deleteMode, getMode } from '../services/modeStore';
import { sseManager } from '../services/sseManagerInstance';
import type { IMode, IModeCreatePayload } from '@warpcore/shared';

export const modesRouter = Router();

// POST /api/modes
modesRouter.post('/', async (req, res) => {
	try {
		const body = req.body as IModeCreatePayload;
		const mode: IMode = {
			id: nanoid(6),
			name: body.name,
			scope: body.scope,
			prompt: body.prompt || undefined,
			allowedTools: body.allowedTools || [],
		};
		await putMode(mode);
		sseManager.emit('modes:update', mode);
		res.json({ ok: true, data: mode, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/modes/:id
modesRouter.delete('/:id', async (req, res) => {
	try {
		const existing = await getMode(req.params.id);
		if (!existing) {
			res.status(404).json({ ok: false, data: null, error: 'Mode not found' });
			return;
		}
		await deleteMode(req.params.id);
		sseManager.emit('modes:delete', existing);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});
