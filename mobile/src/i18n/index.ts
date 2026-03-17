import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';

const LANGUAGE_KEY = 'aionui_language';

const resources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
};

const detectDeviceLanguage = (): string => {
  const deviceLocale = Localization.getLocales()[0]?.languageTag || 'en';
  if (deviceLocale.startsWith('zh')) return 'zh-CN';
  return 'en-US';
};

const getInitialLanguage = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored === 'system') return detectDeviceLanguage();
    if (stored && stored in resources) return stored;
  } catch {
    // Fall through
  }
  return detectDeviceLanguage();
};

i18n.use(initReactI18next);

export const initI18n = async () => {
  const lng = await getInitialLanguage();

  await i18n.init({
    resources,
    lng,
    fallbackLng: 'en-US',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18n;
};

export const changeLanguage = async (lang: string) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    if (lang === 'system') {
      await i18n.changeLanguage(detectDeviceLanguage());
    } else {
      await i18n.changeLanguage(lang);
    }
  } catch (e) {
    console.error('[i18n] Failed to change language:', e);
  }
};

export const getLanguagePreference = async (): Promise<string> => {
  try {
    return (await AsyncStorage.getItem(LANGUAGE_KEY)) || 'system';
  } catch {
    return 'system';
  }
};

export default i18n;
