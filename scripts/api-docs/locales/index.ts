import { createInstance } from 'i18next';
import en from './en';
import zhCN from './zh-CN';

const instance = createInstance();
// Built-in resources initialize synchronously without a backend or language detector.
void instance.init({
  initImmediate: false,
  lng: 'zh-CN',
  fallbackLng: 'en',
  defaultNS: 'apiDocs',
  resources: { en: { apiDocs: en }, 'zh-CN': { apiDocs: zhCN } },
  interpolation: { escapeValue: false },
});
export const t = (key: keyof typeof en, values: Record<string, string | number> = {}): string =>
  instance.t(key, values);
