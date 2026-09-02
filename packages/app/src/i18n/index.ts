import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import settingsEn from './locales/en/settings.json';
import chatEn from './locales/en/chat.json';
import onboardingEn from './locales/en/onboarding.json';
import homeEn from './locales/en/home.json';
import serversEn from './locales/en/servers.json';
import backendsEn from './locales/en/backends.json';
import modelsEn from './locales/en/models.json';
import hubEn from './locales/en/hub.json';
import mcpEn from './locales/en/mcp.json';
import recipesEn from './locales/en/recipes.json';
import checkpointsEn from './locales/en/checkpoints.json';
import proxyEn from './locales/en/proxy.json';
import aboutEn from './locales/en/about.json';

import commonZhCN from './locales/zh-CN/common.json';
import settingsZhCN from './locales/zh-CN/settings.json';
import chatZhCN from './locales/zh-CN/chat.json';
import onboardingZhCN from './locales/zh-CN/onboarding.json';
import homeZhCN from './locales/zh-CN/home.json';
import serversZhCN from './locales/zh-CN/servers.json';
import backendsZhCN from './locales/zh-CN/backends.json';
import modelsZhCN from './locales/zh-CN/models.json';
import hubZhCN from './locales/zh-CN/hub.json';
import mcpZhCN from './locales/zh-CN/mcp.json';
import recipesZhCN from './locales/zh-CN/recipes.json';
import checkpointsZhCN from './locales/zh-CN/checkpoints.json';
import proxyZhCN from './locales/zh-CN/proxy.json';
import aboutZhCN from './locales/zh-CN/about.json';

type SupportedLocale = 'en' | 'zh-CN';
const LOCALE_STORAGE_KEY = 'warpcore.locale';
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'zh-CN'];

const resources: Record<SupportedLocale, Record<string, object>> = {
  en: {
    common: commonEn,
    settings: settingsEn,
    chat: chatEn,
    onboarding: onboardingEn,
    home: homeEn,
    servers: serversEn,
    backends: backendsEn,
    models: modelsEn,
    hub: hubEn,
    mcp: mcpEn,
    recipes: recipesEn,
    checkpoints: checkpointsEn,
    proxy: proxyEn,
    about: aboutEn,
  },
  'zh-CN': {
    common: commonZhCN,
    settings: settingsZhCN,
    chat: chatZhCN,
    onboarding: onboardingZhCN,
    home: homeZhCN,
    servers: serversZhCN,
    backends: backendsZhCN,
    models: modelsZhCN,
    hub: hubZhCN,
    mcp: mcpZhCN,
    recipes: recipesZhCN,
    checkpoints: checkpointsZhCN,
    proxy: proxyZhCN,
    about: aboutZhCN,
  },
};

export const NAMESPACES = Object.keys(resources.en) as string[];

export { type SupportedLocale };

let initializationPromise: Promise<void> | null = null;

function normalizeLocale(locale: string | undefined | null): SupportedLocale | null {
	if (!locale) return null;
	if (locale.toLowerCase().startsWith('zh')) return 'zh-CN';
	if (locale.toLowerCase().startsWith('en')) return 'en';
	return null;
}

export function getPreferredLocale(): SupportedLocale {
	let stored: SupportedLocale | null = null;
	try {
		stored = normalizeLocale(globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY));
	} catch {
		// Storage may be unavailable in hardened webviews; browser language remains a safe fallback.
	}
	if (stored) return stored;

	const browserLocales = globalThis.navigator?.languages?.length
		? globalThis.navigator.languages
		: [globalThis.navigator?.language];
	for (const locale of browserLocales) {
		const normalized = normalizeLocale(locale);
		if (normalized) return normalized;
	}

	return 'en';
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
	try {
		globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		// Language switching must still work when persistent storage is blocked.
	}
	if (!i18next.isInitialized) await initI18n(locale);
	else if (normalizeLocale(i18next.resolvedLanguage) !== locale) await i18next.changeLanguage(locale);
	applyDocumentAttributes(locale);
}

// Keep <html lang> and <html dir> in sync with the active locale. dir makes
// the app RTL-ready: rtl locales flip the document direction, everything else
// stays ltr (today's locales are en/zh-CN — both ltr).
function applyDocumentAttributes(locale: string): void {
	if (!globalThis.document?.documentElement) return;
	globalThis.document.documentElement.lang = locale;
	globalThis.document.documentElement.dir = /^(ar|he|fa|ur)(-|$)/i.test(locale) ? 'rtl' : 'ltr';
}

export async function initI18n(locale: SupportedLocale = getPreferredLocale()): Promise<void> {
	if (i18next.isInitialized) {
		if (normalizeLocale(i18next.resolvedLanguage) !== locale) await i18next.changeLanguage(locale);
		return;
	}
	if (!initializationPromise) {
		initializationPromise = i18next.use(initReactI18next).init({
			resources,
			lng: locale,
			fallbackLng: 'en',
			supportedLngs: [...SUPPORTED_LOCALES],
			load: 'currentOnly',
			defaultNS: 'common',
			ns: NAMESPACES,
			returnNull: false,
			// Fail loudly when a key is missing (the rendered output still falls
			// back to the key itself) — silently rendering raw keys is how dead
			// translations linger.
			missingKeyHandler: (_lngs, namespace, key) => {
				console.warn(`[i18n] Missing translation key "${namespace}:${key}"`);
			},
			interpolation: {
				escapeValue: false,
			},
		}).then(() => {
			applyDocumentAttributes(normalizeLocale(i18next.resolvedLanguage) ?? locale);
		}).catch((error) => {
			initializationPromise = null;
			console.error('i18n initialization failed:', error);
			throw error;
		});
	}
	await initializationPromise;
}
