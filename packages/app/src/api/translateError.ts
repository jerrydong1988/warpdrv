import { useTranslation } from 'react-i18next';

export function useTranslateError() {
  const { t } = useTranslation('common');
  return (errorCode: string): string => {
    const key = `errors.${errorCode}`;
    const translated = t(key);
    return translated === key ? errorCode : translated;
  };
}
