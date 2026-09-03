import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import express, { type Express } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { stableStringify } from "@warpcore/shared";
import { authorizeAccess, authorizeToolCall } from "./auth";
import { chatGetMessageDefinition, chatGetMessageHandler } from "./tools/chat_get_message";
import { chatSearchDefinition, chatSearchHandler } from "./tools/chat_search";
import { listSubthreadsDefinition, listSubthreadsHandler } from "./tools/list_subthreads";
import { createSubthreadDefinition, createSubthreadHandler } from "./tools/create_subthread";
import {
	subthreadSendMessageDefinition,
	subthreadSendMessageHandler,
} from "./tools/subthread_send_message";
import {
	superthreadSendMessageDefinition,
	superthreadSendMessageHandler,
} from "./tools/superthread_send_message";
import { codeGraphCalleesDefinition, codeGraphCalleesHandler } from "./tools/code_graph_callees";
import { codeGraphCallersDefinition, codeGraphCallersHandler } from "./tools/code_graph_callers";
import { codeGraphClearDefinition, codeGraphClearHandler } from "./tools/code_graph_clear";
// import { getProjectRootDefinition, getProjectRootHandler } from './tools/get_project_root';
import { codeGraphIngestDefinition, codeGraphIngestHandler } from "./tools/code_graph_ingest";
import { codeGraphListDefinition, codeGraphListHandler } from "./tools/code_graph_list";
import { codeGraphSearchDefinition, codeGraphSearchHandler } from "./tools/code_graph_search";
import { codeGraphSymbolDefinition, codeGraphSymbolHandler } from "./tools/code_graph_symbol";
import { dirListDefinition, dirListHandler } from "./tools/dir_list";
import { embeddingSearchDefinition, embeddingSearchHandler } from "./tools/embedding_search";
import { fetchDefinition, fetchHandler } from "./tools/fetch";
import { filePatchDefinition, filePatchHandler } from "./tools/file_patch";
import { fileReadDefinition, fileReadHandler } from "./tools/file_read";
import { fileWriteDefinition, fileWriteHandler } from "./tools/file_write";
import { rgDefinition, rgHandler } from "./tools/rg";
import { shellExecDefinition, shellExecHandler } from "./tools/shell_exec";
import {
	todoReadDefinition,
	todoReadHandler,
	todoWriteDefinition,
	todoWriteHandler,
} from "./tools/todo";
import { setCurrentStatusDefinition, setCurrentStatusHandler } from "./tools/set_current_status";
import type { IStartArgs, IStartResult, IWarpmcpDeps } from "./types";

const SERVER_NAME = "warpmcp";
let httpServer: ReturnType<Express["listen"]> | null = null;
let currentPort: number | null = null;
let currentBindHost: string | null = null;

function getVersion(): string {
	const candidates: string[] = [];
	const resourceDir = process.env.WARPCORE_RESOURCE_DIR;
	if (resourceDir) {
		candidates.push(path.join(resourceDir, "release.json"));
		candidates.push(path.join(resourceDir, "_up_", "_up_", "release.json"));
	}
	let directory = process.cwd();
	for (let depth = 0; depth < 6; depth++) {
		candidates.push(path.join(directory, "release.json"));
		const parent = path.dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: unknown };
			if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
		} catch {
			// Keep walking through packaged and development locations.
		}
	}
	return "0.6.17";
}

