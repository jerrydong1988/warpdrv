import fs from 'fs';
import path from 'path';
import os from 'os';

function getDataDir(): string {
	const platform = os.platform();
	if (platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	return path.join(os.homedir(), '.config', 'warpcore');
}

const DATA_DIR = getDataDir();
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'warpcore-data.json');
let data: Record<string, string> = {};

// Max database file size: 50 MB — larger files indicate corruption or abuse
const MAX_DB_BYTES = 50 * 1024 * 1024;

// Load from disk on startup
function load(): void {
	try {
		if (fs.existsSync(DB_FILE)) {
			const stats = fs.statSync(DB_FILE);
			if (stats.size > MAX_DB_BYTES) {
				console.error(`[store] DB file too large (${stats.size} bytes), resetting`);
				data = {};
				return;
			}
			data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
		}
	} catch {
		data = {};
	}
}

function save(): void {
	fs.writeFileSync(DB_FILE, JSON.stringify(data, null, '\t'), 'utf8');
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
		data[key] = JSON.stringify(value);
		save();
	},

	async del(key: string): Promise<void> {
		delete data[key];
		save();
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