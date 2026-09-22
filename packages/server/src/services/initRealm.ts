import type { Server as HTTPServer } from "node:http";
import {
	AppletManager,
	EAppletHostType,
	EAppletScope,
	type EventNode,
	RemoteNode,
	WSTransport,
} from "@warpcore/realmcore";
import { Server as IOServer } from "socket.io";
import { AppletHostBE, beApplets } from "../applets";
import { hasAdminAccess } from "../middleware/auth";
import { isLocalOrShellOrigin } from "../util/localOrigin";

let warpcoreNode: EventNode | null = null;
let io: IOServer | null = null;
let appletManager: AppletManager | null = null;

function parseCookies(header: string | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	if (!header) return result;
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index < 0) continue;
		const key = part.slice(0, index).trim();
		if (key) result[key] = part.slice(index + 1).trim();
	}
	return result;
}

function isAllowedRealmOrigin(origin: string | undefined): boolean {
	if (!origin) return true;
	const configured = process.env.ALLOWED_REALM_ORIGIN;
	if (configured?.trim()) {
		return configured
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean)
			.includes(origin);
	}
	return isLocalOrShellOrigin(origin);
}

export async function initRealm(
	server: HTTPServer,
	node: EventNode,
): Promise<{ node: EventNode; io: IOServer; appletManager: AppletManager }> {
	warpcoreNode = node;

	io = new IOServer(server, {
		path: "/api/realm/",
		cors: {
			origin(origin, callback) {
				callback(null, isAllowedRealmOrigin(origin));
			},
			credentials: true,
		},
	});

	io.use(async (socket, next) => {
		try {
			const request = socket.request as {
				ip?: string;
				connection?: { remoteAddress?: string };
			};
			const authorization = socket.handshake.headers.authorization;
			if (
				await hasAdminAccess({
					ip: request.ip,
					connection: request.connection?.remoteAddress
						? { remoteAddress: request.connection.remoteAddress }
						: undefined,
					cookies: parseCookies(socket.handshake.headers.cookie),
					headers: authorization ? { authorization } : {},
				})
			) {
				next();
				return;
			}
			next(new Error("Admin access required"));
		} catch {
			next(new Error("Admin access required"));
		}
	});

	io.on("connection", (socket) => {
		const nodeId = socket.handshake.query.nodeId as string;
		console.log(`[Realm] Connection from ${nodeId}`);

		const transport = new WSTransport(socket);
		const remoteNode = new RemoteNode(nodeId, warpcoreNode!, transport);

		warpcoreNode!
			.removeChild(nodeId)
			.catch(() => {})
			.then(() => warpcoreNode!.addChild(remoteNode))
			.then(() => {
				console.log(`[Realm] ${nodeId} added as child`);
			})
			.catch((err) => {
				console.error(`[Realm] Failed to add ${nodeId} as child:`, err);
			});

		socket.on("disconnect", () => {
			console.log(`[Realm] ${nodeId} disconnected`);
			warpcoreNode!.removeChild(nodeId);
		});

		socket.on("error", (err) => {
			console.error(`[Realm] ${nodeId} error:`, err);
		});
	});

	appletManager = new AppletManager(
		warpcoreNode,
		EAppletScope.GLOBAL,
		undefined,
		{ [EAppletHostType.BE]: AppletHostBE },
		beApplets,
		{ BEApplet: true },
	);
	await appletManager.initializeAll();
	return { node: warpcoreNode, io, appletManager };
}
