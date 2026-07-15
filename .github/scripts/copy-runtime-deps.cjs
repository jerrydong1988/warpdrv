const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const rootNodeModules = path.join(repoRoot, 'node_modules');
const outputRoot = path.join(repoRoot, 'packages', 'server', 'dist', 'node_modules');
const targetOs = process.argv[2];
const targetArch = process.argv[3];
const visited = new Set();

function resolvePackageDir(name, fromDir) {
	let current = fromDir;
	while (true) {
		const candidate = path.join(current, 'node_modules', name);
		if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function copyEntry(source, destination) {
	const stats = fs.statSync(source);
	if (stats.isDirectory()) {
		fs.mkdirSync(destination, { recursive: true });
		for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
			if (entry.name === 'node_modules') continue;
			copyEntry(path.join(source, entry.name), path.join(destination, entry.name));
		}
		return;
	}
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.copyFileSync(source, destination);
}

function copyPackage(packageDir, packageName) {
	const realPackageDir = fs.realpathSync(packageDir);
	if (visited.has(realPackageDir)) return;
	visited.add(realPackageDir);

	const manifestPath = path.join(realPackageDir, 'package.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	copyEntry(realPackageDir, path.join(outputRoot, packageName));

	for (const dependencyName of Object.keys(manifest.dependencies || {})) {
		const dependencyDir = resolvePackageDir(dependencyName, realPackageDir);
		if (!dependencyDir) {
			throw new Error(`Cannot resolve runtime dependency ${dependencyName} from ${packageName}`);
		}
		copyPackage(dependencyDir, dependencyName);
	}
	for (const dependencyName of Object.keys(manifest.optionalDependencies || {})) {
		const dependencyDir = resolvePackageDir(dependencyName, realPackageDir);
		if (dependencyDir) copyPackage(dependencyDir, dependencyName);
	}
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const packageName of ['kokoro-js', '@huggingface/transformers', 'onnxruntime-node', 'sharp']) {
	const packageDir = path.join(rootNodeModules, packageName);
	if (!fs.existsSync(path.join(packageDir, 'package.json'))) {
		throw new Error(`Missing required runtime package: ${packageName}`);
	}
	copyPackage(packageDir, packageName);
}

if (targetOs && targetArch) {
	const napiRoot = path.join(outputRoot, 'onnxruntime-node', 'bin', 'napi-v3');
	if (fs.existsSync(napiRoot)) {
		for (const osName of fs.readdirSync(napiRoot)) {
			const osPath = path.join(napiRoot, osName);
			if (fs.statSync(osPath).isDirectory() && osName !== targetOs) {
				fs.rmSync(osPath, { recursive: true, force: true });
			}
		}
		const targetOsPath = path.join(napiRoot, targetOs);
		if (fs.existsSync(targetOsPath)) {
			for (const archName of fs.readdirSync(targetOsPath)) {
				const archPath = path.join(targetOsPath, archName);
				if (fs.statSync(archPath).isDirectory() && archName !== targetArch) {
					fs.rmSync(archPath, { recursive: true, force: true });
				}
			}
		}
	}
}

console.log(`Copied ${visited.size} runtime packages to ${outputRoot}`);
