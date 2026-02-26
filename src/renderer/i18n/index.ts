import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { ConfigStorage } from '@/common/storage';

// Supported languages
export const supportedLanguages = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Import function to dynamically load locale modules
async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  // Check cache first
  if (loadedTranslations.has(locale)) {
    return loadedTranslations.get(locale)!;
  }

  // Dynamic import based on locale
  let modules: Record<string, unknown> = {};

  try {
    switch (locale) {
      case 'zh-CN':
        modules = {
          ...(await import('./locales/zh-CN/common.json')).default,
          ...(await import('./locales/zh-CN/agentMode.json')).default,
          ...(await import('./locales/zh-CN/update.json')).default,
          ...(await import('./locales/zh-CN/login.json')).default,
          ...(await import('./locales/zh-CN/fileSelection.json')).default,
          ...(await import('./locales/zh-CN/preview.json')).default,
          ...(await import('./locales/zh-CN/conversation.json')).default,
          ...(await import('./locales/zh-CN/settings.json')).default,
          ...(await import('./locales/zh-CN/messages.json')).default,
          ...(await import('./locales/zh-CN/mcp.json')).default,
          ...(await import('./locales/zh-CN/acp.json')).default,
          ...(await import('./locales/zh-CN/codex.json')).default,
          ...(await import('./locales/zh-CN/tools.json')).default,
          ...(await import('./locales/zh-CN/gemini.json')).default,
          ...(await import('./locales/zh-CN/cron.json')).default,
          ...(await import('./locales/zh-CN/guid.json')).default,
          ...(await import('./locales/zh-CN/agent.json')).default,
        };
        break;
      case 'en-US':
        modules = {
          ...(await import('./locales/en-US/common.json')).default,
          ...(await import('./locales/en-US/agentMode.json')).default,
          ...(await import('./locales/en-US/update.json')).default,
          ...(await import('./locales/en-US/login.json')).default,
          ...(await import('./locales/en-US/fileSelection.json')).default,
          ...(await import('./locales/en-US/preview.json')).default,
          ...(await import('./locales/en-US/conversation.json')).default,
          ...(await import('./locales/en-US/settings.json')).default,
          ...(await import('./locales/en-US/messages.json')).default,
          ...(await import('./locales/en-US/mcp.json')).default,
          ...(await import('./locales/en-US/acp.json')).default,
          ...(await import('./locales/en-US/codex.json')).default,
          ...(await import('./locales/en-US/tools.json')).default,
          ...(await import('./locales/en-US/gemini.json')).default,
          ...(await import('./locales/en-US/cron.json')).default,
          ...(await import('./locales/en-US/guid.json')).default,
          ...(await import('./locales/en-US/agent.json')).default,
        };
        break;
      case 'ja-JP':
      case 'zh-TW':
      case 'ko-KR':
      case 'tr-TR':
        // Fallback to monolithic JSON for languages not yet modularized
        modules = (await import(`./locales/${locale}.json`)).default;
        break;
      default:
        console.warn(`Unknown locale: ${locale}, falling back to en-US`);
        return loadLocaleModules('en-US');
    }

    // Cache the loaded translation
    loadedTranslations.set(locale, modules);
    return modules;
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error);
    // Fallback to en-US if loading fails
    if (locale !== 'en-US') {
      return loadLocaleModules('en-US');
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
    fallbackLng: 'en-US',
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
    const language = savedLanguage || i18n.language || 'en-US';
    
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
  const langOnly = normalized.split('-')[0];
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
      return 'en-US';
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
initLanguage();

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

export default i18n;
