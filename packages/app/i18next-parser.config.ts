import { defineConfig } from 'i18next-parser/config';

export default defineConfig({
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  locales: ['en', 'zh-CN'],
  defaultNamespace: 'common',
  namespaceFunction: 'useTranslation',
  keySeparator: '.',
  createOldCatalogs: false,
  sort: true,
  defaultValue: (_locale: string, _namespace: string, _key: string, value: string) => value,
  keepRemoved: false,
  lineEnding: 'lf',
});
