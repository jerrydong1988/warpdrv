import { enResources } from "./locales/en";
import { zhCNResources } from "./locales/zh-CN";

export type TLocaleDirection = "ltr" | "rtl";

interface ILocaleDefinition<TCode extends string> {
	code: TCode;
	nativeName: string;
	direction: TLocaleDirection;
	aliases: readonly string[];
	resources: Record<string, object>;
}

function defineLocale<const TCode extends string>(
	definition: ILocaleDefinition<TCode>,
): ILocaleDefinition<TCode> {
	return definition;
}

// Adding a locale only requires a resource bundle and one registry entry.
// Core initialization and the settings selector derive everything from here.
export const LOCALE_REGISTRY = [
	defineLocale({
		code: "en",
		nativeName: "English",
		direction: "ltr",
		aliases: ["en"],
		resources: enResources,
	}),
	defineLocale({
		code: "zh-CN",
		nativeName: "简体中文",
		direction: "ltr",
		aliases: ["zh", "zh-Hans"],
		resources: zhCNResources,
	}),
] as const;

export type SupportedLocale = (typeof LOCALE_REGISTRY)[number]["code"];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = LOCALE_REGISTRY.map(
	(locale) => locale.code,
);
export const LOCALE_OPTIONS = LOCALE_REGISTRY.map(({ code, nativeName }) => ({
	label: nativeName,
	value: code,
}));
export const NAMESPACES = Object.keys(enResources);

export const I18N_RESOURCES = Object.fromEntries(
	LOCALE_REGISTRY.map(({ code, resources }) => [code, resources]),
) as Record<SupportedLocale, Record<string, object>>;

function normalizeLocaleCode(locale: string): string {
	return locale.trim().replaceAll("_", "-").toLowerCase();
}

export function resolveSupportedLocale(locale: string | null | undefined): SupportedLocale | null {
	if (!locale) return null;
	const normalized = normalizeLocaleCode(locale);
	const candidates = LOCALE_REGISTRY.flatMap((definition) =>
		[definition.code, ...definition.aliases].map((candidate) => ({
			locale: definition.code,
			normalized: normalizeLocaleCode(candidate),
		})),
	);

	const exact = candidates.find((candidate) => candidate.normalized === normalized);
	if (exact) return exact.locale;

	// Prefer the most specific declared alias (for example zh-Hans over zh).
	return (
		candidates
			.filter((candidate) => normalized.startsWith(`${candidate.normalized}-`))
			.sort((left, right) => right.normalized.length - left.normalized.length)[0]?.locale ?? null
	);
}

export function getLocaleDirection(locale: SupportedLocale): TLocaleDirection {
	return LOCALE_REGISTRY.find((definition) => definition.code === locale)?.direction ?? "ltr";
}

export function detectPreferredLocale({
	storedLocale,
	browserLocales = [],
}: {
	storedLocale?: string | null;
	browserLocales?: readonly (string | null | undefined)[];
}): SupportedLocale {
	const stored = resolveSupportedLocale(storedLocale);
	if (stored) return stored;

	for (const browserLocale of browserLocales) {
		const resolved = resolveSupportedLocale(browserLocale);
		if (resolved) return resolved;
	}
	return DEFAULT_LOCALE;
}
