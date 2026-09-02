#!/usr/bin/env node
/**
 * build.mjs — Cross-platform release build of the warpcore server sidecar.
 *
 * Usage:
 *   node scripts/build.mjs [platform] [arch]
 *
 *     platform ∈ { win32, linux, darwin }   (default: process.platform)
 *     arch     ∈ { x64, arm64 }             (default: process.arch)
 *
 * Callers:
 *   - release.sh                                (node scripts/build.mjs <platform> <arch>)
 *   - .github/workflows/windows-msi.yml         (node scripts/build.mjs win32 x64)
 *   - packages/desktop/scripts/prepare.mjs      (node scripts/build.mjs, host defaults)
 *   - Manual: npm run build -w @warpcore/server
 *
 * This single script replaces the three previously duplicated inline blocks
 * (esbuild bundle + @yao-pkg/pkg + runtime dependency copying) that lived in
 * release.sh and windows-msi.yml. The node target is unified to node24 for
 * every platform (previously win: node22, linux: node24, macos: node24).
 *
 * Steps (each fails the whole script with a non-zero exit code):
 *   1. esbuild bundles src/index.ts → dist/server.cjs
 *      (format=cjs, platform=node, target=node24; native addons that ship as
 *      external packages are left as runtime requires).
 *   2. @yao-pkg/pkg packs dist/server.cjs → dist/warpcore-server(.exe)
 *      (target node24-<pkg-platform>-<arch>, GZip compressed).
 *   3. better_sqlite3.node is copied from the hoisted install.
 *   4. .github/scripts/copy-runtime-deps.cjs copies the external runtime
 *      dependencies into dist/node_modules/ and prunes other-platform
 *      onnxruntime binaries for the requested platform/arch.
 *
 * Output layout (unchanged from the previous inline logic):
 *   packages/server/dist/
 *     server.cjs
 *     warpcore-server[.exe]
 *     better_sqlite3.node
 *     node_modules/**
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..', '..');
const DIST_DIR = path.join(SERVER_DIR, 'dist');

const PLATFORMS = new Set(['win32', 'linux', 'darwin']);
const ARCHES = new Set(['x64', 'arm64']);
// @yao-pkg/pkg uses its own platform token ('macos', 'win') unlike Node's.
const PKG_PLATFORM = { win32: 'win', linux: 'linux', darwin: 'macos' };

// Kept external on purpose: these ship as real files under dist/node_modules
// (see copy-runtime-deps.cjs) because pkg cannot snapshot native addons.
const EXTERNALS = [
  'kokoro-js',
  '@huggingface/transformers',
  'onnxruntime-node',
  'tree-sitter',
  'tree-sitter-typescript',
  'tree-sitter-javascript',
  'tree-sitter-python',
  'tree-sitter-rust',
  'tree-sitter-go',
  'tree-sitter-cpp',
  'tree-sitter-java',
  'tree-sitter-php',
  '@node-rs/xxhash',
  'ignore',
];

function fail(message) {
  console.error(`\n[build] ERROR: ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) {
    fail(`Failed to launch ${cmd}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// --- Resolve platform/arch ---------------------------------------------------
const [platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!PLATFORMS.has(platform)) {
  fail(`Unsupported platform '${platform}' (expected one of ${[...PLATFORMS].join(', ')})`);
}
if (!ARCHES.has(arch)) {
  fail(`Unsupported arch '${arch}' (expected one of ${[...ARCHES].join(', ')})`);
}

const pkgTarget = `node24-${PKG_PLATFORM[platform]}-${arch}`;
const binaryName = `warpcore-server${platform === 'win32' ? '.exe' : ''}`;
console.log(`[build] platform=${platform} arch=${arch} pkgTarget=${pkgTarget}`);
console.log(`[build] server=${SERVER_DIR}`);

// Make the relative paths below independent of the caller's cwd.
process.chdir(SERVER_DIR);

// --- Clean output (drop stale artifacts from previous platform/arch runs) ----
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// --- 1. esbuild bundle -------------------------------------------------------
console.log('[build] Bundling src/index.ts -> dist/server.cjs (esbuild, target node24)');
try {
  await require('esbuild').build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: path.join(DIST_DIR, 'server.cjs'),
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    minify: false,
    external: EXTERNALS,
    logLevel: 'info',
  });
} catch (error) {
  console.error(error);
  fail('esbuild bundling failed');
}

// --- 2. Package standalone binary with @yao-pkg/pkg --------------------------
console.log(`[build] Packaging dist/warpcore-server${platform === 'win32' ? '.exe' : ''} (pkg, ${pkgTarget})`);
try {
  await require('@yao-pkg/pkg').exec([
    path.join(DIST_DIR, 'server.cjs'),
    '--target', pkgTarget,
    '--output', path.join(DIST_DIR, binaryName),
    '--compress', 'GZip',
  ]);
} catch (error) {
  console.error(error);
  fail(`@yao-pkg/pkg failed for target ${pkgTarget}`);
}

// --- 3. better_sqlite3.node --------------------------------------------------
const sqliteCandidates = [
  path.join(REPO_ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  path.join(SERVER_DIR, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
];
const sqliteNode = sqliteCandidates.find((p) => fs.existsSync(p));
if (!sqliteNode) {
  fail('better_sqlite3.node not found under node_modules/better-sqlite3/build/Release — install dependencies first (npm ci).');
}
fs.copyFileSync(sqliteNode, path.join(DIST_DIR, 'better_sqlite3.node'));
console.log(`[build] Copied ${sqliteNode} -> dist/better_sqlite3.node`);

// --- 4. Runtime dependencies -------------------------------------------------
const copyDepsScript = path.join(REPO_ROOT, '.github', 'scripts', 'copy-runtime-deps.cjs');
if (!fs.existsSync(copyDepsScript)) {
  fail(`Missing runtime dependency copy script: ${copyDepsScript}`);
}
console.log(`[build] Copying runtime dependencies (${copyDepsScript} ${platform} ${arch})`);
run(process.execPath, [copyDepsScript, platform, arch]);

console.log(`[build] Done: ${path.join(DIST_DIR, binaryName)}`);
