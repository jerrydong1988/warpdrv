import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import commonEn from '../i18n/locales/en/common.json';

// The server sends human-readable English error strings (e.g. "Not
// authenticated"), while the locale files carry the canonical translation
// under errors.* keys whose English values match those strings. Build a
// value → key lookup so we can translate by text, not by code.
type TErrorMap = Record<string, string>;
const ERROR_TEXT_TO_KEY: TErrorMap = {};
for (const [key, value] of Object.entries((commonEn as { errors?: Record<string, unknown> }).errors ?? {})) {
	if (typeof value === 'string' && value.length > 0) {
		ERROR_TEXT_TO_KEY[value] = key;
	}
}

function cleanErrorText(raw: string): string {
	return raw
		.replace(/^Error:\s*/i, '')
		.replace(/^HTTP \d+:?\s*/i, '')
		.trim();
}

/**
 * Translate a raw server/API error string into the current locale.
 * Falls back to the original string when there is no match, so it is safe to
 * call on any error text. Not a React hook — usable anywhere (e.g. the api
 * client layer) once i18next has been initialized.
 */
export function translateServerError(rawError: string): string {
	if (!rawError) return rawError;
	const cleaned = cleanErrorText(rawError);

	// Exact text match against the canonical English messages
	const exactKey = ERROR_TEXT_TO_KEY[cleaned];
	if (exactKey) {
		const translated = i18next.t(`errors.${exactKey}`);
		if (translated !== `errors.${exactKey}`) return translated;
	}

	// Prefix match — server messages often append context ("Server not found: xyz")
	for (const [text, key] of Object.entries(ERROR_TEXT_TO_KEY)) {
		if (cleaned.startsWith(text)) {
			const translated = i18next.t(`errors.${key}`);
			if (translated !== `errors.${key}`) return translated;
		}
	}

	return rawError;
}

/** React-hook wrapper for use inside components. */
export function useTranslateError(): (rawError: string) => string {
	const { t } = useTranslation('common');
	return (rawError: string): string => {
		if (!rawError) return rawError;
		const cleaned = cleanErrorText(rawError);
		const exactKey = ERROR_TEXT_TO_KEY[cleaned];
		if (exactKey) {
			const translated = t(`errors.${exactKey}`);
			if (translated !== `errors.${exactKey}`) return translated;
		}
		for (const [text, key] of Object.entries(ERROR_TEXT_TO_KEY)) {
			if (cleaned.startsWith(text)) {
				const translated = t(`errors.${key}`);
				if (translated !== `errors.${key}`) return translated;
			}
		}
		return rawError;
	};
}
