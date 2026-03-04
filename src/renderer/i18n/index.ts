import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/storage';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  mergeWithFallback,
  ensureAndSwitch,
} from '@/common/i18n';

// Synchronous import of fallback locale so t() never returns raw keys on startup
import fallbackLocale from './locales/en-US/index';

export type { I18nKey, I18nModule } from './i18n-keys';

// Re-exports
export { normalizeLanguageCode, SUPPORTED_LANGUAGES as supportedLanguages } from '@/common/i18n';
export type { SupportedLanguage } from '@/common/i18n';

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Pre-populate cache with the synchronously loaded fallback locale
loadedTranslations.set(DEFAULT_LANGUAGE, fallbackLocale as Record<string, unknown>);

/**
 * Dynamically load a locale by importing its index barrel.
 * Each locale directory has an `index.ts` that re-exports all JSON modules,
 * so one dynamic import is enough (no need to iterate over module names).
 */
async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  const cached = loadedTranslations.get(locale);
  if (cached) return cached;

  try {
    const mod = await import(`./locales/${locale}/index`);
    const modules = (mod.default ?? mod) as Record<string, unknown>;

    const finalModules =
      locale === DEFAULT_LANGUAGE
        ? modules
        : mergeWithFallback(await loadLocaleModules(DEFAULT_LANGUAGE), modules);

    loadedTranslations.set(locale, finalModules);
    return finalModules;
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error);
    if (locale !== DEFAULT_LANGUAGE) {
      return loadLocaleModules(DEFAULT_LANGUAGE);
    }
    throw error;
  }
}

// Initialize i18n with fallback locale loaded synchronously to avoid FOUC
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      [DEFAULT_LANGUAGE]: {
        translation: fallbackLocale as Record<string, unknown>,
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
  await ConfigStorage.set('language', normalizeLanguageCode(lang));
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
