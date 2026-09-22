import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpStdioEnvironment } from "../src/mcp/client";
import { McpConfig, McpConfigValidationError } from "../src/mcp/config";

const temporaryDirectories: string[] = [];

function temporaryConfigPath(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warpcore-mcp-security-"));
	temporaryDirectories.push(directory);
	return path.join(directory, "mcp.json");
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("MCP stdio environment isolation", () => {
	it("keeps launch essentials without inheriting unrelated host secrets", () => {
		const environment = createMcpStdioEnvironment({
			Path: "C:\\Tools",
			USERPROFILE: "C:\\Users\\Alice",
			TEMP: "C:\\Temp",
			OPENAI_API_KEY: "host-secret",
			AWS_SECRET_ACCESS_KEY: "aws-secret",
			NODE_OPTIONS: "--require malicious-loader.js",
			HTTPS_PROXY: "http://user:password@proxy.example",
		});

		expect(environment).toEqual({
			Path: "C:\\Tools",
			USERPROFILE: "C:\\Users\\Alice",
			TEMP: "C:\\Temp",
		});
	});

	it("allows an explicit per-server environment and overrides keys case-insensitively", () => {
		const environment = createMcpStdioEnvironment(
			{ Path: "C:\\Host", OPENAI_API_KEY: "host-secret" },
			{ PATH: "C:\\Server", OPENAI_API_KEY: "server-specific" },
		);

		expect(environment).toEqual({
			PATH: "C:\\Server",
			OPENAI_API_KEY: "server-specific",
		});
	});
});

describe("MCP config persistence", () => {
	it("returns a fresh empty config when no file exists", () => {
		const config = new McpConfig(temporaryConfigPath());
		const first = config.read();
		first.mcpServers.transient = { command: "node" };
		expect(config.read()).toEqual({ mcpServers: {} });
	});

	it("validates and atomically replaces a valid config", () => {
		const configPath = temporaryConfigPath();
		const config = new McpConfig(configPath);

		config.write({ mcpServers: { local: { command: "npx", args: ["-y", "server"] } } });
		expect(fs.existsSync(`${configPath}.tmp`)).toBe(false);
		expect(config.read().mcpServers.local?.command).toBe("npx");

		config.write({ mcpServers: { remote: { url: "https://mcp.example.test/api" } } });
		expect(fs.existsSync(`${configPath}.tmp`)).toBe(false);
		expect(config.read()).toEqual({
			mcpServers: { remote: { url: "https://mcp.example.test/api" } },
		});
	});

	it("rejects invalid transports without overwriting the last valid config", () => {
		const configPath = temporaryConfigPath();
		const config = new McpConfig(configPath);
		const valid = { mcpServers: { local: { command: "node", args: ["server.js"] } } };
		config.write(valid);
		const before = fs.readFileSync(configPath, "utf8");

		expect(() =>
			config.write({
				mcpServers: {
					ambiguous: { command: "node", url: "https://mcp.example.test" },
				},
			}),
		).toThrow(McpConfigValidationError);
		expect(fs.readFileSync(configPath, "utf8")).toBe(before);
	});

	it("rejects reserved server names before mutating the config object", () => {
		const config = new McpConfig(temporaryConfigPath());
		expect(() => config.addServer("__proto__", { command: "node" })).toThrow(
			McpConfigValidationError,
		);
	});

	it("fails closed on a malformed config while preserving the source file", () => {
		const configPath = temporaryConfigPath();
		const malformed = JSON.stringify({ mcpServers: { bad: { url: "file:///tmp/server" } } });
		fs.writeFileSync(configPath, malformed, "utf8");
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		expect(new McpConfig(configPath).read()).toEqual({ mcpServers: {} });
		expect(fs.readFileSync(configPath, "utf8")).toBe(malformed);
	});
});
