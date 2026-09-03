import { describe, expect, it, vi } from "vitest";
import { AppletHost } from "../src/applet/AppletHost";
import { AppletManager } from "../src/applet/AppletManager";
import {
	EAppletHostStatus,
	EAppletHostType,
	EAppletScope,
	type TAppletBaseAPI,
} from "../src/applet/types";
import { EventNode } from "../src/events/EventNode";

describe("AppletManager lifecycle", () => {
	it("starts configured applets, emits ready, and terminates the active host", async () => {
		const onReady = vi.fn();
		const root = new EventNode("root", true);
		const manager = new AppletManager(
			root,
			EAppletScope.GLOBAL,
			undefined,
			{ [EAppletHostType.BE]: AppletHost },
			{
				demo: {
					name: "demo",
					description: "test applet",
					hostType: EAppletHostType.BE,
					scope: EAppletScope.GLOBAL,
					fn: async (api: TAppletBaseAPI) => {
						await api.onReady(onReady);
					},
				},
			},
			{ demo: true },
		);

		await manager.initializeAll();
		const active = manager.getActiveApplets().demo;
		expect(active?.host.getStatus()).toBe(EAppletHostStatus.READY);
		expect(onReady).toHaveBeenCalledOnce();

		await manager.terminateAll();
		expect(manager.getActiveApplets()).toEqual({});
		expect(root.children).toEqual({});
	});

	it("rejects unknown, wrong-scope, and unavailable host definitions", async () => {
		const root = new EventNode("root", true);
		const manager = new AppletManager(
			root,
			EAppletScope.GLOBAL,
			undefined,
			{},
			{
				workspaceOnly: {
					name: "workspaceOnly",
					description: "wrong scope",
					hostType: EAppletHostType.FE,
					scope: EAppletScope.WORKSPACE,
					fn: async () => undefined,
				},
			},
		);

		await expect(manager.initialize("missing")).resolves.toBe(false);
		await expect(manager.initialize("workspaceOnly")).resolves.toBe(false);
		expect(manager.getScopeValue()).toBeUndefined();
	});
});
