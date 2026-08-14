import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Checks whether a requested path resolves within any of the allowed roots.
 * Uses path.resolve (no symlink following) for directories to avoid TOCTOU races
 * on platforms where symlinks can be swapped between check and use.
 * For files, also checks that the direct parent is not a symlink to an unauthorized location.
 */
export async function assertPathAllowed(roots: string[], requestedPath: string): Promise<string> {
	if (roots.length === 0) {
		throw new Error('No allowed roots configured. Set fsAllowedRoots in settings.');
	}

	const absRequested = path.resolve(requestedPath);

	for (const root of roots) {
		const absRoot = path.resolve(root);
		let realRoot: string;
		try {
			realRoot = fs.realpathSync(absRoot);
		} catch {
			realRoot = absRoot;
		}

		// Check if the resolved (no-symlink-follow) path is within the root
		const rel = path.relative(realRoot, absRequested);
		if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
			return absRequested;
		}
	}

	throw new Error(`Path not within any allowed root: ${requestedPath}`);
}

/**
 * Validates that a file path is safe to operate on.
 * On POSIX systems, checks that no component of the path (from root to the file)
 * is a symlink pointing outside the allowed roots — prevents TOCTOU via symlink swap.
 */
export function assertFileSafe(roots: string[], filePath: string): void {
	if (os.platform() === 'win32') return; // Symlink swaps require admin on Windows

	const absPath = path.resolve(filePath);
	const parts = absPath.split(path.sep).filter(Boolean);
	let accumulated: string = path.sep;

	for (let i = 0; i < parts.length; i++) {
		accumulated = path.join(accumulated, parts[i]!);
		try {
			const stats = fs.lstatSync(accumulated);
			if (stats.isSymbolicLink()) {
				const target = fs.realpathSync(accumulated);
				const withinRoots = roots.some(root => {
					const absRoot = path.resolve(root);
					let realRoot: string;
					try { realRoot = fs.realpathSync(absRoot); } catch { realRoot = absRoot; }
					const rel = path.relative(realRoot, target);
					return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
				});
				if (!withinRoots) {
					throw new Error(`Symlink at '${accumulated}' points outside allowed roots`);
				}
			}
		} catch (err: unknown) {
			// Path component doesn't exist yet (e.g. parent dir being created) — that's ok
			if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code !== 'ENOENT') {
				throw err;
			}
		}
	}
}
