/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { ConfigStorage } from '@/common/storage';

// Module names for each locale
const MODULES = [
  'common',
  'agentMode',
  'update',
  'login',
  'fileSelection',
  'preview',
  'conversation',
  'settings',
  'messages',
  'mcp',
  'acp',
  'codex',
  'tools',
  'gemini',
  'cron',
  'guid',
  'agent',
] as const;

// Supported languages
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'] as const;

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

// Synchronously load locale modules (for main process)
function loadLocaleModules(locale: string): Record<string, unknown> {
  // Check cache first
  if (loadedTranslations.has(locale)) {
    return loadedTranslations.get(locale)!;
  }

  // In main process, we need to use require for synchronous loading
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const fs = require('fs');

  let modules: Record<string, unknown> = {};

  try {
    const localeDir = path.resolve(__dirname, '../../../renderer/i18n/locales', locale);

    for (const moduleName of MODULES) {
      const moduleFile = path.join(localeDir, `${moduleName}.json`);
      if (fs.existsSync(moduleFile)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const content = require(moduleFile);
        modules[moduleName] = content;
      }
    }

    // Cache the loaded translation
    loadedTranslations.set(locale, modules);
    return modules;
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error);
    if (locale !== 'en-US') {
      return loadLocaleModules('en-US');
    }
    return {};
  }
}

// Initialize resources with loaded translations
const resources: Record<string, { translation: Record<string, unknown> }> = {};

// Pre-load default language (en-US)
resources['en-US'] = { translation: loadLocaleModules('en-US') };

// Initialize i18next for main process
i18n
  .init({
    resources,
    fallbackLng: 'en-US',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })
  .catch((error) => {
    console.error('[Main Process] Failed to initialize i18n:', error);
  });

// Load language setting from storage and apply
ConfigStorage.get('language')
  .then((language) => {
    if (language) {
      // Load the language if not already loaded
      if (!i18n.hasResourceBundle(language, 'translation')) {
        const translation = loadLocaleModules(language);
        i18n.addResourceBundle(language, 'translation', translation, true, true);
      }
      i18n.changeLanguage(language).catch((error) => {
        console.error('[Main Process] Failed to change language:', error);
      });
    }
  })
  .catch((error) => {
    console.error('[Main Process] Failed to load language setting:', error);
  });

/**
 * 切换语言
 * Change language
 *
 * 可以在其他地方调用此函数来切换主进程的语言
 * Can be called from elsewhere to change the main process language
 */
export async function changeLanguage(language: string): Promise<void> {
  // Load the language if not already loaded
  if (!i18n.hasResourceBundle(language, 'translation')) {
    const translation = loadLocaleModules(language);
    i18n.addResourceBundle(language, 'translation', translation, true, true);
  }
  await i18n.changeLanguage(language);
}

export default i18n;
