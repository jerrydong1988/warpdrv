import fs from 'fs';
import path from 'path';
import os from 'os';

function getDataDir(): string {
	// WARPCORE_DATA_DIR overrides the default location — useful for tests and
	// running multiple instances against separate data stores.
	const override = process.env.WARPCORE_DATA_DIR;
	if (override && override.trim()) return override;
	const platform = os.platform();
	if (platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	return path.join(os.homedir(), '.config', 'warpcore');
}

const DATA_DIR = getDataDir();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'warpcore-data.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'warpcore-data.json.bak');
const DB_TMP_FILE = path.join(DATA_DIR, 'warpcore-data.json.tmp');
let data: Record<string, string> = {};

// Max database file size: 50 MB — larger files indicate corruption or abuse
const MAX_DB_BYTES = 50 * 1024 * 1024;

// Load from disk on startup
function load(): void {
	try {
		if (fs.existsSync(DB_FILE)) {
			const stats = fs.statSync(DB_FILE);
			if (stats.size > MAX_DB_BYTES) {
				console.error(`[store] DB file too large (${stats.size} bytes), refusing to load it. ` +
					`Your data has NOT been touched — restore from ${DB_BACKUP_FILE} if available.`);
				// Keep the existing file intact (do not silently wipe it).
				try {
					if (fs.existsSync(DB_BACKUP_FILE)) {
						data = JSON.parse(fs.readFileSync(DB_BACKUP_FILE, 'utf8'));
					}
				} catch { data = {}; }
				return;
			}
			data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
		}
	} catch (err) {
		// Corrupt DB file — loudly log, keep the file for manual recovery, and
		// fall back to the last good backup before starting with empty state.
		console.error(`[store] Failed to parse ${DB_FILE}: ${err instanceof Error ? err.message : String(err)}`);
		console.error('[store] The corrupt file was preserved on disk for recovery.');
		try {
			if (fs.existsSync(DB_BACKUP_FILE)) {
				const backupStats = fs.statSync(DB_BACKUP_FILE);
				if (backupStats.size <= MAX_DB_BYTES) {
					data = JSON.parse(fs.readFileSync(DB_BACKUP_FILE, 'utf8'));
					console.error(`[store] Restored ${Object.keys(data).length} entries from backup.`);
				}
			}
		} catch (backupErr) {
			console.error(`[store] Backup restore also failed: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`);
			data = {};
		}
	}
}

function save(): void {
	const serialized = JSON.stringify(data, null, '\t');
	if (Buffer.byteLength(serialized, 'utf8') > MAX_DB_BYTES) {
		throw new Error(`[store] Refusing to persist: DB would exceed ${MAX_DB_BYTES} bytes`);
	}
	// Atomic write: write tmp file, then rename over the real file. On success,
	// rotate the previous version into the .bak so a crash mid-write never
	// corrupts the live file and a .bak always exists.
	fs.writeFileSync(DB_TMP_FILE, serialized, 'utf8');
	if (fs.existsSync(DB_FILE)) {
		try { fs.copyFileSync(DB_FILE, DB_BACKUP_FILE); } catch { /* best-effort backup */ }
	}
	fs.renameSync(DB_TMP_FILE, DB_FILE);
}

/**
 * Apply an in-memory mutation and persist it. If persistence fails the
 * mutation is rolled back: callers must never be left with a process whose
 * memory claims a write that the disk rejected (that state was previously
 * permanent — every later save() failed for the same reason).
 */
function commit(key: string, nextValue: string | null): void {
	const previous = data[key];
	if (nextValue === null) delete data[key];
	else data[key] = nextValue;

	try {
		save();
	} catch (err) {
		if (previous === undefined) delete data[key];
		else data[key] = previous;
		throw err;
	}
}

// Init
load();

export const store = {
	async get<T>(key: string): Promise<T | null> {
		const raw = data[key];
		if (raw === undefined) return null;
		return JSON.parse(raw) as T;
	},

	async put<T>(key: string, value: T): Promise<void> {
		let serialized: string;
		try {
			serialized = JSON.stringify(value);
		} catch (err) {
			throw new Error(`[store] Value for '${key}' is not serializable: ${err instanceof Error ? err.message : String(err)}`);
		}
		commit(key, serialized);
	},

	async del(key: string): Promise<void> {
		commit(key, null);
	},

	async list<T>(prefix: string): Promise<T[]> {
		return Object.entries(data)
			.filter(([key]) => key.startsWith(prefix))
			.map(([, value]) => JSON.parse(value) as T);
	},

	async keys(prefix: string): Promise<string[]> {
		return Object.keys(data).filter(key => key.startsWith(prefix));
	},
};
