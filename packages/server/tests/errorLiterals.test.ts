// Guards the server → client error translation contract: every static error
// string the server can send must be covered by the app locale errors.* keys,
// which translateServerError() matches by exact text or prefix.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(testsDirectory, '..', 'src');
const enCommonPath = path.resolve(testsDirectory, '..', '..', 'app', 'src', 'i18n', 'locales', 'en', 'common.json');
const repoRoot = path.resolve(testsDirectory, '..', '..');

interface TErrorOccurrence {
	file: string;
	literal: string;
}

function walk(directory: string): string[] {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(fullPath) : [fullPath];
	});
}

function collectErrorLiterals(): TErrorOccurrence[] {
	const occurrences: TErrorOccurrence[] = [];
	for (const filePath of walk(serverRoot).filter((file) => file.endsWith('.ts'))) {
		const source = fs.readFileSync(filePath, 'utf8');
		const relative = path.relative(repoRoot, filePath).replace(/\\/g, '/');
		const patterns: RegExp[] = [/error:\s*'([^'\n]*)'/g, /error:\s*`((?:[^`\\]|\\.)*)`/gs];
		for (const regex of patterns) {
			let match: RegExpExecArray | null;
			while ((match = regex.exec(source)) !== null) {
				occurrences.push({ file: relative, literal: match[1] });
			}
		}
	}
	return occurrences;
}

function errorValues(): string[] {
	const parsed = JSON.parse(fs.readFileSync(enCommonPath, 'utf8')) as { errors?: Record<string, unknown> };
	return Object.values(parsed.errors ?? {}).filter(
		(value): value is string => typeof value === 'string' && value.length > 0,
	);
}

describe('server error literals are covered by app locale errors.* keys', () => {
	const values = errorValues();
	const occurrences = collectErrorLiterals();
	// Upstream 0.6.x consolidated several routes and currently exposes 44
	// statically-scannable literals. Keep a floor high enough to catch a broken
	// scanner while validating every literal below instead of pinning old volume.
	expect(occurrences.length).toBeGreaterThanOrEqual(40);

	for (const { file, literal } of occurrences) {
		// For template literals only the static segment before the first ${}
		// is translatable; translateServerError() matches it by prefix.
		const staticPrefix = literal.split('${')[0];
		it(`covers ${JSON.stringify(staticPrefix)} in ${file}`, () => {
			expect(
				values.some((value) => value === staticPrefix || staticPrefix.startsWith(value)),
				`no errors.* value matches or prefixes ${JSON.stringify(staticPrefix)} (${file})`,
			).toBe(true);
		});
	}
});
