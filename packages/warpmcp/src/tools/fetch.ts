import { extractContent } from "../util/extractText";

export const fetchDefinition = {
	name: "fetch",
	description: "Perform an HTTP request and return the response.",
	inputSchema: {
		type: "object",
		properties: {
			url: { type: "string" },
			method: { type: "string", default: "GET" },
			headers: { type: "object", additionalProperties: { type: "string" } },
			body: { type: "string" },
			extractText: {
				type: "boolean",
				default: true,
				description:
					"Extract readable text from HTML responses to return a smaller result and preserve context tokens.",
			},
		},
		required: ["url"],
	},
	resultLimit: 200000,
};
export async function fetchHandler(args: {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	extractText?: boolean;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
	const res = await fetch(args.url, {
		method: args.method ?? "GET",
		headers: args.headers,
		body: args.body,
	});
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => {
		headers[k] = v;
	});
	const rawBody = await res.text();
	const contentType = res.headers.get("content-type") ?? "";
	let body = rawBody;
	if (args.extractText !== false && contentType.includes("html")) {
		try {
			body = extractContent(rawBody, args.url).markdown;
		} catch {
			body = rawBody;
		}
	}
	return { status: res.status, headers, body };
}
