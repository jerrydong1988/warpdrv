// Locale-aware formatting helpers. All follow the app locale (i18next) instead
// of the browser/OS locale, so dates and numbers match the selected UI language
// (previously several call sites hardcoded 'en-US' and rendered English months
// in the zh-CN UI, and bytes/age logic was duplicated across four files).
import i18next from 'i18next';

function resolveLocale(): string {
	return i18next.resolvedLanguage ?? 'en';
}

export function formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(resolveLocale(), options ?? { month: 'short', day: 'numeric' }).format(date);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(resolveLocale(), options).format(value);
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${bytes} B`;
}

// Relative age in the current locale. Reuses the translated keys that
// LoadCheckpointDialog already relied on, so every caller gets one impl.
export function formatAge(createdAt: number): string {
	const ms = Date.now() - createdAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return i18next.t('servers:checkpoints.ageMinutes', { count: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return i18next.t('servers:checkpoints.ageHours', { count: hours });
	const days = Math.floor(hours / 24);
	return i18next.t('servers:checkpoints.ageDays', { count: days });
}
