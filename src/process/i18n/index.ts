/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from 'i18next';
import { ConfigStorage } from '@/common/storage';

// Import language resources
import zhCN from '@/renderer/i18n/locales/zh-CN.json';
import enUS from '@/renderer/i18n/locales/en-US.json';
import jaJP from '@/renderer/i18n/locales/ja-JP.json';
import zhTW from '@/renderer/i18n/locales/zh-TW.json';
import koKR from '@/renderer/i18n/locales/ko-KR.json';

const resources = {
  'zh-CN': {
    translation: zhCN,
  },
  'en-US': {
    translation: enUS,
  },
  'ja-JP': {
    translation: jaJP,
  },
  'zh-TW': {
    translation: zhTW,
  },
  'ko-KR': {
    translation: koKR,
  },
};

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
  await i18n.changeLanguage(language);
}

export default i18n;
