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
import { shouldRequireAuth } from "../middleware/auth";
import { validateBearerToken } from "../routes/tokens";
import { isLocalOrShellOrigin } from "../util/localOrigin";
import { store } from "../util/store";
import type { IAccessToken, ISettings } from "@warpcore/shared";
import { DEFAULT_SETTINGS } from "@warpcore/shared";

const SETTINGS_KEY = "settings:general";
const COOKIE_NAME = "warpcore_auth";

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
			const settings = (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
			const request = socket.request as {
				ip?: string;
				connection?: { remoteAddress?: string };
			};
			if (!(await shouldRequireAuth(request)) || !settings.apiAuthEnabled) {
				next();
				return;
			}
			const tokenId = parseCookies(socket.handshake.headers.cookie)[COOKIE_NAME];
			if (tokenId) {
				const tokens = await store.list<IAccessToken>("tokens:");
				if (tokens.some((token) => token.id === tokenId)) {
					next();
					return;
				}
			}
			if (await validateBearerToken(socket.handshake.headers.authorization)) {
				next();
				return;
			}
			next(new Error("Unauthorized"));
		} catch {
			next(new Error("Unauthorized"));
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