export interface IToolEntry<TDef = { name?: string; resultLimit?: number }> {
	def: TDef;
	handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function entry<TDef>(def: TDef, handler: IToolEntry<TDef>["handler"]): IToolEntry<TDef> {
	return { def, handler };
}

export function buildToolEntries(deps: IWarpmcpDeps) {
	return [
		entry(fileReadDefinition, (a) => fileReadHandler(deps, a as Parameters<typeof fileReadHandler>[1])),
		entry(fileWriteDefinition, (a) => fileWriteHandler(deps, a as Parameters<typeof fileWriteHandler>[1])),
		entry(filePatchDefinition, (a) => filePatchHandler(deps, a as Parameters<typeof filePatchHandler>[1])),
		entry(dirListDefinition, (a) => dirListHandler(deps, a as Parameters<typeof dirListHandler>[1])),
		entry(shellExecDefinition, (a) => shellExecHandler(a as Parameters<typeof shellExecHandler>[0], deps.getFsAllowedRoots())),
		entry(fetchDefinition, (a) => fetchHandler(a as Parameters<typeof fetchHandler>[0])),
		entry(embeddingSearchDefinition, (a) => embeddingSearchHandler(deps, a as Parameters<typeof embeddingSearchHandler>[1])),
		entry(todoReadDefinition, (a) => todoReadHandler(deps, a as Parameters<typeof todoReadHandler>[1])),
		// { def: todoAddDefinition, handler: (a: any) => todoAddHandler(deps, a) },
		// { def: todoRemoveDefinition, handler: (a: any) => todoRemoveHandler(deps, a) },
		// { def: todoUpdateDefinition, handler: (a: any) => todoUpdateHandler(deps, a) },
		// { def: todoClearDefinition, handler: (a: any) => todoClearHandler(deps, a) },
		entry(todoWriteDefinition, (a) => todoWriteHandler(deps, a as Parameters<typeof todoWriteHandler>[1])),
		entry(rgDefinition, (a) => rgHandler(deps, a as Parameters<typeof rgHandler>[1])),
		// { def: getProjectRootDefinition, handler: (a: any) => getProjectRootHandler(deps, a) },
		entry(codeGraphIngestDefinition, (a) => codeGraphIngestHandler(deps, a as Parameters<typeof codeGraphIngestHandler>[1])),
		entry(codeGraphSearchDefinition, (a) => codeGraphSearchHandler(deps, a as Parameters<typeof codeGraphSearchHandler>[1])),
		entry(codeGraphSymbolDefinition, (a) => codeGraphSymbolHandler(deps, a as Parameters<typeof codeGraphSymbolHandler>[1])),
		entry(codeGraphCallersDefinition, (a) => codeGraphCallersHandler(deps, a as Parameters<typeof codeGraphCallersHandler>[1])),
		entry(codeGraphCalleesDefinition, (a) => codeGraphCalleesHandler(deps, a as Parameters<typeof codeGraphCalleesHandler>[1])),
		entry(codeGraphListDefinition, (a) => codeGraphListHandler(deps, a as Parameters<typeof codeGraphListHandler>[1])),
		entry(codeGraphClearDefinition, (a) => codeGraphClearHandler(deps, a as Parameters<typeof codeGraphClearHandler>[1])),
		entry(chatSearchDefinition, (a) => chatSearchHandler(deps, a as Parameters<typeof chatSearchHandler>[1])),
		entry(chatGetMessageDefinition, (a) => chatGetMessageHandler(deps, a as Parameters<typeof chatGetMessageHandler>[1])),
		entry(listSubthreadsDefinition, (a) => listSubthreadsHandler(deps, a as Parameters<typeof listSubthreadsHandler>[1])),
		entry(createSubthreadDefinition, (a) => createSubthreadHandler(deps, a as Parameters<typeof createSubthreadHandler>[1])),
		{
			def: subthreadSendMessageDefinition,
			handler: (a: Record<string, unknown>) => subthreadSendMessageHandler(deps, a as Parameters<typeof subthreadSendMessageHandler>[1]),
		},
		{
			def: superthreadSendMessageDefinition,
			handler: (a: Record<string, unknown>) => superthreadSendMessageHandler(deps, a as Parameters<typeof superthreadSendMessageHandler>[1]),
		},
		{
			def: setCurrentStatusDefinition,
			handler: (a: Record<string, unknown>) => setCurrentStatusHandler(deps, a as Parameters<typeof setCurrentStatusHandler>[1]),
		},
	];
	}

function buildMcpServer(deps: IWarpmcpDeps): McpServer {
	const tools = buildToolEntries(deps);
	const server = new McpServer(
		{ name: SERVER_NAME, version: getVersion() },
		{ capabilities: { tools: {} } },
	);
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: tools.map((t) => t.def),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;
		const tool = tools.find((t) => t.def.name === name);
		if (!tool) throw new Error(`Unknown tool: ${name}`);
		const result = await tool.handler(args as any);
		const json = stableStringify(result) ?? "null";
		const bytes = Buffer.byteLength(json, "utf8");
		const limit = (tool.def as any).resultLimit;
		if (limit !== undefined && bytes > limit) {
			throw new Error(
				`[tool:${name}] Result too large: ${bytes} bytes exceeds ${limit} byte limit.`,
			);
		}
		//console.log('[warpmcp] Tool', name, 'result:', json.slice(0, 200));
		return { content: [{ type: "text", text: json }] };
	});
	return server;
}
export async function startServer(args: IStartArgs): Promise<IStartResult> {
	const { port, exposeExternal } = args;
	const deps: IWarpmcpDeps = {
		isRemote: args.isRemote,
		validateBearerToken: args.validateBearerToken,
		getFsAllowedRoots: args.getFsAllowedRoots,
		embeddingSearch: args.embeddingSearch,
		todoRead: args.todoRead,
		todoAdd: args.todoAdd,
		todoRemove: args.todoRemove,
		todoUpdate: args.todoUpdate,
		todoClear: args.todoClear,
		todoWrite: args.todoWrite,
		// getProjectRoot: args.getProjectRoot,
		onFileWritten: args.onFileWritten,
		codeGraphIngest: args.codeGraphIngest,
		codeGraphSearch: args.codeGraphSearch,
		codeGraphGetSymbol: args.codeGraphGetSymbol,
		codeGraphGetCallers: args.codeGraphGetCallers,
		codeGraphGetCallees: args.codeGraphGetCallees,
		codeGraphListFile: args.codeGraphListFile,
		codeGraphClear: args.codeGraphClear,
		chatSearch: args.chatSearch,
		chatGetMessage: args.chatGetMessage,
		listSubthreads: args.listSubthreads,
		createSubthread: args.createSubthread,
		sendToSubthread: args.sendToSubthread,
		sendToSuperthread: args.sendToSuperthread,
		setCurrentStatus: args.setCurrentStatus,
	};
	//console.log('[warpmcp] startServer deps.embeddingSearch:', typeof args.embeddingSearch);
	const bindHost = exposeExternal ? "0.0.0.0" : "127.0.0.1";
	const app = express();
	app.use(express.json());
	const transports: Record<string, StreamableHTTPServerTransport> = {};
	app.all("/mcp", async (req, res) => {
		const isToolCall = req.method === "POST" && req.body?.method === "tools/call";
		const toolName = req.body?.params?.name;
		if (isToolCall && typeof toolName === "string") {
			const authz = await authorizeToolCall(deps, req, toolName);
			if (!authz.ok) {
				res.status(401).json({ error: authz.reason });
				return;
			}
		} else {
			const authz = await authorizeAccess(deps, req);
			if (!authz.ok) {
				res.status(401).json({ error: authz.reason });
				return;
			}
		}
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		let transport = sessionId ? transports[sessionId] : undefined;
		if (!transport) {
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => {
					transports[sid] = transport!;
				},
			});
			const server = buildMcpServer(deps);
			await server.connect(transport);
			transport.onclose = () => {
				if (transport!.sessionId) delete transports[transport!.sessionId];
			};
		}
		await transport.handleRequest(
			req as unknown as IncomingMessage,
			res as unknown as ServerResponse,
			req.body,
		);
	});
	return await new Promise((resolve, reject) => {
		const srv = app.listen(port, bindHost, () => {
			httpServer = srv;
			currentPort = port;
			currentBindHost = bindHost;
			console.log(`[warpmcp] Built-in MCP server listening on ${bindHost}:${port}`);
			resolve({ port, bindHost });
		});
		srv.on("error", reject);
		srv.timeout = 0;
		srv.requestTimeout = 0;
	});
}
export async function stopServer(): Promise<void> {
	if (!httpServer) return;
	await new Promise<void>((resolve) => {
		httpServer!.close(() => resolve());
	});
	httpServer = null;
	currentPort = null;
	currentBindHost = null;
}
export async function restartServer(args: IStartArgs): Promise<IStartResult> {
	await stopServer();
	return await startServer(args);
}
export function getStatus(): { running: boolean; port: number | null; bindHost: string | null } {
	return { running: httpServer !== null, port: currentPort, bindHost: currentBindHost };
}
export const SERVER_NAME_CONST = SERVER_NAME;
export type { IEmbeddingSearchResult, IStartArgs, IStartResult, IWarpmcpDeps } from "./types";
