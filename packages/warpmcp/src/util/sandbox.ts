import fs from 'fs';
import path from 'path';

/**
 * Path sandbox used by every filesystem-facing warpmcp tool.
 *
 * Two layers:
 *  1. assertPathAllowed() — the requested target, fully resolved through
 *     symlinks/junctions, must sit inside a fully-resolved allowed root.
 *  2. assertFileSafe() — each ancestor component of the target *below* an
 *     allowed root is re-checked so an intermediate symlink (POSIX) or
 *     junction/reparse point (Windows) cannot smuggle the operation out.
 *
 * Both layers resolve with realpathSync, which follows NTFS junctions and
 * mount points as well as POSIX symlinks. Earlier revisions skipped all of it
 * on win32 assuming link creation needs admin rights: that holds for symlinks
 * but not for `mklink /J` junctions, so the Windows fast path was an escape
 * hatch rather than a guard. Roots that are themselves symlinks (common with
 * mounted workspaces) no longer cause false denials, because containment is
 * compared in real space on both sides.
 */

function realpathOrNull(target: string): string | null {
	try {
		return fs.realpathSync(target);
	} catch {
		return null;
	}
}

/**
 * Resolve `target` to its real path without requiring the whole path to exist:
 * the nearest existing ancestor is resolved and the remaining (not yet created)
 * segments are appended lexically.
 */
function resolveExisting(target: string): { real: string; existed: boolean } {
	const abs = path.resolve(target);
	const tail: string[] = [];
	let cursor = abs;
	for (;;) {
		const resolved = realpathOrNull(cursor);
		if (resolved !== null) {
			return {
				real: tail.length > 0 ? path.join(resolved, ...tail.reverse()) : resolved,
				existed: true,
			};
		}
		const parent = path.dirname(cursor);
		if (parent === cursor) return { real: abs, existed: false };
		tail.push(path.basename(cursor));
		cursor = parent;
	}
}

function isWithin(realRoot: string, realTarget: string): boolean {
	const rel = path.relative(realRoot, realTarget);
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Real (symlink-free) form of every configured root. */
function realRoots(roots: string[]): string[] {
	return roots.map(root => resolveExisting(root).real);
}

/**
 * Checks whether a requested path resolves, after following symlinks and
 * junctions, inside one of the allowed roots. Returns the lexical absolute
 * path so callers keep stable paths for the operation that follows.
 */
export async function assertPathAllowed(roots: string[], requestedPath: string): Promise<string> {
	if (roots.length === 0) {
		throw new Error('No allowed roots configured. Set fsAllowedRoots in settings.');
	}

	const absRequested = path.resolve(requestedPath);
	const realRequested = resolveExisting(absRequested).real;

	for (const realRoot of realRoots(roots)) {
		if (isWithin(realRoot, realRequested)) return absRequested;
	}

	throw new Error(`Path not within any allowed root: ${requestedPath}`);
}

/**
 * Validates that every ancestor component of `filePath` below an allowed root
 * stays inside that root. Components that do not exist yet (a parent directory
 * being created) end the walk; anything else resolving outside aborts.
 */
export function assertFileSafe(roots: string[], filePath: string): void {
	if (roots.length === 0) {
		throw new Error('No allowed roots configured. Set fsAllowedRoots in settings.');
	}

	const absPath = path.resolve(filePath);

	for (const root of roots) {
		const absRoot = path.resolve(root);
		const realRoot = resolveExisting(absRoot).real;

		// Walk the target relative to this root: prefer the lexical view, and
		// fall back to the real view when the root itself is a link (so the
		// walk still covers components below the root instead of skipping them).
		let base = absRoot;
		let target = absPath;
		let rel = path.relative(absRoot, absPath);
		if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
			if (!isWithin(realRoot, resolveExisting(absPath).real)) continue;
			base = realRoot;
			target = resolveExisting(absPath).real;
			rel = path.relative(base, target);
		}
		if (rel === '') continue;

		let cursor = base;
		for (const segment of rel.split(path.sep)) {
			cursor = path.join(cursor, segment);
			const real = realpathOrNull(cursor);
			if (real === null) break; // this component and everything below it don't exist yet
			if (!isWithin(realRoot, real)) {
				throw new Error(`Symlink at '${cursor}' points outside allowed roots`);
			}
		}
		return;
	}
}
