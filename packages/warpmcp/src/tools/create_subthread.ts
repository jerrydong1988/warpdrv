import type { IWarpmcpDeps } from "../types";

export const createSubthreadDefinition = {
	name: "create_subthread",
	description:
		"Create a subthread (child thread) under the current thread using the specified agent's configuration. Returns the ID of the created subthread.",
	inputSchema: {
		type: "object",
		properties: {
			agentId: {
				type: "string",
				description: "The ID of the agent whose config to use for the subthread.",
			},
			title: {
				type: "string",
				description: "Title for the new subthread.",
			},
			message: {
				type: "string",
				description: "The initial user message to seed the subthread with.",
			},
		},
		required: ["agentId", "title", "message"],
	},
	resultLimit: 40960,
};

export async function createSubthreadHandler(
	deps: IWarpmcpDeps,
	args: { threadId: string; agentId: string; title: string; message: string },
) {
	if (!deps.createSubthread) {
		throw "[warpmcp] createSubthread function not found";
	}
	return deps.createSubthread(args.threadId, args.agentId, args.message, args.title);
}
