import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";
import {
	createI18nOptions,
	DEFAULT_LOCALE,
	detectPreferredLocale,
	LOCALE_OPTIONS,
	LOCALE_REGISTRY,
	LOCALE_STORAGE_KEY,
	persistLocale,
	readPersistedLocale,
	resolveSupportedLocale,
	SUPPORTED_LOCALES,
} from "../src/i18n";

describe("i18n locale registry", () => {
	it("derives supported locales and selector options from registry entries", () => {
		expect(SUPPORTED_LOCALES).toEqual(LOCALE_REGISTRY.map((locale) => locale.code));
		expect(LOCALE_OPTIONS).toEqual(
			LOCALE_REGISTRY.map((locale) => ({
				label: locale.nativeName,
				value: locale.code,
			})),
		);
		for (const locale of LOCALE_REGISTRY) {
			expect(locale.resources.common).toBeDefined();
		}
	});

	it("resolves exact, regional, script, and underscore locale forms", () => {
		expect(resolveSupportedLocale("zh-CN")).toBe("zh-CN");
		expect(resolveSupportedLocale("zh-Hans-SG")).toBe("zh-CN");
		expect(resolveSupportedLocale("EN_us")).toBe("en");
		expect(resolveSupportedLocale("de-DE")).toBeNull();
	});
});

describe("i18n language detection and persistence", () => {
	it("prefers a persisted locale over browser preferences", () => {
		expect(
			detectPreferredLocale({
				storedLocale: "zh-CN",
				browserLocales: ["en-US"],
			}),
		).toBe("zh-CN");
	});

	it("uses the first supported browser locale and otherwise falls back to English", () => {
		expect(
			detectPreferredLocale({
				storedLocale: "unsupported",
				browserLocales: ["de-DE", "zh-Hans-CN", "en-US"],
			}),
		).toBe("zh-CN");
		expect(detectPreferredLocale({ browserLocales: ["de-DE"] })).toBe(DEFAULT_LOCALE);
	});

	it("persists and reads a locale through the storage boundary", () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		};

		persistLocale("zh-CN", storage);
		expect(values.get(LOCALE_STORAGE_KEY)).toBe("zh-CN");
		expect(readPersistedLocale(storage)).toBe("zh-CN");
	});

	it("continues safely when storage access is blocked", () => {
		const blockedStorage = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		};

		expect(() => persistLocale("zh-CN", blockedStorage)).not.toThrow();
		expect(readPersistedLocale(blockedStorage)).toBeNull();
	});
});

describe("i18n runtime behavior", () => {
	it("falls back to English when the active locale lacks a resource bundle", async () => {
		const instance = createInstance();
		await instance.init(createI18nOptions("zh-CN", vi.fn()));
		instance.removeResourceBundle("zh-CN", "common");

		expect(instance.t("ui.cancel", { ns: "common" })).toBe("Cancel");
	});

	it("reports missing keys while returning the normal i18next fallback value", async () => {
		const reportMissingKey = vi.fn();
		const instance = createInstance();
		await instance.init(createI18nOptions("en", reportMissingKey));

		expect(instance.t("ui.__missing_runtime_test__", { ns: "common" })).toBe(
			"ui.__missing_runtime_test__",
		);
		expect(reportMissingKey).toHaveBeenCalledWith("common", "ui.__missing_runtime_test__");
	});
});
