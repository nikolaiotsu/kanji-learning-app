import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import hi from './locales/hi.json';

import { logger } from '../utils/logger';
// Determine the device locale
const deviceLocale = Localization.locale;
const detectedLanguage = deviceLocale.startsWith('ja') ? 'ja' : 
                        deviceLocale.startsWith('zh') ? 'zh' : 
                        deviceLocale.startsWith('hi') ? 'hi' : 'en';

logger.log('[i18n] Device locale:', deviceLocale, 'Detected language:', detectedLanguage);

// Initialize i18n synchronously
i18next
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      zh: { translation: zh },
      hi: { translation: hi },
    },
    lng: detectedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    // Add these options to ensure proper initialization in production builds
    initImmediate: false, // Initialize synchronously
    debug: __DEV__, // Enable debug in development
  });

// Ensure i18n is ready before export
if (!i18next.isInitialized) {
  logger.warn('[i18n] i18next not initialized properly');
}

export default i18next; 