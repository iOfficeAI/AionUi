/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { ProcessConfig } from '@process/utils/initStorage';
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  mergeWithFallback,
  ensureAndSwitch,
  type LocaleData,
} from '@/common/config/i18n';

// Static imports – Vite bundles these into the main-process output so they
// work correctly in both development and production (no fs.readFile needed).
import enUS from '@renderer/services/i18n/locales/en-US/index';
import zhCN from '@renderer/services/i18n/locales/zh-CN/index';
import jaJP from '@renderer/services/i18n/locales/ja-JP/index';
import zhTW from '@renderer/services/i18n/locales/zh-TW/index';
import koKR from '@renderer/services/i18n/locales/ko-KR/index';
import trTR from '@renderer/services/i18n/locales/tr-TR/index';

// All locale data keyed by language code.
// NOTE: When adding a new language, add a static import above and an entry here.
// These MUST be static imports (not dynamic) because the main process is bundled
// by Vite and the JSON files won't exist on disk in production.
const localeData: LocaleData = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'zh-TW': zhTW,
  'ko-KR': koKR,
  'tr-TR': trTR,
};

const fallbackData = localeData[DEFAULT_LANGUAGE] ?? {};

function getLocaleModules(locale: string): Record<string, unknown> {
  const data = localeData[locale];
  if (!data) return fallbackData;
  if (locale === DEFAULT_LANGUAGE) return data;
  return mergeWithFallback(fallbackData, data);
}

/** Resolves when i18n is fully initialized with the user's language */
export const i18nReady = (async (): Promise<void> => {
  await i18n.init({
    resources: {
      [DEFAULT_LANGUAGE]: { translation: getLocaleModules(DEFAULT_LANGUAGE) },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: { escapeValue: false },
  });

  const language = await ProcessConfig.get('language');
  if (language) {
    await ensureAndSwitch(i18n, language, getLocaleModules);
  }
})().catch((error) => {
  console.error('[Main Process] Failed to initialize i18n:', error);
});

/**
 * Set initial language (called after storage is ready)
 */
export async function setInitialLanguage(language: string | undefined): Promise<void> {
  await i18nReady;
  if (language) {
    await ensureAndSwitch(i18n, language, getLocaleModules);
  }
}

/**
 * Change language
 */
export async function changeLanguage(language: string): Promise<void> {
  await i18nReady;
  await ensureAndSwitch(i18n, language, getLocaleModules);
}

export { normalizeLanguageCode };
export default i18n;
