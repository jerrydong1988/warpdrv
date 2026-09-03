import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	getAutoSelectedDraftModelPath,
	getDraftModelCandidates,
} from "../src/pages/Servers/LaunchServer/draftModelSelection";

function modelEntry(
	fileName: string,
	filePath: string,
	architecture: string | null,
	metadata: { fileSize?: number; tensorCount?: number; nextnPredictLayers?: number } = {},
) {
	return {
		file: {
			fileName,
			filePath,
			metadata: architecture ? { architecture, ...metadata } : null,
		},
	};
}

const target = modelEntry(
	"Qwen3.8-27B-UD-Q6_K_XL.gguf",
	"C:\\models\\Qwen3.8-27B-GGUF\\Qwen3.8-27B-UD-Q6_K_XL.gguf",
	"qwen35",
	{ fileSize: 25_000, tensorCount: 900, nextnPredictLayers: 1 },
);
const siblingDflash = modelEntry(
	"Qwen3.8-27B-DFlash2-Q4_K_M.gguf",
	"C:\\models\\Qwen3.8-27B-GGUF\\Qwen3.8-27B-DFlash2-Q4_K_M.gguf",
	"dflash",
);
const remoteDflash = modelEntry(
	"Other-DFlash.gguf",
	"D:\\models\\Other-DFlash.gguf",
	"dflash",
);
const ordinaryDraft = modelEntry(
	"Qwen3.8-7B-Q4_K_M.gguf",
	"D:\\models\\Qwen3.8-7B-Q4_K_M.gguf",
	"qwen35",
);
const siblingMtp = modelEntry(
	"mtp-Qwen3.8-27B-Q8_0.gguf",
	"C:\\models\\Qwen3.8-27B-GGUF\\mtp-Qwen3.8-27B-Q8_0.gguf",
	"qwen35",
	{ fileSize: 1_000, tensorCount: 24, nextnPredictLayers: 1 },
);

describe("draft model candidate selection", () => {
	it("recognizes dflash sidecars instead of requiring the target architecture", () => {
		const candidates = getDraftModelCandidates(
			[target, ordinaryDraft, remoteDflash, siblingDflash],
			target,
			"dflash",
		);

		expect(candidates).toEqual([siblingDflash, remoteDflash]);
	});

	it("keeps exact-architecture filtering for ordinary draft models", () => {
		const candidates = getDraftModelCandidates(
			[target, ordinaryDraft, siblingDflash, siblingMtp],
			target,
			"draft",
		);

		expect(candidates).toEqual([ordinaryDraft]);
	});

	it("recognizes Eagle3 sidecars by their dedicated architecture", () => {
		const eagle3 = modelEntry(
			"Qwen3.8-27B-Eagle3-Q8_0.gguf",
			"C:\\models\\Qwen3.8-27B-GGUF\\Qwen3.8-27B-Eagle3-Q8_0.gguf",
			"eagle3",
		);
		const candidates = getDraftModelCandidates(
			[target, ordinaryDraft, eagle3],
			target,
			"draft",
			"draft-eagle3",
		);

		expect(candidates).toEqual([eagle3]);
	});

	it("recognizes a compact sibling MTP model without listing full MTP-preserved models", () => {
		const fullMtpModel = modelEntry(
			"Qwen3.8-27B-Native-MTP-Preserved-Q4_K_M.gguf",
			"C:\\models\\Qwen3.8-27B-GGUF\\Qwen3.8-27B-Native-MTP-Preserved-Q4_K_M.gguf",
			"qwen35",
			{ fileSize: 18_000, tensorCount: 850, nextnPredictLayers: 1 },
		);
		const remoteMtp = modelEntry(
			"mtp-Other-Qwen-Q8_0.gguf",
			"D:\\models\\mtp-Other-Qwen-Q8_0.gguf",
			"qwen35",
			{ fileSize: 800, tensorCount: 20, nextnPredictLayers: 1 },
		);

		expect(
			getDraftModelCandidates(
				[target, ordinaryDraft, fullMtpModel, remoteMtp, siblingMtp],
				target,
				"mtp",
			),
		).toEqual([siblingMtp]);
	});

	it("auto-selects one dflash sidecar in the target model directory", () => {
		expect(
			getAutoSelectedDraftModelPath(
				[siblingDflash, remoteDflash],
				target.file.filePath,
				"",
				"dflash",
			),
		).toBe(siblingDflash.file.filePath);
	});

	it("auto-selects one compatible external MTP sidecar beside the target model", () => {
		expect(
			getAutoSelectedDraftModelPath(
				[siblingMtp],
				target.file.filePath,
				"",
				"mtp",
			),
		).toBe(siblingMtp.file.filePath);
	});

	it("does not overwrite a custom path or guess between sibling sidecars", () => {
		const customPath = "E:\\custom\\draft.gguf";
		expect(
			getAutoSelectedDraftModelPath(
				[siblingDflash],
				target.file.filePath,
				customPath,
				"dflash",
			),
		).toBeNull();

		const secondSibling = modelEntry(
			"Qwen3.8-27B-DFlash2-Q8_0.gguf",
			"C:\\models\\Qwen3.8-27B-GGUF\\Qwen3.8-27B-DFlash2-Q8_0.gguf",
			"dflash",
		);
		expect(
			getAutoSelectedDraftModelPath(
				[siblingDflash, secondSibling],
				target.file.filePath,
				"",
				"dflash",
			),
		).toBeNull();
	});
});

describe("draft model picker fallback", () => {
	it("wires mode-aware candidates and same-directory auto-selection into the launch dialog", () => {
		const source = readFileSync(
			new URL(
				"../src/pages/Servers/LaunchServer/LaunchServerDialog.tsx",
				import.meta.url,
			),
			"utf8",
		);

		expect(source).toContain("getDraftModelCandidates(modelEntries, selectedEntry, specDecodeMode");
		expect(source).toContain("getAutoSelectedDraftModelPath(");
		expect(source).toContain("draftModelPath: autoPath");
	});

	it("keeps an explicit GGUF file picker when no indexed candidate is suitable", () => {
		const source = readFileSync(
			new URL(
				"../src/pages/Servers/LaunchServer/SpeculativeDecodingCard.tsx",
				import.meta.url,
			),
			"utf8",
		);

		expect(source).toContain("await import('@tauri-apps/plugin-dialog')");
		expect(source).toContain("filters: [{ name: 'GGUF', extensions: ['gguf'] }]");
		expect(source).toContain("if (typeof selected === 'string') onSelect(selected)");
		expect(source).toContain("common:ui.externalMtpDraftModelOptional");
		expect(source).toContain("common:ui.leaveEmptyToUseBuiltInMtp");
	});
});
