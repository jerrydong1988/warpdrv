import { DEFAULT_SETTINGS, type ISettings } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface SettingsSlice {
	settings: ISettings;
	locale: 'en' | 'zh-CN';
	setLocale: (locale: 'en' | 'zh-CN') => void;
}

export const settingsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	settings: DEFAULT_SETTINGS as ISettings,
	locale: (DEFAULT_SETTINGS.locale ?? 'en') as 'en' | 'zh-CN',
	setLocale: (locale) => {
		_setState((s) => {
			s.locale = locale;
			if (s.settings) {
				(s.settings as ISettings).locale = locale;
			}
		});
	},
});
