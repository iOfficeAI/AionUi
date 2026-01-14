import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';
import jaJP from './locales/ja-JP.json';
import zhTW from './locales/zh-TW.json';
import koKR from './locales/ko-KR.json';
import { ConfigStorage } from '@/common/storage';

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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
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
  .catch((error) => {
    console.error('Failed to initialize i18n:', error);
  });

ConfigStorage.get('language')
  .then((language) => {
    if (language) {
      i18n.changeLanguage(language).catch((error) => {
        console.error('Failed to change language:', error);
      });
    }
  })
  .catch((error) => {
    console.error('Failed to load language setting:', error);
  });

export default i18n;
