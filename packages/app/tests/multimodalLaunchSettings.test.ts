import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("multimodal launch settings", () => {
	it("exposes detected projector candidates and a native GGUF picker", () => {
		const cardSource = readFileSync(
			new URL(
				"../src/pages/Servers/LaunchServer/MultiModalCard.tsx",
				import.meta.url,
			),
			"utf8",
		);
		const dialogSource = readFileSync(
			new URL(
				"../src/pages/Servers/LaunchServer/LaunchServerDialog.tsx",
				import.meta.url,
			),
			"utf8",
		);

		expect(cardSource).toContain("await import('@tauri-apps/plugin-dialog')");
		expect(cardSource).toContain("onParamChange('mmprojPath', selected)");
		expect(cardSource).toContain("options={mmprojOptions}");
		expect(cardSource).not.toContain("disabled={!hasMmproj}");
		expect(dialogSource).toContain("model.files.filter(file => file.isMmproj)");
		expect(dialogSource).toContain("detectedMmproj={selectedEntry?.model.mmprojFile ?? null}");
	});

	it("uses one canonical load-mode selector instead of independent legacy toggles", () => {
		const source = readFileSync(
			new URL(
				"../src/pages/Servers/LaunchServer/OptionsCard.tsx",
				import.meta.url,
			),
			"utf8",
		);

		expect(source).toContain("resolveLlamaLoadMode(params)");
		expect(source).toContain("llamaLoadModeToLegacyParams(nextMode)");
		expect(source).toContain('onParamChange("loadMode", nextMode)');
		expect(source).not.toContain('label={i18nextSingleton.t("common:ui.mmap")}');
		expect(source).not.toContain('label={i18nextSingleton.t("common:ui.directIO")}');
	});
});
