import { DEFAULT_SETTINGS, type ISettings } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface SettingsSlice {
	settings: ISettings;
	setLocale: (locale: 'en' | 'zh-CN') => void;
}

export const settingsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	settings: DEFAULT_SETTINGS as ISettings,
	setLocale: (locale) => {
		_setState((s) => {
			s.settings.locale = locale;
		});
	},
});
