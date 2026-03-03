/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import i18n from 'i18next';
import { ConfigStorage } from '@/common/storage';
import i18nConfig from '@/shared/i18n-config.json';

const MODULES = i18nConfig.modules;
const SUPPORTED_LANGUAGES = i18nConfig.supportedLanguages;
const DEFAULT_LANGUAGE = i18nConfig.fallbackLanguage;
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
      return DEFAULT_LANGUAGE;
  }
}

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

async function loadLocaleModules(locale: string): Promise<Record<string, unknown>> {
  if (loadedTranslations.has(locale)) {
    return loadedTranslations.get(locale)!;
  }

  const localeDir = path.resolve(__dirname, '../../../renderer/i18n/locales', locale);
  const modules: Record<string, unknown> = {};

  try {
    const entries = await Promise.all(
      MODULES.map(async (moduleName) => {
        const moduleFile = path.join(localeDir, `${moduleName}.json`);
        try {
          const content = await fs.promises.readFile(moduleFile, 'utf-8');
          return [moduleName, JSON.parse(content) as Record<string, unknown>] as const;
        } catch {
          return [moduleName, {} as Record<string, unknown>] as const;
        }
      })
    );

    for (const [moduleName, content] of entries) {
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
    return {};
  }
}

const initPromise = (async (): Promise<void> => {
  const resources: Record<string, { translation: Record<string, unknown> }> = {
    [DEFAULT_LANGUAGE]: { translation: await loadLocaleModules(DEFAULT_LANGUAGE) },
  };

  await i18n.init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

  const language = await ConfigStorage.get('language');
  if (!language) {
    return;
  }

  const normalizedLanguage = normalizeLanguageCode(language);
  if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
    const translation = await loadLocaleModules(normalizedLanguage);
    i18n.addResourceBundle(normalizedLanguage, 'translation', translation, true, true);
  }

  await i18n.changeLanguage(normalizedLanguage);
})().catch((error) => {
  console.error('[Main Process] Failed to initialize i18n:', error);
});

/**
 * 切换语言
 * Change language
 *
 * 可以在其他地方调用此函数来切换主进程的语言
 * Can be called from elsewhere to change the main process language
 */
export async function changeLanguage(language: string): Promise<void> {
  await initPromise;

  const normalizedLanguage = normalizeLanguageCode(language);
  if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
    const translation = await loadLocaleModules(normalizedLanguage);
    i18n.addResourceBundle(normalizedLanguage, 'translation', translation, true, true);
  }

  await i18n.changeLanguage(normalizedLanguage);
}

export default i18n;
