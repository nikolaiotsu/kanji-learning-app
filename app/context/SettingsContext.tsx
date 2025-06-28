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
  de: 'German',
  hi: 'Hindi'
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
  de: 'German',
  hi: 'Hindi'
};

// Settings context interface
interface SettingsContextType {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => Promise<void>;
  forcedDetectionLanguage: string;
  setForcedDetectionLanguage: (lang: string) => Promise<void>;
  swapLanguages: () => Promise<void>;
  availableLanguages: typeof AVAILABLE_LANGUAGES;
  detectableLanguages: typeof DETECTABLE_LANGUAGES;
}

// Create the context with default values
const SettingsContext = createContext<SettingsContextType>({
  targetLanguage: 'en',
  setTargetLanguage: async () => {},
  forcedDetectionLanguage: 'auto',
  setForcedDetectionLanguage: async () => {},
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
      // Validate that target language is different from forced detection language
      if (lang === forcedDetectionLanguage && forcedDetectionLanguage !== 'auto') {
        throw new Error('Target language cannot be the same as the detection language. Please choose a different language.');
      }
      
      setTargetLanguageState(lang);
      const settings = await getSettings();
      settings.targetLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to storage:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  };

  // Function to update forced detection language
  const setForcedDetectionLanguage = async (lang: string) => {
    try {
      // Validate that forced detection language is different from target language
      if (lang === targetLanguage && lang !== 'auto') {
        throw new Error('Detection language cannot be the same as the target language. Please choose a different language.');
      }
      
      setForcedDetectionLanguageState(lang);
      const settings = await getSettings();
      settings.forcedDetectionLanguage = lang;
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to storage:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  };

  // Function to swap languages
  const swapLanguages = async () => {
    try {
      if (forcedDetectionLanguage === 'auto') {
        throw new Error('Cannot swap languages when detection is set to auto-detect.');
      }

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
      console.error('Error swapping languages:', error);
      throw error; // Re-throw to allow UI to handle the error
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