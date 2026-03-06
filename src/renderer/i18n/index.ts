import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/storage';
import { ipcBridge } from '@/common';
import i18nConfig from '@/shared/i18n-config.json';
import { DEFAULT_LANGUAGE, normalizeLanguageCode, mergeWithFallback, ensureAndSwitch, type LocaleData } from '@/common/i18n';

// Static imports for all locales to ensure packaged app can always switch language.
import enUS from './locales/en-US/index';
import zhCN from './locales/zh-CN/index';
import jaJP from './locales/ja-JP/index';
import zhTW from './locales/zh-TW/index';
import koKR from './locales/ko-KR/index';
import trTR from './locales/tr-TR/index';

export type { I18nKey, I18nModule } from './i18n-keys';

// Re-exports
export { normalizeLanguageCode } from '@/common/i18n';
export type { SupportedLanguage } from '@/common/i18n';

export const supportedLanguages = i18nConfig.supportedLanguages;

const localeData: LocaleData = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
  'ko-KR': koKR,
  'tr-TR': trTR,
};

const fallbackLocale = localeData[DEFAULT_LANGUAGE] ?? {};

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Pre-populate cache with the synchronously loaded fallback locale
loadedTranslations.set(DEFAULT_LANGUAGE, fallbackLocale as Record<string, unknown>);

function getLocaleModules(locale: string): Record<string, unknown> {
  const normalized = normalizeLanguageCode(locale);
  const modules = localeData[normalized] ?? fallbackLocale;
  if (normalized === DEFAULT_LANGUAGE) return modules;
  return mergeWithFallback(fallbackLocale, modules);
}

async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  const normalized = normalizeLanguageCode(locale);
  const cached = loadedTranslations.get(normalized);
  if (cached) return cached;

  const modules = getLocaleModules(normalized);
  loadedTranslations.set(normalized, modules);
  return modules;
}

// Initialize i18n with fallback locale loaded synchronously to avoid FOUC
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      [DEFAULT_LANGUAGE]: {
        translation: fallbackLocale,
      },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })
  .catch((error: Error) => {
    console.error('Failed to initialize i18n:', error);
  });

// Load initial language
async function initLanguage(): Promise<void> {
  try {
    const savedLanguage = await ConfigStorage.get('language');
    const language = savedLanguage || i18n.language || DEFAULT_LANGUAGE;
    await ensureAndSwitch(i18n, language, loadLocaleModules);
  } catch (error) {
    console.error('Failed to initialize language:', error);
  }
}

// Listen for language changes and lazy load translations
i18n.on('languageChanged', async (lang: string) => {
  const normalizedLang = normalizeLanguageCode(lang);
  if (i18n.hasResourceBundle(normalizedLang, 'translation')) return;

  try {
    const translation = await loadLocaleModules(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
  } catch (error) {
    console.error(`Failed to load language ${normalizedLang}:`, error);
  }
});

// Initialize on module load
void initLanguage();

/**
 * Change language with lazy loading.
 */
export async function changeLanguage(lang: string): Promise<void> {
  await ensureAndSwitch(i18n, lang, loadLocaleModules);
  const normalized = normalizeLanguageCode(lang);
  await ConfigStorage.set('language', normalized);
  // Notify main process to sync i18n (for tray menu, etc.)
  ipcBridge.systemSettings.changeLanguage.invoke({ language: normalized }).catch(() => {});
}

// Clear translation cache (useful for development/testing)
export function clearTranslationCache(): void {
  loadedTranslations.clear();
}

// Get loaded languages
export function getLoadedLanguages(): string[] {
  return Array.from(loadedTranslations.keys());
}

export default i18n;
