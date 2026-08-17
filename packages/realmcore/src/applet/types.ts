import type { EventNode, TCallback, TCallbackId } from '../events/EventNode';

export enum EAppletHostType {
	BE = 'be',
	FE = 'fe',
}

export enum EAppletScope {
	GLOBAL = 'global',
	WORKSPACE = 'workspace',
	THREAD = 'thread',
}

export enum EAppletHostStatus {
	NOT_RUNNING = 'notRunning',
	INIT = 'init',
	READY = 'ready',
	DEINIT = 'deinit',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous applet APIs are erased at the manager boundary; `any` here is a deliberate escape hatch (see AppletManager).
export interface TAppletDefinition<TApi = any> {
	name: string;
	description: string;
	fn: IAppletFn<TApi>;
	hostType: EAppletHostType;
	scope: EAppletScope;
}

export type TAppletBaseAPI = {
	eventNode: EventNode,
	onReady: (cb: TCallback) => Promise<TCallbackId>,
	onTerminate: (cb: TCallback) => Promise<TCallbackId>,
}

export const APPLET_READY = "applet.ready";
export const APPLET_TERMINATE = "applet.terminate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see TAppletDefinition.
export type IAppletFn<TApi = any> = (api: TApi) => Promise<void>;

