import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  de: 'German'
};

// Languages that can be forced for detection
export const DETECTABLE_LANGUAGES = {
  auto: 'Auto-detect',
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
  de: 'German'
};

// Settings context interface
interface SettingsContextType {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => Promise<void>;
  forcedDetectionLanguage: string;
  setForcedDetectionLanguage: (lang: string) => Promise<void>;
  availableLanguages: typeof AVAILABLE_LANGUAGES;
  detectableLanguages: typeof DETECTABLE_LANGUAGES;
}

// Create the context with default values
const SettingsContext = createContext<SettingsContextType>({
  targetLanguage: 'en',
  setTargetLanguage: async () => {},
  forcedDetectionLanguage: 'auto',
  setForcedDetectionLanguage: async () => {},
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
  // State for forced detection language (default to auto-detect)
  const [forcedDetectionLanguage, setForcedDetectionLanguageState] = useState<string>('auto');

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
            setForcedDetectionLanguageState(settings.forcedDetectionLanguage);
          }
        }
      } catch (error) {
        console.error('Error loading settings from storage:', error);
      }
    };

    loadSettings();
  }, []);

  // Function to update target language
  const setTargetLanguage = async (lang: string) => {
    try {
      setTargetLanguageState(lang);
      const settings = await getSettings();
      settings.targetLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to storage:', error);
    }
  };

  // Function to update forced detection language
  const setForcedDetectionLanguage = async (lang: string) => {
    try {
      setForcedDetectionLanguageState(lang);
      const settings = await getSettings();
      settings.forcedDetectionLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to storage:', error);
    }
  };

  // Helper function to get current settings
  const getSettings = async () => {
    try {
      const storedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      return storedSettings ? JSON.parse(storedSettings) : {};
    } catch (error) {
      console.error('Error getting settings from storage:', error);
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
        availableLanguages: AVAILABLE_LANGUAGES,
        detectableLanguages: DETECTABLE_LANGUAGES
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export default SettingsProvider; 