import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import hi from './locales/hi.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import th from './locales/th.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import pt from './locales/pt.json';
import vi from './locales/vi.json';

import { logger } from '../utils/logger';
// Determine the device locale
const deviceLocale = Localization.locale;
const detectedLanguage = deviceLocale.startsWith('ja') ? 'ja' : 
                        deviceLocale.startsWith('zh') ? 'zh' : 
                        deviceLocale.startsWith('hi') ? 'hi' : 
                        deviceLocale.startsWith('ko') ? 'ko' : 
                        deviceLocale.startsWith('es') ? 'es' : 
                        deviceLocale.startsWith('ar') ? 'ar' : 
                        deviceLocale.startsWith('fr') ? 'fr' : 
                        deviceLocale.startsWith('de') ? 'de' : 
                        deviceLocale.startsWith('th') ? 'th' : 
                        deviceLocale.startsWith('it') ? 'it' : 
                        deviceLocale.startsWith('ru') ? 'ru' : 
                        deviceLocale.startsWith('pt') ? 'pt' : 
                        deviceLocale.startsWith('vi') ? 'vi' : 'en';

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
      ko: { translation: ko },
      es: { translation: es },
      ar: { translation: ar },
      fr: { translation: fr },
      de: { translation: de },
      th: { translation: th },
      it: { translation: it },
      ru: { translation: ru },
      pt: { translation: pt },
      vi: { translation: vi },
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