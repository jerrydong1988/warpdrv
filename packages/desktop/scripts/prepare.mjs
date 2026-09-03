#!/usr/bin/env node
/**
 * prepare.mjs — Reproducible pre-build step for the Tauri desktop app.
 *
 * Previously `npm run build:desktop` on a clean checkout failed because
 * packages/desktop/binaries/ and packages/desktop/app-dist/ are gitignored
 * and nothing produced them. This script builds and stages everything the
 * Tauri bundle step needs, so `npm run build -w @warpcore/desktop` is
 * self-contained:
 *
 *   1. npm run build -w @warpcore/app          → packages/app/dist
 *      (app build script: tsc -b && vite build)
 *   2. node scripts/build.mjs (in packages/server, host platform/arch)
 *                                              → packages/server/dist
 *   3. packages/server/dist/warpcore-server(.exe)
 *        → packages/desktop/binaries/warpcore-server-<rustc host triple>(.exe)
 *   4. packages/server/dist/better_sqlite3.node and dist/node_modules/**
 *        → packages/desktop/binaries/
 *   5. packages/app/dist → packages/desktop/app-dist/ (cleared first)
 *
 * Callers:
 *   - npm run prepare:binaries -w @warpcore/desktop  (npm execs this file)
 *   - the desktop package's `build` script (prepare:binaries && cargo tauri build)
 *   - manually: node scripts/prepare.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const SERVER_DIR = path.join(REPO_ROOT, 'packages', 'server');
const APP_DIR = path.join(REPO_ROOT, 'packages', 'app');
const BINARIES_DIR = path.join(DESKTOP_DIR, 'binaries');
const APP_DIST = path.join(DESKTOP_DIR, 'app-dist');

function fail(message) {
  console.error(`\n[prepare] ERROR: ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  console.log(`\n[prepare] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) {
    fail(`Failed to launch ${cmd}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

// --- 1. Frontend ---------------------------------------------------------------
// When npm launches this script it exposes its CLI entrypoint. Invoking that
// entrypoint through Node avoids both npm.cmd spawning restrictions and shell
// argument concatenation on Windows.
const npmExecPath = process.env.npm_execpath;
if (npmExecPath) {
  run(process.execPath, [npmExecPath, 'run', 'build', '-w', '@warpcore/app'], { cwd: REPO_ROOT });
} else {
  run('npm', ['run', 'build', '-w', '@warpcore/app'], {
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
  });
}

// --- 2. Server sidecar (host platform/arch defaults) ---------------------------
run(process.execPath, ['scripts/build.mjs'], { cwd: SERVER_DIR });

// --- 3. rustc host triple (sidecar filename convention from tauri.conf.json) ---
let triple = runCapture('rustc', ['--print', 'host-tuple']);
if (!triple) {
  const verbose = runCapture('rustc', ['-vV']);
  const hostLine = verbose
    ? verbose.split(/\r?\n/).find((line) => line.startsWith('host: '))
    : null;
  triple = hostLine ? hostLine.slice('host: '.length).trim() : null;
}
if (!triple) {
  fail('Could not determine the rustc host triple (is rustc installed?).');
}
console.log(`\n[prepare] rustc host triple: ${triple}`);

// --- 4. Stage sidecar + runtime deps into binaries/ ----------------------------
const ext = process.platform === 'win32' ? '.exe' : '';
const serverBinary = path.join(SERVER_DIR, 'dist', `warpcore-server${ext}`);
const sqliteNode = path.join(SERVER_DIR, 'dist', 'better_sqlite3.node');
const serverNodeModules = path.join(SERVER_DIR, 'dist', 'node_modules');

for (const [label, src] of [
  ['server binary', serverBinary],
  ['better_sqlite3.node', sqliteNode],
  ['runtime deps', serverNodeModules],
]) {
  if (!fs.existsSync(src)) {
    fail(`Missing ${label} at ${src} — the server build did not produce it.`);
  }
}

fs.mkdirSync(BINARIES_DIR, { recursive: true });
const sidecarDest = path.join(BINARIES_DIR, `warpcore-server-${triple}${ext}`);
fs.copyFileSync(serverBinary, sidecarDest);
fs.copyFileSync(sqliteNode, path.join(BINARIES_DIR, 'better_sqlite3.node'));

const binNodeModules = path.join(BINARIES_DIR, 'node_modules');
fs.rmSync(binNodeModules, { recursive: true, force: true });
fs.mkdirSync(binNodeModules, { recursive: true });
fs.cpSync(serverNodeModules, binNodeModules, { recursive: true });

if (process.platform !== 'win32') {
  fs.chmodSync(sidecarDest, 0o755);
}

// --- 5. Frontend assets ----------------------------------------------------------
if (!fs.existsSync(path.join(APP_DIR, 'dist'))) {
  fail(`Missing frontend build at ${path.join(APP_DIR, 'dist')}.`);
}
fs.rmSync(APP_DIST, { recursive: true, force: true });
fs.mkdirSync(APP_DIST, { recursive: true });
fs.cpSync(path.join(APP_DIR, 'dist'), APP_DIST, { recursive: true });

console.log('\n[prepare] Desktop assets staged:');
console.log(`  ${path.relative(DESKTOP_DIR, sidecarDest)}`);
console.log(`  ${path.relative(DESKTOP_DIR, path.join(BINARIES_DIR, 'better_sqlite3.node'))}`);
console.log(`  ${path.relative(DESKTOP_DIR, binNodeModules)}/`);
console.log(`  ${path.relative(DESKTOP_DIR, APP_DIST)}/`);
