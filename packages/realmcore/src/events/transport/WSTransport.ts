import type { IMessageTransport, TRemoteHandler } from "../RemoteNode";

// a Socket.IO socket exposes emit and on. emitWithAck sends a message and
// resolves with the peer's ack response, which gives request/response
// correlation for free, so WSTransport does not maintain its own pending map.
// the type is kept minimal so this file does not depend on socket.io's types.
export interface ISocket {
	emit(event: string, ...args: Array<unknown>): void;
	emitWithAck(event: string, ...args: Array<unknown>): Promise<unknown>;
	on(event: string, listener: (...args: Array<unknown>) => void): void;
}

const WIRE_EVENT = "remote.msg";

interface IWireMessage {
	msgId: string;
	payload: unknown;
}

// one WSTransport wraps one socket, which is one connection between two hosts,
// fronting one RemoteNode. it implements the same IMessageTransport seam as the
// in-process MockTransport, so RemoteNode and the event framework are unchanged.
// outbound messages go out as a single wire event carrying msgId + payload, with
// the ack delivering the handler's return value. inbound wire events are
// dispatched to the registered handler, and its result is returned through the
// ack callback.
export class WSTransport implements IMessageTransport {
	private socket: ISocket;
	private handlers: Record<string, TRemoteHandler>;

	constructor(socket: ISocket) {
		this.socket = socket;
		this.handlers = {};
		this.socket.on(WIRE_EVENT, (raw: unknown, ack: unknown) => {
			void this.receive(raw as IWireMessage, ack as (response: unknown) => void);
		});
	}

	public async sendMessage(msgId: string, payload: unknown): Promise<unknown> {
		const msg: IWireMessage = { msgId, payload };
		// Guard against a peer that never acks — emitWithAck would otherwise
		// hang the caller forever.
		return await new Promise<unknown>((resolve) => {
			const timer = setTimeout(() => resolve(undefined), 15000);
			Promise.resolve(this.socket.emitWithAck(WIRE_EVENT, msg))
				.then((result) => { clearTimeout(timer); resolve(result); })
				.catch((err) => { clearTimeout(timer); resolve(err); });
		});
	}

	public onMessage(msgId: string, handler: TRemoteHandler): void {
		this.handlers[msgId] = handler;
	}

	private async receive(msg: IWireMessage, ack: (response: unknown) => void): Promise<void> {
		const handler = this.handlers[msg.msgId];
		if (!handler) {
			if (ack) ack(undefined);
			return;
		}
		try {
			const result = await handler(msg.payload);
			if (ack) ack(result);
		} catch (err) {
			// Always ack — a throwing remote handler previously left the peer's
			// emitWithAck unresolved forever (realm route() calls could stall).
			if (ack) ack({ __error: err instanceof Error ? err.message : String(err) });
		}
	}
}
