import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	storeGet: vi.fn<(key: string) => Promise<unknown>>(),
	storePut: vi.fn(async () => undefined),
	scanAllModelRoots: vi.fn<() => Promise<unknown[]>>(),
	emit: vi.fn(),
}));

vi.mock("../src/util/store", () => ({
	store: {
		get: mocks.storeGet,
		put: mocks.storePut,
	},
}));

vi.mock("../src/services/modelScanner", () => ({
	scanAllModelRoots: mocks.scanAllModelRoots,
}));

vi.mock("../src/services/sseManagerInstance", () => ({
	sseManager: { emit: mocks.emit },
}));

function model(parserVersion: number, name = "Cached-Model") {
	return {
		id: name,
		user: "publisher",
		name,
		dirPath: "C:/models",
		files: [
			{
				fileName: `${name}.gguf`,
				filePath: `C:/models/${name}.gguf`,
				sizeMb: 1,
				metadata: { parserVersion },
				shardIndex: null,
				shardTotal: null,
				isMmproj: false,
				parentModel: null,
			},
		],
		primaryFile: null,
		mmprojFile: null,
		totalSizeMb: 1,
	};
}

beforeEach(() => {
	vi.resetModules();
	mocks.storeGet.mockReset();
	mocks.storePut.mockClear();
	mocks.scanAllModelRoots.mockReset();
	mocks.emit.mockClear();
});

describe("startup model cache refresh", () => {
	it("defers a first-install scan until the API listener starts the background refresh", async () => {
		const fresh = model(2, "Fresh-Install-Model");
		mocks.storeGet.mockImplementation(async (key) =>
			key === "models:cache" ? null : { modelRoots: ["C:/models"] },
		);
		mocks.scanAllModelRoots.mockResolvedValue([fresh]);

		const modelsRoute = await import("../src/routes/models");
		await modelsRoute.loadCachedModels();

		expect(modelsRoute.getCachedModels()).toEqual([]);
		expect(mocks.scanAllModelRoots).not.toHaveBeenCalled();
		expect(await modelsRoute.startPendingModelRefresh()).toEqual([fresh]);
		expect(mocks.scanAllModelRoots).toHaveBeenCalledTimes(1);
	});

	it("hydrates a stale cache without scanning until startup explicitly begins the background refresh", async () => {
		const stale = model(1);
		const fresh = model(2, "Fresh-Model");
		let finishScan!: (models: unknown[]) => void;
		const scanPromise = new Promise<unknown[]>((resolve) => {
			finishScan = resolve;
		});
		mocks.storeGet.mockImplementation(async (key) =>
			key === "models:cache" ? [stale] : { modelRoots: ["C:/models"] },
		);
		mocks.scanAllModelRoots.mockReturnValue(scanPromise);

		const modelsRoute = await import("../src/routes/models");
		await modelsRoute.loadCachedModels();

		expect(mocks.scanAllModelRoots).not.toHaveBeenCalled();
		expect(modelsRoute.getCachedModels()).toEqual([stale]);

		const refresh = modelsRoute.startPendingModelRefresh();
		await vi.waitFor(() => expect(mocks.scanAllModelRoots).toHaveBeenCalledTimes(1));
		finishScan([fresh]);
		expect(await refresh).toEqual([fresh]);
		expect(modelsRoute.getCachedModels()).toEqual([fresh]);
		expect(mocks.emit).toHaveBeenCalledWith("models:init", [fresh]);
	});

	it("does not schedule a refresh when cached metadata is current", async () => {
		const current = model(2);
		mocks.storeGet.mockResolvedValue([current]);

		const modelsRoute = await import("../src/routes/models");
		await modelsRoute.loadCachedModels();

		expect(await modelsRoute.startPendingModelRefresh()).toBeNull();
		expect(mocks.scanAllModelRoots).not.toHaveBeenCalled();
	});

	it("shares an in-flight ordinary rescan instead of scanning the same roots twice", async () => {
		const scanned = model(2, "Scanned-Model");
		let finishScan!: (models: unknown[]) => void;
		const scanPromise = new Promise<unknown[]>((resolve) => {
			finishScan = resolve;
		});
		mocks.storeGet.mockResolvedValue({ modelRoots: ["C:/models"] });
		mocks.scanAllModelRoots.mockReturnValue(scanPromise);

		const modelsRoute = await import("../src/routes/models");
		const first = modelsRoute.rescanAllModels();
		const second = modelsRoute.rescanAllModels();
		await vi.waitFor(() => expect(mocks.scanAllModelRoots).toHaveBeenCalledTimes(1));
		finishScan([scanned]);

		expect(await first).toEqual([scanned]);
		expect(await second).toEqual([scanned]);
		expect(mocks.scanAllModelRoots).toHaveBeenCalledTimes(1);
	});
});
