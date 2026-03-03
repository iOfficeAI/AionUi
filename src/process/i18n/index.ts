/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import i18n from 'i18next';
import { ConfigStorage } from '@/common/storage';

// Module names for each locale
const MODULES = ['common', 'agentMode', 'update', 'login', 'fileSelection', 'preview', 'conversation', 'settings', 'messages', 'mcp', 'acp', 'codex', 'tools', 'gemini', 'cron', 'guid', 'agent'] as const;

// Supported languages
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeLanguageCode(language: string): SupportedLanguage {
  const normalized = language.replace('_', '-');
  if (SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }

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
      return 'en-US';
  }
}

// Cache for loaded translations
const loadedTranslations = new Map<string, Record<string, unknown>>();

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

// Synchronously load locale modules (for main process)
function loadLocaleModules(locale: string): Record<string, unknown> {
  if (loadedTranslations.has(locale)) {
    return loadedTranslations.get(locale)!;
  }

  const modules: Record<string, unknown> = {};

  try {
    const localeDir = path.resolve(__dirname, '../../../renderer/i18n/locales', locale);

    for (const moduleName of MODULES) {
      const moduleFile = path.join(localeDir, `${moduleName}.json`);
      if (fs.existsSync(moduleFile)) {
        const content = fs.readFileSync(moduleFile, 'utf-8');
        modules[moduleName] = JSON.parse(content);
      } else {
        modules[moduleName] = {};
      }
    }

    const finalModules = locale === 'en-US' ? modules : mergeWithFallback(loadLocaleModules('en-US'), modules);

    loadedTranslations.set(locale, finalModules);
    return finalModules;
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
      const normalizedLanguage = normalizeLanguageCode(language);
      // Load the language if not already loaded
      if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
        const translation = loadLocaleModules(normalizedLanguage);
        i18n.addResourceBundle(normalizedLanguage, 'translation', translation, true, true);
      }
      i18n.changeLanguage(normalizedLanguage).catch((error) => {
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
  const normalizedLanguage = normalizeLanguageCode(language);

  // Load the language if not already loaded
  if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
    const translation = loadLocaleModules(normalizedLanguage);
    i18n.addResourceBundle(normalizedLanguage, 'translation', translation, true, true);
  }
  await i18n.changeLanguage(normalizedLanguage);
}

export default i18n;
