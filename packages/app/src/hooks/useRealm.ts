import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import { EventNode, RemoteNode, WSTransport } from '@warpcore/realmcore';
import { AppletManager, EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { feApplets, AppletHostFE } from '@/applets';

export function useRealm(currentThreadId: string | null) {
	const realmRef = useRef<{
		eventNode: EventNode;
		remoteNode: RemoteNode;
		nodeId: string;
		socket: Socket;
		appletMgr: AppletManager;
	}>(null);

	const [isParentAttached, setParentAttached] = useState<boolean>(false);

	// Initialize the realm connection once per mount. The cleanup nulls the
	// ref AND disconnects, so React StrictMode's double-mount re-initializes
	// cleanly; thread switches are handled by updateScopeValue below and must
	// NOT tear the connection down (previously the socket stayed dead after
	// the first thread switch because the guard skipped re-init).
	useEffect(() => {
		if (realmRef.current) return; // Already initialized

		console.log(`[Realm] Loading..`);

		const nodeId = `chat-${nanoid(6)}`;
		const chatNode = new EventNode(nodeId, false, () => setParentAttached(true));
		(window as any).eventNode = chatNode;

		const appletMgr = new AppletManager(
			chatNode,
			EAppletScope.THREAD,
			currentThreadId ?? undefined,
			{ [EAppletHostType.FE]: AppletHostFE },
			feApplets,
			{ FEApplet: true },
		);

		const socket = io({
			path: '/api/realm/',
			query: { nodeId },
			transports: ['websocket'],
			upgrade: false,
		});

		const remoteNode = new RemoteNode('warpcore', chatNode, new WSTransport(socket));

		realmRef.current = {
			eventNode: chatNode,
			remoteNode,
			nodeId,
			socket,
			appletMgr,
		};

		// Register listeners after store is populated to avoid stale references
		const onConnect = () => { console.log(`[Realm] ✅ Connected as ${nodeId}.`); };
		const onDisconnect = () => { console.error(`[Realm] Disconnected!`); setParentAttached(false); };
		const onManagerError = (err: { message: string }) => { console.error(`[Realm] Manager error:`, err.message); };

		socket.on('connect', onConnect);
		socket.on('disconnect', onDisconnect);
		socket.io.on('error', onManagerError);

		return () => {
			socket.off('connect', onConnect);
			socket.off('disconnect', onDisconnect);
			socket.io.off('error', onManagerError);
			socket.disconnect();
			// Allow re-initialization (e.g. StrictMode double-mount, or a
			// future explicit reconnect) instead of leaving a dead connection.
			realmRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!isParentAttached) return;
		realmRef.current?.appletMgr.initializeAll();

		return () => {
			realmRef.current?.appletMgr.terminateAll();
		};
	}, [isParentAttached]);

	useEffect(() => {
		if (!isParentAttached) return;
		realmRef.current?.appletMgr.updateScopeValue(currentThreadId ?? undefined);
	}, [currentThreadId, isParentAttached]);

	return realmRef.current;
}
