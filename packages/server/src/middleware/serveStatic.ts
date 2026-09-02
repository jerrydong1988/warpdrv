import express from 'express';
import path from 'path';
import fs from 'fs';
import { store } from '../util/store';
import { isRemote } from './auth';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';

async function getSettings(): Promise<ISettings> {
	return (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}

export function serveStaticApp(app: express.Express): void {
	const candidates = [
		process.env.WARPCORE_RESOURCE_DIR ? path.join(process.env.WARPCORE_RESOURCE_DIR, 'app-dist') : '',
		path.join(path.dirname(process.execPath), 'app-dist'),
		path.join(process.cwd(), 'app-dist'),
		path.join(process.cwd(), '..', 'app', 'dist'),
	].filter(Boolean);

	let staticDir: string | null = null;
	for (const dir of candidates) {
		const resolved = path.resolve(dir);
		if (fs.existsSync(path.join(resolved, 'index.html'))) {
			staticDir = resolved;
			break;
		}
	}

	if (!staticDir) {
		console.log('[WarpCore] No frontend build found — API only mode');
		console.log('[WarpCore] WARPCORE_RESOURCE_DIR:', process.env.WARPCORE_RESOURCE_DIR);
		console.log('[WarpCore] execPath:', process.execPath);
		console.log('[WarpCore] cwd:', process.cwd());
		return;
	}

	console.log(`[WarpCore] Serving frontend from ${staticDir}`);

	// Security headers for the production frontend. The desktop window loads
	// this origin (http://localhost:<port>), so the Tauri CSP from
	// tauri.conf.json does not apply here — this header is the real CSP.
	// Notes:
	//  * 'wasm-unsafe-eval' is required by onnxruntime-web / VAD (WebAssembly).
	//  * The sha256 entry allows the single inline platform-detection script
	//    in index.html; regenerate it if that script changes.
	//  * style-src keeps 'unsafe-inline' for the inline critical CSS in
	//    index.html and emotion/Chakra runtime style tags.
	const CSP_HEADER = [
		"default-src 'self'",
		"script-src 'self' 'wasm-unsafe-eval' 'sha256-2atInzy1c/37fklkSMDxOMKoiYONqTrq9KxIzphJ+Kw='",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com",
		"img-src 'self' data: blob: https:",
		"media-src 'self' blob: data:",
		"connect-src 'self' ws: wss:",
		"worker-src 'self' blob:",
		"child-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; ');

	app.use((req, res, next) => {
		res.setHeader('Content-Security-Policy', CSP_HEADER);
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.setHeader('Referrer-Policy', 'no-referrer');
		next();
	});

	app.use(express.static(staticDir, { index: 'index.html' }));

	// SPA fallback with auth check
	app.use(async (req, res, next) => {
		if (req.path.startsWith('/api')) return next();

		// Check if auth is required (remote request + auth enabled)
		const settings = await getSettings();
		if (isRemote(req) && settings.apiAuthEnabled) {
			// Redirect to root - React app will show login via AuthProvider
			return res.redirect('/');
		}

		res.sendFile(path.join(staticDir!, 'index.html'));
	});
}
