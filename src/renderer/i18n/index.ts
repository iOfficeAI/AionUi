import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/storage';
import i18nConfig from '@/shared/i18n-config.json';

export type { I18nKey, I18nModule } from './i18n-keys';

const DEFAULT_LANGUAGE = i18nConfig.fallbackLanguage;

// Supported languages
export const supportedLanguages = i18nConfig.supportedLanguages;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Module names for each locale
const MODULES = i18nConfig.modules;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeWithFallback(fallback: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fallback };

  for (const [key, value] of Object.entries(target)) {
    const fallbackValue = merged[key];
    if (isPlainObject(fallbackValue) && isPlainObject(value)) {
      merged[key] = mergeWithFallback(fallbackValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

// Import function to dynamically load locale modules
async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  if (loadedTranslations.has(locale)) {
    return loadedTranslations.get(locale)!;
  }

  const modules: Record<string, unknown> = {};

  try {
    const importPromises = MODULES.map(async (moduleName) => {
      try {
        const module = await import(`./locales/${locale}/${moduleName}.json`);
        return [moduleName, (module.default || {}) as Record<string, unknown>] as const;
      } catch {
        return [moduleName, {} as Record<string, unknown>] as const;
      }
    });

    const results = await Promise.all(importPromises);

    for (const [moduleName, content] of results) {
      modules[moduleName] = content;
    }

    const finalModules = locale === DEFAULT_LANGUAGE ? modules : mergeWithFallback(await loadLocaleModules(DEFAULT_LANGUAGE), modules);

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

// Initialize i18n with lazy loading
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {}, // Start with empty resources, will be loaded on demand
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
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

    // Normalize language code
    const normalizedLang = normalizeLanguageCode(language);

    // Load and set the language
    const translation = await loadLocaleModules(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
    await i18n.changeLanguage(normalizedLang);
  } catch (error) {
    console.error('Failed to initialize language:', error);
  }
}

// Normalize language code to match supported languages
function normalizeLanguageCode(lang: string): SupportedLanguage {
  const normalized = lang.replace('_', '-');

  // Direct match
  if (supportedLanguages.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }

  // Handle language-only codes (e.g., 'zh' -> 'zh-CN')
  const langOnly = normalized.toLowerCase().split('-')[0];
  switch (langOnly) {
    case 'zh':
      return 'zh-CN';
    case 'ja':
      return 'ja-JP';
    case 'ko':
      return 'ko-KR';
    case 'tr':
      return 'tr-TR';
    default:
      return DEFAULT_LANGUAGE;
  }
}

// Listen for language changes and lazy load translations
i18n.on('languageChanged', async (lang: string) => {
  const normalizedLang = normalizeLanguageCode(lang);

  // Skip if already loaded
  if (i18n.hasResourceBundle(normalizedLang, 'translation')) {
    return;
  }

  try {
    const translation = await loadLocaleModules(normalizedLang);
    i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
  } catch (error) {
    console.error(`Failed to load language ${normalizedLang}:`, error);
  }
});

// Initialize on module load
void initLanguage();

// Export a function to change language with lazy loading
export async function changeLanguage(lang: string): Promise<void> {
  const normalizedLang = normalizeLanguageCode(lang);

  try {
    // Load translation if not already loaded
    if (!i18n.hasResourceBundle(normalizedLang, 'translation')) {
      const translation = await loadLocaleModules(normalizedLang);
      i18n.addResourceBundle(normalizedLang, 'translation', translation, true, true);
    }

    await i18n.changeLanguage(normalizedLang);
    await ConfigStorage.set('language', normalizedLang);
  } catch (error) {
    console.error(`Failed to change language to ${normalizedLang}:`, error);
    throw error;
  }
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
