import type { IWarpmcpDeps } from "../types";

export const subthreadSendMessageDefinition = {
	name: "subthread_send_message",
	description:
		"Send a message to a subthread (child thread). Creates a notification in the target subthread with the current thread as the sender.",
	inputSchema: {
		type: "object",
		properties: {
			threadId: {
				type: "string",
				description: "The ID of the subthread to send the message to.",
			},
			message: {
				type: "string",
				description: "The message content to send.",
			},
		},
		required: ["threadId", "message"],
	},
	resultLimit: 40960,
};

export async function subthreadSendMessageHandler(
	deps: IWarpmcpDeps,
	args: { threadId: string; subthreadId: string; message: string },
) {
	if (!deps.sendToSubthread) {
		throw "[warpmcp] sendToSubthread function not found";
	}
	return deps.sendToSubthread(args.threadId, args.subthreadId, args.message);
}
