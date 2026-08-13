import type { IWarpmcpDeps } from "../types";

export const superthreadSendMessageDefinition = {
	name: "superthread_send_message",
	description:
		"Send a message to the superthread (parent thread). Creates a notification in the parent thread with the current thread as the sender.",
	inputSchema: {
		type: "object",
		properties: {
			message: {
				type: "string",
				description: "The message content to send.",
			},
		},
		required: ["message"],
	},
	resultLimit: 40960,
};

export async function superthreadSendMessageHandler(
	deps: IWarpmcpDeps,
	args: { threadId: string; message: string },
) {
	if (!deps.sendToSuperthread) {
		throw "[warpmcp] sendToSuperthread function not found";
	}
	return deps.sendToSuperthread(args.threadId, args.message);
}
