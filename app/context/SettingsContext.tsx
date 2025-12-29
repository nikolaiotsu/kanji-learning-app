import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '../utils/logger';
// Available target languages
export const AVAILABLE_LANGUAGES = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
  ko: 'Korean',
  zh: 'Chinese',
  tl: 'Tagalog',
  ja: 'Japanese',
  ar: 'Arabic',
  pt: 'Portuguese',
  de: 'German',
  hi: 'Hindi',
  eo: 'Esperanto',
  th: 'Thai',
  vi: 'Vietnamese'
};

// Languages that can be forced for detection
export const DETECTABLE_LANGUAGES = {
  en: 'English',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  ar: 'Arabic',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  tl: 'Tagalog',
  pt: 'Portuguese',
  de: 'German',
  hi: 'Hindi',
  eo: 'Esperanto',
  th: 'Thai',
  vi: 'Vietnamese'
};

// Settings context interface
interface SettingsContextType {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => Promise<void>;
  forcedDetectionLanguage: string;
  setForcedDetectionLanguage: (lang: string) => Promise<void>;
  setBothLanguages: (sourceLang: string, targetLang: string) => Promise<void>;
  swapLanguages: () => Promise<void>;
  availableLanguages: typeof AVAILABLE_LANGUAGES;
  detectableLanguages: typeof DETECTABLE_LANGUAGES;
}

// Create the context with default values
const SettingsContext = createContext<SettingsContextType>({
  targetLanguage: 'en',
  setTargetLanguage: async () => {},
  forcedDetectionLanguage: 'ja',
  setForcedDetectionLanguage: async () => {},
  setBothLanguages: async () => {},
  swapLanguages: async () => {},
  availableLanguages: AVAILABLE_LANGUAGES,
  detectableLanguages: DETECTABLE_LANGUAGES
});

// Hook for accessing the settings context
export const useSettings = () => useContext(SettingsContext);

// Storage key for settings
const SETTINGS_STORAGE_KEY = 'app_settings';

// Settings provider component
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State for target language (default to English)
  const [targetLanguage, setTargetLanguageState] = useState<string>('en');
  // State for forced detection language (default to Japanese)
  const [forcedDetectionLanguage, setForcedDetectionLanguageState] = useState<string>('ja');

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (storedSettings) {
          const settings = JSON.parse(storedSettings);
          if (settings.targetLanguage) {
            setTargetLanguageState(settings.targetLanguage);
          }
          if (settings.forcedDetectionLanguage) {
            // Migrate from 'auto' to 'ja' for existing users
            if (settings.forcedDetectionLanguage === 'auto') {
              logger.log('[SettingsContext] Migrating from auto-detect to Japanese');
              settings.forcedDetectionLanguage = 'ja';
              await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
              setForcedDetectionLanguageState('ja');
            } else {
              setForcedDetectionLanguageState(settings.forcedDetectionLanguage);
            }
          }
        }
      } catch (error) {
        logger.error('Error loading settings from storage:', error);
      }
    };

    loadSettings();
  }, []);

  // Function to update target language
  const setTargetLanguage = async (lang: string) => {
    try {
      // If target language would be the same as forced detection language, swap them
      if (lang === forcedDetectionLanguage) {
        logger.log('[SettingsContext] Target language same as detection language - auto-swapping');
        // Swap: set new target to lang, and move current target to detection
        const newDetectionLanguage = targetLanguage;
        
        setTargetLanguageState(lang);
        setForcedDetectionLanguageState(newDetectionLanguage);
        
        const settings = await getSettings();
        settings.targetLanguage = lang;
        settings.forcedDetectionLanguage = newDetectionLanguage;
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        return;
      }
      
      setTargetLanguageState(lang);
      const settings = await getSettings();
      settings.targetLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.log('Error saving settings to storage:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  };

  // Function to update forced detection language
  const setForcedDetectionLanguage = async (lang: string) => {
    try {
      // If forced detection language would be the same as target language, swap them
      if (lang === targetLanguage) {
        logger.log('[SettingsContext] Detection language same as target language - auto-swapping');
        // Swap: set new detection to lang, and move current detection to target
        const newTargetLanguage = forcedDetectionLanguage;
        
        setForcedDetectionLanguageState(lang);
        setTargetLanguageState(newTargetLanguage);
        
        const settings = await getSettings();
        settings.forcedDetectionLanguage = lang;
        settings.targetLanguage = newTargetLanguage;
        await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        return;
      }
      
      setForcedDetectionLanguageState(lang);
      const settings = await getSettings();
      settings.forcedDetectionLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.log('Error saving settings to storage:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  };

  // Function to update both languages atomically (NO auto-swap)
  // Use this after successful translation to preserve the correct target language
  const setBothLanguages = async (sourceLang: string, targetLang: string) => {
    try {
      logger.log(`[SettingsContext] Setting both languages atomically: ${sourceLang} → ${targetLang}`);
      
      setForcedDetectionLanguageState(sourceLang);
      setTargetLanguageState(targetLang);
      
      const settings = await getSettings();
      settings.forcedDetectionLanguage = sourceLang;
      settings.targetLanguage = targetLang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.log('Error saving both languages to storage:', error);
      throw error;
    }
  };

  // Function to swap languages
  const swapLanguages = async () => {
    try {
      // Check if both languages exist in their respective language lists
      const targetExists = AVAILABLE_LANGUAGES[forcedDetectionLanguage as keyof typeof AVAILABLE_LANGUAGES];
      const detectionExists = DETECTABLE_LANGUAGES[targetLanguage as keyof typeof DETECTABLE_LANGUAGES];

      if (!targetExists) {
        throw new Error(`"${DETECTABLE_LANGUAGES[forcedDetectionLanguage as keyof typeof DETECTABLE_LANGUAGES]}" is not available as a translation target language.`);
      }

      if (!detectionExists) {
        throw new Error(`"${AVAILABLE_LANGUAGES[targetLanguage as keyof typeof AVAILABLE_LANGUAGES]}" is not available as a detection language.`);
      }

      // Perform the swap by updating both states and storage simultaneously
      const tempTarget = targetLanguage;
      const tempDetection = forcedDetectionLanguage;
      
      setTargetLanguageState(tempDetection);
      setForcedDetectionLanguageState(tempTarget);
      
      const settings = await getSettings();
      settings.targetLanguage = tempDetection;
      settings.forcedDetectionLanguage = tempTarget;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      logger.error('Error swapping languages:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  };

  // Helper function to get current settings
  const getSettings = async () => {
    try {
      const storedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      return storedSettings ? JSON.parse(storedSettings) : {};
    } catch (error) {
      logger.error('Error getting settings from storage:', error);
      return {};
    }
  };

  // Provide settings context to child components
  return (
    <SettingsContext.Provider
      value={{
        targetLanguage,
        setTargetLanguage,
        forcedDetectionLanguage,
        setForcedDetectionLanguage,
        setBothLanguages,
        swapLanguages,
        availableLanguages: AVAILABLE_LANGUAGES,
        detectableLanguages: DETECTABLE_LANGUAGES
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsProvider; 