import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'eslint-warning-baseline.json');
const targets = [
	'packages/shared/src',
	'packages/realmcore/src',
	'packages/bridge/src',
	'packages/server/src',
	'packages/app/src',
	'packages/warpmcp/src',
];

function warningCounts(results) {
	const byFile = {};
	const byRule = {};
	let total = 0;

	for (const result of results) {
		const relativeFile = path.relative(repoRoot, result.filePath).replaceAll(path.sep, '/');
		for (const message of result.messages) {
			if (message.severity !== 1) continue;
			const rule = message.ruleId ?? '<unclassified>';
			byFile[relativeFile] ??= {};
			byFile[relativeFile][rule] = (byFile[relativeFile][rule] ?? 0) + 1;
			byRule[rule] = (byRule[rule] ?? 0) + 1;
			total += 1;
		}
	}

	const sortRecord = (record) => Object.fromEntries(
		Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
	);
	return {
		total,
		byRule: sortRecord(byRule),
		byFile: Object.fromEntries(
			Object.entries(byFile)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([file, counts]) => [file, sortRecord(counts)]),
		),
	};
}

const eslint = new ESLint({ cwd: repoRoot });
const results = await eslint.lintFiles(targets);
const formatter = await eslint.loadFormatter('stylish');
const formatted = formatter.format(results);
if (formatted) process.stdout.write(formatted);

const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
if (errorCount > 0) {
	console.error(`ESLint reported ${errorCount} error(s).`);
	process.exit(1);
}

const current = warningCounts(results);
if (process.argv.includes('--write-baseline')) {
	await fs.writeFile(
		baselinePath,
		`${JSON.stringify({ version: 1, ...current }, null, '\t')}\n`,
		'utf8',
	);
	console.log(`Recorded ${current.total} ESLint warnings in ${path.relative(repoRoot, baselinePath)}.`);
	process.exit(0);
}

const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const regressions = [];
if (current.total > baseline.total) {
	regressions.push(`total warnings: ${current.total} > ${baseline.total}`);
}

for (const [file, counts] of Object.entries(current.byFile)) {
	for (const [rule, count] of Object.entries(counts)) {
		const allowed = baseline.byFile?.[file]?.[rule] ?? 0;
		if (count > allowed) regressions.push(`${file} ${rule}: ${count} > ${allowed}`);
	}
}

if (regressions.length > 0) {
	console.error('\nESLint warning baseline regressed:');
	for (const regression of regressions) console.error(`- ${regression}`);
	console.error('Fix the warnings. Update the baseline only when an intentional upstream sync requires review.');
	process.exit(1);
}

console.log(`ESLint baseline passed: ${current.total}/${baseline.total} warnings.`);
