import type { IAccessToken, ISettings } from "@warpcore/shared";
import { DEFAULT_SETTINGS } from "@warpcore/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	list: vi.fn(),
	validateBearerToken: vi.fn(),
}));

vi.mock("../src/util/store", () => ({
	store: {
		get: mocks.get,
		list: mocks.list,
	},
}));

vi.mock("../src/routes/tokens", () => ({
	validateBearerToken: mocks.validateBearerToken,
}));

import { adminMiddleware, authMiddleware } from "../src/middleware/auth";

function settings(overrides: Partial<ISettings> = {}): ISettings {
	return {
		...DEFAULT_SETTINGS,
		apiAuthEnabled: true,
		authRequireForLocalhost: true,
		...overrides,
	};
}

function responseRecorder() {
	const state: { status: number; body: unknown } = { status: 200, body: undefined };
	const response = {
		status(code: number) {
			state.status = code;
			return response;
		},
		json(body: unknown) {
			state.body = body;
			return response;
		},
	};
	return { response, state };
}

async function runControlPlaneBoundary(req: Record<string, unknown>) {
	const { response, state } = responseRecorder();
	let authenticated = false;
	let admitted = false;
	await authMiddleware(req, response as never, () => {
		authenticated = true;
	});
	if (authenticated) {
		await adminMiddleware(req, response as never, () => {
			admitted = true;
		});
	}
	return { authenticated, admitted, state };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.get.mockResolvedValue(settings());
	mocks.list.mockResolvedValue([]);
	mocks.validateBearerToken.mockResolvedValue(null);
});

describe("control-plane authorization boundary", () => {
	it("rejects an unauthenticated request before it reaches a control-plane route", async () => {
		const result = await runControlPlaneBoundary({
			headers: {},
			cookies: {},
			ip: "127.0.0.1",
		});

		expect(result.authenticated).toBe(false);
		expect(result.admitted).toBe(false);
		expect(result.state.status).toBe(401);
	});

	it("authenticates but denies an inference-only token", async () => {
		const token = {
			id: "inference",
			name: "inference only",
			tokenHash: "hash",
			tokenPrefix: "wc_inferen",
			inference: true,
			admin: false,
			createdAt: Date.now(),
		} as IAccessToken;
		mocks.validateBearerToken.mockResolvedValue(token);

		const result = await runControlPlaneBoundary({
			headers: { authorization: "Bearer wc_inference" },
			cookies: {},
			ip: "127.0.0.1",
		});

		expect(result.authenticated).toBe(true);
		expect(result.admitted).toBe(false);
		expect(result.state.status).toBe(403);
	});

	it("admits an administrator token", async () => {
		mocks.validateBearerToken.mockResolvedValue({
			id: "admin",
			name: "administrator",
			tokenHash: "hash",
			tokenPrefix: "wc_admin00",
			admin: true,
			createdAt: Date.now(),
		} as IAccessToken);

		const result = await runControlPlaneBoundary({
			headers: { authorization: "Bearer wc_admin" },
			cookies: {},
			ip: "127.0.0.1",
		});

		expect(result.authenticated).toBe(true);
		expect(result.admitted).toBe(true);
		expect(result.state.status).toBe(200);
	});

	it("preserves the configured loopback no-auth mode", async () => {
		mocks.get.mockResolvedValue(
			settings({ authRequireForLocalhost: false, apiHost: "127.0.0.1" }),
		);

		const result = await runControlPlaneBoundary({
			headers: {},
			cookies: {},
			ip: "127.0.0.1",
		});

		expect(result.authenticated).toBe(true);
		expect(result.admitted).toBe(true);
	});
});
