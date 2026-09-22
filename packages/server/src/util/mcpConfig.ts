// ============================================================
// FILE: packages/server/src/util/mcpConfig.ts
// Reads and writes ~/.config/warpcore/mcp.json
// ============================================================

import { McpConfig } from "@warpcore/bridge/server";
import type { IMcpConfigFile, IMcpServerEntry } from "@warpcore/shared";
import os from "os";
import path from "path";

export function getDataDir(): string {
	const override = process.env.WARPCORE_DATA_DIR;
	if (override && override.trim()) return override;
	const platform = os.platform();
	if (platform === "win32") return path.join(os.homedir(), "AppData", "Roaming", "warpcore");
	if (platform === "darwin")
		return path.join(os.homedir(), "Library", "Application Support", "warpcore");
	return path.join(os.homedir(), ".config", "warpcore");
}

const MCP_CONFIG_PATH = path.join(getDataDir(), "mcp.json");
const configStore = new McpConfig(MCP_CONFIG_PATH);
type BridgeMcpConfigFile = Parameters<McpConfig["write"]>[0];
type BridgeMcpServerEntry = Parameters<McpConfig["addServer"]>[1];

export function readMcpConfig(): IMcpConfigFile {
	return configStore.read() as unknown as IMcpConfigFile;
}

export function writeMcpConfig(config: IMcpConfigFile): void {
	configStore.write(config as unknown as BridgeMcpConfigFile);
}

export function getMcpConfigPath(): string {
	return MCP_CONFIG_PATH;
}

export function addMcpServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
	return configStore.addServer(
		name,
		entry as unknown as BridgeMcpServerEntry,
	) as unknown as IMcpConfigFile;
}

export function removeMcpServer(name: string): IMcpConfigFile {
	return configStore.removeServer(name) as unknown as IMcpConfigFile;
}

export function updateMcpServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
	return configStore.updateServer(
		name,
		entry as unknown as BridgeMcpServerEntry,
	) as unknown as IMcpConfigFile;
}
