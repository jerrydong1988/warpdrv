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

export const NAMESPACES = [
  'common',
  'settings',
  'chat',
  'onboarding',
  'home',
  'servers',
  'backends',
  'models',
  'hub',
  'mcp',
  'recipes',
  'checkpoints',
  'proxy',
  'about',
] as const;

export { type SupportedLocale };

export async function initI18n(locale: SupportedLocale = 'en'): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: NAMESPACES as unknown as string[],
    interpolation: {
      escapeValue: false,
    },
  });
}
