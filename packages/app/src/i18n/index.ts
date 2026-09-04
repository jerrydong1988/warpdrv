import i18next, { type InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import {
	DEFAULT_LOCALE,
	detectPreferredLocale,
	getLocaleDirection,
	I18N_RESOURCES,
	NAMESPACES,
	resolveSupportedLocale,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "./registry";

export {
	DEFAULT_LOCALE,
	detectPreferredLocale,
	LOCALE_OPTIONS,
	LOCALE_REGISTRY,
	NAMESPACES,
	resolveSupportedLocale,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "./registry";

export const LOCALE_STORAGE_KEY = "warpcore.locale";

type TLocaleStorage = Pick<Storage, "getItem" | "setItem">;
type TMissingKeyReporter = (namespace: string, key: string) => void;

let initializationPromise: Promise<void> | null = null;

function getBrowserStorage(): TLocaleStorage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

export function readPersistedLocale(
	storage: TLocaleStorage | undefined = getBrowserStorage(),
): SupportedLocale | null {
	try {
		return resolveSupportedLocale(storage?.getItem(LOCALE_STORAGE_KEY));
	} catch {
		return null;
	}
}

export function persistLocale(
	locale: SupportedLocale,
	storage: TLocaleStorage | undefined = getBrowserStorage(),
): void {
	try {
		storage?.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		// Language switching must still work when persistent storage is blocked.
	}
}

export function getPreferredLocale(): SupportedLocale {
	let browserLocales: readonly (string | undefined)[] = [];
	try {
		browserLocales = globalThis.navigator?.languages?.length
			? globalThis.navigator.languages
			: [globalThis.navigator?.language];
	} catch {
		// A hardened webview may deny navigator access; English remains the fallback.
	}

	return detectPreferredLocale({
		storedLocale: readPersistedLocale(),
		browserLocales,
	});
}

function defaultMissingKeyReporter(namespace: string, key: string): void {
	console.warn(`[i18n] Missing translation key "${namespace}:${key}"`);
}

export function createI18nOptions(
	locale: SupportedLocale,
	reportMissingKey: TMissingKeyReporter = defaultMissingKeyReporter,
): InitOptions {
	return {
		resources: I18N_RESOURCES,
		lng: locale,
		fallbackLng: DEFAULT_LOCALE,
		supportedLngs: [...SUPPORTED_LOCALES],
		load: "currentOnly",
		defaultNS: "common",
		ns: NAMESPACES,
		returnNull: false,
		saveMissing: true,
		missingKeyHandler: (_languages, namespace, key) => {
			reportMissingKey(namespace, key);
		},
		interpolation: {
			escapeValue: false,
		},
	};
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
	persistLocale(locale);
	if (!i18next.isInitialized) await initI18n(locale);
	else if (resolveSupportedLocale(i18next.resolvedLanguage) !== locale) {
		await i18next.changeLanguage(locale);
	}
	applyDocumentAttributes(locale);
}

function applyDocumentAttributes(locale: SupportedLocale): void {
	if (!globalThis.document?.documentElement) return;
	globalThis.document.documentElement.lang = locale;
	globalThis.document.documentElement.dir = getLocaleDirection(locale);
}

export async function initI18n(locale: SupportedLocale = getPreferredLocale()): Promise<void> {
	if (i18next.isInitialized) {
		if (resolveSupportedLocale(i18next.resolvedLanguage) !== locale) {
			await i18next.changeLanguage(locale);
		}
		applyDocumentAttributes(locale);
		return;
	}

	if (!initializationPromise) {
		initializationPromise = i18next
			.use(initReactI18next)
			.init(createI18nOptions(locale))
			.then(() => {
				const resolvedLocale = resolveSupportedLocale(i18next.resolvedLanguage) ?? locale;
				applyDocumentAttributes(resolvedLocale);
			})
			.catch((error) => {
				initializationPromise = null;
				console.error("i18n initialization failed:", error);
				throw error;
			});
	}
	await initializationPromise;
}
