// ============================================================
// warpbridge/src/mcp/config.ts
// MCP config file reader/writer.
// Node only — filesystem access.
// ============================================================

import fs from "fs";
import path from "path";
import type { IMcpConfigFile, IMcpServerEntry } from "../types";
import type { IMcpConfig } from "../types/interfaces";

const RESERVED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_SERVER_NAME_LENGTH = 128;
const MAX_COMMAND_LENGTH = 4096;
const MAX_ARGUMENTS = 256;
const MAX_ARGUMENT_LENGTH = 16 * 1024;
const MAX_MAP_ENTRIES = 256;
const MAX_MAP_KEY_LENGTH = 256;
const MAX_MAP_VALUE_LENGTH = 64 * 1024;

function emptyMcpConfig(): IMcpConfigFile {
	return { mcpServers: {} };
}

export class McpConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McpConfigValidationError";
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function assertSafeObjectKey(key: string, label: string): void {
	if (!key || key.length > MAX_MAP_KEY_LENGTH) {
		throw new McpConfigValidationError(
			`${label} must be between 1 and ${MAX_MAP_KEY_LENGTH} characters`,
		);
	}
	if (RESERVED_OBJECT_KEYS.has(key)) {
		throw new McpConfigValidationError(`${label} uses a reserved object key`);
	}
	if (/\0|[\r\n]/.test(key)) {
		throw new McpConfigValidationError(`${label} contains control characters`);
	}
}

function validateStringMap(value: unknown, label: string): void {
	if (!isPlainObject(value)) {
		throw new McpConfigValidationError(`${label} must be an object of string values`);
	}
	const entries = Object.entries(value);
	if (entries.length > MAX_MAP_ENTRIES) {
		throw new McpConfigValidationError(
			`${label} may contain at most ${MAX_MAP_ENTRIES} entries`,
		);
	}
	for (const [key, mapValue] of entries) {
		assertSafeObjectKey(key, `${label} key`);
		if (typeof mapValue !== "string") {
			throw new McpConfigValidationError(`${label}.${key} must be a string`);
		}
		if (mapValue.length > MAX_MAP_VALUE_LENGTH || mapValue.includes("\0")) {
			throw new McpConfigValidationError(
				`${label}.${key} is too large or contains a null byte`,
			);
		}
	}
}

export function validateMcpServerName(name: unknown): asserts name is string {
	if (typeof name !== "string" || !name.trim() || name.length > MAX_SERVER_NAME_LENGTH) {
		throw new McpConfigValidationError(
			`MCP server name must be between 1 and ${MAX_SERVER_NAME_LENGTH} characters`,
		);
	}
	assertSafeObjectKey(name, "MCP server name");
}

export function validateMcpServerEntry(
	entry: unknown,
	label = "MCP server entry",
): asserts entry is IMcpServerEntry {
	if (!isPlainObject(entry)) {
		throw new McpConfigValidationError(`${label} must be an object`);
	}

	const hasCommand = typeof entry.command === "string" && entry.command.trim().length > 0;
	const hasUrl = typeof entry.url === "string" && entry.url.trim().length > 0;
	if (hasCommand === hasUrl) {
		throw new McpConfigValidationError(`${label} must define exactly one of command or url`);
	}

	if (entry.command !== undefined) {
		if (
			typeof entry.command !== "string" ||
			!entry.command.trim() ||
			entry.command.length > MAX_COMMAND_LENGTH ||
			/[\0\r\n]/.test(entry.command)
		) {
			throw new McpConfigValidationError(`${label}.command is invalid`);
		}
	}

	if (entry.url !== undefined) {
		if (typeof entry.url !== "string" || !entry.url.trim()) {
			throw new McpConfigValidationError(`${label}.url is invalid`);
		}
		let parsed: URL;
		try {
			parsed = new URL(entry.url);
		} catch {
			throw new McpConfigValidationError(`${label}.url must be a valid HTTP(S) URL`);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new McpConfigValidationError(`${label}.url must use http or https`);
		}
	}

	if (entry.args !== undefined) {
		if (!Array.isArray(entry.args) || entry.args.length > MAX_ARGUMENTS) {
			throw new McpConfigValidationError(
				`${label}.args must be an array with at most ${MAX_ARGUMENTS} items`,
			);
		}
		for (const [index, argument] of entry.args.entries()) {
			if (
				typeof argument !== "string" ||
				argument.length > MAX_ARGUMENT_LENGTH ||
				argument.includes("\0")
			) {
				throw new McpConfigValidationError(`${label}.args[${index}] is invalid`);
			}
		}
	}

	if (entry.env !== undefined) validateStringMap(entry.env, `${label}.env`);
	if (entry.headers !== undefined) validateStringMap(entry.headers, `${label}.headers`);

	if (
		entry.timeout !== undefined &&
		(typeof entry.timeout !== "number" ||
			!Number.isFinite(entry.timeout) ||
			!Number.isInteger(entry.timeout) ||
			entry.timeout < 0 ||
			entry.timeout > 2_147_483_647)
	) {
		throw new McpConfigValidationError(
			`${label}.timeout must be a non-negative 32-bit integer`,
		);
	}

	if (entry.warpdrv !== undefined && !isPlainObject(entry.warpdrv)) {
		throw new McpConfigValidationError(`${label}.warpdrv must be an object`);
	}
}

export function validateMcpConfig(config: unknown): asserts config is IMcpConfigFile {
	if (!isPlainObject(config) || !isPlainObject(config.mcpServers)) {
		throw new McpConfigValidationError("MCP config must contain an mcpServers object");
	}
	for (const [name, entry] of Object.entries(config.mcpServers)) {
		validateMcpServerName(name);
		validateMcpServerEntry(entry, `MCP server '${name}'`);
	}
}

export class McpConfig implements IMcpConfig {
	private configPath: string;

	constructor(configPath: string) {
		this.configPath = configPath;
	}

	read(): IMcpConfigFile {
		try {
			if (fs.existsSync(this.configPath)) {
				const raw = fs.readFileSync(this.configPath, "utf8");
				const parsed = JSON.parse(raw);
				validateMcpConfig(parsed);
				return parsed as IMcpConfigFile;
			}
		} catch (err) {
			console.error(
				`[MCP Config] Refusing invalid config at ${this.configPath}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		return emptyMcpConfig();
	}

	write(config: IMcpConfigFile): void {
		validateMcpConfig(config);
		const dir = path.dirname(this.configPath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const tempPath = `${this.configPath}.tmp`;
		try {
			fs.writeFileSync(tempPath, JSON.stringify(config, null, "\t"), {
				encoding: "utf8",
				mode: 0o600,
			});
			fs.renameSync(tempPath, this.configPath);
		} finally {
			if (fs.existsSync(tempPath)) {
				try {
					fs.unlinkSync(tempPath);
				} catch {
					/* best-effort cleanup */
				}
			}
		}
	}

	getPath(): string {
		return this.configPath;
	}

	addServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
		validateMcpServerName(name);
		validateMcpServerEntry(entry);
		const config = this.read();
		config.mcpServers[name] = entry;
		this.write(config);
		return config;
	}

	removeServer(name: string): IMcpConfigFile {
		validateMcpServerName(name);
		const config = this.read();
		delete config.mcpServers[name];
		this.write(config);
		return config;
	}

	updateServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
		validateMcpServerName(name);
		validateMcpServerEntry(entry);
		const config = this.read();
		config.mcpServers[name] = entry;
		this.write(config);
		return config;
	}
}
