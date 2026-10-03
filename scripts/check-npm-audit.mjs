import { spawnSync } from "node:child_process";

const minimumSeverity = "moderate";
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

// npm currently reports every published version of `braces` as vulnerable,
// so there is no non-breaking version that the dependency graph can select.
// The affected paths are build-time tools which only receive repository-owned
// glob patterns. Keep this exception narrow and time-bound so a patched release
// is adopted instead of silently accumulating permanent audit debt.
const auditAllowlist = new Map([
	[
		"GHSA-vfj7-8cjw-p6xm",
		{
			expires: "2026-11-03",
			reason: "No patched braces release; affected build tools process trusted project globs only.",
		},
	],
]);

const npmArgs = [
	"audit",
	"--json",
	`--audit-level=${minimumSeverity}`,
	"--registry=https://registry.npmjs.org",
];
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const args = npmExecPath ? [npmExecPath, ...npmArgs] : npmArgs;
const result = spawnSync(command, args, { encoding: "utf8" });

if (result.error) {
	console.error(`Unable to run npm audit: ${result.error.message}`);
	process.exit(1);
}

let report;
try {
	report = JSON.parse(result.stdout || "{}");
} catch (error) {
	console.error("npm audit did not return valid JSON.");
	if (result.stderr) console.error(result.stderr.trim());
	console.error(error);
	process.exit(1);
}

if (report.error) {
	console.error(
		`npm audit failed: ${report.error.summary || report.error.message || "unknown error"}`,
	);
	process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const minimumRank = severityRank[minimumSeverity];
const memo = new Map();
const visiting = new Set();

function advisoryId(via) {
	if (typeof via?.url !== "string") return null;
	return via.url.split("/").filter(Boolean).at(-1) ?? null;
}

function activeAllowlistEntry(via) {
	const id = advisoryId(via);
	if (!id) return null;
	const entry = auditAllowlist.get(id);
	if (!entry) return null;
	const expiresAt = Date.parse(`${entry.expires}T23:59:59Z`);
	return Date.now() <= expiresAt ? { id, ...entry } : null;
}

function isFullyAllowlisted(packageName) {
	if (memo.has(packageName)) return memo.get(packageName);
	if (visiting.has(packageName)) return false;

	const vulnerability = vulnerabilities[packageName];
	if (!vulnerability) return false;
	if ((severityRank[vulnerability.severity] ?? 0) < minimumRank) return true;
	if (!Array.isArray(vulnerability.via) || vulnerability.via.length === 0) return false;

	visiting.add(packageName);
	const allowed = vulnerability.via.every((via) =>
		typeof via === "string" ? isFullyAllowlisted(via) : activeAllowlistEntry(via) !== null,
	);
	visiting.delete(packageName);
	memo.set(packageName, allowed);
	return allowed;
}

const relevantPackages = Object.keys(vulnerabilities).filter(
	(packageName) => (severityRank[vulnerabilities[packageName]?.severity] ?? 0) >= minimumRank,
);
const blockingPackages = relevantPackages.filter((packageName) => !isFullyAllowlisted(packageName));

if (blockingPackages.length > 0) {
	console.error(
		`npm audit found ${blockingPackages.length} non-allowlisted ${minimumSeverity}-or-higher vulnerable package(s):`,
	);
	for (const packageName of blockingPackages.sort()) {
		const vulnerability = vulnerabilities[packageName];
		const advisoryUrls = (vulnerability.via ?? [])
			.filter((via) => typeof via !== "string")
			.map((via) => via.url)
			.filter(Boolean);
		console.error(
			`- ${packageName} (${vulnerability.severity})${advisoryUrls.length ? `: ${advisoryUrls.join(", ")}` : ""}`,
		);
	}
	process.exit(1);
}

const allowedEntries = [...auditAllowlist.entries()]
	.map(([id, entry]) => ({ id, ...entry }))
	.filter((entry) =>
		Object.values(vulnerabilities).some((vulnerability) =>
			(vulnerability.via ?? []).some(
				(via) => typeof via !== "string" && advisoryId(via) === entry.id,
			),
		),
	);

if (allowedEntries.length === 0) {
	console.log(`npm audit passed at severity >= ${minimumSeverity}.`);
} else {
	console.warn(`npm audit passed with ${allowedEntries.length} temporary advisory exception(s):`);
	for (const entry of allowedEntries) {
		console.warn(`- ${entry.id} until ${entry.expires}: ${entry.reason}`);
	}
}
